#!/usr/bin/env python3
"""
Terraly automated collector.

1. Discover listing links from configured VivaReal search pages.
2. Compare current observation with the previous Terraly snapshot.
3. Enrich only new/changed/incomplete listings with Firecrawl JSON extraction.
4. Persist immutable snapshots plus data/auto/latest.json.
5. Never infer missing values and never interpret disappearance as a sale.

Python stdlib only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape"

LISTING_RE = re.compile(r"-id-(\d+)")
SEO_RE = re.compile(r"-(?P<area>\d+(?:\.\d+)?)m2-venda-RS(?P<price>\d+)-id-(?P<id>\d+)")
PAGE_HINT_RE = re.compile(r"(?:pagina|page)[=/\-]?\d+", re.I)

INITIAL_BASELINE = ROOT / "data" / "raw" / "vivareal_indaiatuba_2026-10-01.json"
LATEST_PATH = ROOT / "data" / "auto" / "latest.json"
SNAPSHOT_DIR = ROOT / "data" / "auto" / "snapshots"
HISTORY_PATH = ROOT / "data" / "auto" / "history.jsonl"
REPORT_PATH = ROOT / "reports" / "collector_latest.md"


@dataclass
class Settings:
    source: str
    city: str
    state: str
    search_url: str
    max_search_pages: int = 5
    max_enrich_per_run: int = 10
    request_timeout_seconds: int = 90
    sleep_between_requests_seconds: float = 1.2
    timezone: str = "America/Sao_Paulo"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat()


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def dump_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temp.replace(path)


def load_settings(path: Path) -> Settings:
    raw = load_json(path)
    if not raw:
        raise RuntimeError(f"Configuração não encontrada: {path}")
    return Settings(**raw)


def firecrawl_headers() -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "TerralyCollector/0.1",
    }
    api_key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def post_json(url: str, payload: dict[str, Any], timeout: int, attempts: int = 3) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        request = urllib.request.Request(url, data=body, headers=firecrawl_headers(), method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(f"HTTP {exc.code}: {detail[:400]}")
            if exc.code not in {408, 409, 425, 429, 500, 502, 503, 504}:
                raise last_error
        except Exception as exc:
            last_error = exc

        if attempt < attempts:
            time.sleep(min(2 ** attempt, 8))

    raise RuntimeError(f"Falha após {attempts} tentativas: {last_error}")


def firecrawl_scrape(url: str, formats: list[Any], settings: Settings) -> dict[str, Any]:
    result = post_json(
        FIRECRAWL_SCRAPE_URL,
        {"url": url, "formats": formats, "maxAge": 0, "onlyMainContent": False},
        timeout=settings.request_timeout_seconds,
    )
    if not result.get("success"):
        raise RuntimeError(f"Firecrawl retornou success=false para {url}: {result}")
    return result.get("data") or {}


def canonical_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme or "https"
    host = parsed.netloc.lower()
    path = parsed.path.rstrip("/") + "/"
    return urllib.parse.urlunparse((scheme, host, path, "", "", ""))


def same_search_family(base_url: str, candidate: str) -> bool:
    base = urllib.parse.urlparse(base_url)
    parsed = urllib.parse.urlparse(candidate)
    if parsed.netloc.lower() != base.netloc.lower():
        return False
    if not parsed.path.rstrip("/").startswith(base.path.rstrip("/")):
        return False
    return bool(PAGE_HINT_RE.search(candidate.lower())) or canonical_url(candidate) == canonical_url(base_url)


def is_listing_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    return (
        "vivareal.com.br" in parsed.netloc.lower()
        and parsed.path.startswith("/imovel/lote-terreno-")
        and LISTING_RE.search(parsed.path) is not None
    )


def parse_basic_from_url(url: str, settings: Settings) -> dict[str, Any]:
    clean_url = canonical_url(url)
    path = urllib.parse.urlparse(clean_url).path
    id_match = LISTING_RE.search(path)
    seo_match = SEO_RE.search(path)

    listing_id = id_match.group(1) if id_match else None
    area = float(seo_match.group("area")) if seo_match else None
    price = int(seo_match.group("price")) if seo_match else None

    if isinstance(area, float) and area.is_integer():
        area = int(area)

    return {
        "listing_id": listing_id,
        "original_url": clean_url,
        "source_list_page": {
            "price_displayed": None,
            "price_brl": price,
            "area_m2": area,
            "price_per_m2_brl": round(price / area, 2) if price and area else None,
            "condo_fee_displayed": None,
            "condo_fee_brl": None,
            "condo_fee_exempt": False,
            "iptu_displayed": None,
            "iptu_brl": None,
            "iptu_exempt": False,
            "neighborhood": None,
            "address_displayed": None,
            "city": settings.city,
            "state": settings.state,
        },
    }


def discover_listings(settings: Settings) -> tuple[dict[str, dict[str, Any]], list[str]]:
    queue = [settings.search_url]
    queued = {settings.search_url}
    visited: list[str] = []
    listings: dict[str, dict[str, Any]] = {}

    while queue and len(visited) < settings.max_search_pages:
        page_url = queue.pop(0)
        if page_url in visited:
            continue

        data = firecrawl_scrape(page_url, ["links"], settings)
        visited.append(page_url)

        links = data.get("links") or []
        if isinstance(links, dict):
            links = list(links.values())

        for raw_link in links:
            if not isinstance(raw_link, str):
                continue

            link = urllib.parse.urljoin(page_url, raw_link)

            if is_listing_url(link):
                basic = parse_basic_from_url(link, settings)
                listing_id = basic.get("listing_id")
                if listing_id:
                    basic["discovered_on"] = page_url
                    listings[str(listing_id)] = basic
                continue

            if same_search_family(settings.search_url, link) and link not in queued:
                queue.append(link)
                queued.add(link)

        time.sleep(settings.sleep_between_requests_seconds)

    if not listings:
        raise RuntimeError("Nenhum anúncio foi descoberto. Snapshot vazio não será gravado.")

    return listings, visited


ENRICH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": ["string", "null"]},
        "description": {"type": ["string", "null"]},
        "price_brl": {"type": ["number", "null"]},
        "area_m2": {"type": ["number", "null"]},
        "condo_fee_brl": {"type": ["number", "null"]},
        "condo_fee_exempt": {"type": ["boolean", "null"]},
        "iptu_brl": {"type": ["number", "null"]},
        "iptu_exempt": {"type": ["boolean", "null"]},
        "address_displayed": {"type": ["string", "null"]},
        "street": {"type": ["string", "null"]},
        "neighborhood": {"type": ["string", "null"]},
        "city": {"type": ["string", "null"]},
        "state": {"type": ["string", "null"]},
        "condominium_name": {"type": ["string", "null"]},
        "advertiser": {"type": ["string", "null"]},
        "creci": {"type": ["string", "null"]},
        "lot_dimensions": {"type": ["string", "null"]},
        "frontage": {"type": ["number", "null"]},
        "topography": {"type": ["string", "null"]},
        "infrastructure": {"type": "array", "items": {"type": "string"}},
        "condominium_features": {"type": "array", "items": {"type": "string"}},
        "latitude": {"type": ["number", "null"]},
        "longitude": {"type": ["number", "null"]},
        "published_at": {"type": ["string", "null"]},
        "updated_at": {"type": ["string", "null"]},
        "photo_count": {"type": ["integer", "null"]},
        "has_existing_improvement": {"type": ["boolean", "null"]},
        "built_area_m2": {"type": ["number", "null"]},
    },
    "required": [],
}


def enrich_listing(url: str, settings: Settings) -> dict[str, Any]:
    prompt = (
        "Extract only information explicitly present on this real-estate listing. "
        "Never infer missing information. Use null when absent. "
        "Do not infer slope from photos, zoning, demand, liquidity, fair value, "
        "investment quality, sale status, appreciation or construction potential."
    )
    data = firecrawl_scrape(
        url,
        [{"type": "json", "schema": ENRICH_SCHEMA, "prompt": prompt}],
        settings,
    )
    value = data.get("json")
    return value if isinstance(value, dict) else {}


def records_by_id(dataset: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not dataset:
        return {}
    return {
        str(record.get("listing_id")): record
        for record in dataset.get("records", [])
        if record.get("listing_id")
    }


def load_previous() -> tuple[dict[str, Any] | None, str]:
    latest = load_json(LATEST_PATH)
    if latest:
        return latest, str(LATEST_PATH.relative_to(ROOT))
    baseline = load_json(INITIAL_BASELINE)
    if baseline:
        return baseline, str(INITIAL_BASELINE.relative_to(ROOT))
    return None, "none"


def meaningful_change(current: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    if not previous:
        return True
    cur = current.get("source_list_page") or {}
    old = previous.get("source_list_page") or {}
    return (
        cur.get("price_brl") != old.get("price_brl")
        or cur.get("area_m2") != old.get("area_m2")
        or canonical_url(current.get("original_url", "")) != canonical_url(previous.get("original_url", ""))
    )


def needs_enrichment(record: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    if meaningful_change(record, previous):
        return True
    enrichment = (previous or {}).get("firecrawl_enrichment") or {}
    useful = [
        enrichment.get("title"),
        enrichment.get("description"),
        enrichment.get("neighborhood"),
        enrichment.get("latitude"),
        enrichment.get("longitude"),
    ]
    return sum(value is not None for value in useful) < 3


def merge_record(
    current: dict[str, Any],
    previous: dict[str, Any] | None,
    enrichment: dict[str, Any] | None,
    collected_at: str,
) -> dict[str, Any]:
    merged = {
        "listing_id": current["listing_id"],
        "original_url": current["original_url"],
        "collected_at": collected_at,
        "source_list_page": dict(current["source_list_page"]),
        "firecrawl_enrichment": {},
        "collector": {
            "discovered_on": current.get("discovered_on"),
            "status": "observed",
            "enriched_this_run": bool(enrichment),
        },
    }

    if previous:
        previous_list = previous.get("source_list_page") or {}
        for key, value in previous_list.items():
            if merged["source_list_page"].get(key) is None:
                merged["source_list_page"][key] = value
        merged["firecrawl_enrichment"] = dict(previous.get("firecrawl_enrichment") or {})

    if enrichment:
        merged["firecrawl_enrichment"].update(enrichment)
        list_page = merged["source_list_page"]

        for key in (
            "price_brl",
            "area_m2",
            "neighborhood",
            "address_displayed",
            "city",
            "state",
            "condo_fee_brl",
            "iptu_brl",
        ):
            value = enrichment.get(key)
            if value is not None:
                list_page[key] = value

        if enrichment.get("condo_fee_exempt") is not None:
            list_page["condo_fee_exempt"] = bool(enrichment["condo_fee_exempt"])
        if enrichment.get("iptu_exempt") is not None:
            list_page["iptu_exempt"] = bool(enrichment["iptu_exempt"])

        price = list_page.get("price_brl")
        area = list_page.get("area_m2")
        if isinstance(price, (int, float)) and isinstance(area, (int, float)) and area:
            list_page["price_per_m2_brl"] = round(price / area, 2)

    return merged


def write_report(dataset: dict[str, Any], snapshot_name: str) -> None:
    events = dataset["events"]
    lines = [
        "# Terraly — coleta automática mais recente",
        "",
        f"- Coletado em: **{dataset['collected_at']}**",
        f"- Cidade: **{dataset['city']}/{dataset['state']}**",
        f"- Páginas de busca visitadas: **{len(dataset['search_pages_visited'])}**",
        f"- Anúncios observados: **{dataset['record_count']}**",
        f"- Novos anúncios: **{len(events['new_listing_ids'])}**",
        f"- Anúncios com mudança detectada: **{len(events['changed_listing_ids'])}**",
        f"- Não observados nesta coleta: **{len(events['not_observed_listing_ids'])}**",
        f"- Enriquecidos nesta execução: **{dataset['enriched_count']}**",
        f"- Snapshot: {snapshot_name}",
        "",
        "> Não observado não significa vendido. O Terraly registra apenas o que conseguiu observar.",
        "",
    ]
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def run(settings: Settings) -> dict[str, Any]:
    collected_at = iso_now()
    previous_dataset, baseline_source = load_previous()
    previous = records_by_id(previous_dataset)

    discovered, pages = discover_listings(settings)

    new_ids = sorted(set(discovered) - set(previous))
    missing_ids = sorted(set(previous) - set(discovered))
    changed_ids = sorted(
        listing_id
        for listing_id in set(discovered) & set(previous)
        if meaningful_change(discovered[listing_id], previous[listing_id])
    )

    enrichment_queue = [
        listing_id
        for listing_id, record in discovered.items()
        if needs_enrichment(record, previous.get(listing_id))
    ]
    enrichment_queue.sort(key=lambda item: (item not in new_ids, item not in changed_ids, item))
    enrichment_queue = enrichment_queue[: settings.max_enrich_per_run]

    enriched: dict[str, dict[str, Any]] = {}
    enrichment_errors: dict[str, str] = {}

    for listing_id in enrichment_queue:
        try:
            enriched[listing_id] = enrich_listing(discovered[listing_id]["original_url"], settings)
        except Exception as exc:
            enrichment_errors[listing_id] = str(exc)
        time.sleep(settings.sleep_between_requests_seconds)

    records = [
        merge_record(
            discovered[listing_id],
            previous.get(listing_id),
            enriched.get(listing_id),
            collected_at,
        )
        for listing_id in sorted(discovered)
    ]

    snapshot_name = now_utc().strftime("%Y-%m-%dT%H%M%SZ") + ".json"
    dataset = {
        "dataset": "terraly_auto_v1",
        "source": "Viva Real",
        "source_search_url": settings.search_url,
        "city": settings.city,
        "state": settings.state,
        "collected_at": collected_at,
        "timezone": settings.timezone,
        "methodology": (
            "Busca incremental: varre páginas de resultado primeiro e enriquece "
            "somente anúncios novos, alterados ou ainda incompletos."
        ),
        "baseline_source": baseline_source,
        "record_count": len(records),
        "enriched_count": len(enriched),
        "search_pages_visited": pages,
        "events": {
            "new_listing_ids": new_ids,
            "changed_listing_ids": changed_ids,
            "not_observed_listing_ids": missing_ids,
            "enrichment_errors": enrichment_errors,
        },
        "records": records,
    }

    dump_json(LATEST_PATH, dataset)
    dump_json(SNAPSHOT_DIR / snapshot_name, dataset)

    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY_PATH.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "collected_at": collected_at,
                    "snapshot": snapshot_name,
                    "record_count": len(records),
                    "new": len(new_ids),
                    "changed": len(changed_ids),
                    "not_observed": len(missing_ids),
                    "enriched": len(enriched),
                },
                ensure_ascii=False,
            )
            + "\n"
        )

    write_report(dataset, snapshot_name)
    return dataset


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        default=str(ROOT / "collector" / "config.json"),
        help="Arquivo JSON de configuração.",
    )
    args = parser.parse_args()

    try:
        settings = load_settings(Path(args.config))
        result = run(settings)
    except Exception as exc:
        print(f"[terraly-collector] ERRO: {exc}", file=sys.stderr)
        return 1

    print(
        "[terraly-collector] OK "
        f"observados={result['record_count']} "
        f"novos={len(result['events']['new_listing_ids'])} "
        f"alterados={len(result['events']['changed_listing_ids'])} "
        f"enriquecidos={result['enriched_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
