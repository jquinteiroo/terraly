const DATA_URL = "./data/raw/vivareal_indaiatuba_2026-10-01.json";

const state = {
  dataset: null,
  all: [],
  filtered: [],
  map: null,
  markerLayer: null,
  chart: null,
  duplicateIds: new Set()
};

const $ = (selector) => document.querySelector(selector);

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const numberBR = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clean(value) {
  if (value === null || value === undefined || value === "") return null;
  return value;
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function formatMoney(value) {
  return Number.isFinite(value) ? brl.format(value) : "Não informado";
}

function formatPpm2(value) {
  return Number.isFinite(value) ? `${brl.format(value)}/m²` : "—";
}

function normalizeRecord(record) {
  const list = record.source_list_page || {};
  const enrich = record.firecrawl_enrichment || {};

  return {
    id: record.listing_id,
    url: record.original_url,
    collectedAt: record.collected_at,
    price: Number(list.price_brl),
    area: Number(list.area_m2),
    ppm2: Number(list.price_per_m2_brl),
    condoRaw: clean(list.condo_fee_displayed),
    condoValue: Number.isFinite(Number(list.condo_fee_brl)) ? Number(list.condo_fee_brl) : null,
    condoExempt: Boolean(list.condo_fee_exempt),
    iptuRaw: clean(list.iptu_displayed),
    iptuValue: Number.isFinite(Number(list.iptu_brl)) ? Number(list.iptu_brl) : null,
    iptuExempt: Boolean(list.iptu_exempt),
    neighborhood: clean(list.neighborhood) || "Bairro não informado",
    address: clean(list.address_displayed),
    city: clean(list.city),
    state: clean(list.state),
    title: clean(enrich.title),
    description: clean(enrich.description),
    condominium: clean(enrich.condominium_name),
    advertiser: clean(enrich.advertiser),
    creci: clean(enrich.creci),
    lotDimensions: clean(enrich.lot_dimensions),
    frontage: clean(enrich.frontage),
    topography: clean(enrich.topography),
    infrastructure: Array.isArray(enrich.infrastructure) ? enrich.infrastructure : [],
    condominiumFeatures: Array.isArray(enrich.condominium_features) ? enrich.condominium_features : [],
    latitude: Number(enrich.latitude),
    longitude: Number(enrich.longitude),
    publishedAt: clean(enrich.published_at),
    updatedAt: clean(enrich.updated_at),
    photoCount: Number.isFinite(Number(enrich.photo_count)) ? Number(enrich.photo_count) : null
  };
}

function signatureValue(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildDuplicateFlags(rows) {
  const exactGroups = new Map();
  const coordGroups = new Map();

  rows.forEach((row) => {
    if (row.address) {
      const exactKey = [
        signatureValue(row.address),
        signatureValue(row.neighborhood),
        row.area,
        row.price
      ].join("|");
      if (!exactGroups.has(exactKey)) exactGroups.set(exactKey, []);
      exactGroups.get(exactKey).push(row.id);
    }

    if (Number.isFinite(row.latitude) && Number.isFinite(row.longitude)) {
      const coordKey = `${row.latitude.toFixed(6)}|${row.longitude.toFixed(6)}`;
      if (!coordGroups.has(coordKey)) coordGroups.set(coordKey, []);
      coordGroups.get(coordKey).push(row.id);
    }
  });

  const flagged = new Set();
  [...exactGroups.values(), ...coordGroups.values()]
    .filter((ids) => ids.length > 1)
    .forEach((ids) => ids.forEach((id) => flagged.add(id)));

  return flagged;
}

function completeness(row) {
  const checks = [
    Number.isFinite(row.price),
    Number.isFinite(row.area),
    Boolean(row.address),
    Number.isFinite(row.latitude) && Number.isFinite(row.longitude),
    Boolean(row.condominium),
    Boolean(row.iptuRaw) || row.iptuExempt,
    Boolean(row.topography),
    Boolean(row.lotDimensions) || Boolean(row.frontage)
  ];
  return checks.filter(Boolean).length;
}

function topographyKey(row) {
  const value = signatureValue(row.topography);
  if (!value) return "unknown";
  if (value.includes("declive")) return "declive";
  if (value.includes("aclive")) return "aclive";
  if (value.includes("plano") || value.includes("plan")) return "plano";
  return value;
}

function candidateStatus(row, ppm2Median) {
  if (!Number.isFinite(row.ppm2) || !Number.isFinite(ppm2Median)) return null;
  if (row.ppm2 < ppm2Median * 0.6) return "low";
  if (row.ppm2 > ppm2Median * 1.6) return "high";
  return null;
}

function currentMedian() {
  return median(state.filtered.map((row) => row.ppm2));
}

function getFilteredRows() {
  const search = signatureValue($("#search-input").value);
  const maxPrice = Number($("#price-filter").value) || null;
  const topo = $("#topography-filter").value;
  const onlyCandidates = $("#candidate-filter").checked;

  let rows = state.all.filter((row) => {
    const haystack = [
      row.neighborhood,
      row.address,
      row.condominium,
      row.advertiser
    ].map(signatureValue).join(" ");

    if (search && !haystack.includes(search)) return false;
    if (maxPrice && row.price > maxPrice) return false;
    if (topo && topographyKey(row) !== topo) return false;
    return true;
  });

  const baseMedian = median(rows.map((row) => row.ppm2));
  if (onlyCandidates) {
    rows = rows.filter((row) => candidateStatus(row, baseMedian));
  }

  const sort = $("#sort-filter").value;
  rows = [...rows].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "area-desc") return b.area - a.area;
    return a.ppm2 - b.ppm2;
  });

  return rows;
}

function renderStats(rows) {
  const medPrice = median(rows.map((row) => row.price));
  const medPpm2 = median(rows.map((row) => row.ppm2));
  const neighborhoods = new Set(rows.map((row) => row.neighborhood).filter(Boolean)).size;
  const duplicateCount = rows.filter((row) => state.duplicateIds.has(row.id)).length;

  const cards = [
    {
      label: "Anúncios exibidos",
      value: rows.length,
      note: `de ${state.all.length} observados`,
      accent: true
    },
    {
      label: "Mediana de preço",
      value: formatMoney(medPrice),
      note: "preço anunciado"
    },
    {
      label: "Mediana de R$/m²",
      value: Number.isFinite(medPpm2) ? formatPpm2(medPpm2) : "—",
      note: "área anunciada"
    },
    {
      label: "Bairros",
      value: neighborhoods,
      note: "na seleção atual"
    },
    {
      label: "Possíveis duplicidades",
      value: duplicateCount,
      note: "anúncios sinalizados"
    }
  ];

  $("#stats-grid").innerHTML = cards.map((card) => `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(card.label)}</div>
      <div class="metric-value ${card.accent ? "accent" : ""}">${escapeHtml(card.value)}</div>
      <div class="metric-note">${escapeHtml(card.note)}</div>
    </article>
  `).join("");
}

function renderTable(rows) {
  const body = $("#listings-body");
  $("#result-count").textContent = `${rows.length} resultado${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-cell">Nenhum anúncio atende aos filtros atuais.</td></tr>';
    return;
  }

  const ppm2Median = median(rows.map((row) => row.ppm2));

  body.innerHTML = rows.map((row) => {
    const candidate = candidateStatus(row, ppm2Median);
    const quality = completeness(row);
    const signals = [];

    if (candidate === "low") signals.push('<span class="pill accent">R$/m² muito abaixo</span>');
    if (candidate === "high") signals.push('<span class="pill warning">R$/m² muito acima</span>');
    if (state.duplicateIds.has(row.id)) signals.push('<span class="pill danger">Possível duplicidade</span>');
    if (row.condominium) signals.push('<span class="pill blue">Condomínio identificado</span>');

    const topo = row.topography
      ? `<span class="pill">${escapeHtml(row.topography)}</span>`
      : '<span class="pill">Não informada</span>';

    return `
      <tr>
        <td class="location-cell">
          <strong title="${escapeHtml(row.neighborhood)}">${escapeHtml(row.neighborhood)}</strong>
          <span title="${escapeHtml(row.address || "Endereço não informado")}">${escapeHtml(row.address || "Endereço não informado")}</span>
        </td>
        <td>${numberBR.format(row.area)} m²</td>
        <td class="money">${formatMoney(row.price)}</td>
        <td class="money ppm2">${formatPpm2(row.ppm2)}</td>
        <td>${topo}</td>
        <td><span class="pill">${quality}/8 campos</span></td>
        <td><div class="signals">${signals.join("") || '<span class="pill">Sem sinal adicional</span>'}</div></td>
        <td><button class="row-action" type="button" data-detail-id="${escapeHtml(row.id)}">Detalhes</button></td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("[data-detail-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detailId));
  });
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([-23.09, -47.22], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);
}

function renderMap(rows) {
  if (!state.map) initMap();
  state.markerLayer.clearLayers();

  const valid = rows.filter((row) =>
    Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
  );

  const ppm2Median = median(rows.map((row) => row.ppm2));
  const coordinateGroups = new Map();

  valid.forEach((row) => {
    const key = `${row.latitude.toFixed(6)}|${row.longitude.toFixed(6)}`;
    if (!coordinateGroups.has(key)) coordinateGroups.set(key, []);
    coordinateGroups.get(key).push(row);
  });

  coordinateGroups.forEach((group) => {
    const first = group[0];
    const hasCandidate = group.some((row) => candidateStatus(row, ppm2Median));
    const marker = L.circleMarker([first.latitude, first.longitude], {
      radius: group.length > 1 ? 9 : 7,
      color: hasCandidate ? "#e7c66f" : "#7cf2ad",
      weight: 2,
      fillColor: hasCandidate ? "#e7c66f" : "#7cf2ad",
      fillOpacity: 0.66
    });

    const groupLabel = group.length > 1
      ? `<small>${group.length} anúncios compartilham este ponto</small>`
      : `<small>${escapeHtml(first.address || "Localização aproximada")}</small>`;

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHtml(first.neighborhood)}</strong>
        ${groupLabel}
        <div class="popup-price">${formatMoney(first.price)} · ${formatPpm2(first.ppm2)}</div>
      </div>
    `);

    marker.addTo(state.markerLayer);
  });

  const points = valid.map((row) => [row.latitude, row.longitude]);
  if (points.length) {
    const bounds = L.latLngBounds(points);
    state.map.fitBounds(bounds.pad(0.12), { maxZoom: 14 });
  }
}

function renderChart(rows) {
  const canvas = $("#scatter-chart");
  const ppm2Median = median(rows.map((row) => row.ppm2));

  const normal = [];
  const candidates = [];

  rows.forEach((row) => {
    if (!Number.isFinite(row.area) || !Number.isFinite(row.ppm2)) return;
    const point = {
      x: row.area,
      y: row.ppm2,
      recordId: row.id,
      label: row.neighborhood,
      price: row.price
    };
    (candidateStatus(row, ppm2Median) ? candidates : normal).push(point);
  });

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(canvas, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Dentro da faixa",
          data: normal,
          pointRadius: 5,
          pointHoverRadius: 7,
          backgroundColor: "rgba(124, 242, 173, .72)",
          borderColor: "#7cf2ad",
          borderWidth: 1.5
        },
        {
          label: "Extremo estatístico",
          data: candidates,
          pointRadius: 6,
          pointHoverRadius: 8,
          backgroundColor: "rgba(231, 198, 111, .76)",
          borderColor: "#e7c66f",
          borderWidth: 1.5
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      parsing: false,
      interaction: {
        mode: "nearest",
        intersect: true
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#8fa79a",
            boxWidth: 9,
            boxHeight: 9,
            usePointStyle: true,
            font: { size: 10 }
          }
        },
        tooltip: {
          backgroundColor: "#0b1812",
          borderColor: "rgba(196,255,221,.16)",
          borderWidth: 1,
          titleColor: "#f4fbf7",
          bodyColor: "#9ab0a4",
          callbacks: {
            title(items) {
              return items[0]?.raw?.label || "Anúncio";
            },
            label(item) {
              const p = item.raw;
              return [
                `Área: ${numberBR.format(p.x)} m²`,
                `Preço/m²: ${formatPpm2(p.y)}`,
                `Preço: ${formatMoney(p.price)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Área do terreno (m²)", color: "#6f867a", font: { size: 10 } },
          ticks: { color: "#6f867a", font: { size: 9 } },
          grid: { color: "rgba(196,255,221,.06)" },
          border: { color: "rgba(196,255,221,.10)" }
        },
        y: {
          title: { display: true, text: "Preço anunciado por m²", color: "#6f867a", font: { size: 10 } },
          ticks: {
            color: "#6f867a",
            font: { size: 9 },
            callback(value) { return `R$ ${numberBR.format(value)}`; }
          },
          grid: { color: "rgba(196,255,221,.06)" },
          border: { color: "rgba(196,255,221,.10)" }
        }
      },
      onClick(_event, elements) {
        if (!elements.length) return;
        const element = elements[0];
        const point = state.chart.data.datasets[element.datasetIndex].data[element.index];
        if (point?.recordId) openDetail(point.recordId);
      }
    }
  });
}

function renderAll() {
  state.filtered = getFilteredRows();
  renderStats(state.filtered);
  renderTable(state.filtered);
  renderMap(state.filtered);
  renderChart(state.filtered);
}

function dateWarning(row) {
  const values = [row.publishedAt, row.updatedAt].filter(Boolean).map(String);
  if (values.some((value) => value.toLowerCase().includes("há "))) return true;
  const collection = new Date(row.collectedAt);
  return values.some((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed > collection;
  });
}

function infoItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "Não informado")}</strong>
    </div>
  `;
}

function openDetail(id) {
  const row = state.all.find((item) => item.id === id);
  if (!row) return;

  const ppm2Median = median(state.filtered.map((item) => item.ppm2));
  const candidate = candidateStatus(row, ppm2Median);
  const duplicate = state.duplicateIds.has(row.id);
  const signals = [];

  if (candidate === "low") signals.push('<span class="pill accent">R$/m² abaixo da faixa</span>');
  if (candidate === "high") signals.push('<span class="pill warning">R$/m² acima da faixa</span>');
  if (duplicate) signals.push('<span class="pill danger">Possível duplicidade</span>');
  if (dateWarning(row)) signals.push('<span class="pill warning">Datas precisam de validação</span>');

  const infrastructure = row.infrastructure.length
    ? row.infrastructure.map((item) => escapeHtml(item)).join(" · ")
    : "Não informada";

  const condoFeatures = row.condominiumFeatures.length
    ? row.condominiumFeatures.map((item) => escapeHtml(item)).join(" · ")
    : "Não informadas";

  $("#drawer-content").innerHTML = `
    <div class="detail-eyebrow">Anúncio ${escapeHtml(row.id)}</div>
    <h2 class="detail-title" id="drawer-title">${escapeHtml(row.title || row.neighborhood)}</h2>
    <div class="detail-address">${escapeHtml(row.address || "Endereço não informado")} · ${escapeHtml(row.city || "")}/${escapeHtml(row.state || "")}</div>

    <div class="signals" style="margin-top:14px">${signals.join("") || '<span class="pill">Sem sinal adicional</span>'}</div>

    <div class="detail-hero">
      <div class="detail-figure">
        <span>Preço anunciado</span>
        <strong>${formatMoney(row.price)}</strong>
      </div>
      <div class="detail-figure">
        <span>Preço por m²</span>
        <strong>${formatPpm2(row.ppm2)}</strong>
      </div>
      <div class="detail-figure">
        <span>Área</span>
        <strong>${numberBR.format(row.area)} m²</strong>
      </div>
      <div class="detail-figure">
        <span>Completude observada</span>
        <strong>${completeness(row)}/8 campos</strong>
      </div>
    </div>

    <section class="detail-section">
      <h3>Dados observados</h3>
      <div class="detail-grid">
        ${infoItem("Bairro", row.neighborhood)}
        ${infoItem("Condomínio", row.condominium)}
        ${infoItem("Topografia", row.topography)}
        ${infoItem("Dimensões", row.lotDimensions || row.frontage)}
        ${infoItem("Condomínio / taxa", row.condoExempt ? "Isento" : row.condoRaw)}
        ${infoItem("IPTU", row.iptuExempt ? "Isento" : row.iptuRaw)}
        ${infoItem("Anunciante", row.advertiser)}
        ${infoItem("CRECI", row.creci)}
      </div>
    </section>

    <section class="detail-section">
      <h3>Descrição original</h3>
      <div class="detail-description">${escapeHtml(row.description || "Descrição não disponível.")}</div>
    </section>

    <section class="detail-section">
      <h3>Infraestrutura e características</h3>
      <div class="detail-description"><strong>Infraestrutura:</strong> ${infrastructure}</div>
      <div class="detail-description" style="margin-top:9px"><strong>Condomínio:</strong> ${condoFeatures}</div>
    </section>

    <section class="detail-section">
      <h3>Proveniência e tempo</h3>
      <div class="detail-grid">
        ${infoItem("Publicado", row.publishedAt)}
        ${infoItem("Atualizado", row.updatedAt)}
        ${infoItem("Coletado", row.collectedAt)}
        ${infoItem("Fotos", row.photoCount)}
        ${infoItem("Latitude", Number.isFinite(row.latitude) ? row.latitude : null)}
        ${infoItem("Longitude", Number.isFinite(row.longitude) ? row.longitude : null)}
      </div>
    </section>

    <section class="detail-section">
      <p class="detail-description">
        A localização pode ser aproximada. Este registro não confirma zoneamento, potencial construtivo,
        preço de transação, liquidez, demanda ou rentabilidade.
      </p>
      <a class="detail-link" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">Abrir anúncio original ↗</a>
    </section>
  `;

  const drawer = $("#detail-drawer");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  const drawer = $("#detail-drawer");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function bindEvents() {
  ["search-input", "price-filter", "topography-filter", "sort-filter", "candidate-filter"]
    .forEach((id) => {
      const element = document.getElementById(id);
      element.addEventListener(id === "search-input" ? "input" : "change", renderAll);
    });

  $("#clear-filters").addEventListener("click", () => {
    $("#search-input").value = "";
    $("#price-filter").value = "";
    $("#topography-filter").value = "";
    $("#sort-filter").value = "ppm2-asc";
    $("#candidate-filter").checked = false;
    renderAll();
  });

  $("#drawer-close").addEventListener("click", closeDetail);
  $("#drawer-backdrop").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetail();
  });
}

async function boot() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Falha ao carregar dataset (HTTP ${response.status})`);

    state.dataset = await response.json();
    state.all = (state.dataset.records || []).map(normalizeRecord);
    state.duplicateIds = buildDuplicateFlags(state.all);

    $("#dataset-status").textContent =
      `${state.all.length} anúncios · coleta ${state.dataset.collection_date || "01/10/2026"}`;

    bindEvents();
    renderAll();

    setTimeout(() => state.map?.invalidateSize(), 100);
  } catch (error) {
    console.error(error);
    $("main").innerHTML = `
      <div class="error-box">
        <strong>Não foi possível carregar o dataset.</strong>
        <p>
          Esta tela usa <code>fetch()</code> para ler o JSON do repositório. Abra o projeto por um servidor HTTP
          (por exemplo, GitHub Pages ou <code>python -m http.server</code>) em vez de abrir o arquivo HTML diretamente.
        </p>
        <small>${escapeHtml(error.message)}</small>
      </div>
    `;
    $("#dataset-status").textContent = "Erro ao carregar dataset";
  }
}

boot();