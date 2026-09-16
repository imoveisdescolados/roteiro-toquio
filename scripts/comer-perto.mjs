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
const QUANTOS = 14;

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

console.log(`\nProcurando onde comer num raio de ${RAIO} m de ${CASA.nome}…`);
const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
  body: JSON.stringify({
    includedTypes: ["restaurant"],
    excludedTypes: ["fast_food_restaurant", "convenience_store"],
    maxResultCount: 20,
    rankPreference: "POPULARITY",
    languageCode: "pt-BR",
    regionCode: "JP",
    locationRestriction: { circle: { center: { latitude: CASA.lat, longitude: CASA.lng }, radius: RAIO } },
  }),
});
if (!r.ok) {
  console.error(`Erro ${r.status}: ${(await r.text()).slice(0, 400)}`);
  process.exit(1);
}
const achados = (await r.json()).places || [];
console.log(`${achados.length} restaurantes encontrados. Filtrando por nota ≥ ${MIN_NOTA} e ≥ ${MIN_AVALIACOES} avaliações…\n`);

const bons = achados
  .filter((p) => (p.rating || 0) >= MIN_NOTA && (p.userRatingCount || 0) >= MIN_AVALIACOES)
  // nota pesa, mas um lugar com 3.000 avaliações é mais seguro que um com 90
  .sort((a, b) => (b.rating * Math.log10(b.userRatingCount)) - (a.rating * Math.log10(a.userRatingCount)))
  .slice(0, QUANTOS);

const lista = [];
for (const p of bons) {
  let ja = null;
  const d = await fetch(`https://places.googleapis.com/v1/places/${p.id}?languageCode=ja&regionCode=JP`, {
    headers: { "X-Goog-Api-Key": chave, "X-Goog-FieldMask": "displayName,shortFormattedAddress" },
  });
  if (d.ok) { const j = await d.json(); ja = { nome_ja: j.displayName?.text || null, endereco_ja: j.shortFormattedAddress || null }; }
  await dormir(120);

  const descr = p.regularOpeningHours?.weekdayDescriptions || [];
  const item = {
    place_id: p.id,
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
  console.log(`  ⭐${String(item.nota).padEnd(3)} (${String(item.avaliacoes).padStart(5)})  ${item.minutos_a_pe} min  ${item.faixa_preco || "—"}  ${item.nome}  ${item.nome_ja ? "· " + item.nome_ja : ""}`);
  console.log(`         ${item.tipo || "—"}${item.horarios?.fecha_em.length ? ` · fecha ${item.horarios.fecha_em.join("/")}` : ""}`);
}

console.log(`\n${lista.length} lugares selecionados.`);
if (SIMULAR) { console.log("(simulação — nada gravado)\n"); }
else {
  await writeFile(ARQ, JSON.stringify({
    casa: CASA.nome, raio_m: RAIO, gerado_em: new Date().toISOString().slice(0, 10), lugares: lista,
  }, null, 2) + "\n");
  console.log(`Gravado em ${ARQ}\n`);
}
