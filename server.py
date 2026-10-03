#!/usr/bin/env python3
"""
Servidor local do Terraly.

- Serve os arquivos estáticos do projeto.
- Expõe /api/bcb para consultar o SGS do Banco Central no servidor,
  evitando bloqueio de CORS no navegador.
- Usa apenas a biblioteca padrão do Python.
"""

from __future__ import annotations

import json
import mimetypes
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("TERRALY_PORT", "8000"))
CACHE_TTL_SECONDS = 15 * 60

_cache: dict[str, tuple[float, bytes]] = {}


class TerralyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/bcb":
            self.handle_bcb(parsed)
            return

        super().do_GET()

    def handle_bcb(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        code = (query.get("code") or [""])[0].strip()
        limit_raw = (query.get("limit") or ["30"])[0].strip()

        if not code.isdigit() or not limit_raw.isdigit():
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Parâmetros esperados: code e limit."},
            )
            return

        limit = max(1, min(int(limit_raw), 120))
        upstream_url = (
            f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/"
            f"dados/ultimos/{limit}?formato=json"
        )

        cache_key = upstream_url
        cached = _cache.get(cache_key)
        now = time.time()

        if cached and now - cached[0] < CACHE_TTL_SECONDS:
            self.send_bytes(HTTPStatus.OK, cached[1], "application/json; charset=utf-8")
            return

        request = urllib.request.Request(
            upstream_url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Terraly/0.1 (+local prototype)",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            self.send_json(
                HTTPStatus.BAD_GATEWAY,
                {
                    "error": "Banco Central retornou erro.",
                    "status": exc.code,
                    "detail": detail[:300],
                },
            )
            return
        except Exception as exc:
            self.send_json(
                HTTPStatus.BAD_GATEWAY,
                {
                    "error": "Não foi possível consultar o Banco Central.",
                    "detail": str(exc),
                },
            )
            return

        try:
            json.loads(payload.decode("utf-8"))
        except Exception:
            self.send_json(
                HTTPStatus.BAD_GATEWAY,
                {"error": "Resposta inesperada recebida do Banco Central."},
            )
            return

        _cache[cache_key] = (now, payload)
        self.send_bytes(HTTPStatus.OK, payload, "application/json; charset=utf-8")

    def send_json(self, status: HTTPStatus, data):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, payload, "application/json; charset=utf-8")

    def send_bytes(self, status: HTTPStatus, payload: bytes, content_type: str):
        self.send_response(status.value)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    mimetypes.add_type("application/json", ".json")
    server = ThreadingHTTPServer((HOST, PORT), TerralyHandler)
    print(f"Terraly disponível em http://{HOST}:{PORT}")
    print("Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()
