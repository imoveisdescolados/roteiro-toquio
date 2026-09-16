/* ==========================================================================
   Onde comer a pé de casa (Ebisu). Roda uma vez; grava data/comer_perto.json.

   Por que só aqui e não em todos os bairros: nos outros você come onde
   estiver, mas perto de casa é o caso real — chegando tarde, cansado, com
   tudo fechando às 20h. Aqui a informação é factual (vem do Google), e não
   restaurante que eu lembrei de cabeça.

   Uso:
     node scripts/comer-perto.mjs --simular   # mostra, não grava
     node scripts/comer-perto.mjs             # grava
     node scripts/comer-perto.mjs --raio 1000 # muda o raio (padrão 700 m)

   Custo: 1 Nearby Search + ~15 Place Details. Dentro da cota grátis.
   ========================================================================== */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ARQ = "data/comer_perto.json";
const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const RAIO = Number(args[args.indexOf("--raio") + 1]) || 700;

// Onde é "casa". O guia usa a estação de Ebisu como padrão; se vocês quiserem
// centrar no endereço exato do Airbnb, troque aqui.
const CASA = { nome: "Ebisu Station, Shibuya City, Tokyo", lat: 35.6467, lng: 139.7100 };

const MIN_AVALIACOES = 80;   // abaixo disso não dá pra confiar na nota
const MIN_NOTA = 3.8;

// Duas buscas: o geral do bairro, e uma só de cozinha ocidental — porque lá
// pelo quinto dia bate a vontade de comer algo que não seja japonês, e no
// resultado geral de Ebisu isso some no meio dos ramens.
const GRUPOS = [
  { cozinha: "geral", quantos: 14, raio: RAIO, tipos: ["restaurant"] },
  {
    cozinha: "ocidental", quantos: 8, raio: Math.max(RAIO, 1000),
    tipos: ["italian_restaurant", "french_restaurant", "american_restaurant",
      "spanish_restaurant", "greek_restaurant", "mediterranean_restaurant",
      "mexican_restaurant", "brazilian_restaurant", "pizza_restaurant",
      "steak_house", "hamburger_restaurant"],
  },
];

async function lerChave() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY.trim();
  if (existsSync(".env.local")) {
    const m = (await readFile(".env.local", "utf8")).match(/^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  console.error("Não achei a chave em .env.local (GOOGLE_MAPS_API_KEY=...)");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const PRECO = {
  PRICE_LEVEL_FREE: "grátis", PRICE_LEVEL_INEXPENSIVE: "¥", PRICE_LEVEL_MODERATE: "¥¥",
  PRICE_LEVEL_EXPENSIVE: "¥¥¥", PRICE_LEVEL_VERY_EXPENSIVE: "¥¥¥¥",
};
const DIAS_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function distanciaM(a, b, c, d) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (c - a) * rad, dLng = (d - b) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const CAMPOS = [
  "places.id", "places.displayName", "places.primaryTypeDisplayName", "places.types",
  "places.rating", "places.userRatingCount", "places.priceLevel", "places.regularOpeningHours",
  "places.shortFormattedAddress", "places.location", "places.googleMapsUri", "places.websiteUri",
].join(",");

const chave = await lerChave();

// Nota pesa, mas um lugar com 3.000 avaliações é mais seguro que um com 90.
const confianca = (p) => (p.rating || 0) * Math.log10(p.userRatingCount || 1);

async function buscar(grupo) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
    body: JSON.stringify({
      includedTypes: grupo.tipos,
      excludedTypes: ["fast_food_restaurant", "convenience_store"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      languageCode: "pt-BR",
      regionCode: "JP",
      locationRestriction: { circle: { center: { latitude: CASA.lat, longitude: CASA.lng }, radius: grupo.raio } },
    }),
  });
  if (!r.ok) { console.error(`Erro ${r.status}: ${(await r.text()).slice(0, 400)}`); process.exit(1); }
  return (await r.json()).places || [];
}

const escolhidos = [];        // { place, cozinha }
const vistos = new Set();
for (const grupo of GRUPOS) {
  console.log(`\nBuscando "${grupo.cozinha}" num raio de ${grupo.raio} m de ${CASA.nome}…`);
  const achados = await buscar(grupo);
  const bons = achados
    .filter((p) => (p.rating || 0) >= MIN_NOTA && (p.userRatingCount || 0) >= MIN_AVALIACOES)
    .sort((a, b) => confianca(b) - confianca(a));

  // Corta primeiro, decide depois: assim o grupo tem exatamente `quantos`,
  // contando tanto os novos quanto os que já vieram do grupo anterior e só
  // precisam ser reclassificados (a Peter Luger é ocidental, não "geral").
  const top = bons.slice(0, grupo.quantos);
  let novos = 0, reclassificados = 0;
  for (const p of top) {
    const ja = escolhidos.find((x) => x.place.id === p.id);
    if (ja) { ja.cozinha = grupo.cozinha; reclassificados++; continue; }
    vistos.add(p.id);
    escolhidos.push({ place: p, cozinha: grupo.cozinha });
    novos++;
  }
  console.log(`  ${achados.length} encontrados · ${bons.length} passaram no filtro · ${novos} novos + ${reclassificados} reclassificados = ${top.length}`);
}

const lista = [];
for (const { place: p, cozinha } of escolhidos) {
  let ja = null;
  const d = await fetch(`https://places.googleapis.com/v1/places/${p.id}?languageCode=ja&regionCode=JP`, {
    headers: { "X-Goog-Api-Key": chave, "X-Goog-FieldMask": "displayName,shortFormattedAddress" },
  });
  if (d.ok) { const j = await d.json(); ja = { nome_ja: j.displayName?.text || null, endereco_ja: j.shortFormattedAddress || null }; }
  await dormir(120);

  const descr = p.regularOpeningHours?.weekdayDescriptions || [];
  const item = {
    place_id: p.id,
    cozinha,
    nome: p.displayName?.text || "",
    nome_ja: ja?.nome_ja || null,
    endereco_ja: ja?.endereco_ja || null,
    tipo: p.primaryTypeDisplayName?.text || null,
    nota: p.rating ?? null,
    avaliacoes: p.userRatingCount ?? null,
    faixa_preco: PRECO[p.priceLevel] || null,
    endereco: p.shortFormattedAddress || null,
    metros: distanciaM(CASA.lat, CASA.lng, p.location.latitude, p.location.longitude),
    minutos_a_pe: Math.max(1, Math.round(distanciaM(CASA.lat, CASA.lng, p.location.latitude, p.location.longitude) / 80)),
    site: p.websiteUri || null,
    maps_uri: p.googleMapsUri || null,
    lat: p.location.latitude, lng: p.location.longitude,
    horarios: descr.length ? {
      descricao: descr,
      fecha_em: descr.map((l, i) => (/fechad|closed/i.test(l) ? DIAS_PT[i] : null)).filter(Boolean),
    } : null,
  };
  lista.push(item);
}

// Ordena por cozinha e, dentro de cada uma, por confiança da nota.
const ORDEM = ["geral", "ocidental"];
lista.sort((a, b) => ORDEM.indexOf(a.cozinha) - ORDEM.indexOf(b.cozinha)
  || (b.nota * Math.log10(b.avaliacoes)) - (a.nota * Math.log10(a.avaliacoes)));

for (const g of ORDEM) {
  const doGrupo = lista.filter((x) => x.cozinha === g);
  if (!doGrupo.length) continue;
  console.log(`\n── ${g} (${doGrupo.length}) ──`);
  for (const x of doGrupo) {
    console.log(`  ⭐${String(x.nota).padEnd(3)} (${String(x.avaliacoes).padStart(5)})  ${x.minutos_a_pe} min  ${(x.faixa_preco || "—").padEnd(4)}  ${x.nome}${x.nome_ja ? "  · " + x.nome_ja : ""}`);
    console.log(`         ${x.tipo || "—"}${x.horarios?.fecha_em.length ? ` · fecha ${x.horarios.fecha_em.join("/")}` : ""}`);
  }
}

console.log(`\n${lista.length} lugares no total.`);
if (SIMULAR) { console.log("(simulação — nada gravado)\n"); }
else {
  await writeFile(ARQ, JSON.stringify({
    casa: CASA.nome, raio_m: RAIO, gerado_em: new Date().toISOString().slice(0, 10), lugares: lista,
  }, null, 2) + "\n");
  console.log(`Gravado em ${ARQ}\n`);
}
