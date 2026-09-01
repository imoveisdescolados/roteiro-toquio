/* ==========================================================================
   Guia Tóquio — lógica (vanilla JS)
   "Montar o dia" (energia + clima + vibe + interesse) · Bairros · Combos · Mapa
   ========================================================================== */
"use strict";

/* ------------------------------ taxonomias ------------------------------ */
const CORES_CATEGORIA = {
  "Uniqlo": "#e60012",
  "Templo/Santuário": "#ea580c",
  "Papelaria": "#f59e0b",
  "Parque": "#16a34a",
  "Loja de interesse": "#0d9488",
  "Eletrônicos": "#2563eb",
  "Centro de compras": "#7c3aed",
  "Rua especial": "#db2777",
  "Loja tradicional": "#92400e",
  "Atração/Museu": "#475569",
};
const COR_PADRAO = "#6b7280";

const ENERGIAS = { leve: "🟢 Leve", media: "🟡 Média", puxada: "🔴 Puxada" };
const ENERGIA_DESC = { leve: "a pé de Ebisu", media: "1 trem direto", puxada: "baldeação / dia à parte" };
const ENERGIA_COR = { leve: "#16a34a", media: "#d97706", puxada: "#dc2626" };
const ORDEM_ENERGIA = ["leve", "media", "puxada"];

const CLIMAS = { sol: "☀️ Sol", nublado: "⛅ Nublado", chuva: "🌧️ Chuva" };
const CLIMA_EMOJI = { sol: "☀️", nublado: "⛅", chuva: "🌧️" };
const ORDEM_CLIMA = ["sol", "nublado", "chuva"];

const VIBES = {
  calmo: "🍃 Calmo", badalado: "✨ Badalado", cultural: "🎨 Cultural",
  gastronomico: "🍜 Gastronômico", tradicional: "⛩️ Tradicional", natureza: "🌳 Natureza",
  design: "✏️ Design", arquitetura: "🏙️ Arquitetura", vintage: "🧥 Vintage",
  otaku: "🎮 Otaku", luxo: "💎 Luxo",
};
const ORDEM_VIBE = ["calmo", "badalado", "cultural", "gastronomico", "tradicional", "natureza", "design", "arquitetura", "vintage", "otaku", "luxo"];

const INTERESSES = {
  compras: "🛍️ Compras", comida: "🍜 Comida", templo: "⛩️ Templo", museu: "🏛️ Museu",
  parque: "🌳 Parque", papelaria: "📓 Papelaria", artesanato: "🧵 Artesanato",
  eletronicos: "🔌 Eletrônicos", vida_noturna: "🍶 Vida noturna", arquitetura: "🏙️ Arquitetura",
  vintage: "🧥 Vintage",
};
const ORDEM_INTERESSE = ["compras", "comida", "templo", "museu", "parque", "papelaria", "artesanato", "eletronicos", "vida_noturna", "arquitetura", "vintage"];

function energiaDe(tipoAcesso) {
  if (tipoAcesso === "transfer") return "puxada";
  if (tipoAcesso === "direct_train") return "media";
  return "leve"; // base, walkable
}

/* -------------------------------- estado -------------------------------- */
const estado = {
  zonas: [],   // bairros + guia mesclados
  pontos: [],
  combos: [],
  datas: [],
  sel: { energia: new Set(), clima: new Set(), vibe: new Set(), interesse: new Set() },
  mapaFiltros: { bairro: "", categoria: "", busca: "" },
  map: null,
  camada: null,
  marcadores: [],
};

/* ------------------------------ utilidades ------------------------------ */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
function esc(t) {
  if (t == null) return "";
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const corCategoria = (c) => CORES_CATEGORIA[c] || COR_PADRAO;
const slug = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const interseca = (arr, set) => (arr || []).some((x) => set.has(x));

/* -------------------------------- carga --------------------------------- */
async function carregarDados() {
  const pega = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`Falha ao carregar ${u} (${r.status})`); return r.json(); });
  const [bairros, guia, pontos, combos, datas] = await Promise.all([
    pega("data/data_bairros.json"),
    pega("data/bairros_guia.json"),
    pega("data/data_pontos_interesse_geo.json"),
    pega("data/combos.json"),
    pega("data/datas.json"),
  ]);
  estado.zonas = bairros.map((b) => ({ ...b, ...(guia[b.zona] || {}), energia: energiaDe(b.tipo_acesso) }));
  estado.pontos = pontos;
  estado.combos = combos;
  estado.datas = datas;
}

/* ------------------------------ chips (montar) -------------------------- */
function montarChips(containerId, grupo, ordem, rotulos, usados) {
  const cont = $("#" + containerId);
  const lista = ordem.filter((v) => !usados || usados.has(v));
  cont.innerHTML = lista
    .map((v) => `<button type="button" class="chip" data-grupo="${grupo}" data-val="${v}">${esc(rotulos[v])}</button>`)
    .join("");
}

function initChips() {
  const usadosVibe = new Set(estado.zonas.flatMap((z) => z.tags_vibe || []));
  const usadosInt = new Set(estado.zonas.flatMap((z) => z.tags_interesse || []));
  montarChips("chips-energia", "energia", ORDEM_ENERGIA, ENERGIAS);
  montarChips("chips-clima", "clima", ORDEM_CLIMA, CLIMAS);
  montarChips("chips-vibe", "vibe", ORDEM_VIBE, VIBES, usadosVibe);
  montarChips("chips-interesse", "interesse", ORDEM_INTERESSE, INTERESSES, usadosInt);

  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const g = chip.dataset.grupo, v = chip.dataset.val;
      const set = estado.sel[g];
      if (set.has(v)) { set.delete(v); chip.classList.remove("is-on"); }
      else { set.add(v); chip.classList.add("is-on"); }
      montarFiltrar();
    });
  });
}

/* --------------------------- filtro "montar" ---------------------------- */
function zonaPassa(z) {
  const s = estado.sel;
  if (s.energia.size && !s.energia.has(z.energia)) return false;
  if (s.clima.size && !interseca(z.clima, s.clima)) return false;
  if (s.vibe.size && !interseca(z.tags_vibe, s.vibe)) return false;
  if (s.interesse.size && !interseca(z.tags_interesse, s.interesse)) return false;
  return true;
}
function comboInteresses(c) {
  const set = new Set();
  c.zonas.forEach((nome) => {
    const z = estado.zonas.find((x) => x.zona === nome);
    (z?.tags_interesse || []).forEach((t) => set.add(t));
  });
  return [...set];
}
function comboPassa(c) {
  const s = estado.sel;
  if (s.energia.size && !s.energia.has(c.energia)) return false;
  if (s.clima.size && !interseca(c.clima, s.clima)) return false;
  if (s.vibe.size && !interseca(c.tags_vibe, s.vibe)) return false;
  if (s.interesse.size && !interseca(comboInteresses(c), s.interesse)) return false;
  return true;
}

function montarFiltrar() {
  const zonas = estado.zonas.filter(zonaPassa).sort((a, b) =>
    ORDEM_ENERGIA.indexOf(a.energia) - ORDEM_ENERGIA.indexOf(b.energia) || a.zona.localeCompare(b.zona, "pt"));
  const combos = estado.combos.filter(comboPassa);

  const totalSel = Object.values(estado.sel).reduce((n, s) => n + s.size, 0);
  $("#montar-contador").textContent = totalSel === 0
    ? `${zonas.length} bairros · ${combos.length} combos`
    : `${zonas.length} bairro(s) · ${combos.length} combo(s) no seu filtro`;

  const res = $("#montar-resultado");
  if (!zonas.length && !combos.length) {
    res.innerHTML = `<p class="vazio">Nada bate com essa combinação. Tente afrouxar um filtro (ex.: menos vibes).</p>`;
    return;
  }
  res.innerHTML =
    (combos.length ? `<h3 class="resultado__cab">Combos que encaixam</h3><div class="combos-lista">${combos.map(comboHTML).join("")}</div>` : "") +
    (zonas.length ? `<h3 class="resultado__cab">Bairros que encaixam</h3><div class="bairros-lista">${zonas.map(fichaHTML).join("")}</div>` : "");
}

/* ------------------------------- fichas --------------------------------- */
function pilulaEnergia(en) {
  return `<span class="pilula" style="background:${ENERGIA_COR[en]}1a;color:${ENERGIA_COR[en]}">${esc(ENERGIAS[en])}</span>`;
}
function iconesClima(clima) {
  return `<span class="clima-icones" title="Bom para: ${(clima || []).join(", ")}">${(clima || []).map((c) => CLIMA_EMOJI[c]).join(" ")}</span>`;
}
function chipsTags(tags, dic) {
  return (tags || []).map((t) => `<span class="tag">${esc(dic[t] || t)}</span>`).join("");
}
function campo(rotulo, valor) {
  if (!valor || valor === "-") return "";
  return `<div class="ficha__campo"><span class="rotulo">${rotulo}</span>${esc(valor)}</div>`;
}
function fichaHTML(z) {
  const combina = (z.combina_com || [])
    .map((n) => `<button type="button" class="link-zona" data-zona="${esc(n)}">${esc(n)}</button>`).join(" · ");
  const destaques = (z.destaques || []).map((d) => `<li>${esc(d)}</li>`).join("");
  return `
  <details class="ficha" id="ficha-${slug(z.zona)}" style="border-left-color:${ENERGIA_COR[z.energia]}">
    <summary>
      <div class="ficha__topo">
        <span class="ficha__nome">${esc(z.zona)}</span>
        <span class="ficha__meta">${pilulaEnergia(z.energia)} ${iconesClima(z.clima)}</span>
      </div>
      ${z.vibe ? `<p class="ficha__vibe">${esc(z.vibe)}</p>` : ""}
      <div class="ficha__tags">${chipsTags(z.tags_interesse, INTERESSES)}</div>
    </summary>
    <div class="ficha__corpo">
      <div class="ficha__linha">
        ${z.tempo_ideal ? `<span>⏱ ${esc(z.tempo_ideal)}</span>` : ""}
        ${z.movimento ? `<span>📊 ${esc(z.movimento)}</span>` : ""}
        ${z.melhor_momento ? `<span>🕑 ${esc(z.melhor_momento)}</span>` : ""}
      </div>
      ${campo("Como chegar", z.como_chegar)}
      ${z.clima_nota ? `<p class="ficha__clima">${(z.clima || []).map((c) => CLIMA_EMOJI[c]).join(" ")} ${esc(z.clima_nota)}</p>` : ""}
      ${destaques ? `<div class="ficha__campo"><span class="rotulo">Destaques</span><ul class="ficha__destaques">${destaques}</ul></div>` : ""}
      ${campo("Atrações", z.atracoes)}
      ${campo("Compras", z.compras)}
      ${campo("Comida / vida noturna", z.comida_vida_noturna)}
      ${campo("Notas", z.notas)}
      ${combina ? `<div class="ficha__campo"><span class="rotulo">Combina com</span><span class="combina">${combina}</span></div>` : ""}
    </div>
  </details>`;
}

/* ------------------------------- combos --------------------------------- */
function comboHTML(c) {
  const zonas = c.zonas
    .map((n) => `<button type="button" class="link-zona" data-zona="${esc(n)}">${esc(n)}</button>`).join(" → ");
  return `
  <details class="combo" style="border-left-color:${ENERGIA_COR[c.energia]}">
    <summary>
      <div class="ficha__topo">
        <span class="ficha__nome">${esc(c.nome)}</span>
        <span class="ficha__meta">${pilulaEnergia(c.energia)} ${iconesClima(c.clima)}</span>
      </div>
      <div class="ficha__linha"><span>⏱ ${esc(c.tempo)}</span></div>
      <div class="ficha__tags">${chipsTags(c.tags_vibe, VIBES)}</div>
    </summary>
    <div class="ficha__corpo">
      <div class="ficha__campo"><span class="rotulo">Bairros</span><span class="combina">${zonas}</span></div>
      <div class="ficha__campo"><span class="rotulo">Roteiro</span>${esc(c.roteiro)}</div>
      <p class="combo__porque">${esc(c.porque)}</p>
    </div>
  </details>`;
}

/* -------------------------------- datas --------------------------------- */
const DATA_BADGE = {
  feira: "Feira", feriado: "Feriado", evento: "Evento", reserva: "Reserva", fechamento: "Atenção",
};
function renderDatas() {
  $("#datas-lista").innerHTML = estado.datas
    .map((d) => `
      <div class="data-item data-item--${esc(d.tipo)}">
        <div class="data-item__topo">
          <span class="data-item__badge">${esc(DATA_BADGE[d.tipo] || d.tipo)}</span>
          <span class="data-item__quando">${esc(d.quando)}</span>
        </div>
        <p class="data-item__titulo">${esc(d.titulo)}</p>
        <p class="data-item__desc">${esc(d.desc)}</p>
      </div>`)
    .join("");
}

/* ------------------------------ Bairros tab ----------------------------- */
function renderBairros() {
  const zonas = [...estado.zonas].sort((a, b) =>
    ORDEM_ENERGIA.indexOf(a.energia) - ORDEM_ENERGIA.indexOf(b.energia) || a.zona.localeCompare(b.zona, "pt"));
  const grupos = ORDEM_ENERGIA.map((en) => {
    const doGrupo = zonas.filter((z) => z.energia === en);
    if (!doGrupo.length) return "";
    return `
      <div class="grupo-energia">
        <h2 class="grupo-energia__cab" style="color:${ENERGIA_COR[en]}">
          ${esc(ENERGIAS[en])} <span class="grupo-energia__dica">${esc(ENERGIA_DESC[en])}</span>
        </h2>
        ${doGrupo.map(fichaHTML).join("")}
      </div>`;
  });
  $("#bairros-lista").innerHTML = grupos.join("");
}

function renderCombos() {
  $("#combos-lista").innerHTML = estado.combos.map(comboHTML).join("");
}

/* --------------------- abrir ficha a partir de um link ------------------ */
function abrirFicha(zonaNome) {
  trocarView("bairros");
  const alvo = $("#ficha-" + slug(zonaNome), $("#view-bairros"));
  if (alvo) {
    alvo.open = true;
    setTimeout(() => alvo.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
}
document.addEventListener("click", (e) => {
  const link = e.target.closest(".link-zona");
  if (link) { e.preventDefault(); abrirFicha(link.dataset.zona); }
});

/* --------------------------------- mapa --------------------------------- */
function popupHTML(p) {
  const cor = corCategoria(p.categoria);
  const links = [];
  if (p.site_oficial) links.push(`<a class="pop__link pop__link--site" href="${esc(p.site_oficial)}" target="_blank" rel="noopener">Site oficial</a>`);
  if (p.google_maps) links.push(`<a class="pop__link pop__link--maps" href="${esc(p.google_maps)}" target="_blank" rel="noopener">Ver no Google Maps</a>`);
  const endExtra = p.endereco && p.endereco.trim().toLowerCase() !== (p.bairro || "").trim().toLowerCase() ? " · " + esc(p.endereco) : "";
  return `
    <h3>${esc(p.nome)}</h3>
    <span class="pop__cat" style="background:${cor}">${esc(p.categoria)}</span>
    <p class="pop__desc">${esc(p.descricao)}</p>
    <p class="pop__desc" style="font-size:13px"><strong>${esc(p.bairro)}</strong>${endExtra}</p>
    ${p.notas ? `<p class="pop__notas">${esc(p.notas)}</p>` : ""}
    <div class="pop__links">${links.join("")}</div>`;
}
function iconeCategoria(cat) {
  return L.divIcon({ className: "", html: `<div class="pin" style="background:${corCategoria(cat)}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
}
function initMapa() {
  estado.map = L.map("map", { zoomControl: true }).setView([35.6465, 139.7101], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(estado.map);
  estado.camada = L.layerGroup().addTo(estado.map);

  const comGeo = estado.pontos.filter((p) => p.lat != null && p.lng != null);
  estado.marcadores = comGeo.map((ponto) => {
    const marker = L.marker([ponto.lat, ponto.lng], { icon: iconeCategoria(ponto.categoria) });
    marker.bindPopup(popupHTML(ponto), { maxWidth: 280 });
    return { ponto, marker };
  });
  const semGeo = estado.pontos.length - comGeo.length;
  if (semGeo > 0) { const a = $("#aviso-geo"); a.hidden = false; a.textContent = `${semGeo} ponto(s) sem coordenada não aparecem no mapa.`; }
  aplicarFiltrosMapa();
}
function aplicarFiltrosMapa() {
  const { bairro, categoria, busca } = estado.mapaFiltros;
  const q = busca.trim().toLowerCase();
  estado.camada.clearLayers();
  let visiveis = 0;
  const bounds = [];
  for (const { ponto, marker } of estado.marcadores) {
    let ok = true;
    if (bairro && ponto.bairro !== bairro) ok = false;
    if (categoria && ponto.categoria !== categoria) ok = false;
    if (q && !(ponto.nome + " " + ponto.bairro).toLowerCase().includes(q)) ok = false;
    if (ok) { estado.camada.addLayer(marker); bounds.push([ponto.lat, ponto.lng]); visiveis++; }
  }
  const total = estado.marcadores.length;
  $("#contador").textContent = visiveis === total ? `${total} pontos` : `${visiveis} de ${total} pontos`;
  if (bounds.length && bounds.length < total) estado.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
}
function preencherSelectsMapa() {
  const fB = $("#f-bairro"), fC = $("#f-categoria");
  const bairros = [...new Set(estado.pontos.map((p) => p.bairro))].sort((a, b) => a.localeCompare(b, "pt"));
  fB.innerHTML = `<option value="">Todos os bairros</option>` + bairros.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join("");
  const cats = [...new Set(estado.pontos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "pt"));
  fC.innerHTML = `<option value="">Todas as categorias</option>` + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
}
function renderLegenda() {
  const usados = [...new Set(estado.pontos.map((p) => p.categoria))];
  $("#legenda").innerHTML = Object.keys(CORES_CATEGORIA).filter((c) => usados.includes(c))
    .map((c) => `<div class="legenda__item"><span class="legenda__cor" style="background:${corCategoria(c)}"></span>${esc(c)}</div>`).join("");
}

/* ------------------------------ navegação ------------------------------- */
function trocarView(nome) {
  $$(".tab").forEach((t) => { const on = t.dataset.view === nome; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
  $$(".view").forEach((v) => { const on = v.id === "view-" + nome; v.classList.toggle("is-active", on); v.hidden = !on; });
  if (nome === "mapa" && estado.map) setTimeout(() => estado.map.invalidateSize(), 60);
}

/* -------------------------------- eventos ------------------------------- */
function ligarEventos() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => trocarView(t.dataset.view)));

  $("#montar-limpar").addEventListener("click", () => {
    Object.values(estado.sel).forEach((s) => s.clear());
    $$(".chip").forEach((c) => c.classList.remove("is-on"));
    montarFiltrar();
  });

  const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
  $("#busca").addEventListener("input", debounce((e) => { estado.mapaFiltros.busca = e.target.value; aplicarFiltrosMapa(); }, 200));
  $("#f-bairro").addEventListener("change", (e) => { estado.mapaFiltros.bairro = e.target.value; aplicarFiltrosMapa(); });
  $("#f-categoria").addEventListener("change", (e) => { estado.mapaFiltros.categoria = e.target.value; aplicarFiltrosMapa(); });
  $("#limpar").addEventListener("click", () => {
    estado.mapaFiltros = { bairro: "", categoria: "", busca: "" };
    $("#busca").value = ""; $("#f-bairro").value = ""; $("#f-categoria").value = "";
    aplicarFiltrosMapa(); estado.map.setView([35.6465, 139.7101], 12);
  });

  const toggle = $("#toggle-legenda");
  toggle.addEventListener("click", () => { const leg = $("#legenda"); leg.hidden = !leg.hidden; toggle.setAttribute("aria-expanded", leg.hidden ? "false" : "true"); });
}

/* --------------------------------- init --------------------------------- */
async function init() {
  try {
    await carregarDados();
  } catch (err) {
    const el = $("#carregando");
    el.classList.add("is-erro");
    el.innerHTML = `Não foi possível carregar os dados.<br><br>${esc(err.message)}<br><br>Abra o site por um servidor (GitHub Pages, Netlify ou <code>node scripts/serve.mjs</code>), não pelo <code>file://</code>.`;
    return;
  }
  renderDatas();
  initChips();
  montarFiltrar();
  renderBairros();
  renderCombos();
  preencherSelectsMapa();
  renderLegenda();
  initMapa();
  ligarEventos();
  $("#carregando").classList.add("is-hidden");
}
document.addEventListener("DOMContentLoaded", init);
