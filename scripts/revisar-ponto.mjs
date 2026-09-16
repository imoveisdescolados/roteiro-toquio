/* Reconsulta pontos específicos mostrando TODOS os candidatos, em inglês.
   Serve pra decidir à mão os casos que o enriquecimento marcou como duvidosos.

   Uso:  node scripts/revisar-ponto.mjs "Inokashira Park" "Miraikan"
   Não grava nada — só imprime as opções pra você escolher.                    */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

async function lerChave() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY.trim();
  if (existsSync(".env.local")) {
    const m = (await readFile(".env.local", "utf8")).match(/^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  console.error("Não achei a chave em .env.local"); process.exit(1);
}

function distanciaM(a, b, c, d) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (c - a) * rad, dLng = (d - b) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const CAMPOS = ["places.id", "places.displayName", "places.shortFormattedAddress", "places.location",
  "places.primaryTypeDisplayName", "places.rating", "places.userRatingCount", "places.regularOpeningHours"].join(",");

const chave = await lerChave();
const pontos = JSON.parse(await readFile("data/data_pontos_interesse_geo.json", "utf8"));
const args = process.argv.slice(2);

// --q "texto livre": busca solta em Tóquio, sem partir de um ponto existente.
// Útil quando o nome que temos não é o nome oficial do lugar.
const iq = args.indexOf("--q");
if (iq !== -1) {
  const termo = args[iq + 1];
  console.log(`\n### busca livre: "${termo}"`);
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
    body: JSON.stringify({ textQuery: termo, languageCode: "en", regionCode: "JP", maxResultCount: 5 }),
  });
  if (!r.ok) { console.log(`ERRO ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  ((await r.json()).places || []).forEach((c, i) => {
    console.log(`    ${i + 1}. ${c.displayName?.text}`);
    console.log(`       ${c.primaryTypeDisplayName?.text || "—"} · ⭐${c.rating ?? "—"} (${c.userRatingCount ?? 0})`);
    console.log(`       ${c.shortFormattedAddress || "—"}`);
    console.log(`       id: ${c.id}`);
    console.log(`       coord: ${c.location?.latitude}, ${c.location?.longitude}`);
  });
  console.log("");
}
if (iq === -1) {

const alvos = args;
if (!alvos.length) { console.error('Passe os nomes: node scripts/revisar-ponto.mjs "Inokashira Park"   ou   --q "texto livre"'); process.exit(1); }


for (const alvo of alvos) {
  const p = pontos.find((x) => x.nome === alvo) || pontos.find((x) => x.nome.toLowerCase().includes(alvo.toLowerCase()));
  if (!p) { console.log(`\n### "${alvo}" — não achei esse ponto nos dados\n`); continue; }

  console.log(`\n### ${p.nome}  [${p.categoria} · ${p.bairro}]`);
  console.log(`    guardado hoje: ${p.lat}, ${p.lng}${p.geo_fonte ? ` (fonte: ${p.geo_fonte})` : ""}${p.geo_jitter ? " (APROXIMADO)" : ""}`);
  console.log(`    place_id atual: ${p.place_id || "—"}`);

  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
    body: JSON.stringify({
      textQuery: `${p.nome}, ${p.bairro}, Tokyo`,
      languageCode: "en",              // inglês: evita nome traduzido atrapalhar a comparação
      regionCode: "JP",
      maxResultCount: 5,
      locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 3000 } },
    }),
  });
  if (!r.ok) { console.log(`    ERRO ${r.status}: ${(await r.text()).slice(0, 200)}`); continue; }

  const lista = (await r.json()).places || [];
  lista.forEach((c, i) => {
    const d = c.location ? distanciaM(p.lat, p.lng, c.location.latitude, c.location.longitude) : null;
    const marca = c.id === p.place_id ? " ←– é o que está gravado" : "";
    console.log(`    ${i + 1}. ${c.displayName?.text}${marca}`);
    console.log(`       ${c.primaryTypeDisplayName?.text || "—"} · ${d ?? "?"}m · ⭐${c.rating ?? "—"} (${c.userRatingCount ?? 0})`);
    console.log(`       ${c.shortFormattedAddress || "—"}`);
    console.log(`       id: ${c.id}`);
    console.log(`       coord: ${c.location?.latitude}, ${c.location?.longitude}`);
  });
  await new Promise((r) => setTimeout(r, 150));
}
console.log("");
}
