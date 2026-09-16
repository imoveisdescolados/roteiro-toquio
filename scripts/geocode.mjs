// Geocodifica os pontos de data_pontos_interesse.json UMA vez usando o
// Nominatim (OpenStreetMap) e grava data_pontos_interesse_geo.json com lat/lng.
//
// Uso:  node scripts/geocode.mjs
//
// ⚠️  SÓ FAZ SENTIDO RODAR ANTES DO ENRIQUECIMENTO PELO GOOGLE PLACES.
// Este script parte do arquivo ORIGINAL (data_pontos_interesse.json), que não
// tem nada do que veio depois: horários, nome em japonês, notas, as lojas
// adicionadas à mão nem os pontos removidos. Rodar hoje jogaria tudo fora.
// Por isso ele se recusa a sobrescrever um arquivo já enriquecido — veja a
// trava logo abaixo. Para corrigir coordenadas hoje, use:
//     node scripts/enriquecer-places.mjs --corrigir
//
// Regras respeitadas: 1 requisição por segundo, User-Agent identificável,
// resultados fora da área de Tóquio são descartados. O script é retomável:
// se rodar de novo, reaproveita o que já foi resolvido no arquivo _geo.
//
// Requer Node 18+ (usa fetch nativo). Testado no Node 24.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SRC = join(DATA_DIR, "data_pontos_interesse.json");
const OUT = join(DATA_DIR, "data_pontos_interesse_geo.json");

// Trava: não deixa apagar o enriquecimento do Google por engano.
if (existsSync(OUT) && !process.argv.includes("--forcar")) {
  const atual = JSON.parse(readFileSync(OUT, "utf8"));
  const enriquecidos = atual.filter((p) => p.place_id).length;
  if (enriquecidos) {
    console.error(`
⛔ Parado pra não destruir dados.

   ${OUT}
   já tem ${enriquecidos} de ${atual.length} pontos enriquecidos pelo Google Places
   (horários, nome em japonês, notas, coordenada exata).

   Este script recomeça do zero a partir do arquivo original e apagaria tudo
   isso — além das lojas adicionadas à mão e dos pontos removidos.

   Para ajustar coordenadas hoje:  node scripts/enriquecer-places.mjs --corrigir
   Se você REALMENTE quer recomeçar:  node scripts/geocode.mjs --forcar
`);
    process.exit(1);
  }
}

// Caixa delimitadora aproximada da Grande Tóquio (23 distritos + oeste).
const TOKYO = { minLat: 35.45, maxLat: 35.9, minLng: 139.4, maxLng: 139.95 };
const UA = "roteiro-toquio-pessoal/1.0 (uso pessoal; planejamento de viagem)";
const SLEEP_MS = 1100; // > 1s, margem de segurança para o rate limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inTokyo(lat, lng) {
  return lat >= TOKYO.minLat && lat <= TOKYO.maxLat && lng >= TOKYO.minLng && lng <= TOKYO.maxLng;
}

// Remove ruído em português / referências relativas que atrapalham o geocoding.
function limparEndereco(e) {
  if (!e) return "";
  return e
    .replace(/~?\s*\d+\s*min[^,]*/gi, "")           // "~5 min a pé..."
    .replace(/\b\d+F(-\d+F)?\b/gi, "")               // "1F-2F", "8F"
    .replace(/\bB\d+\b/gi, "")                       // "B1"
    .replace(/direto na esta[çc][ãa]o[^,]*/gi, "")
    .replace(/perto da esta[çc][ãa]o[^,]*/gi, "")
    .replace(/pr[óo]ximo[^,]*/gi, "")
    .replace(/ao lado[^,]*/gi, "")
    .replace(/ligad[oa][^,]*/gi, "")
    .replace(/em cima[^,]*/gi, "")
    .replace(/lado (leste|oeste|norte|sul)[^,]*/gi, "")
    .replace(/sa[íi]da[^,]*/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*,|,\s*$/g, "")
    .trim();
}

async function nominatim(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} para "${q}"`);
  const arr = await res.json();
  await sleep(SLEEP_MS);
  if (!arr.length) return null;
  const { lat, lon } = arr[0];
  return { lat: parseFloat(lat), lng: parseFloat(lon) };
}

// Tenta uma lista de consultas em ordem; devolve a 1ª que cair dentro de Tóquio.
async function geocodeQueries(queries) {
  for (const q of queries) {
    if (!q) continue;
    try {
      const hit = await nominatim(q);
      if (hit && inTokyo(hit.lat, hit.lng)) return { ...hit, matched_query: q };
    } catch (err) {
      console.warn("  ! erro:", err.message);
      await sleep(SLEEP_MS);
    }
  }
  return null;
}

// Afasta levemente pontos com coordenadas idênticas (endereços vagos que caem
// no mesmo centroide de bairro) para os marcadores não se sobreporem.
function jitterDuplicados(pontos) {
  const vistos = new Map();
  for (const p of pontos) {
    if (p.lat == null) continue;
    const chave = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const n = vistos.get(chave) || 0;
    if (n > 0) {
      const ang = (n * 137.5 * Math.PI) / 180; // espiral de ângulo áureo
      const raio = 0.00025 * Math.ceil(n / 6); // ~28m por anel
      p.lat += raio * Math.cos(ang);
      p.lng += raio * Math.sin(ang);
      p.geo_jitter = true;
    }
    vistos.set(chave, n + 1);
  }
}

async function main() {
  const pontos = JSON.parse(readFileSync(SRC, "utf8"));

  // Retomada: reaproveita coordenadas já resolvidas de uma execução anterior.
  const cache = new Map();
  if (existsSync(OUT)) {
    for (const p of JSON.parse(readFileSync(OUT, "utf8"))) {
      if (p.lat != null && !p.geo_jitter) cache.set(p.nome + "|" + p.bairro, { lat: p.lat, lng: p.lng });
    }
    console.log(`Cache: ${cache.size} pontos já resolvidos serão reaproveitados.`);
  }

  const resultado = [];
  let ok = 0, cacheHit = 0, falhou = 0;

  for (let i = 0; i < pontos.length; i++) {
    const p = { ...pontos[i] };
    const chaveCache = p.nome + "|" + p.bairro;

    if (cache.has(chaveCache)) {
      Object.assign(p, cache.get(chaveCache));
      resultado.push(p);
      cacheHit++;
      continue;
    }

    const endLimpo = limparEndereco(p.endereco);
    const queries = [
      `${p.nome}, ${p.bairro}, Tokyo, Japan`,
      endLimpo ? `${endLimpo}, Tokyo, Japan` : null,
      `${p.nome}, Tokyo, Japan`,
      `${p.bairro}, Tokyo, Japan`,
    ];

    process.stdout.write(`[${i + 1}/${pontos.length}] ${p.nome} … `);
    const hit = await geocodeQueries(queries);
    if (hit) {
      p.lat = hit.lat;
      p.lng = hit.lng;
      p.geo_query = hit.matched_query;
      ok++;
      console.log(`ok (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`);
    } else {
      p.lat = null;
      p.lng = null;
      falhou++;
      console.log("FALHOU — sem coordenada");
    }
    resultado.push(p);

    // Grava progresso a cada 10 pontos (execução retomável).
    if ((i + 1) % 10 === 0) writeFileSync(OUT, JSON.stringify(resultado, null, 2));
  }

  jitterDuplicados(resultado);
  writeFileSync(OUT, JSON.stringify(resultado, null, 2));

  console.log(`\nConcluído. Geocodificados agora: ${ok} | reaproveitados: ${cacheHit} | falharam: ${falhou}`);
  console.log(`Arquivo gravado: ${OUT}`);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
