/* ==========================================================================
   Guia Tóquio — lógica (vanilla JS)
   Hoje (dia a dia) · Explorar (bairros + lugares + combos) · Mapa · Básico
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

// Como se chega ao bairro a partir de Ebisu — o fato, não uma nota abstrata.
const MODOS = {
  casa:      { rotulo: "🏠 É aqui que vocês ficam", curto: "🏠 Casa",       cor: "#7c3aed" },
  pe:        { rotulo: "🚶 Dá pra ir a pé",         curto: "🚶 A pé",        cor: "#16a34a" },
  trem:      { rotulo: "🚆 Um trem, sem trocar",    curto: "🚆 Trem direto", cor: "#2563eb" },
  baldeacao: { rotulo: "🚆 Precisa baldear",        curto: "🚆 Baldeação",   cor: "#d97706" },
};
const ORDEM_MODO = ["casa", "pe", "trem", "baldeacao"];
const MODOS_CHIP = ["pe", "trem", "baldeacao"];
// Combos guardam energia (leve/media/puxada); traduzimos para o mesmo eixo.
const ENERGIA_PARA_MODO = { leve: "pe", media: "trem", puxada: "baldeacao" };

const CLIMAS = { sol: "☀️ Sol", nublado: "⛅ Nublado", chuva: "🌧️ Chuva" };
const CLIMA_EMOJI = { sol: "☀️", nublado: "⛅", chuva: "🌧️" };
const CLIMA_LABEL = { sol: "sol", nublado: "nublado", chuva: "chuva" };
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

const DATA_BADGE = {
  feira: "Feira", feriado: "Feriado", evento: "Evento", reserva: "Reserva", fechamento: "Atenção",
};

/* -------------------------------- estado -------------------------------- */
const estado = {
  zonas: [],
  pontos: [],
  pontoByKey: new Map(),
  pontosPorZona: new Map(),
  combos: [],
  datas: [],
  dias: [],
  basico: [],
  diaSel: null,             // índice do dia selecionado na aba Hoje
  climaPorDia: new Map(),   // iso -> { cat, max, min }
  climaAgora: null,
  painel: { pilha: [], altura: 48 },   // pilha de navegação (lugar ↔ bairro)
  centrosZona: new Map(),              // centro geográfico de cada bairro
  sel: { acesso: new Set(), clima: new Set(), vibe: new Set(), interesse: new Set() },
  mapaFiltros: { bairro: "", categoria: "", busca: "", soFav: false },
  map: null,
  camada: null,
  tileLayer: null,
  tileAtual: "latim",
  marcadores: [],
  fav: new Set(),
  notas: {},
  meuMarcador: null,
};

/* ------------------------------ utilidades ------------------------------ */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
function esc(t) {
  if (t == null) return "";
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const corCategoria = (c) => CORES_CATEGORIA[c] || COR_PADRAO;
const semAcento = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => semAcento(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => semAcento(s || "").toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const interseca = (arr, set) => (arr || []).some((x) => set.has(x));
const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };

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
const zonaPorNome = (nome) => estado.zonas.find((z) => z.zona === nome);
const combosPorZona = (zona) => estado.combos.filter((c) => c.zonas.includes(zona));

// Estação principal de uma zona, pra montar rota: "Ginza + Nihonbashi" → "Ginza".
function estacaoDaZona(nome) {
  const principal = (nome || "").split(/[+/(]/)[0].trim();
  return `${principal} Station, Tokyo, Japan`;
}

/* --------------------------- Google Maps links -------------------------- */
// Ordem de precisão: place_id do Google (exato, vem do enriquecimento) →
// coordenada confiável → busca por texto (para os pontos ainda aproximados,
// onde o nome acerta mais que o pin).
function destinoDe(p) {
  if (p.place_id) return p.nome;
  if (p.lat != null && p.lng != null && !p.geo_jitter) return `${p.lat},${p.lng}`;
  return [p.nome, p.endereco, "Tokyo, Japan"].filter(Boolean).join(", ");
}
const urlVer = (destino, placeId) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}` +
  (placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : "");
const urlRota = (destino, placeId) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}` +
  (placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : "") + "&travelmode=transit";

/* ------------------------------ persistência ---------------------------- */
const FAV_KEY = "guia_toquio_fav";
const NOTAS_KEY = "guia_toquio_notas";
const BLOCO_KEY = "guia_toquio_bloco";
const CASA_KEY = "guia_toquio_casa";
const TILE_KEY = "guia_toquio_tile";
const CASA_PADRAO = "Ebisu Station, Shibuya City, Tokyo, Japan";

const ls = {
  get(k, def = null) { try { return localStorage.getItem(k) ?? def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

const favKey = (p) => `${p.nome}|${p.bairro}`;
function carregarFav() {
  try { JSON.parse(ls.get(FAV_KEY, "[]")).forEach((k) => estado.fav.add(k)); } catch (e) {}
}
const salvarFav = () => ls.set(FAV_KEY, JSON.stringify([...estado.fav]));
const ehFav = (p) => estado.fav.has(favKey(p));

function carregarNotas() {
  try { estado.notas = JSON.parse(ls.get(NOTAS_KEY, "{}")); } catch (e) { estado.notas = {}; }
}
const salvarNotas = () => ls.set(NOTAS_KEY, JSON.stringify(estado.notas));
const getNota = (p) => estado.notas[favKey(p)] || "";
const getNotaPorChave = (k) => estado.notas[k] || "";
function setNota(key, texto) {
  const t = (texto || "").trim();
  if (t) estado.notas[key] = t; else delete estado.notas[key];
  salvarNotas();
}

const getCasa = () => (ls.get(CASA_KEY, "") || "").trim() || CASA_PADRAO;
function atualizarBotaoCasa() {
  const b = $("#btn-casa");
  if (b) b.href = urlRota(getCasa());
}

/* -------------------------------- carga --------------------------------- */
async function carregarDados() {
  const pega = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`Falha ao carregar ${u} (${r.status})`); return r.json(); });
  const [bairros, guia, pontos, combos, datas, dias, basico] = await Promise.all([
    pega("data/data_bairros.json"),
    pega("data/bairros_guia.json"),
    pega("data/data_pontos_interesse_geo.json"),
    pega("data/combos.json"),
    pega("data/datas.json"),
    pega("data/dias.json"),
    pega("data/basico.json"),
  ]);
  // Opcional: só existe depois de rodar scripts/comer-perto.mjs
  estado.comer = await pega("data/comer_perto.json").catch(() => null);
  estado.zonas = bairros.map((b) => ({ ...b, ...(guia[b.zona] || {}) }));
  estado.pontos = pontos;
  estado.pontoByKey = new Map(pontos.map((p) => [favKey(p), p]));
  estado.combos = combos.map((c) => ({ ...c, modo: modoDoCombo(c) }));
  estado.datas = datas;
  estado.dias = dias;
  estado.basico = basico;

  // Índice bairro → lugares, pra mostrar os pontos dentro da ficha do bairro.
  const porZona = new Map();
  for (const p of pontos) {
    const z = zonaDoBairro(p.bairro);
    if (!z) continue;
    if (!porZona.has(z)) porZona.set(z, []);
    porZona.get(z).push(p);
  }
  estado.pontosPorZona = porZona;

  // Centro de cada bairro = média dos seus lugares. Serve pra dizer quanto
  // tempo se leva a pé de um bairro ao outro — sem API, funciona offline.
  for (const [zona, lista] of porZona) {
    const comGeo = lista.filter((x) => x.lat != null);
    if (!comGeo.length) continue;
    estado.centrosZona.set(zona, [
      comGeo.reduce((s, x) => s + x.lat, 0) / comGeo.length,
      comGeo.reduce((s, x) => s + x.lng, 0) / comGeo.length,
    ]);
  }
}

/* ------------------------ distância entre bairros ----------------------- */
function metrosEntre(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Como se vai de um bairro ao vizinho. ~80 m/min é passo de turista, com paradas.
function comoIrEntre(zonaA, zonaB) {
  const a = estado.centrosZona.get(zonaA), b = estado.centrosZona.get(zonaB);
  if (!a || !b) return null;
  const m = metrosEntre(a, b);
  const min = Math.round(m / 80);
  if (m < 1600) return { m, texto: `🚶 ~${min} min a pé`, aPe: true };
  if (m < 3000) return { m, texto: `🚶 ~${min} min a pé, ou 1 parada`, aPe: true };
  return { m, texto: "🚆 melhor de trem", aPe: false };
}

// O combo é tão difícil quanto o bairro mais difícil que ele inclui.
function modoDoCombo(c) {
  let pior = 0;
  for (const nome of c.zonas) {
    const z = zonaPorNome(nome);
    const i = ORDEM_MODO.indexOf(z?.modo || ENERGIA_PARA_MODO[c.energia] || "trem");
    if (i > pior) pior = i;
  }
  return ORDEM_MODO[pior];
}

/* ---------------------------- sol (nascer/pôr) --------------------------- */
// Algoritmo clássico do almanaque. Roda offline — nenhuma API envolvida.
function horaSolar(ano, mes, dia, lat, lng, tz, nascendo) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const N = Math.floor(275 * mes / 9) - Math.floor((mes + 9) / 12) *
    (1 + Math.floor((ano - 4 * Math.floor(ano / 4) + 2) / 3)) + dia - 30;
  const lngHora = lng / 15;
  const t = N + ((nascendo ? 6 : 18) - lngHora) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
  L = (L % 360 + 360) % 360;
  let RA = deg * Math.atan(0.91764 * Math.tan(L * rad));
  RA = (RA % 360 + 360) % 360;
  RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  const H = (nascendo ? 360 - deg * Math.acos(cosH) : deg * Math.acos(cosH)) / 15;
  let local = (H + RA - 0.06571 * t - 6.622 - lngHora + tz) % 24;
  if (local < 0) local += 24;
  return local;
}
function hhmm(h) {
  if (h == null) return "";
  let m = Math.round(h * 60);
  m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function solDoDia(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return {
    nascer: hhmm(horaSolar(a, m, d, 35.6762, 139.6503, 9, true)),
    por: hhmm(horaSolar(a, m, d, 35.6762, 139.6503, 9, false)),
  };
}

/* ------------------------------- horários -------------------------------- */
// O dia de referência é o que estiver escolhido na aba Hoje: olhando o plano de
// terça, cada lugar mostra o horário de terça — e avisa se fecha nesse dia.
const diaReferencia = () => estado.dias[estado.diaSel]?.data || hojeEmTokyo();

// O Google devolve `weekdayDescriptions` começando na segunda; JS conta a
// semana começando no domingo.
function horarioDoDia(p, iso) {
  const linhas = p.horarios?.descricao;
  if (!linhas || !linhas.length) return null;
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const linha = linhas[(dow + 6) % 7];
  if (!linha) return null;
  const texto = linha.includes(":") ? linha.slice(linha.indexOf(":") + 1).trim() : linha.trim();
  return { texto, dia: DIAS_SEMANA[dow], fechado: /fechad|closed/i.test(texto) };
}

function horariosHTML(p) {
  const h = horarioDoDia(p, diaReferencia());
  if (!h) return "";
  const semana = (p.horarios.descricao || []).map((l) => `<li>${esc(l)}</li>`).join("");
  return `
    <p class="lugar__horario${h.fechado ? " lugar__horario--fechado" : ""}">
      ${h.fechado ? `⚠️ Fechado ${esc(h.dia)}` : `🕐 ${esc(h.dia)}: ${esc(h.texto)}`}
    </p>
    ${semana ? `<details class="horario-semana"><summary>ver a semana</summary><ul>${semana}</ul></details>` : ""}`;
}

function metaHTML(p) {
  const bits = [];
  if (p.google_nota != null) bits.push(`⭐ ${esc(p.google_nota)}${p.google_avaliacoes ? ` <small>(${esc(p.google_avaliacoes)})</small>` : ""}`);
  if (p.faixa_preco) bits.push(esc(p.faixa_preco));
  if (p.telefone) bits.push(`📞 ${esc(p.telefone)}`);
  if (p.situacao === "CLOSED_PERMANENTLY") bits.push(`<strong style="color:#dc2626">fechou em definitivo</strong>`);
  return bits.length ? `<p class="lugar__meta">${bits.join(" · ")}</p>` : "";
}

// Nome e endereço em japonês, pra mostrar ao taxista ou colar numa máquina.
function japonesHTML(p) {
  if (!p.nome_ja) return "";
  const copiar = [p.nome_ja, p.endereco_ja].filter(Boolean).join("\n");
  return `<div class="lugar__ja">
      <span class="lugar__ja-txt">${esc(p.nome_ja)}${p.endereco_ja ? `<br><small>${esc(p.endereco_ja)}</small>` : ""}</span>
      <button type="button" class="btn-copiar" data-copiar="${esc(copiar)}" title="Copiar em japonês">📋</button>
    </div>`;
}

/* --------------------------------- datas -------------------------------- */
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function hojeEmTokyo() {
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}
function porExtenso(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[dow]}, ${d} de ${MESES[m - 1]}`;
}
const diffDias = (isoA, isoB) => Math.round((Date.parse(isoB + "T00:00:00Z") - Date.parse(isoA + "T00:00:00Z")) / 86400000);

/* =========================== ABA HOJE ==================================== */
function indiceDoDiaAtual() {
  const hoje = hojeEmTokyo();
  const i = estado.dias.findIndex((d) => d.data === hoje);
  if (i >= 0) return i;
  return diffDias(hoje, estado.dias[0].data) > 0 ? 0 : estado.dias.length - 1;
}

function renderStripDias() {
  const hoje = hojeEmTokyo();
  $("#hoje-dias").innerHTML = estado.dias.map((d, i) => {
    const c = estado.climaPorDia.get(d.data);
    const ehHoje = d.data === hoje;
    return `<button type="button" class="dia-chip${i === estado.diaSel ? " is-on" : ""}${ehHoje ? " is-hoje" : ""}"
              data-dia="${i}" role="tab" aria-selected="${i === estado.diaSel}">
        <span class="dia-chip__rot">${esc(d.rotulo)}</span>
        <span class="dia-chip__meta">${ehHoje ? "hoje" : c ? `${CLIMA_EMOJI[c.cat]} ${c.max}°` : `dia ${d.dia}`}</span>
      </button>`;
  }).join("");
}

function avisoDaViagem() {
  const box = $("#hoje-aviso-viagem");
  const hoje = hojeEmTokyo();
  const faltam = diffDias(hoje, estado.dias[0].data);
  const passou = diffDias(estado.dias[estado.dias.length - 1].data, hoje);
  if (faltam > 0) {
    box.hidden = false;
    box.innerHTML = `✈️ <strong>Faltam ${faltam} dia${faltam > 1 ? "s" : ""}</strong> pra viagem começar.
      Enquanto isso, vale ler a aba <strong>Básico</strong> e resolver as pendências marcadas nos dias.`;
  } else if (passou > 0) {
    box.hidden = false;
    box.innerHTML = `🎌 A etapa Tóquio terminou. O guia continua aqui pra consulta.`;
  } else {
    box.hidden = true;
  }
}

// Um aviso só entra no dia se for acionável nele: ou é geral (feriado, museu
// fechado), ou é de um bairro que está no plano de hoje. Sem isso, "Ginza vira
// calçadão" apareceria num dia em Ueno, virando ruído.
// Como o campo `fecha_em` nomeia os dias (ver scripts/enriquecer-places.mjs).
const DIA_CURTO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Lugares dos bairros de hoje que fecham justamente hoje. É a armadilha clássica:
// ir a Nihonbashi num domingo e achar as lojas centenárias de portas fechadas.
function fechadosNoDia(dia) {
  const [a, m, d] = dia.data.split("-").map(Number);
  const nomeDia = DIA_CURTO[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const out = [];
  for (const zona of dia.zonas) {
    for (const p of estado.pontosPorZona.get(zona) || []) {
      if (p.horarios?.fecha_em?.includes(nomeDia)) out.push(p);
    }
  }
  return { nomeDia, lista: out };
}

function alertasDoDia(dia) {
  return estado.datas.filter((d) => {
    if (!(d.dias || []).includes(dia.data)) return false;
    return !d.zona || dia.zonas.includes(d.zona);
  });
}

function renderHoje() {
  avisoDaViagem();
  renderStripDias();

  const d = estado.dias[estado.diaSel];
  const sol = solDoDia(d.data);
  const clima = estado.climaPorDia.get(d.data);
  const alertas = alertasDoDia(d);
  const ehHoje = d.data === hojeEmTokyo();

  const climaHTML = clima
    ? `<span class="hoje-faixa__item">${CLIMA_EMOJI[clima.cat]} ${clima.max}°/${clima.min}° · ${esc(CLIMA_LABEL[clima.cat])}</span>`
    : `<span class="hoje-faixa__item hoje-faixa__item--fraco">🌡️ previsão só a partir de ~7 dias antes</span>`;

  const zonasHTML = d.zonas.map((nome) => {
    const z = zonaPorNome(nome);
    if (!z) return "";
    const m = MODOS[z.modo] || MODOS.trem;
    const destino = estacaoDaZona(nome);
    return `
      <div class="hoje-zona" style="border-left-color:${m.cor}">
        <div class="hoje-zona__nome">${esc(nome)}</div>
        <div class="hoje-zona__como" style="color:${m.cor}">${esc(z.tempo_ate || m.rotulo)}</div>
        ${z.vibe ? `<p class="hoje-zona__vibe">${esc(z.vibe)}</p>` : ""}
        <div class="acoes">
          ${z.modo !== "casa" ? `<a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino))}" target="_blank" rel="noopener">🧭 Como chegar</a>` : ""}
          <button type="button" class="btn-acao link-zona" data-zona="${esc(nome)}">📖 Ver o bairro</button>
          <button type="button" class="btn-acao btn-mapa-zona" data-zona="${esc(nome)}">🗺️ No mapa</button>
        </div>
      </div>`;
  }).join("");

  const blocosHTML = (d.blocos || []).map((b) => `
      <div class="bloco-hora">
        <div class="bloco-hora__quando">${esc(b.quando)}</div>
        <p class="bloco-hora__texto">${esc(b.texto)}</p>
      </div>`).join("");

  const alertasHTML = alertas.map(dataItemHTML).join("");

  $("#hoje-conteudo").innerHTML = `
    <div class="hoje-cab">
      <div class="hoje-cab__dia">${ehHoje ? "HOJE · " : ""}Dia ${d.dia} de ${estado.dias.length}</div>
      <h2 class="hoje-cab__data">${esc(porExtenso(d.data))}</h2>
      <p class="hoje-cab__tema">${esc(d.tema)}</p>
    </div>

    <div class="hoje-faixa">
      ${climaHTML}
      <span class="hoje-faixa__item">🌇 sol se põe ${esc(sol.por)}</span>
    </div>

    ${d.status ? `<div class="pendencia">${esc(d.status)}</div>` : ""}
    ${fechadosHTML(d)}
    ${alertasHTML ? `<div class="hoje-alertas">${alertasHTML}</div>` : ""}

    <p class="hoje-resumo">${esc(d.resumo)}</p>

    ${zonasHTML ? `<h3 class="secao">Onde é o dia</h3>${zonasHTML}` : ""}
    ${blocosHTML ? `<h3 class="secao">Como distribuir</h3><div class="blocos-hora">${blocosHTML}</div>` : ""}

    <h3 class="secao">Planos B</h3>
    <div class="planoB">
      ${d.se_chuva ? `<div class="planoB__item"><span class="planoB__rot">🌧️ Se chover</span>${esc(d.se_chuva)}</div>` : ""}
      ${d.se_cansado ? `<div class="planoB__item"><span class="planoB__rot">😮‍💨 Se cansar</span>${esc(d.se_cansado)}</div>` : ""}
    </div>

    <a class="btn-casa-grande" href="${esc(urlRota(getCasa()))}" target="_blank" rel="noopener">
      🏠 Rota de volta pra casa
    </a>

    ${comerPertoHTML()}

    <details class="bloco" id="todas-datas">
      <summary>📅 Todas as datas presas da viagem <span class="bloco__dica">${estado.datas.length} avisos</span></summary>
      <div class="bloco__conteudo">
        <div class="hoje-alertas">${estado.datas.map(dataItemHTML).join("")}</div>
      </div>
    </details>`;
}

// Onde comer a pé de casa. Vem da Places API (scripts/comer-perto.mjs), não de
// curadoria — por isso mostra nota e nº de avaliações, pra você julgar.
function comerPertoHTML() {
  const d = estado.comer;
  if (!d?.lugares?.length) return "";
  const hoje = diaReferencia();
  const [a, m, dd] = hoje.split("-").map(Number);
  const nomeDia = DIA_CURTO[new Date(Date.UTC(a, m - 1, dd)).getUTCDay()];

  const umLugar = (x) => {
    const fechado = x.horarios?.fecha_em?.includes(nomeDia);
    const destino = x.nome_ja || x.nome;
    return `
      <div class="comer${fechado ? " comer--fechado" : ""}">
        <div class="comer__topo">
          <span class="comer__nome">${esc(x.nome)}</span>
          <span class="comer__dist">🚶 ${x.minutos_a_pe} min</span>
        </div>
        ${x.nome_ja && x.nome_ja !== x.nome ? `<div class="comer__ja">${esc(x.nome_ja)}</div>` : ""}
        <div class="comer__meta">
          ${x.tipo ? esc(x.tipo) : ""}${x.nota != null ? ` · ⭐${esc(x.nota)} <small>(${x.avaliacoes.toLocaleString("pt-BR")})</small>` : ""}${x.faixa_preco ? ` · ${esc(x.faixa_preco)}` : ""}
          ${fechado ? ` · <strong class="comer__aviso">fecha ${esc(nomeDia)}</strong>` : ""}
        </div>
        <div class="acoes">
          <a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino, x.place_id))}" target="_blank" rel="noopener">🧭 Ir</a>
          ${x.maps_uri ? `<a class="btn-acao" href="${esc(x.maps_uri)}" target="_blank" rel="noopener">📍 Maps</a>` : ""}
          ${x.site ? `<a class="btn-acao" href="${esc(x.site)}" target="_blank" rel="noopener">🔗 Site</a>` : ""}
        </div>
      </div>`;
  };

  const GRUPOS_COMER = [
    { id: "geral", titulo: "🍜 Os mais populares", dica: "Qualquer cozinha — é o que o bairro mais usa." },
    { id: "ocidental", titulo: "🍝 Ocidental", dica: "Pra quando bater o cansaço de comida japonesa." },
  ];
  const secoes = GRUPOS_COMER.map((g) => {
    const doGrupo = d.lugares.filter((x) => (x.cozinha || "geral") === g.id);
    if (!doGrupo.length) return "";
    return `
      <h3 class="painel__secao">${g.titulo} <span class="comer__conta">${doGrupo.length}</span></h3>
      <p class="painel__dica">${g.dica}</p>
      <div class="comer-lista">${doGrupo.map(umLugar).join("")}</div>`;
  }).join("");

  const maisLonge = Math.max(...d.lugares.map((x) => x.minutos_a_pe));
  return `
    <details class="bloco" id="comer-perto">
      <summary>🍜 Onde comer perto de casa <span class="bloco__dica">${d.lugares.length} lugares, até ${maisLonge} min a pé</span></summary>
      <div class="bloco__conteudo">
        <p class="painel__dica">Puxado do Google por nota e nº de avaliações, a pé de casa — não é curadoria nossa. Ordenado por confiança da nota, não só pela nota: ⭐4,6 com 90 avaliações vale menos que ⭐4,3 com 4.445.</p>
        ${secoes}
      </div>
    </details>`;
}

function fechadosHTML(dia) {
  const { nomeDia, lista } = fechadosNoDia(dia);
  if (!lista.length) return "";
  return `
    <details class="fechados">
      <summary>
        🚪 <strong>${lista.length} lugar${lista.length > 1 ? "es" : ""} do roteiro de hoje fecha${lista.length > 1 ? "m" : ""} ${esc(nomeDia)}</strong>
        <span class="bloco__dica">toque para ver</span>
      </summary>
      <div class="fechados__lista">
        ${lista.map((p) => `<div class="fechados__item">
            <strong>${esc(p.nome)}</strong>${p.nome_ja ? ` <span class="fechados__ja">${esc(p.nome_ja)}</span>` : ""}
            <br><span class="fechados__sub">${esc(p.bairro)} · ${esc(p.categoria)}</span>
          </div>`).join("")}
      </div>
    </details>`;
}

function dataItemHTML(a) {
  return `
    <div class="data-item data-item--${esc(a.tipo)}">
      <div class="data-item__topo">
        <span class="data-item__badge">${esc(DATA_BADGE[a.tipo] || a.tipo)}</span>
        <span class="data-item__quando">${esc(a.quando)}</span>
      </div>
      <p class="data-item__titulo">${esc(a.titulo)}</p>
      <p class="data-item__desc">${esc(a.desc)}</p>
      ${a.zona ? `<button type="button" class="link-zona" data-zona="${esc(a.zona)}">${esc(a.zona)}</button>` : ""}
    </div>`;
}

/* ========================== ABA EXPLORAR ================================= */
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
  const rotulosModo = Object.fromEntries(MODOS_CHIP.map((m) => [m, MODOS[m].curto]));
  montarChips("chips-energia", "acesso", MODOS_CHIP, rotulosModo);
  montarChips("chips-clima", "clima", ORDEM_CLIMA, CLIMAS);
  montarChips("chips-vibe", "vibe", ORDEM_VIBE, VIBES, usadosVibe);
  montarChips("chips-interesse", "interesse", ORDEM_INTERESSE, INTERESSES, usadosInt);

  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const g = chip.dataset.grupo, v = chip.dataset.val;
      const set = estado.sel[g];
      if (set.has(v)) { set.delete(v); chip.classList.remove("is-on"); }
      else { set.add(v); chip.classList.add("is-on"); }
      explorarFiltrar();
    });
  });
}

function zonaPassa(z) {
  const s = estado.sel;
  // Ebisu é onde eles moram: nunca some por causa do filtro de deslocamento.
  if (s.acesso.size && z.modo !== "casa" && !s.acesso.has(z.modo)) return false;
  if (s.clima.size && !interseca(z.clima, s.clima)) return false;
  if (s.vibe.size && !interseca(z.tags_vibe, s.vibe)) return false;
  if (s.interesse.size && !interseca(z.tags_interesse, s.interesse)) return false;
  return true;
}
function comboInteresses(c) {
  const set = new Set();
  c.zonas.forEach((nome) => (zonaPorNome(nome)?.tags_interesse || []).forEach((t) => set.add(t)));
  return [...set];
}
function comboPassa(c) {
  const s = estado.sel;
  if (s.acesso.size && !s.acesso.has(c.modo)) return false;
  if (s.clima.size && !interseca(c.clima, s.clima)) return false;
  if (s.vibe.size && !interseca(c.tags_vibe, s.vibe)) return false;
  if (s.interesse.size && !interseca(comboInteresses(c), s.interesse)) return false;
  return true;
}

function explorarFiltrar() {
  const zonas = estado.zonas.filter(zonaPassa).sort(ordenarZonas);
  const combos = estado.combos.filter(comboPassa);
  const totalSel = Object.values(estado.sel).reduce((n, s) => n + s.size, 0);

  $("#montar-contador").textContent = `${zonas.length} bairro(s) · ${combos.length} roteiro(s)`;
  $("#filtros-resumo").textContent = totalSel === 0
    ? "tudo aparecendo"
    : `${totalSel} filtro(s) · ${zonas.length} bairro(s)`;
  $("#filtros-box").classList.toggle("tem-filtro", totalSel > 0);

  const res = $("#explorar-resultado");
  if (!zonas.length && !combos.length) {
    res.innerHTML = `<p class="vazio">Nada bate com essa combinação. Tente tirar um filtro.</p>`;
    return;
  }

  const grupos = ORDEM_MODO.map((modo) => {
    const doGrupo = zonas.filter((z) => z.modo === modo);
    if (!doGrupo.length) return "";
    const m = MODOS[modo];
    return `
      <div class="grupo-modo">
        <h3 class="grupo-modo__cab" style="color:${m.cor}">${esc(m.rotulo)}</h3>
        ${doGrupo.map(fichaHTML).join("")}
      </div>`;
  }).join("");

  res.innerHTML =
    (combos.length ? `<h3 class="secao">Roteiros prontos de um dia</h3><div class="combos-lista">${combos.map(comboHTML).join("")}</div>` : "") +
    (zonas.length ? `<h3 class="secao">Bairros</h3>${grupos}` : "");
}

const ordenarZonas = (a, b) =>
  ORDEM_MODO.indexOf(a.modo) - ORDEM_MODO.indexOf(b.modo) || a.zona.localeCompare(b.zona, "pt");

/* ------------------------------- fichas --------------------------------- */
function pilulaModo(z) {
  const m = MODOS[z.modo] || MODOS.trem;
  return `<span class="pilula" style="background:${m.cor}1a;color:${m.cor}">${esc(z.tempo_ate || m.curto)}</span>`;
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

function lugarHTML(p) {
  const fav = ehFav(p);
  const nota = getNota(p);
  const destino = destinoDe(p);
  const site = p.site_oficial
    ? `<a class="btn-acao" href="${esc(p.site_oficial)}" target="_blank" rel="noopener">🔗 Site</a>` : "";
  const endExtra = p.endereco && p.endereco.trim().toLowerCase() !== (p.bairro || "").trim().toLowerCase()
    ? `<p class="lugar__end">📍 ${esc(p.endereco)}</p>` : "";
  return `
    <div class="lugar">
      <button type="button" class="fav-mini${fav ? " is-on" : ""}" data-favkey="${esc(favKey(p))}" title="Favoritar">${fav ? "★" : "☆"}</button>
      <div class="lugar__corpo">
        <div class="lugar__nome">${esc(p.nome)} <span class="tag" style="background:${corCategoria(p.categoria)}1a;color:${corCategoria(p.categoria)}">${esc(p.categoria)}</span></div>
        ${japonesHTML(p)}
        ${p.descricao ? `<p class="lugar__desc">${esc(p.descricao)}</p>` : ""}
        ${horariosHTML(p)}
        ${metaHTML(p)}
        ${endExtra}
        ${p.notas ? `<p class="lugar__notas">💡 ${esc(p.notas)}</p>` : ""}
        ${nota ? `<p class="busca-item__nota">📝 ${esc(nota)}</p>` : ""}
        <div class="acoes">
          <a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino, p.place_id))}" target="_blank" rel="noopener">🧭 Como chegar</a>
          <a class="btn-acao" href="${esc(urlVer(destino, p.place_id))}" target="_blank" rel="noopener">📍 No Maps</a>
          ${site}
        </div>
      </div>
    </div>`;
}

function fichaHTML(z) {
  const m = MODOS[z.modo] || MODOS.trem;
  const combina = (z.combina_com || [])
    .map((n) => `<button type="button" class="link-zona" data-zona="${esc(n)}">${esc(n)}</button>`).join(" · ");
  const imperdiveis = (z.imperdiveis || [])
    .map((d) => `<li><strong>${esc(d.nome)}</strong> — ${esc(d.nota)}</li>`).join("");
  const lugares = estado.pontosPorZona.get(z.zona) || [];
  const combos = combosPorZona(z.zona);
  const destino = estacaoDaZona(z.zona);

  return `
  <details class="ficha" id="ficha-${slug(z.zona)}" style="border-left-color:${m.cor}">
    <summary>
      <div class="ficha__topo">
        <span class="ficha__nome">${esc(z.zona)}</span>
        <span class="ficha__meta">${iconesClima(z.clima)}</span>
      </div>
      <div class="ficha__acesso">${pilulaModo(z)}</div>
      ${z.vibe ? `<p class="ficha__vibe">${esc(z.vibe)}</p>` : ""}
      <div class="ficha__tags">${chipsTags(z.tags_interesse, INTERESSES)}</div>
    </summary>
    <div class="ficha__corpo">
      ${z.resumo ? `<p class="ficha__resumo">${esc(z.resumo)}</p>` : ""}

      <div class="acoes acoes--ficha">
        ${z.modo !== "casa" ? `<a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino))}" target="_blank" rel="noopener">🧭 Como chegar</a>` : ""}
        <button type="button" class="btn-acao btn-mapa-zona" data-zona="${esc(z.zona)}">🗺️ Ver no mapa</button>
      </div>

      ${imperdiveis ? `<div class="ficha__campo"><span class="rotulo">✨ Não perca</span><ul class="ficha__imperdiveis">${imperdiveis}</ul></div>` : ""}

      <div class="ficha__linha">
        ${z.tempo_ideal ? `<span>⏱ ${esc(z.tempo_ideal)}</span>` : ""}
        ${z.movimento ? `<span>📊 ${esc(z.movimento)}</span>` : ""}
        ${z.melhor_momento ? `<span>🕑 ${esc(z.melhor_momento)}</span>` : ""}
      </div>

      ${raioXHTML(z.zona)}

      ${campo("Como chegar", z.como_chegar)}
      ${z.clima_nota ? `<p class="ficha__clima">${(z.clima || []).map((c) => CLIMA_EMOJI[c]).join(" ")} ${esc(z.clima_nota)}</p>` : ""}
      ${campoLinkado("Atrações", z.atracoes, z.zona)}
      ${campoLinkado("Compras", z.compras, z.zona)}
      ${campoLinkado("Comida / vida noturna", z.comida_vida_noturna, z.zona)}
      ${campo("Notas", z.notas)}

      ${lugares.length ? `
        <details class="sub-bloco">
          <summary>📍 ${lugares.length} lugar(es) mapeado(s) neste bairro</summary>
          <div class="lugares-lista">${lugares.map(lugarHTML).join("")}</div>
        </details>` : ""}

      ${combos.length ? `<div class="ficha__campo"><span class="rotulo">Roteiros que passam aqui</span><span class="combina">${
        combos.map((c) => `<button type="button" class="link-combo" data-comboid="${esc(c.id)}">${esc(c.nome)}</button>`).join(" · ")
      }</span></div>` : ""}

      ${combina ? `<div class="ficha__campo"><span class="rotulo">Combina com</span><span class="combina">${combina}</span></div>` : ""}
    </div>
  </details>`;
}

function comboHTML(c) {
  const m = MODOS[c.modo] || MODOS.trem;
  const zonas = c.zonas
    .map((n) => `<button type="button" class="link-zona" data-zona="${esc(n)}">${esc(n)}</button>`).join(" → ");
  return `
  <details class="combo" data-comboid="${esc(c.id)}" style="border-left-color:${m.cor}">
    <summary>
      <div class="ficha__topo">
        <span class="ficha__nome">${esc(c.nome)}</span>
        <span class="ficha__meta">${iconesClima(c.clima)}</span>
      </div>
      <div class="ficha__linha"><span>⏱ ${esc(c.tempo)}</span><span style="color:${m.cor}">${esc(m.curto)}</span></div>
      <div class="ficha__tags">${chipsTags(c.tags_vibe, VIBES)}</div>
    </summary>
    <div class="ficha__corpo">
      <div class="ficha__campo"><span class="rotulo">Bairros, nesta ordem</span><span class="combina">${zonas}</span></div>
      <div class="ficha__campo"><span class="rotulo">Roteiro</span>${esc(c.roteiro)}</div>
      <p class="combo__porque">${esc(c.porque)}</p>
    </div>
  </details>`;
}

/* ------------------- índice de todos os bairros ------------------------- */
// Atalho pro painel de cada bairro, agrupado por esforço pra chegar. Sem ele,
// ver a lista completa exigia rolar as 19 fichas abertas da aba Explorar.
function renderIndiceBairros() {
  const cont = $("#bairros-indice");
  if (!cont) return;
  const conta = $("#bairros-conta");
  if (conta) conta.textContent = `${estado.zonas.length} no total, do mais perto ao mais longe`;

  cont.innerHTML = ORDEM_MODO.map((modo) => {
    const doGrupo = estado.zonas.filter((z) => z.modo === modo)
      .sort((a, b) => a.zona.localeCompare(b.zona, "pt"));
    if (!doGrupo.length) return "";
    const m = MODOS[modo];
    return `
      <h3 class="indice__cab" style="color:${m.cor}">${esc(m.rotulo)}</h3>
      <div class="indice">
        ${doGrupo.map((z) => {
          const n = (estado.pontosPorZona.get(z.zona) || []).length;
          return `
          <button type="button" class="bairro-linha" data-painel-bairro="${esc(z.zona)}" style="border-left-color:${m.cor}">
            <span class="bairro-linha__nome">${esc(z.zona)}</span>
            <span class="bairro-linha__meta">${esc(z.tempo_ate || m.curto)}${n ? ` · ${n} ${n > 1 ? "lugares" : "lugar"}` : ""}</span>
            ${z.vibe ? `<span class="bairro-linha__vibe">${esc(z.vibe)}</span>` : ""}
            <span class="bairro-linha__seta">→</span>
          </button>`;
        }).join("")}
      </div>`;
  }).join("");
}

/* --------------------- lista "Meus favoritos" --------------------------- */
function renderFavoritos() {
  const cont = $("#fav-lista");
  const cnt = $("#fav-count");
  const keys = [...estado.fav];
  if (cnt) cnt.textContent = keys.length;
  if (!cont) return;
  if (!keys.length) {
    cont.innerHTML = `<p class="bloco__vazio">Nenhum favorito ainda. Toque na ⭐ de um lugar — no mapa, na busca ou dentro do bairro — pra ele aparecer aqui.</p>`;
    return;
  }
  cont.innerHTML = keys.map((k) => {
    const p = estado.pontoByKey.get(k);
    if (!p) return "";
    const zona = zonaDoBairro(p.bairro);
    const nota = getNotaPorChave(k);
    const destino = destinoDe(p);
    const zonaLink = zona ? `<button type="button" class="link-zona" data-zona="${esc(zona)}">${esc(zona)}</button>` : esc(p.bairro);
    return `
      <div class="fav-item">
        <button type="button" class="fav-mini is-on" data-favkey="${esc(k)}" title="Remover dos favoritos">★</button>
        <div class="fav-item__corpo">
          <div class="fav-item__nome">${esc(p.nome)} <span class="tag">${esc(p.categoria)}</span></div>
          <div class="busca-item__linha">📍 ${zonaLink}</div>
          ${nota ? `<div class="busca-item__nota">📝 ${esc(nota)}</div>` : ""}
          <div class="acoes">
            <a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino, p.place_id))}" target="_blank" rel="noopener">🧭 Como chegar</a>
          </div>
        </div>
      </div>`;
  }).join("");
}

function toggleFav(key) {
  if (estado.fav.has(key)) estado.fav.delete(key); else estado.fav.add(key);
  salvarFav();
  const item = estado.marcadores.find((m) => favKey(m.ponto) === key);
  if (item) item.marker.setIcon(iconeCategoria(item.ponto.categoria, estado.fav.has(key)));
  // Atualiza a estrela onde ela estiver visível, sem redesenhar o mundo.
  $$(`[data-favkey="${CSS.escape(key)}"]`).forEach((b) => {
    const on = estado.fav.has(key);
    b.classList.toggle("is-on", on);
    if (b.classList.contains("fav-mini")) b.textContent = on ? "★" : "☆";
    if (b.classList.contains("pop__fav")) b.textContent = on ? "★ Nos favoritos" : "☆ Salvar nos favoritos";
  });
  atualizarBotaoFav();
  renderFavoritos();
  if (estado.mapaFiltros.soFav) aplicarFiltrosMapa();
}
function atualizarBotaoFav() {
  const b = $("#fav-toggle");
  if (b) b.textContent = `★ Favoritos (${estado.fav.size})`;
}

/* --------------------------- busca global ------------------------------- */
function buscaGlobal(q) {
  const box = $("#busca-global-res");
  const nq = norm(q).trim();
  if (nq.length < 2) { box.hidden = true; box.innerHTML = ""; return; }

  const zonas = estado.zonas.filter((z) =>
    norm(z.zona).includes(nq) || norm(z.vibe).includes(nq) ||
    (z.tags_vibe || []).some((t) => norm(VIBES[t] || t).includes(nq)) ||
    (z.destaques || []).some((d) => norm(d).includes(nq))
  ).sort(ordenarZonas);

  const bairrosHTML = zonas.map((z) => `
      <div class="busca-item">
        <div class="busca-item__nome">
          <button type="button" class="link-zona busca-item__link" data-zona="${esc(z.zona)}">${esc(z.zona)}</button>
        </div>
        <div class="busca-item__linha">${pilulaModo(z)}</div>
        ${z.vibe ? `<div class="busca-item__linha">${esc(z.vibe)}</div>` : ""}
      </div>`).join("");

  const pontos = estado.pontos.filter((p) =>
    norm(p.nome).includes(nq) || norm(p.categoria).includes(nq) ||
    norm(p.bairro).includes(nq) || norm(p.descricao).includes(nq));
  const mostra = pontos.slice(0, 30);

  const linhas = mostra.map((p) => {
    const zona = zonaDoBairro(p.bairro);
    const zonaLink = zona
      ? `<button type="button" class="link-zona" data-zona="${esc(zona)}">${esc(zona)}</button>`
      : esc(p.bairro);
    const sub = zona && norm(zona).indexOf(norm(p.bairro)) === -1 ? ` <span class="busca-item__sub">(${esc(p.bairro)})</span>` : "";
    const destino = destinoDe(p);
    const nota = getNota(p);
    return `
      <div class="busca-item">
        <div class="busca-item__nome"><button type="button" class="fav-mini${ehFav(p) ? " is-on" : ""}" data-favkey="${esc(favKey(p))}" title="Favoritar">${ehFav(p) ? "★" : "☆"}</button> ${esc(p.nome)} <span class="tag">${esc(p.categoria)}</span></div>
        ${japonesHTML(p)}
        ${p.descricao ? `<div class="busca-item__linha">${esc(p.descricao)}</div>` : ""}
        ${horariosHTML(p)}
        ${metaHTML(p)}
        <div class="busca-item__linha">📍 ${zonaLink}${sub}</div>
        ${nota ? `<div class="busca-item__nota">📝 ${esc(nota)}</div>` : ""}
        <div class="acoes">
          <a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino, p.place_id))}" target="_blank" rel="noopener">🧭 Como chegar</a>
          <a class="btn-acao" href="${esc(urlVer(destino, p.place_id))}" target="_blank" rel="noopener">📍 No Maps</a>
        </div>
      </div>`;
  }).join("");

  box.hidden = false;
  if (!zonas.length && !pontos.length) {
    box.innerHTML = `<p class="vazio">Nada encontrado para “${esc(q)}”.</p>`;
    return;
  }
  box.innerHTML =
    (zonas.length ? `<p class="busca-res__cab">Bairros (${zonas.length})</p>${bairrosHTML}` : "") +
    (pontos.length ? `<p class="busca-res__cab">Lugares (${pontos.length}${pontos.length > 30 ? " · mostrando 30" : ""})</p>${linhas}` : "");
}

/* ================== PAINEL (lugar ↔ bairro) ============================== */
/* Um painel só, com pilha de navegação, servindo mapa, busca e aba Hoje.
   Antes: o popup do Leaflet ocupava 132% da área do mapa e não levava a
   lugar nenhum — de um ponto não dava pra chegar ao bairro dele.           */

function abrirPainel(tipo, id, { empilhar = true } = {}) {
  if (!empilhar) estado.painel.pilha = [];
  const topo = estado.painel.pilha[estado.painel.pilha.length - 1];
  if (!topo || topo.tipo !== tipo || topo.id !== id) estado.painel.pilha.push({ tipo, id });
  renderPainel();
}
function voltarPainel() {
  estado.painel.pilha.pop();
  if (!estado.painel.pilha.length) fecharPainel(); else renderPainel();
}
function fecharPainel() {
  estado.painel.pilha = [];
  const el = $("#painel");
  el.classList.remove("is-aberto");
  setTimeout(() => { if (!estado.painel.pilha.length) el.hidden = true; }, 220);
}

function renderPainel() {
  const atual = estado.painel.pilha[estado.painel.pilha.length - 1];
  if (!atual) return fecharPainel();
  const el = $("#painel");
  let titulo = "", corpo = "";

  if (atual.tipo === "lugar") {
    const p = estado.pontoByKey.get(atual.id);
    if (!p) return fecharPainel();
    titulo = p.nome;
    corpo = painelLugarHTML(p);
    if (p.lat != null) centralizarNoMapa(p.lat, p.lng);
  } else {
    const z = zonaPorNome(atual.id);
    if (!z) return fecharPainel();
    titulo = z.zona;
    corpo = painelBairroHTML(z);
  }

  $("#painel-titulo").textContent = titulo;
  $("#painel-corpo").innerHTML = corpo;
  $("#painel-corpo").scrollTop = 0;
  $("#painel-voltar").hidden = estado.painel.pilha.length < 2;
  el.hidden = false;
  el.style.height = estado.painel.altura + "dvh";
  requestAnimationFrame(() => el.classList.add("is-aberto"));
}

function painelLugarHTML(p) {
  const destino = destinoDe(p);
  const fav = ehFav(p);
  const zona = zonaDoBairro(p.bairro);
  const endExtra = p.endereco && p.endereco.trim().toLowerCase() !== (p.bairro || "").trim().toLowerCase()
    ? `<p class="lugar__end">📍 ${esc(p.endereco)}</p>` : "";
  return `
    <span class="pop__cat" style="background:${corCategoria(p.categoria)}">${esc(p.categoria)}</span>
    ${japonesHTML(p)}
    ${p.descricao ? `<p class="painel__desc">${esc(p.descricao)}</p>` : ""}
    ${horariosHTML(p)}
    ${metaHTML(p)}
    ${endExtra}
    ${p.notas ? `<p class="lugar__notas">💡 ${esc(p.notas)}</p>` : ""}
    <div class="acoes">
      <a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino, p.place_id))}" target="_blank" rel="noopener">🧭 Como chegar</a>
      <a class="btn-acao" href="${esc(urlVer(destino, p.place_id))}" target="_blank" rel="noopener">📍 No Maps</a>
      ${p.site_oficial ? `<a class="btn-acao" href="${esc(p.site_oficial)}" target="_blank" rel="noopener">🔗 Site</a>` : ""}
    </div>
    <button type="button" class="pop__fav${fav ? " is-on" : ""}" data-favkey="${esc(favKey(p))}">${fav ? "★ Nos favoritos" : "☆ Salvar nos favoritos"}</button>
    <label class="pop__nota-wrap">
      <span class="pop__nota-rot">📝 Sua nota</span>
      <textarea class="pop__nota" data-notakey="${esc(favKey(p))}" rows="2" placeholder="Ex.: pedir o tamago; fecha 17h; comprar aqui…">${esc(getNota(p))}</textarea>
    </label>
    ${zona ? `
      <button type="button" class="painel__salto" data-painel-bairro="${esc(zona)}">
        <span class="painel__salto-rot">Fica no bairro</span>
        <span class="painel__salto-nome">${esc(zona)}</span>
        <span class="painel__salto-seta">→</span>
      </button>` : ""}`;
}

/* ------------- texto livre → links, e raio-X do bairro ------------------ */
// Palavras que sozinhas não identificam lugar nenhum ("Square", "Hills").
const GENERICOS = new Set(["square", "hills", "market", "center", "centre", "store", "plaza",
  "mall", "tokyo", "park", "parque", "shrine", "museum", "museu", "books", "coffee", "gai",
  "dori", "yokocho", "city", "line", "shop", "cafe", "garden", "place", "tower", "station"]);
let _nomesDeBairro = null;
function nomesDeBairro() {
  if (_nomesDeBairro) return _nomesDeBairro;
  _nomesDeBairro = new Set();
  estado.pontos.forEach((p) => _nomesDeBairro.add(norm(p.bairro)));
  estado.zonas.forEach((z) => z.zona.split(/[+/(]/).forEach((t) => _nomesDeBairro.add(norm(t.trim()))));
  return _nomesDeBairro;
}

function apelidosDe(ponto) {
  const bairros = nomesDeBairro();
  const set = new Map();                       // apelido → é o nome exato?
  set.set(ponto.nome, true);
  // Nunca sobrescrever o nome exato: sem parênteses, semPar é igual ao nome,
  // e um set() cego rebaixaria "Ameyoko" a apelido, fazendo a rua perder
  // para a loja "Takeya (Ameyoko)" que fica dentro dela.
  const guarda = (a, exato) => { if (a && !set.has(a)) set.set(a, exato); };
  const semPar = ponto.nome.replace(/\s*\([^)]*\)/g, "").trim();
  guarda(semPar, false);
  guarda(ponto.nome.match(/\(([^)]+)\)/)?.[1]?.trim(), false);
  // "Daikanyama T-Site" → "T-Site": tira só um prefixo que é nome de bairro
  const partes = semPar.split(/\s+/);
  if (partes.length > 1 && bairros.has(norm(partes[0]))) guarda(partes.slice(1).join(" "), false);

  return [...set].filter(([a]) => {
    const n = norm(a);
    return n.replace(/[^a-z0-9]/g, "").length >= 4 && !GENERICOS.has(n) && !bairros.has(n);
  });
}

// Transforma nomes citados em texto corrido nos lugares clicáveis que já temos.
// Sem isso, "Itoya, Kyukyodo, Haibara" é texto morto embaixo de uma lista que
// tem esses mesmos lugares com horário, nota e rota.
function linkarLugares(texto, zona) {
  if (!texto || texto === "-") return esc(texto);
  const lista = estado.pontosPorZona.get(zona) || [];
  if (!lista.length) return esc(texto);

  const alvo = norm(texto);
  const cands = [];
  for (const ponto of lista) {
    for (const [ap, exato] of apelidosDe(ponto)) cands.push({ ponto, exato, n: norm(ap) });
  }
  // Nome exato ganha do apelido: "Ameyoko" deve ir pra rua Ameyoko,
  // não pra "Takeya (Ameyoko)". Depois, o mais longo ganha.
  cands.sort((a, b) => (b.exato - a.exato) || (b.n.length - a.n.length));

  const usado = new Array(alvo.length).fill(false);
  const achados = [];
  for (const c of cands) {
    let i = alvo.indexOf(c.n);
    while (i !== -1) {
      const fim = i + c.n.length;
      const livre = !usado.slice(i, fim).some(Boolean);
      const borda = (i === 0 || /[^a-z0-9]/.test(alvo[i - 1])) && (fim >= alvo.length || /[^a-z0-9]/.test(alvo[fim]));
      if (livre && borda) {
        for (let k = i; k < fim; k++) usado[k] = true;
        achados.push({ inicio: i, fim, ponto: c.ponto });
        break;
      }
      i = alvo.indexOf(c.n, i + 1);
    }
  }
  if (!achados.length) return esc(texto);

  achados.sort((a, b) => a.inicio - b.inicio);
  let saida = "", pos = 0;
  for (const a of achados) {
    saida += esc(texto.slice(pos, a.inicio));
    saida += `<button type="button" class="link-lugar" data-painel-lugar="${esc(favKey(a.ponto))}">${esc(texto.slice(a.inicio, a.fim))}</button>`;
    pos = a.fim;
  }
  return saida + esc(texto.slice(pos));
}

const campoLinkado = (rotulo, valor, zona) => (!valor || valor === "-") ? ""
  : `<div class="ficha__campo"><span class="rotulo">${rotulo}</span>${linkarLugares(valor, zona)}</div>`;

// Fatos que saem dos próprios lugares — nada escrito à mão.
function raioXHTML(zona) {
  const lista = estado.pontosPorZona.get(zona) || [];
  if (lista.length < 2) return "";
  const cats = {};
  lista.forEach((p) => (cats[p.categoria] = (cats[p.categoria] || 0) + 1));
  const composicao = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${v} ${k.toLowerCase()}`).join(" · ");

  const top = [...lista].sort((a, b) => (b.google_avaliacoes || 0) - (a.google_avaliacoes || 0))[0];
  const fecha = {};
  lista.forEach((p) => (p.horarios?.fecha_em || []).forEach((d) => (fecha[d] = (fecha[d] || 0) + 1)));
  const pior = Object.entries(fecha).sort((a, b) => b[1] - a[1])[0];

  return `
    <div class="raiox">
      <div class="raiox__linha"><strong>${lista.length} lugares</strong> · ${esc(composicao)}</div>
      ${top && top.google_avaliacoes ? `<div class="raiox__linha">⭐ Mais visitado: <strong>${esc(top.nome)}</strong> <span class="raiox__fraco">(${top.google_avaliacoes.toLocaleString("pt-BR")} avaliações)</span></div>` : ""}
      ${pior ? `<div class="raiox__linha raiox__linha--alerta">⚠️ Pior dia: <strong>${esc(pior[0])}</strong> — ${pior[1]} ${pior[1] > 1 ? "lugares fecham" : "lugar fecha"}</div>` : ""}
    </div>`;
}

function painelBairroHTML(z) {
  const m = MODOS[z.modo] || MODOS.trem;
  const destino = estacaoDaZona(z.zona);
  const lugares = estado.pontosPorZona.get(z.zona) || [];
  const combos = combosPorZona(z.zona);

  const passeio = (z.combina_com || []).map((nome) => {
    const v = zonaPorNome(nome);
    if (!v) return "";
    const ir = comoIrEntre(z.zona, nome);
    return `
      <button type="button" class="vizinho" data-painel-bairro="${esc(nome)}">
        <span class="vizinho__nome">${esc(nome)}</span>
        <span class="vizinho__como">${ir ? esc(ir.texto) : esc(v.tempo_ate || "")}</span>
        <span class="vizinho__seta">→</span>
      </button>`;
  }).join("");

  const imperdiveis = (z.imperdiveis || [])
    .map((d) => `<li><strong>${esc(d.nome)}</strong> — ${esc(d.nota)}</li>`).join("");

  const linhas = lugares.map((p) => {
    const h = horarioDoDia(p, diaReferencia());
    return `
      <button type="button" class="lugar-linha" data-painel-lugar="${esc(favKey(p))}">
        <span class="lugar-linha__nome">${esc(p.nome)}</span>
        <span class="lugar-linha__meta">
          ${esc(p.categoria)}${p.google_nota != null ? ` · ⭐${esc(p.google_nota)}` : ""}${h && h.fechado ? ` · <span class="lugar-linha__fechado">fecha ${esc(h.dia)}</span>` : ""}
        </span>
      </button>`;
  }).join("");

  return `
    <div class="painel__meta">
      <span class="pilula" style="background:${m.cor}1a;color:${m.cor}">${esc(z.tempo_ate || m.curto)}</span>
      ${iconesClima(z.clima)}
    </div>
    <div class="acoes">
      ${z.modo !== "casa" ? `<a class="btn-acao btn-acao--rota" href="${esc(urlRota(destino))}" target="_blank" rel="noopener">🧭 Como chegar</a>` : ""}
      <button type="button" class="btn-acao btn-mapa-zona" data-zona="${esc(z.zona)}">🗺️ Ver no mapa</button>
    </div>

    ${z.vibe ? `<p class="painel__vibe">${esc(z.vibe)}</p>` : ""}
    ${z.resumo ? `<p class="painel__desc">${esc(z.resumo)}</p>` : ""}

    ${raioXHTML(z.zona)}

    ${imperdiveis ? `<h3 class="painel__secao">✨ Não perca</h3><ul class="ficha__imperdiveis">${imperdiveis}</ul>` : ""}

    <div class="ficha__linha">
      ${z.tempo_ideal ? `<span>⏱ ${esc(z.tempo_ideal)}</span>` : ""}
      ${z.movimento ? `<span>📊 ${esc(z.movimento)}</span>` : ""}
      ${z.melhor_momento ? `<span>🕑 ${esc(z.melhor_momento)}</span>` : ""}
    </div>
    ${z.clima_nota ? `<p class="ficha__clima">${(z.clima || []).map((c) => CLIMA_EMOJI[c]).join(" ")} ${esc(z.clima_nota)}</p>` : ""}

    ${passeio ? `
      <h3 class="painel__secao">🚶 Passeio — emenda com</h3>
      <p class="painel__dica">Bairros que funcionam no mesmo dia, com o tempo real entre eles.</p>
      <div class="vizinhos">${passeio}</div>` : ""}

    ${linhas ? `<h3 class="painel__secao">📍 ${lugares.length} lugares aqui</h3><div class="lugar-linhas">${linhas}</div>` : ""}

    ${z.modo === "casa" ? comerPertoHTML() : ""}

    ${campo("Como chegar", z.como_chegar)}
    ${campoLinkado("Atrações", z.atracoes, z.zona)}
    ${campoLinkado("Compras", z.compras, z.zona)}
    ${campoLinkado("Comida / vida noturna", z.comida_vida_noturna, z.zona)}
    ${campo("Notas", z.notas)}

    ${combos.length ? `<div class="ficha__campo"><span class="rotulo">Roteiros que passam aqui</span><span class="combina">${
      combos.map((c) => `<button type="button" class="link-combo" data-comboid="${esc(c.id)}">${esc(c.nome)}</button>`).join(" · ")
    }</span></div>` : ""}`;
}

// Sobe o ponto na tela pra ele não ficar escondido atrás do painel.
function centralizarNoMapa(lat, lng) {
  if (!estado.map || $("#view-mapa").hidden) return;
  estado.map.setView([lat, lng], Math.max(estado.map.getZoom(), 15), { animate: true });
  const desloca = (estado.painel.altura / 100) * window.innerHeight * 0.45;
  setTimeout(() => estado.map.panBy([0, desloca], { animate: true }), 80);
}

function ligarArrastePainel() {
  const puxador = $("#painel-puxador"), painel = $("#painel");
  let inicioY = 0, alturaInicial = 0, arrastando = false;
  puxador.addEventListener("pointerdown", (e) => {
    arrastando = true; inicioY = e.clientY; alturaInicial = estado.painel.altura;
    painel.classList.add("is-arrastando");
    puxador.setPointerCapture(e.pointerId);
  });
  puxador.addEventListener("pointermove", (e) => {
    if (!arrastando) return;
    const delta = ((inicioY - e.clientY) / window.innerHeight) * 100;
    estado.painel.altura = Math.min(92, Math.max(16, alturaInicial + delta));
    painel.style.height = estado.painel.altura + "dvh";
  });
  const fim = () => {
    if (!arrastando) return;
    arrastando = false;
    painel.classList.remove("is-arrastando");
    if (estado.painel.altura < 28) { estado.painel.altura = 48; fecharPainel(); }
    else if (estado.painel.altura > 75) { estado.painel.altura = 92; painel.style.height = "92dvh"; }
  };
  puxador.addEventListener("pointerup", fim);
  puxador.addEventListener("pointercancel", fim);
}

/* --------------------------------- mapa --------------------------------- */
// O mapa padrão do OSM rotula o Japão só em kanji (渋谷区), o que deixa o mapa
// mudo pra quem não lê japonês. O World Street Map da Esri escreve o romaji
// junto do japonês ("Tomigaya" sob 冨ヶ谷) — dá pra ler E pra mostrar ao local.
// (A CARTO deixou de servir sem API key: as tiles vêm marcadas.)
const TILES = {
  latim: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    opts: { maxZoom: 19, attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a>' },
    rotulo: "🔤 Nomes em latim (romaji)",
  },
  japones: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    opts: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    rotulo: "🇯🇵 Nomes em japonês (OpenStreetMap)",
  },
};

function iconeCategoria(cat, fav) {
  return L.divIcon({
    className: "",
    html: `<div class="pin${fav ? " pin--fav" : ""}" style="background:${corCategoria(cat)}"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20],
  });
}

function aplicarTile(nome) {
  estado.tileAtual = nome;
  ls.set(TILE_KEY, nome);
  if (estado.tileLayer) estado.map.removeLayer(estado.tileLayer);
  const t = TILES[nome];
  estado.tileLayer = L.tileLayer(t.url, t.opts).addTo(estado.map);
  const b = $("#troca-mapa");
  if (b) b.title = t.rotulo;
}

function initMapa() {
  estado.map = L.map("map", { zoomControl: true }).setView([35.6465, 139.7101], 12);
  aplicarTile(ls.get(TILE_KEY, "latim") === "japones" ? "japones" : "latim");
  estado.camada = L.layerGroup().addTo(estado.map);

  const comGeo = estado.pontos.filter((p) => p.lat != null && p.lng != null);
  estado.marcadores = comGeo.map((ponto) => {
    const marker = L.marker([ponto.lat, ponto.lng], { icon: iconeCategoria(ponto.categoria, ehFav(ponto)) });
    // Sem popup: abre o painel, que cabe na tela e leva ao bairro.
    marker.on("click", () => abrirPainel("lugar", favKey(ponto), { empilhar: false }));
    return { ponto, marker };
  });
  const semGeo = estado.pontos.length - comGeo.length;
  if (semGeo > 0) { const a = $("#aviso-geo"); a.hidden = false; a.textContent = `${semGeo} ponto(s) sem coordenada não aparecem no mapa.`; }
  aplicarFiltrosMapa();
}

function aplicarFiltrosMapa(ajustarZoom = true) {
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
  if (ajustarZoom && bounds.length && bounds.length < total) estado.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
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

// Abre o mapa já filtrado nos bairros finos que compõem aquela zona.
function mapaDaZona(zonaNome) {
  const lugares = estado.pontosPorZona.get(zonaNome) || [];
  trocarView("mapa");
  estado.mapaFiltros = { bairro: "", categoria: "", busca: "", soFav: false };
  $("#busca").value = ""; $("#f-bairro").value = ""; $("#f-categoria").value = "";
  const ft = $("#fav-toggle"); ft.classList.remove("is-on"); ft.setAttribute("aria-pressed", "false");

  setTimeout(() => {
    estado.map.invalidateSize();
    const coords = lugares.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lat, p.lng]);
    estado.camada.clearLayers();
    const doZoom = new Set(lugares.map(favKey));
    let visiveis = 0;
    for (const { ponto, marker } of estado.marcadores) {
      if (doZoom.has(favKey(ponto))) { estado.camada.addLayer(marker); visiveis++; }
    }
    $("#contador").textContent = `${visiveis} ponto(s) em ${zonaNome}`;
    if (coords.length) estado.map.fitBounds(coords, { padding: [40, 40], maxZoom: 16 });
  }, 80);
}

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

/* ------------------------------- básico --------------------------------- */
function renderBasico() {
  $("#basico-lista").innerHTML = estado.basico.map((s) => `
    <details class="ficha ficha--basico" id="basico-${esc(s.id)}">
      <summary>
        <div class="ficha__topo">
          <span class="ficha__nome">${esc(s.icone)} ${esc(s.titulo)}</span>
        </div>
        <p class="ficha__vibe">${esc(s.resumo)}</p>
      </summary>
      <div class="ficha__corpo">
        ${(s.itens || []).map((i) => `
          <div class="ficha__campo">
            <span class="rotulo">${esc(i.t)}</span>
            ${esc(i.d)}
          </div>`).join("")}
      </div>
    </details>`).join("");

  const inp = $("#casa-endereco");
  if (inp) inp.value = ls.get(CASA_KEY, "") || "";
}

/* ---------------------------- clima ao vivo ----------------------------- */
const wmoParaClima = (code) => (code <= 2 ? "sol" : code <= 48 ? "nublado" : "chuva");

async function carregarClima() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=35.6465&longitude=139.7101" +
      "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&timezone=Asia%2FTokyo&forecast_days=16";
    const r = await fetch(url);
    if (!r.ok) throw new Error("clima");
    const d = await r.json();
    if (!d.current || !d.daily) throw new Error("clima");

    estado.climaAgora = { cat: wmoParaClima(d.current.weather_code), temp: Math.round(d.current.temperature_2m) };
    d.daily.time.forEach((iso, i) => {
      estado.climaPorDia.set(iso, {
        cat: wmoParaClima(d.daily.weather_code[i]),
        max: Math.round(d.daily.temperature_2m_max[i]),
        min: Math.round(d.daily.temperature_2m_min[i]),
      });
    });
    renderHoje(); // redesenha com a previsão já disponível
  } catch (e) {
    /* offline ou API fora do ar: o guia segue funcionando sem previsão */
  }
}

/* --------------------- navegação entre as abas -------------------------- */
function trocarView(nome) {
  $$(".tab").forEach((t) => { const on = t.dataset.view === nome; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
  $$(".view").forEach((v) => { const on = v.id === "view-" + nome; v.classList.toggle("is-active", on); v.hidden = !on; });
  if (nome === "mapa" && estado.map) setTimeout(() => estado.map.invalidateSize(), 60);
  window.scrollTo({ top: 0 });
}

function abrirCombo(id) {
  trocarView("explorar");
  const alvo = document.querySelector(`#view-explorar [data-comboid="${CSS.escape(id)}"]`);
  if (alvo) { alvo.open = true; setTimeout(() => alvo.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
}

/* -------------------------------- eventos ------------------------------- */
document.addEventListener("click", (e) => {
  const dia = e.target.closest(".dia-chip");
  if (dia) {
    estado.diaSel = Number(dia.dataset.dia);
    renderHoje();
    explorarFiltrar(); // os horários dos lugares seguem o dia escolhido
    return;
  }

  const cp = e.target.closest(".btn-copiar");
  if (cp) {
    e.preventDefault();
    navigator.clipboard?.writeText(cp.dataset.copiar).then(() => {
      cp.textContent = "✓";
      setTimeout(() => { cp.textContent = "📋"; }, 1200);
    }).catch(() => {});
    return;
  }

  const pl = e.target.closest("[data-painel-lugar]");
  if (pl) { e.preventDefault(); abrirPainel("lugar", pl.dataset.painelLugar); return; }

  const pb = e.target.closest("[data-painel-bairro]");
  if (pb) { e.preventDefault(); abrirPainel("bairro", pb.dataset.painelBairro); return; }

  const mz = e.target.closest(".btn-mapa-zona");
  if (mz) { e.preventDefault(); fecharPainel(); mapaDaZona(mz.dataset.zona); return; }

  // Nome de bairro em qualquer lugar (busca, Hoje, ficha) abre o painel dele.
  const lz = e.target.closest(".link-zona");
  if (lz) { e.preventDefault(); abrirPainel("bairro", lz.dataset.zona, { empilhar: false }); return; }

  const lc = e.target.closest(".link-combo");
  if (lc) { e.preventDefault(); fecharPainel(); abrirCombo(lc.dataset.comboid); return; }

  const fb = e.target.closest("[data-favkey]");
  if (fb) { e.preventDefault(); toggleFav(fb.dataset.favkey); return; }
});

document.addEventListener("input", (e) => {
  const ta = e.target.closest(".pop__nota");
  if (ta) setNota(ta.dataset.notakey, ta.value);
});

function ligarEventos() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => trocarView(t.dataset.view)));

  $("#montar-limpar").addEventListener("click", () => {
    Object.values(estado.sel).forEach((s) => s.clear());
    $$(".chip").forEach((c) => c.classList.remove("is-on"));
    explorarFiltrar();
  });

  $("#busca-global").addEventListener("input", debounce((e) => buscaGlobal(e.target.value), 180));
  $("#busca").addEventListener("input", debounce((e) => { estado.mapaFiltros.busca = e.target.value; aplicarFiltrosMapa(); }, 200));
  $("#f-bairro").addEventListener("change", (e) => { estado.mapaFiltros.bairro = e.target.value; aplicarFiltrosMapa(); });
  $("#f-categoria").addEventListener("change", (e) => { estado.mapaFiltros.categoria = e.target.value; aplicarFiltrosMapa(); });

  $("#limpar").addEventListener("click", () => {
    estado.mapaFiltros = { bairro: "", categoria: "", busca: "", soFav: false };
    $("#busca").value = ""; $("#f-bairro").value = ""; $("#f-categoria").value = "";
    const ft = $("#fav-toggle"); ft.classList.remove("is-on"); ft.setAttribute("aria-pressed", "false");
    aplicarFiltrosMapa(false); estado.map.setView([35.6465, 139.7101], 12);
  });

  $("#troca-mapa").addEventListener("click", () => {
    aplicarTile(estado.tileAtual === "latim" ? "japones" : "latim");
  });

  const toggle = $("#toggle-legenda");
  toggle.addEventListener("click", () => {
    const leg = $("#legenda"); leg.hidden = !leg.hidden;
    toggle.setAttribute("aria-expanded", leg.hidden ? "false" : "true");
    toggle.classList.toggle("is-on", !leg.hidden);
  });

  $("#painel-fechar").addEventListener("click", fecharPainel);
  $("#painel-voltar").addEventListener("click", voltarPainel);
  ligarArrastePainel();
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || $("#painel").hidden) return;
    estado.painel.pilha.length > 1 ? voltarPainel() : fecharPainel();
  });
  // Trocar de aba fecha o painel: ele é sempre sobre o conteúdo atual.
  $$(".tab").forEach((t) => t.addEventListener("click", fecharPainel));
  // Recolher/abrir os filtros muda a altura do mapa.
  $("#filtros-mapa").addEventListener("toggle", () => {
    if (estado.map) setTimeout(() => estado.map.invalidateSize(), 220);
  });

  $("#fav-toggle").addEventListener("click", (e) => {
    estado.mapaFiltros.soFav = !estado.mapaFiltros.soFav;
    e.currentTarget.classList.toggle("is-on", estado.mapaFiltros.soFav);
    e.currentTarget.setAttribute("aria-pressed", estado.mapaFiltros.soFav ? "true" : "false");
    aplicarFiltrosMapa();
  });
  $("#perto").addEventListener("click", pertoDeMim);

  const anot = $("#anot-texto");
  if (anot) anot.addEventListener("input", debounce((e) => ls.set(BLOCO_KEY, e.target.value), 300));

  const casa = $("#casa-endereco");
  if (casa) casa.addEventListener("input", debounce((e) => {
    ls.set(CASA_KEY, e.target.value);
    atualizarBotaoCasa();
    renderHoje();
  }, 400));
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
  carregarNotas();

  estado.diaSel = indiceDoDiaAtual();
  renderHoje();

  initChips();
  explorarFiltrar();
  renderIndiceBairros();
  renderBasico();
  preencherSelectsMapa();
  renderLegenda();
  initMapa();
  ligarEventos();
  atualizarBotaoFav();
  atualizarBotaoCasa();
  renderFavoritos();

  const bloco = $("#anot-texto");
  if (bloco) bloco.value = ls.get(BLOCO_KEY, "") || "";

  $("#carregando").classList.add("is-hidden");
  carregarClima(); // não bloqueia; se falhar, o guia segue sem previsão
}
document.addEventListener("DOMContentLoaded", init);

// Service worker (offline + instalável). Caminho relativo p/ funcionar em subpasta.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
