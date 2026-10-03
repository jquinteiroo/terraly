const DATA_URL="./data/raw/vivareal_indaiatuba_2026-10-01.json";
const state={dataset:null,all:[],filtered:[],map:null,markerLayer:null,chart:null,duplicateIds:new Set(),currentStep:1,profile:{strategy:"",priceRange:"",ppm2Range:"",condoCost:"",iptuCost:"",areaRange:"",neighborhood:"",condominium:"",condoType:"",topography:"",infrastructure:"",feature:"",hideDuplicates:false,requireTopography:false,onlyCandidates:false}};
const $=s=>document.querySelector(s);
const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const numberBR=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2});

function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function clean(v){return v===null||v===undefined||v===""?null:v}
function numInput(id){const raw=$(id)?.value?.trim();if(!raw)return null;const v=Number(raw);return Number.isFinite(v)&&v>=0?v:null}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function formatMoney(v){return Number.isFinite(v)?brl.format(v):"Não informado"}
function formatPpm2(v){return Number.isFinite(v)?`${brl.format(v)}/m²`:"—"}
function signatureValue(v){return String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ")}

function parseRange(value){
  if(!value)return{min:null,max:null};
  const [a,b]=String(value).split(":");
  return{min:a===""?null:Number(a),max:b===""?null:Number(b)};
}
function inRange(value,rangeValue){
  if(!rangeValue)return true;
  const {min,max}=parseRange(rangeValue);
  if(!Number.isFinite(value))return false;
  if(min!==null&&value<min)return false;
  if(max!==null&&value>max)return false;
  return true;
}
function optionLabel(id,value){
  const select=$(id);
  return select?.querySelector(`option[value="${CSS.escape(value)}"]`)?.textContent?.trim()||value;
}

function normalizeRecord(record){
  const list=record.source_list_page||{},enrich=record.firecrawl_enrichment||{};
  return{
    id:record.listing_id,url:record.original_url,collectedAt:record.collected_at,
    price:Number(list.price_brl),area:Number(list.area_m2),ppm2:Number(list.price_per_m2_brl),
    condoRaw:clean(list.condo_fee_displayed),condoValue:Number.isFinite(Number(list.condo_fee_brl))?Number(list.condo_fee_brl):null,condoExempt:Boolean(list.condo_fee_exempt),
    iptuRaw:clean(list.iptu_displayed),iptuValue:Number.isFinite(Number(list.iptu_brl))?Number(list.iptu_brl):null,iptuExempt:Boolean(list.iptu_exempt),
    neighborhood:clean(list.neighborhood)||"Bairro não informado",address:clean(list.address_displayed),city:clean(list.city),state:clean(list.state),
    title:clean(enrich.title),description:clean(enrich.description),condominium:clean(enrich.condominium_name),advertiser:clean(enrich.advertiser),creci:clean(enrich.creci),
    lotDimensions:clean(enrich.lot_dimensions),frontage:clean(enrich.frontage),topography:clean(enrich.topography),
    infrastructure:Array.isArray(enrich.infrastructure)?enrich.infrastructure:[],condominiumFeatures:Array.isArray(enrich.condominium_features)?enrich.condominium_features:[],
    latitude:Number(enrich.latitude),longitude:Number(enrich.longitude),publishedAt:clean(enrich.published_at),updatedAt:clean(enrich.updated_at),
    photoCount:Number.isFinite(Number(enrich.photo_count))?Number(enrich.photo_count):null
  };
}

function buildDuplicateFlags(rows){
  const exact=new Map(),coords=new Map();
  rows.forEach(row=>{
    if(row.address){
      const k=[signatureValue(row.address),signatureValue(row.neighborhood),row.area,row.price].join("|");
      if(!exact.has(k))exact.set(k,[]); exact.get(k).push(row.id);
    }
    if(Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)){
      const k=`${row.latitude.toFixed(6)}|${row.longitude.toFixed(6)}`;
      if(!coords.has(k))coords.set(k,[]); coords.get(k).push(row.id);
    }
  });
  const flagged=new Set();
  [...exact.values(),...coords.values()].filter(ids=>ids.length>1).forEach(ids=>ids.forEach(id=>flagged.add(id)));
  return flagged;
}

function completeness(row){
  const checks=[Number.isFinite(row.price),Number.isFinite(row.area),Boolean(row.address),Number.isFinite(row.latitude)&&Number.isFinite(row.longitude),Boolean(row.condominium),Boolean(row.iptuRaw)||row.iptuExempt,Boolean(row.topography),Boolean(row.lotDimensions)||Boolean(row.frontage)];
  return checks.filter(Boolean).length;
}

function topographyKey(row){
  const v=signatureValue(row.topography);
  if(!v)return"unknown";
  if(v.includes("declive"))return"declive";
  if(v.includes("aclive"))return"aclive";
  if(v.includes("plano")||v.includes("plan"))return"plano";
  return v;
}

function candidateStatus(row,med){
  if(!Number.isFinite(row.ppm2)||!Number.isFinite(med))return null;
  if(row.ppm2<med*.6)return"low";
  if(row.ppm2>med*1.6)return"high";
  return null;
}

function readProfileFromForm(){
  return{
    strategy:document.querySelector('input[name="strategy"]:checked')?.value||"",
    priceRange:$("#journey-price-range").value,
    ppm2Range:$("#journey-ppm2-range").value,
    condoCost:$("#journey-condo-cost").value,
    iptuCost:$("#journey-iptu-cost").value,
    areaRange:$("#journey-area-range").value,
    neighborhood:$("#journey-neighborhood").value,
    condominium:$("#journey-condominium").value,
    condoType:$("#journey-condo-type").value,
    topography:$("#journey-topography").value,
    infrastructure:$("#journey-infrastructure").value,
    feature:$("#journey-feature").value,
    hideDuplicates:$("#journey-hide-duplicates").checked,
    requireTopography:$("#journey-require-topography").checked,
    onlyCandidates:$("#journey-only-candidates").checked
  };
}

function validateProfile(){ return []; }

function profileLabels(p){
  const l=[];
  const strategies={build_sell:"Construir e vender",build_rent:"Construir e alugar",appreciation:"Comprar para valorização",explore:"Explorar oportunidades"};
  if(p.strategy)l.push(strategies[p.strategy]||p.strategy);
  if(p.priceRange)l.push(optionLabel("#journey-price-range",p.priceRange));
  if(p.ppm2Range)l.push(optionLabel("#journey-ppm2-range",p.ppm2Range));
  if(p.condoCost)l.push("Condomínio: "+optionLabel("#journey-condo-cost",p.condoCost));
  if(p.iptuCost)l.push("IPTU: "+optionLabel("#journey-iptu-cost",p.iptuCost));
  if(p.areaRange)l.push(optionLabel("#journey-area-range",p.areaRange));
  if(p.neighborhood)l.push(p.neighborhood);
  if(p.condominium)l.push(p.condominium);
  if(p.condoType==="with")l.push("Com condomínio identificado");
  if(p.condoType==="without")l.push("Sem condomínio identificado");
  if(p.topography)l.push("Topografia: "+optionLabel("#journey-topography",p.topography));
  if(p.infrastructure)l.push(optionLabel("#journey-infrastructure",p.infrastructure));
  if(p.feature)l.push(optionLabel("#journey-feature",p.feature));
  if(p.hideDuplicates)l.push("Sem possíveis duplicidades");
  if(p.requireTopography)l.push("Exigir topografia");
  if(p.onlyCandidates)l.push("Somente extremos de R$/m²");
  return l;
}

function updateJourneySummary(){
  const p=readProfileFromForm(),errors=validateProfile(p),el=$("#journey-summary");
  if(errors.length){el.textContent=`Revise: ${errors.join("; ")}.`;el.style.color="var(--danger)";return}
  el.style.color="";
  const labels=profileLabels(p);
  el.textContent=labels.length?labels.join(" · "):"Nenhuma restrição definida. O sistema mostrará todos os anúncios observados.";
}

function setJourneyStep(step){
  state.currentStep=Math.min(5,Math.max(1,step));
  document.querySelectorAll(".journey-step").forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===state.currentStep));
  document.querySelectorAll(".journey-dot").forEach(b=>b.classList.toggle("active",Number(b.dataset.stepTarget)===state.currentStep));
  $("#journey-back").disabled=state.currentStep===1;
  $("#journey-next").classList.toggle("hidden",state.currentStep===5);
  $("#journey-apply").classList.toggle("hidden",state.currentStep!==5);
}

function applyProfile(){
  const p=readProfileFromForm(),errors=validateProfile(p);
  if(errors.length){$("#journey-summary").textContent=`Revise: ${errors.join("; ")}.`;$("#journey-summary").style.color="var(--danger)";return}
  state.profile=p; renderActiveProfile(); renderAll(); $("#active-profile").classList.remove("hidden");
  $("#stats-grid").scrollIntoView({behavior:"smooth",block:"start"});
}

function resetJourneyForm(){
  document.querySelectorAll('input[name="strategy"]').forEach(i=>i.checked=false);
  ["#journey-price-range","#journey-ppm2-range","#journey-condo-cost","#journey-iptu-cost","#journey-area-range","#journey-neighborhood","#journey-condominium","#journey-condo-type","#journey-topography","#journey-infrastructure","#journey-feature"].forEach(s=>{const e=$(s);if(e)e.value=""});
  $("#journey-hide-duplicates").checked=false;
  $("#journey-require-topography").checked=false;
  $("#journey-only-candidates").checked=false;
  state.profile=readProfileFromForm();
  setJourneyStep(1);
  updateJourneySummary();
  $("#active-profile").classList.add("hidden");
  renderAll();
}

function renderActiveProfile(){
  const labels=profileLabels(state.profile);
  $("#active-chips").innerHTML=labels.length?labels.map(x=>`<span class="profile-chip">${escapeHtml(x)}</span>`).join(""):'<span class="profile-chip">Sem restrições</span>';
}

function rowMatchesInfrastructure(row,pack){
  if(!pack)return true;
  const h=signatureValue([...row.infrastructure,...row.condominiumFeatures,row.description||""].join(" "));
  if(pack==="basic")return h.includes("agua")&&h.includes("esgoto");
  if(pack==="paved")return h.includes("paviment")||h.includes("asfalt");
  if(pack==="security")return h.includes("portaria")||h.includes("segur")||h.includes("ronda");
  if(pack==="leisure")return ["piscina","quadra","playground","churrasqueira","lazer","academia","salao de festas"].some(x=>h.includes(x));
  return true;
}

function rowMatchesFeature(row,feature){
  if(!feature)return true;
  const h=signatureValue(row.description||"");
  if(feature==="ready")return h.includes("pronto para construir")||h.includes("pronto pra construir");
  if(feature==="approved")return h.includes("aprova")||h.includes("projeto");
  if(feature==="registered")return h.includes("escritur")||h.includes("registrad");
  return true;
}

function populateDynamicDropdowns(){
  const neighborhood=$("#journey-neighborhood");
  const condominium=$("#journey-condominium");
  const neighborhoods=[...new Set(state.all.map(r=>r.neighborhood).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const condos=[...new Set(state.all.map(r=>r.condominium).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  neighborhoods.forEach(value=>{
    const option=document.createElement("option"); option.value=value; option.textContent=value; neighborhood.appendChild(option);
  });
  condos.forEach(value=>{
    const option=document.createElement("option"); option.value=value; option.textContent=value; condominium.appendChild(option);
  });
}

function getFilteredRows(){
  const p=state.profile,quick=signatureValue($("#search-input")?.value||"");
  let rows=state.all.filter(row=>{
    if(!inRange(row.price,p.priceRange))return false;
    if(!inRange(row.ppm2,p.ppm2Range))return false;
    if(!inRange(row.area,p.areaRange))return false;

    if(p.condoCost){
      if(p.condoCost==="isento"){ if(!row.condoExempt)return false; }
      else if(!row.condoExempt&&!inRange(row.condoValue,p.condoCost))return false;
    }
    if(p.iptuCost){
      if(p.iptuCost==="isento"){ if(!row.iptuExempt)return false; }
      else if(!row.iptuExempt&&!inRange(row.iptuValue,p.iptuCost))return false;
    }

    if(p.neighborhood&&row.neighborhood!==p.neighborhood)return false;
    if(p.condominium&&row.condominium!==p.condominium)return false;
    if(p.condoType==="with"&&!row.condominium)return false;
    if(p.condoType==="without"&&row.condominium)return false;

    const topo=topographyKey(row);
    if(p.topography==="known"&&topo==="unknown")return false;
    if(["plano","aclive","declive"].includes(p.topography)&&topo!==p.topography)return false;
    if(p.requireTopography&&topo==="unknown")return false;

    if(!rowMatchesInfrastructure(row,p.infrastructure))return false;
    if(!rowMatchesFeature(row,p.feature))return false;
    if(p.hideDuplicates&&state.duplicateIds.has(row.id))return false;

    if(quick&&! [row.neighborhood,row.address,row.condominium,row.advertiser,row.description].map(signatureValue).join(" ").includes(quick))return false;
    return true;
  });
  const med=median(rows.map(r=>r.ppm2));
  if(p.onlyCandidates)rows=rows.filter(r=>candidateStatus(r,med));
  const sort=$("#sort-filter")?.value||"ppm2-asc";
  return [...rows].sort((a,b)=>{
    if(sort==="price-asc")return a.price-b.price;
    if(sort==="price-desc")return b.price-a.price;
    if(sort==="area-desc")return b.area-a.area;
    if(sort==="area-asc")return a.area-b.area;
    return a.ppm2-b.ppm2;
  });
}

function renderStats(rows){
  const medPrice=median(rows.map(r=>r.price)),medPpm2=median(rows.map(r=>r.ppm2));
  const neighborhoods=new Set(rows.map(r=>r.neighborhood).filter(Boolean)).size;
  const dup=rows.filter(r=>state.duplicateIds.has(r.id)).length;
  const cards=[
    ["Terrenos compatíveis",rows.length,`de ${state.all.length} anúncios observados`,true],
    ["Mediana de preço",formatMoney(medPrice),"preço anunciado",false],
    ["Mediana de R$/m²",Number.isFinite(medPpm2)?formatPpm2(medPpm2):"—","seleção atual",false],
    ["Bairros",neighborhoods,"na seleção atual",false],
    ["Duplicidades sinalizadas",dup,"não removidas automaticamente",false]
  ];
  $("#stats-grid").innerHTML=cards.map(c=>`<article class="metric-card"><div class="metric-label">${escapeHtml(c[0])}</div><div class="metric-value ${c[3]?"accent":""}">${escapeHtml(c[1])}</div><div class="metric-note">${escapeHtml(c[2])}</div></article>`).join("");
}

function renderInsights(rows){
  const el=$("#insight-content");
  if(!rows.length){el.innerHTML='<div class="insight-note"><strong>Nenhum anúncio atende a todos os critérios.</strong><br>Tente ampliar preço, área ou remover alguma exigência.</div>';return}
  const med=median(rows.map(r=>r.ppm2)),candidates=rows.filter(r=>candidateStatus(r,med)).length;
  const topo=rows.filter(r=>topographyKey(r)!=="unknown").length,condo=rows.filter(r=>r.condominium).length;
  const min=[...rows].sort((a,b)=>a.ppm2-b.ppm2)[0];
  el.innerHTML=`<div class="insight-grid">
    <div class="insight-stat"><span>Menor R$/m²</span><strong>${formatPpm2(min.ppm2)}</strong></div>
    <div class="insight-stat"><span>Extremos estatísticos</span><strong>${candidates}</strong></div>
    <div class="insight-stat"><span>Topografia informada</span><strong>${topo}/${rows.length}</strong></div>
    <div class="insight-stat"><span>Condomínio identificado</span><strong>${condo}/${rows.length}</strong></div>
  </div><div class="insight-note"><strong>Leitura:</strong> o menor R$/m² pertence a <strong>${escapeHtml(min.neighborhood)}</strong>. Isso é apenas um sinal para investigação; a seleção ainda não confirma zoneamento, potencial construtivo, preço real de venda ou viabilidade financeira.</div>`;
}

function renderTable(rows){
  const body=$("#listings-body");$("#result-count").textContent=`${rows.length} resultado${rows.length===1?"":"s"}`;
  if(!rows.length){body.innerHTML='<tr><td colspan="8" class="empty-cell">Nenhum anúncio atende aos filtros atuais.</td></tr>';return}
  const med=median(rows.map(r=>r.ppm2));
  body.innerHTML=rows.map(row=>{
    const c=candidateStatus(row,med),signals=[];
    if(c==="low")signals.push('<span class="pill accent">R$/m² muito abaixo</span>');
    if(c==="high")signals.push('<span class="pill warning">R$/m² muito acima</span>');
    if(state.duplicateIds.has(row.id))signals.push('<span class="pill danger">Possível duplicidade</span>');
    if(row.condominium)signals.push('<span class="pill blue">Condomínio identificado</span>');
    const topo=row.topography?`<span class="pill">${escapeHtml(row.topography)}</span>`:'<span class="pill">Não informada</span>';
    return`<tr><td class="location-cell"><strong title="${escapeHtml(row.neighborhood)}">${escapeHtml(row.neighborhood)}</strong><span title="${escapeHtml(row.address||"Endereço não informado")}">${escapeHtml(row.address||"Endereço não informado")}</span></td><td>${numberBR.format(row.area)} m²</td><td class="money">${formatMoney(row.price)}</td><td class="money ppm2">${formatPpm2(row.ppm2)}</td><td>${topo}</td><td><span class="pill">${completeness(row)}/8 campos</span></td><td><div class="signals">${signals.join("")||'<span class="pill">Sem sinal adicional</span>'}</div></td><td><button class="row-action" type="button" data-detail-id="${escapeHtml(row.id)}">Detalhes</button></td></tr>`;
  }).join("");
  body.querySelectorAll("[data-detail-id]").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.detailId)));
}

function initMap(){
  state.map=L.map("map",{zoomControl:true,scrollWheelZoom:true,preferCanvas:true,zoomSnap:.5}).setView([-23.09,-47.22],12);
  const carto=L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{
    subdomains:"abcd",
    maxZoom:20,
    detectRetina:true,
    updateWhenIdle:false,
    keepBuffer:4,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });
  let errors=0,fallback=false;
  carto.on("tileerror",()=>{
    errors++;
    if(errors<4||fallback)return;
    fallback=true;
    state.map.removeLayer(carto);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      updateWhenIdle:false,
      keepBuffer:4,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(state.map);
  });
  carto.addTo(state.map);
  state.markerLayer=L.layerGroup().addTo(state.map);
  state.map.on("popupopen",()=>document.querySelectorAll("[data-map-detail-id]").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.mapDetailId),{once:true})));
  if("ResizeObserver"in window){
    const o=new ResizeObserver(()=>requestAnimationFrame(()=>state.map?.invalidateSize({pan:false})));
    o.observe($("#map"));
  }
}

function renderMap(rows){
  if(!state.map)initMap();
  state.markerLayer.clearLayers();
  const valid=rows.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
  if(!valid.length){
    state.map.setView([-23.09,-47.22],12);
    setTimeout(()=>state.map.invalidateSize({pan:false}),60);
    return;
  }
  const med=median(rows.map(r=>r.ppm2)),groups=new Map();
  valid.forEach(r=>{
    const k=`${r.latitude.toFixed(6)}|${r.longitude.toFixed(6)}`;
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(r);
  });
  groups.forEach(group=>{
    const first=group[0],candidate=group.some(r=>candidateStatus(r,med));
    const price=first.price>=1000000?`R$ ${(first.price/1000000).toFixed(1).replace(".",",")} mi`:`R$ ${Math.round(first.price/1000)} mil`;
    const cls=`price-marker${candidate?" candidate":""}${group.length>1?" multiple":""}`;
    const icon=L.divIcon({
      className:"",
      html:`<div class="${cls}" data-count="${group.length}">${escapeHtml(price)}</div>`,
      iconSize:[90,36],
      iconAnchor:[45,18]
    });
    const marker=L.marker([first.latitude,first.longitude],{icon});
    const label=group.length>1?`<small>${group.length} anúncios compartilham esta coordenada</small>`:`<small>${escapeHtml(first.address||"Localização aproximada")}</small>`;
    marker.bindPopup(`<div class="map-popup"><strong>${escapeHtml(first.neighborhood)}</strong>${label}<div class="popup-price">${formatMoney(first.price)} · ${formatPpm2(first.ppm2)}</div><button type="button" data-map-detail-id="${escapeHtml(first.id)}">Ver detalhes</button></div>`);
    marker.addTo(state.markerLayer);
  });
  setTimeout(()=>{
    state.map.invalidateSize({pan:false});
    if(valid.length===1)state.map.setView([valid[0].latitude,valid[0].longitude],14);
    else state.map.fitBounds(L.latLngBounds(valid.map(r=>[r.latitude,r.longitude])).pad(.16),{maxZoom:14});
  },100);
}

function renderChart(rows){
  const canvas=$("#scatter-chart"),med=median(rows.map(r=>r.ppm2)),normal=[],candidates=[];
  rows.forEach(r=>{if(!Number.isFinite(r.area)||!Number.isFinite(r.ppm2))return;const p={x:r.area,y:r.ppm2,recordId:r.id,label:r.neighborhood,price:r.price};(candidateStatus(r,med)?candidates:normal).push(p)});
  if(state.chart)state.chart.destroy();
  state.chart=new Chart(canvas,{type:"scatter",data:{datasets:[
    {label:"Dentro da faixa",data:normal,pointRadius:5,pointHoverRadius:7,backgroundColor:"rgba(124, 242, 173, .72)",borderColor:"#7cf2ad",borderWidth:1.5},
    {label:"Extremo estatístico",data:candidates,pointRadius:6,pointHoverRadius:8,backgroundColor:"rgba(231, 198, 111, .76)",borderColor:"#e7c66f",borderWidth:1.5}
  ]},options:{maintainAspectRatio:false,responsive:true,parsing:false,interaction:{mode:"nearest",intersect:true},plugins:{legend:{position:"bottom",labels:{color:"#8fa79a",boxWidth:9,boxHeight:9,usePointStyle:true,font:{size:10}}},tooltip:{backgroundColor:"#0b1812",borderColor:"rgba(196,255,221,.16)",borderWidth:1,titleColor:"#f4fbf7",bodyColor:"#9ab0a4",callbacks:{title:i=>i[0]?.raw?.label||"Anúncio",label:item=>{const p=item.raw;return[`Área: ${numberBR.format(p.x)} m²`,`Preço/m²: ${formatPpm2(p.y)}`,`Preço: ${formatMoney(p.price)}`]}}}},scales:{x:{title:{display:true,text:"Área do terreno (m²)",color:"#6f867a",font:{size:10}},ticks:{color:"#6f867a",font:{size:9}},grid:{color:"rgba(196,255,221,.06)"},border:{color:"rgba(196,255,221,.10)"}},y:{title:{display:true,text:"Preço anunciado por m²",color:"#6f867a",font:{size:10}},ticks:{color:"#6f867a",font:{size:9},callback:v=>`R$ ${numberBR.format(v)}`},grid:{color:"rgba(196,255,221,.06)"},border:{color:"rgba(196,255,221,.10)"}}},onClick(_e,elements){if(!elements.length)return;const e=elements[0],p=state.chart.data.datasets[e.datasetIndex].data[e.index];if(p?.recordId)openDetail(p.recordId)}}});
}

function renderAll(){state.filtered=getFilteredRows();renderStats(state.filtered);renderInsights(state.filtered);renderTable(state.filtered);renderMap(state.filtered);renderChart(state.filtered)}

function dateWarning(row){
  const values=[row.publishedAt,row.updatedAt].filter(Boolean).map(String);
  if(values.some(v=>v.toLowerCase().includes("há ")))return true;
  const collection=new Date(row.collectedAt);
  return values.some(v=>{const d=new Date(v);return!Number.isNaN(d.valueOf())&&d>collection});
}
function infoItem(label,value){return`<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value??"Não informado")}</strong></div>`}

function openDetail(id){
  const row=state.all.find(i=>i.id===id);if(!row)return;
  const med=median(state.filtered.map(i=>i.ppm2)),candidate=candidateStatus(row,med),signals=[];
  if(candidate==="low")signals.push('<span class="pill accent">R$/m² abaixo da faixa</span>');
  if(candidate==="high")signals.push('<span class="pill warning">R$/m² acima da faixa</span>');
  if(state.duplicateIds.has(row.id))signals.push('<span class="pill danger">Possível duplicidade</span>');
  if(dateWarning(row))signals.push('<span class="pill warning">Datas precisam de validação</span>');
  const infrastructure=row.infrastructure.length?row.infrastructure.map(escapeHtml).join(" · "):"Não informada";
  const condoFeatures=row.condominiumFeatures.length?row.condominiumFeatures.map(escapeHtml).join(" · "):"Não informadas";
  $("#drawer-content").innerHTML=`<div class="detail-eyebrow">Anúncio ${escapeHtml(row.id)}</div><h2 class="detail-title" id="drawer-title">${escapeHtml(row.title||row.neighborhood)}</h2><div class="detail-address">${escapeHtml(row.address||"Endereço não informado")} · ${escapeHtml(row.city||"")}/${escapeHtml(row.state||"")}</div><div class="signals" style="margin-top:14px">${signals.join("")||'<span class="pill">Sem sinal adicional</span>'}</div>
  <div class="detail-hero"><div class="detail-figure"><span>Preço anunciado</span><strong>${formatMoney(row.price)}</strong></div><div class="detail-figure"><span>Preço por m²</span><strong>${formatPpm2(row.ppm2)}</strong></div><div class="detail-figure"><span>Área</span><strong>${numberBR.format(row.area)} m²</strong></div><div class="detail-figure"><span>Completude observada</span><strong>${completeness(row)}/8 campos</strong></div></div>
  <section class="detail-section"><h3>Dados observados</h3><div class="detail-grid">${infoItem("Bairro",row.neighborhood)}${infoItem("Condomínio",row.condominium)}${infoItem("Topografia",row.topography)}${infoItem("Dimensões",row.lotDimensions||row.frontage)}${infoItem("Condomínio / taxa",row.condoExempt?"Isento":row.condoRaw)}${infoItem("IPTU",row.iptuExempt?"Isento":row.iptuRaw)}${infoItem("Anunciante",row.advertiser)}${infoItem("CRECI",row.creci)}</div></section>
  <section class="detail-section"><h3>Descrição original</h3><div class="detail-description">${escapeHtml(row.description||"Descrição não disponível.")}</div></section>
  <section class="detail-section"><h3>Infraestrutura e características</h3><div class="detail-description"><strong>Infraestrutura:</strong> ${infrastructure}</div><div class="detail-description" style="margin-top:9px"><strong>Condomínio:</strong> ${condoFeatures}</div></section>
  <section class="detail-section"><h3>Proveniência e tempo</h3><div class="detail-grid">${infoItem("Publicado",row.publishedAt)}${infoItem("Atualizado",row.updatedAt)}${infoItem("Coletado",row.collectedAt)}${infoItem("Fotos",row.photoCount)}${infoItem("Latitude",Number.isFinite(row.latitude)?row.latitude:null)}${infoItem("Longitude",Number.isFinite(row.longitude)?row.longitude:null)}</div></section>
  <section class="detail-section"><p class="detail-description">A localização pode ser aproximada. Este registro não confirma zoneamento, potencial construtivo, preço de transação, liquidez, demanda ou rentabilidade.</p><a class="detail-link" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">Abrir anúncio original ↗</a></section>`;
  $("#detail-drawer").classList.add("open");$("#detail-drawer").setAttribute("aria-hidden","false");
}
function closeDetail(){$("#detail-drawer").classList.remove("open");$("#detail-drawer").setAttribute("aria-hidden","true")}

function bindEvents(){
  $("#journey-next").addEventListener("click",()=>setJourneyStep(state.currentStep+1));
  $("#journey-back").addEventListener("click",()=>setJourneyStep(state.currentStep-1));
  $("#journey-apply").addEventListener("click",applyProfile);
  $("#journey-reset").addEventListener("click",resetJourneyForm);
  document.querySelectorAll("[data-step-target]").forEach(b=>b.addEventListener("click",()=>setJourneyStep(Number(b.dataset.stepTarget))));
  document.querySelectorAll("#journey input, #journey select").forEach(e=>{e.addEventListener("input",updateJourneySummary);e.addEventListener("change",updateJourneySummary)});
  $("#edit-profile").addEventListener("click",()=>{setJourneyStep(1);$("#journey").scrollIntoView({behavior:"smooth",block:"start"})});
  $("#search-input").addEventListener("input",renderAll);
  $("#sort-filter").addEventListener("change",renderAll);
  $("#clear-quick-filters").addEventListener("click",()=>{$("#search-input").value="";$("#sort-filter").value="ppm2-asc";renderAll()});
  $("#drawer-close").addEventListener("click",closeDetail);
  $("#drawer-backdrop").addEventListener("click",closeDetail);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail()});
}

async function boot(){
  try{
    const response=await fetch(DATA_URL,{cache:"no-store"});
    if(!response.ok)throw new Error(`Falha ao carregar dataset (HTTP ${response.status})`);
    state.dataset=await response.json();
    state.all=(state.dataset.records||[]).map(normalizeRecord);
    state.duplicateIds=buildDuplicateFlags(state.all);
    populateDynamicDropdowns();
    $("#dataset-status").textContent=`${state.all.length} anúncios · coleta ${state.dataset.collection_date||"01/10/2026"}`;
    bindEvents();
    setJourneyStep(1);
    updateJourneySummary();
    renderAll();
  }catch(error){
    console.error(error);
    $("main").innerHTML=`<div class="error-box"><strong>Não foi possível carregar o dataset.</strong><p>Abra o projeto por um servidor HTTP (por exemplo, GitHub Pages ou <code>python -m http.server</code>) em vez de abrir o HTML diretamente.</p><small>${escapeHtml(error.message)}</small></div>`;
    $("#dataset-status").textContent="Erro ao carregar dataset";
  }
}
boot();