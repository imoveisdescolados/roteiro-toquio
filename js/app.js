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
  mapaFiltros: { bairro: "", categoria: "", busca: "", soFav: false },
  map: null,
  camada: null,
  marcadores: [],
  fav: new Set(),
  meuMarcador: null,
};

/* ------------------------------ favoritos ------------------------------- */
const FAV_KEY = "guia_toquio_fav";
const favKey = (p) => `${p.nome}|${p.bairro}`;
function carregarFav() {
  try { JSON.parse(localStorage.getItem(FAV_KEY) || "[]").forEach((k) => estado.fav.add(k)); } catch (e) {}
}
function salvarFav() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...estado.fav])); } catch (e) {}
}
function ehFav(p) { return estado.fav.has(favKey(p)); }

/* ------------------------------ utilidades ------------------------------ */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
function esc(t) {
  if (t == null) return "";
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const corCategoria = (c) => CORES_CATEGORIA[c] || COR_PADRAO;
const slug = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const interseca = (arr, set) => (arr || []).some((x) => set.has(x));

// Mapeia o bairro (fino) de um ponto para a zona (do guia). Usa fronteira de
// palavra pra não confundir "Meguro" com "Nakameguro".
const _cacheZona = new Map();
function zonaDoBairro(bairro) {
  if (_cacheZona.has(bairro)) return _cacheZona.get(bairro);
  const nb = norm(bairro);
  const re = new RegExp("(^|[^a-z0-9])" + escapeRe(nb));
  const z = estado.zonas.find((x) => re.test(norm(x.zona)));
  const nome = z ? z.zona : null;
  _cacheZona.set(bairro, nome);
  return nome;
}
const combosPorZona = (zona) => estado.combos.filter((c) => c.zonas.includes(zona));

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
  <details class="combo" data-comboid="${esc(c.id)}" style="border-left-color:${ENERGIA_COR[c.energia]}">
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
function abrirCombo(id) {
  trocarView("combos");
  const alvo = document.querySelector(`#view-combos [data-comboid="${CSS.escape(id)}"]`);
  if (alvo) { alvo.open = true; setTimeout(() => alvo.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
}
document.addEventListener("click", (e) => {
  const lz = e.target.closest(".link-zona");
  if (lz) { e.preventDefault(); abrirFicha(lz.dataset.zona); return; }
  const lc = e.target.closest(".link-combo");
  if (lc) { e.preventDefault(); abrirCombo(lc.dataset.comboid); return; }
  const fb = e.target.closest(".pop__fav");
  if (fb) { e.preventDefault(); toggleFav(fb.dataset.favkey); return; }
  const cb = e.target.closest(".clima-agora__btn");
  if (cb) { e.preventDefault(); aplicarClimaChip(cb.dataset.clima); }
});

function toggleFav(key) {
  if (estado.fav.has(key)) estado.fav.delete(key); else estado.fav.add(key);
  salvarFav();
  const item = estado.marcadores.find((m) => favKey(m.ponto) === key);
  if (item) {
    const fav = estado.fav.has(key);
    item.marker.setIcon(iconeCategoria(item.ponto.categoria, fav));
    const pop = item.marker.getPopup();
    if (pop && pop.isOpen()) pop.setContent(popupHTML(item.ponto));
  }
  atualizarBotaoFav();
  if (estado.mapaFiltros.soFav) aplicarFiltrosMapa();
}
function atualizarBotaoFav() {
  const b = $("#fav-toggle");
  if (b) b.textContent = `★ Favoritos (${estado.fav.size})`;
}

/* --------------------------- busca global ------------------------------- */
function comboLinks(zona) {
  const combos = zona ? combosPorZona(zona) : [];
  return combos.length
    ? combos.map((c) => `<button type="button" class="link-combo" data-comboid="${esc(c.id)}">${esc(c.nome)}</button>`).join(", ")
    : `<span class="busca-item__sub">nenhum combo</span>`;
}

function buscaGlobal(q) {
  const box = $("#busca-global-res");
  const nq = norm(q).trim();
  if (nq.length < 2) { box.hidden = true; box.innerHTML = ""; return; }

  // Bairros que casam (nome da zona, vibe ou destaques)
  const zonas = estado.zonas.filter((z) =>
    norm(z.zona).includes(nq) || norm(z.vibe).includes(nq) ||
    (z.tags_vibe || []).some((t) => norm(VIBES[t] || t).includes(nq)) ||
    (z.destaques || []).some((d) => norm(d).includes(nq))
  ).sort((a, b) => ORDEM_ENERGIA.indexOf(a.energia) - ORDEM_ENERGIA.indexOf(b.energia) || a.zona.localeCompare(b.zona, "pt"));

  const bairrosHTML = zonas.map((z) => `
      <div class="busca-item">
        <div class="busca-item__nome">
          <button type="button" class="link-zona busca-item__link" data-zona="${esc(z.zona)}">${esc(z.zona)}</button>
          ${pilulaEnergia(z.energia)}
        </div>
        ${z.vibe ? `<div class="busca-item__linha">${esc(z.vibe)}</div>` : ""}
        <div class="busca-item__linha">🧩 ${comboLinks(z.zona)}</div>
      </div>`).join("");

  // Lugares (pontos) que casam
  const pontos = estado.pontos.filter((p) =>
    norm(p.nome).includes(nq) || norm(p.categoria).includes(nq) ||
    norm(p.bairro).includes(nq) || norm(p.descricao).includes(nq));

  const totalPontos = pontos.length;
  const mostra = pontos.slice(0, 40);

  const linhas = mostra.map((p) => {
    const zona = zonaDoBairro(p.bairro);
    const combos = zona ? combosPorZona(zona) : [];
    const zonaLink = zona
      ? `<button type="button" class="link-zona" data-zona="${esc(zona)}">${esc(zona)}</button>`
      : esc(p.bairro);
    const sub = zona && norm(zona).indexOf(norm(p.bairro)) === -1 ? ` <span class="busca-item__sub">(${esc(p.bairro)})</span>` : "";
    const maps = p.google_maps ? `<a class="pop__link pop__link--maps" href="${esc(p.google_maps)}" target="_blank" rel="noopener">Google Maps</a>` : "";
    return `
      <div class="busca-item">
        <div class="busca-item__nome">${esc(p.nome)} <span class="tag">${esc(p.categoria)}</span></div>
        <div class="busca-item__linha">📍 ${zonaLink}${sub}</div>
        <div class="busca-item__linha">🧩 ${comboLinks(zona)}</div>
        ${maps ? `<div class="busca-item__acoes">${maps}</div>` : ""}
      </div>`;
  }).join("");

  box.hidden = false;
  if (!zonas.length && !totalPontos) {
    box.innerHTML = `<p class="vazio">Nada encontrado para “${esc(q)}”.</p>`;
    return;
  }
  box.innerHTML =
    (zonas.length ? `<p class="busca-res__cab">Bairros (${zonas.length})</p>${bairrosHTML}` : "") +
    (totalPontos ? `<p class="busca-res__cab">Lugares (${totalPontos}${totalPontos > 40 ? " · mostrando 40" : ""})</p>${linhas}` : "");
}

/* --------------------------------- mapa --------------------------------- */
function popupHTML(p) {
  const cor = corCategoria(p.categoria);
  const links = [];
  if (p.site_oficial) links.push(`<a class="pop__link pop__link--site" href="${esc(p.site_oficial)}" target="_blank" rel="noopener">Site oficial</a>`);
  if (p.google_maps) links.push(`<a class="pop__link pop__link--maps" href="${esc(p.google_maps)}" target="_blank" rel="noopener">Ver no Google Maps</a>`);
  const endExtra = p.endereco && p.endereco.trim().toLowerCase() !== (p.bairro || "").trim().toLowerCase() ? " · " + esc(p.endereco) : "";
  const fav = ehFav(p);
  return `
    <h3>${esc(p.nome)}</h3>
    <span class="pop__cat" style="background:${cor}">${esc(p.categoria)}</span>
    <p class="pop__desc">${esc(p.descricao)}</p>
    <p class="pop__desc" style="font-size:13px"><strong>${esc(p.bairro)}</strong>${endExtra}</p>
    ${p.notas ? `<p class="pop__notas">${esc(p.notas)}</p>` : ""}
    <button type="button" class="pop__fav${fav ? " is-on" : ""}" data-favkey="${esc(favKey(p))}">${fav ? "★ Nos favoritos" : "☆ Salvar nos favoritos"}</button>
    <div class="pop__links">${links.join("")}</div>`;
}
function iconeCategoria(cat, fav) {
  return L.divIcon({
    className: "",
    html: `<div class="pin${fav ? " pin--fav" : ""}" style="background:${corCategoria(cat)}"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20],
  });
}
function initMapa() {
  estado.map = L.map("map", { zoomControl: true }).setView([35.6465, 139.7101], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(estado.map);
  estado.camada = L.layerGroup().addTo(estado.map);

  const comGeo = estado.pontos.filter((p) => p.lat != null && p.lng != null);
  estado.marcadores = comGeo.map((ponto) => {
    const marker = L.marker([ponto.lat, ponto.lng], { icon: iconeCategoria(ponto.categoria, ehFav(ponto)) });
    marker.bindPopup(() => popupHTML(ponto), { maxWidth: 280 });
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
    if (estado.mapaFiltros.soFav && !ehFav(ponto)) ok = false;
    if (bairro && ponto.bairro !== bairro) ok = false;
    if (categoria && ponto.categoria !== categoria) ok = false;
    if (q && !(ponto.nome + " " + ponto.bairro).toLowerCase().includes(q)) ok = false;
    if (ok) { estado.camada.addLayer(marker); bounds.push([ponto.lat, ponto.lng]); visiveis++; }
  }
  const total = estado.marcadores.length;
  const rotulo = estado.mapaFiltros.soFav ? "favorito(s)" : "pontos";
  $("#contador").textContent = visiveis === total ? `${total} pontos` : `${visiveis} de ${total} ${rotulo}`;
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

/* ---------------------------- clima ao vivo ----------------------------- */
const CLIMA_LABEL = { sol: "dia de sol", nublado: "nublado", chuva: "dia de chuva" };
const wmoParaClima = (code) => (code <= 2 ? "sol" : code <= 48 ? "nublado" : "chuva");

async function carregarClima() {
  const box = $("#clima-agora");
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=35.6465&longitude=139.7101" +
      "&current=temperature_2m,weather_code&daily=weather_code&timezone=Asia%2FTokyo&forecast_days=3";
    const r = await fetch(url);
    if (!r.ok) throw new Error("clima");
    const d = await r.json();
    if (!d.current) throw new Error("clima");
    const cat = wmoParaClima(d.current.weather_code);
    const temp = Math.round(d.current.temperature_2m);
    const prox = (d.daily && d.daily.weather_code ? d.daily.weather_code.slice(1, 3) : [])
      .map((c) => CLIMA_EMOJI[wmoParaClima(c)]).join(" ");
    box.hidden = false;
    box.innerHTML = `
      <div class="clima-agora__info">
        <span class="clima-agora__emoji">${CLIMA_EMOJI[cat]}</span>
        <div><strong>Agora em Tóquio</strong> · ${temp}° · ${CLIMA_LABEL[cat]}
          ${prox ? `<span class="clima-agora__prox">próximos dias: ${prox}</span>` : ""}</div>
      </div>
      <button type="button" class="clima-agora__btn" data-clima="${cat}">Ver opções</button>`;
  } catch (e) {
    box.hidden = true; // offline ou API fora do ar: simplesmente não mostra
  }
}

function aplicarClimaChip(cat) {
  estado.sel.clima = new Set([cat]);
  $$("#chips-clima .chip").forEach((c) => c.classList.toggle("is-on", c.dataset.val === cat));
  trocarView("montar");
  montarFiltrar();
  setTimeout(() => $("#montar-resultado").scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

/* --------------------------- perto de mim ------------------------------- */
function pertoDeMim() {
  const btn = $("#perto");
  if (!navigator.geolocation) { alert("Seu navegador não suporta geolocalização."); return; }
  btn.disabled = true; btn.textContent = "📍 Localizando…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (estado.meuMarcador) estado.map.removeLayer(estado.meuMarcador);
      estado.meuMarcador = L.circleMarker([lat, lng], { radius: 8, color: "#1a73e8", fillColor: "#1a73e8", fillOpacity: .9, weight: 3 })
        .addTo(estado.map).bindPopup("Você está aqui").openPopup();
      estado.map.setView([lat, lng], 15);
      btn.disabled = false; btn.textContent = "📍 Perto de mim";
    },
    () => {
      btn.disabled = false; btn.textContent = "📍 Perto de mim";
      alert("Não consegui pegar sua localização. Verifique a permissão de localização do navegador.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
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
  $("#busca-global").addEventListener("input", debounce((e) => buscaGlobal(e.target.value), 180));
  $("#busca").addEventListener("input", debounce((e) => { estado.mapaFiltros.busca = e.target.value; aplicarFiltrosMapa(); }, 200));
  $("#f-bairro").addEventListener("change", (e) => { estado.mapaFiltros.bairro = e.target.value; aplicarFiltrosMapa(); });
  $("#f-categoria").addEventListener("change", (e) => { estado.mapaFiltros.categoria = e.target.value; aplicarFiltrosMapa(); });
  $("#limpar").addEventListener("click", () => {
    estado.mapaFiltros = { bairro: "", categoria: "", busca: "", soFav: false };
    $("#busca").value = ""; $("#f-bairro").value = ""; $("#f-categoria").value = "";
    const ft = $("#fav-toggle"); ft.classList.remove("is-on"); ft.setAttribute("aria-pressed", "false");
    aplicarFiltrosMapa(); estado.map.setView([35.6465, 139.7101], 12);
  });

  const toggle = $("#toggle-legenda");
  toggle.addEventListener("click", () => { const leg = $("#legenda"); leg.hidden = !leg.hidden; toggle.setAttribute("aria-expanded", leg.hidden ? "false" : "true"); });

  $("#fav-toggle").addEventListener("click", (e) => {
    estado.mapaFiltros.soFav = !estado.mapaFiltros.soFav;
    e.currentTarget.classList.toggle("is-on", estado.mapaFiltros.soFav);
    e.currentTarget.setAttribute("aria-pressed", estado.mapaFiltros.soFav ? "true" : "false");
    aplicarFiltrosMapa();
  });
  $("#perto").addEventListener("click", pertoDeMim);
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
  carregarFav();
  renderDatas();
  initChips();
  montarFiltrar();
  renderBairros();
  renderCombos();
  preencherSelectsMapa();
  renderLegenda();
  initMapa();
  ligarEventos();
  atualizarBotaoFav();
  $("#carregando").classList.add("is-hidden");

  carregarClima(); // não bloqueia o carregamento; some sozinho se falhar
}
document.addEventListener("DOMContentLoaded", init);

// Service worker (offline + instalável). Caminho relativo p/ funcionar em subpasta.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
