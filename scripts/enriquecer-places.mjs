/* ==========================================================================
   Enriquece os 159 pontos com dados da Google Places API (New).
   Roda UMA VEZ, na sua máquina. O site publicado não leva chave nenhuma —
   os dados ficam gravados nos JSON.

   Uso:
     node scripts/enriquecer-places.mjs --teste      # só 5 pontos, não grava nada
     node scripts/enriquecer-places.mjs --simular    # todos, mas não grava
     node scripts/enriquecer-places.mjs              # pra valer
     node scripts/enriquecer-places.mjs --refazer    # ignora o cache e refaz tudo

   A chave sai de .env.local (GOOGLE_MAPS_API_KEY=...) ou da variável de
   ambiente de mesmo nome. Ela nunca é impressa na tela nem gravada em log.

   Custo: 1 Text Search (Enterprise) + 1 Place Details (Pro) por ponto.
   159 pontos = 159 + 159 chamadas, dentro das cotas grátis (1.000 e 5.000/mês).
   ========================================================================== */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ARQ_PONTOS = "data/data_pontos_interesse_geo.json";
const ARQ_CACHE = "data/places_cache.json";
const ARQ_CORRECOES = "data/places_correcoes.json";
const ARQ_RELATORIO = "data/places_relatorio.md";

const args = process.argv.slice(2);
const TESTE = args.includes("--teste");
const SIMULAR = args.includes("--simular") || TESTE;
const REFAZER = args.includes("--refazer");
const CORRIGIR = args.includes("--corrigir");   // reprocessa só os de places_correcoes.json
const LIMITE = TESTE ? 5 : Infinity;

/* ----------------------------- a chave ---------------------------------- */
async function lerChave() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY.trim();
  if (existsSync(".env.local")) {
    const txt = await readFile(".env.local", "utf8");
    const m = txt.match(/^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  console.error(`
❌ Não achei a chave.

Crie um arquivo chamado  .env.local  na raiz do projeto com UMA linha:

    GOOGLE_MAPS_API_KEY=cole_sua_chave_aqui

O .gitignore já bloqueia esse arquivo, então ele nunca vai pro GitHub.
`);
  process.exit(1);
}

/* --------------------------- utilidades --------------------------------- */
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function distanciaM(a, b, c, d) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (c - a) * rad, dLng = (d - b) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Quanto os dois nomes se parecem (0 a 1), por sobreposição de palavras.
function parecencaNome(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  let comuns = 0;
  for (const w of A) if (B.has(w)) comuns++;
  return comuns / Math.min(A.size, B.size);
}

/* ------------------------------ chamadas -------------------------------- */
const CAMPOS_BUSCA = [
  "places.id", "places.displayName", "places.formattedAddress", "places.shortFormattedAddress",
  "places.location", "places.googleMapsUri", "places.businessStatus",
  "places.primaryTypeDisplayName", "places.types",
  "places.regularOpeningHours", "places.websiteUri", "places.nationalPhoneNumber",
  "places.rating", "places.userRatingCount", "places.priceLevel", "places.photos",
].join(",");

async function buscar(chave, ponto) {
  // Viés de localização: o ponto aproximado (geo_jitter) merece raio maior,
  // porque a coordenada atual é só o centroide do bairro.
  const raio = ponto.geo_jitter ? 4000 : 1500;
  const corpo = {
    textQuery: [ponto.nome, ponto.endereco, "Tokyo"].filter(Boolean).join(", "),
    languageCode: "pt-BR",
    regionCode: "JP",
    maxResultCount: 5,
  };
  if (ponto.lat != null && ponto.lng != null) {
    corpo.locationBias = { circle: { center: { latitude: ponto.lat, longitude: ponto.lng }, radius: raio } };
  }
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS_BUSCA },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`searchText ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).places || [];
}

async function nomeEmJapones(chave, placeId) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ja&regionCode=JP`, {
    headers: { "X-Goog-Api-Key": chave, "X-Goog-FieldMask": "displayName,shortFormattedAddress" },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return { nome_ja: d.displayName?.text || null, endereco_ja: d.shortFormattedAddress || null };
}

// Busca um lugar pelo place_id, quando a escolha já foi feita à mão
// (data/places_correcoes.json). Mesmos campos da busca por texto.
async function detalhes(chave, placeId) {
  const campos = CAMPOS_BUSCA.split(",").map((c) => c.replace(/^places\./, "")).join(",");
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=pt-BR&regionCode=JP`, {
    headers: { "X-Goog-Api-Key": chave, "X-Goog-FieldMask": campos },
  });
  if (!r.ok) throw new Error(`placeDetails ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

/* ------------------------- escolha do resultado ------------------------- */
function escolherMelhor(ponto, candidatos) {
  const avaliados = candidatos.map((c) => {
    const nome = c.displayName?.text || "";
    const dist = (ponto.lat != null && c.location)
      ? distanciaM(ponto.lat, ponto.lng, c.location.latitude, c.location.longitude) : null;
    const sim = parecencaNome(ponto.nome, nome);
    // Nome pesa mais que distância: a coordenada de origem pode estar errada,
    // o nome não. A distância só desempata e detecta homônimo em outro bairro.
    let pontuacao = sim * 100;
    if (dist != null) pontuacao -= Math.min(dist / 100, 30);
    return { c, nome, dist, sim, pontuacao };
  }).sort((a, b) => b.pontuacao - a.pontuacao);

  const melhor = avaliados[0];
  if (!melhor) return null;

  // Confiança: com que tranquilidade dá pra sobrescrever a coordenada antiga.
  const limiteDist = ponto.geo_jitter ? 4000 : 800;
  let confianca;
  if (melhor.sim >= 0.75 && (melhor.dist == null || melhor.dist <= limiteDist)) confianca = "alta";
  else if (melhor.sim >= 0.45 || (melhor.dist != null && melhor.dist <= 250)) confianca = "media";
  else confianca = "baixa";

  return { ...melhor, confianca };
}

/* -------------------------- formatação de saída ------------------------- */
const DIAS_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

// Os dias de fechamento saem do próprio texto do Google ("segunda-feira: Fechado"),
// e não dos `periods`: um lugar aberto 24h vem como um único período sem hora de
// fechar, o que faria os outros 6 dias parecerem fechados.
// `weekdayDescriptions` começa na segunda — mesma ordem de DIAS_PT.
function normalizaHorarios(h) {
  if (!h?.descricao?.length) return h || null;
  return {
    descricao: h.descricao,
    fecha_em: h.descricao.map((l, i) => (/fechad|closed/i.test(l) ? DIAS_PT[i] : null)).filter(Boolean),
    aberto_24h: h.descricao.every((l) => /24 horas|24 hours/i.test(l)),
  };
}

function horariosDe(place) {
  const oh = place.regularOpeningHours;
  if (!oh) return null;
  return normalizaHorarios({ descricao: oh.weekdayDescriptions || [] });
}

const PRECO = {
  PRICE_LEVEL_FREE: "grátis", PRICE_LEVEL_INEXPENSIVE: "¥", PRICE_LEVEL_MODERATE: "¥¥",
  PRICE_LEVEL_EXPENSIVE: "¥¥¥", PRICE_LEVEL_VERY_EXPENSIVE: "¥¥¥¥",
};

/* --------------------------------- main --------------------------------- */
const chave = await lerChave();
const pontos = JSON.parse(await readFile(ARQ_PONTOS, "utf8"));
let cache = {};
if (!REFAZER && existsSync(ARQ_CACHE)) cache = JSON.parse(await readFile(ARQ_CACHE, "utf8"));

const chaveDe = (p) => `${p.nome}|${p.bairro}`;

let correcoes = {};
if (existsSync(ARQ_CORRECOES)) {
  correcoes = JSON.parse(await readFile(ARQ_CORRECOES, "utf8"));
  delete correcoes._leia_me;
}

const pendentes = CORRIGIR
  ? pontos.filter((p) => correcoes[chaveDe(p)])
  : pontos.filter((p) => !cache[chaveDe(p)]).slice(0, LIMITE);

console.log(`\n${pontos.length} pontos no total · ${Object.keys(cache).length} já em cache · ${pendentes.length} a processar`);
if (CORRIGIR) console.log(`MODO CORREÇÃO: só os ${pendentes.length} de data/places_correcoes.json.\n`);
if (SIMULAR) console.log(TESTE ? "MODO TESTE: 5 pontos, nada é gravado nos dados.\n" : "MODO SIMULAÇÃO: nada é gravado nos dados.\n");
if (!pendentes.length) console.log("Nada a fazer. Use --refazer pra reprocessar tudo.\n");

let n = 0, erros = 0;
for (const p of pendentes) {
  n++;
  const rot = `[${String(n).padStart(3)}/${pendentes.length}] ${p.nome}`;
  try {
    const forcado = correcoes[chaveDe(p)];
    let m, place;

    if (forcado?.sem_correspondencia) {
      // Decidimos à mão que o Google não tem este lugar. Melhor ficar sem dado
      // do que com o dado de outro estabelecimento.
      cache[chaveDe(p)] = { achou: false, ignorado_a_mao: true, motivo_correcao: forcado.motivo };
      console.log(`${rot} — 🚫 marcado como sem correspondência no Google`);
      continue;
    }

    if (forcado) {
      // Escolha feita à mão: não busca, vai direto no place_id certo.
      place = await detalhes(chave, forcado.place_id);
      await dormir(120);
      const d = (p.lat != null && place.location)
        ? distanciaM(p.lat, p.lng, place.location.latitude, place.location.longitude) : null;
      m = { c: place, nome: place.displayName?.text || "", dist: d, sim: 1, confianca: "alta" };
    } else {
      const candidatos = await buscar(chave, p);
      if (!candidatos.length) {
        cache[chaveDe(p)] = { achou: false };
        console.log(`${rot} — ✖ nada encontrado`);
        await dormir(120); continue;
      }
      m = escolherMelhor(p, candidatos);
      place = m.c;
    }

    let ja = null;
    if (m.confianca !== "baixa") { ja = await nomeEmJapones(chave, place.id); await dormir(120); }

    cache[chaveDe(p)] = {
      achou: true,
      confianca: m.confianca,
      corrigido_a_mao: !!forcado || undefined,
      motivo_correcao: forcado?.motivo,
      distancia_m: m.dist,
      parecenca: Number(m.sim.toFixed(2)),
      place_id: place.id,
      nome_google: m.nome,
      nome_ja: ja?.nome_ja || null,
      endereco_ja: ja?.endereco_ja || null,
      endereco: place.shortFormattedAddress || place.formattedAddress || null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      maps_uri: place.googleMapsUri || null,
      site: place.websiteUri || null,
      telefone: place.nationalPhoneNumber || null,
      google_nota: place.rating ?? null,
      google_avaliacoes: place.userRatingCount ?? null,
      faixa_preco: PRECO[place.priceLevel] || null,
      situacao: place.businessStatus || null,
      tipo: place.primaryTypeDisplayName?.text || null,
      horarios: horariosDe(place),
      foto_ref: place.photos?.[0]?.name || null,
    };
    const e = cache[chaveDe(p)];
    const marca = forcado ? "🔧" : { alta: "✓", media: "~", baixa: "?" }[m.confianca];
    console.log(`${rot} — ${marca} ${m.nome}${e.horarios ? " · horários" : ""}${e.nome_ja ? " · " + e.nome_ja : ""}${m.dist != null ? ` · ${m.dist}m` : ""}`);
  } catch (err) {
    erros++;
    console.log(`${rot} — ERRO: ${err.message}`);
    if (/API_KEY_HTTP_REFERRER_BLOCKED|referer/i.test(err.message)) {
      console.error(`
Interrompido: a chave está restrita a "Sites (referenciadores HTTP)".
Este script roda pelo Node, que não envia referenciador — por isso o bloqueio.

  Console → APIs e serviços → Credenciais → sua chave
  → Restrições de aplicativo: troque "Sites" por "Nenhuma" → Salvar
  (mantenha a Restrição de API em "Places API (New)"; leva ~5 min pra valer)
`);
      break;
    }
    if (/API_KEY|PERMISSION_DENIED|SERVICE_DISABLED|403|400/.test(err.message)) {
      console.error(`
Interrompido: problema de chave ou de API. Confira:
  · a "Places API (New)" está ativada no projeto? (a antiga "Places API" não serve)
  · a chave pertence a esse mesmo projeto?
  · o faturamento está vinculado ao projeto?
`);
      break;
    }
  }
  await dormir(120);
  if (n % 10 === 0 && !SIMULAR) await writeFile(ARQ_CACHE, JSON.stringify(cache, null, 2));
}

/* ------------------------- gravação e relatório -------------------------- */
const achados = Object.values(cache).filter((c) => c.achou);
const porConf = achados.reduce((a, c) => (a[c.confianca] = (a[c.confianca] || 0) + 1, a), {});
console.log(`\n=== Resultado ===`);
console.log(`encontrados: ${achados.length}/${Object.keys(cache).length}  ·  erros: ${erros}`);
console.log(`confiança: alta ${porConf.alta || 0} · média ${porConf.media || 0} · baixa ${porConf.baixa || 0}`);
console.log(`com horários: ${achados.filter((c) => c.horarios).length}  ·  com site: ${achados.filter((c) => c.site).length}  ·  com nome japonês: ${achados.filter((c) => c.nome_ja).length}`);

if (SIMULAR) {
  console.log("\n(simulação — nada foi gravado)\n");
} else {

await writeFile(ARQ_CACHE, JSON.stringify(cache, null, 2));

// Mescla nos pontos. Coordenada só é sobrescrita com confiança ALTA — o resto
// fica pra revisão manual, porque pin errado é pior que pin aproximado.
let coordTrocadas = 0;
const CAMPOS_ENRIQUECIDOS = ["place_id", "nome_ja", "endereco_ja", "horarios", "telefone",
  "google_nota", "google_avaliacoes", "faixa_preco", "geo_fonte", "situacao"];

const enriquecidos = pontos.map((p) => {
  const e = cache[chaveDe(p)];

  // Marcado à mão como sem correspondência: limpa o que uma rodada anterior
  // tenha gravado de errado e devolve o ponto ao estado original.
  if (e?.ignorado_a_mao) {
    const limpo = { ...p };
    for (const c of CAMPOS_ENRIQUECIDOS) delete limpo[c];
    limpo.google_maps = `https://www.google.com/maps/search/?api=1&query=${
      encodeURIComponent([p.nome, p.endereco, "Tokyo, Japan"].filter(Boolean).join(", "))}`;
    return limpo;
  }

  if (!e || !e.achou || e.confianca === "baixa") return p;
  const novo = { ...p };
  novo.place_id = e.place_id;
  if (e.nome_ja) novo.nome_ja = e.nome_ja;
  if (e.endereco_ja) novo.endereco_ja = e.endereco_ja;
  // Renormaliza sempre: conserta entradas gravadas por versões anteriores.
  if (e.horarios) novo.horarios = e.horarios = normalizaHorarios(e.horarios);
  if (e.site && !novo.site_oficial) novo.site_oficial = e.site;
  if (e.telefone) novo.telefone = e.telefone;
  if (e.google_nota != null) { novo.google_nota = e.google_nota; novo.google_avaliacoes = e.google_avaliacoes; }
  if (e.faixa_preco) novo.faixa_preco = e.faixa_preco;
  if (e.maps_uri) novo.google_maps = e.maps_uri;
  if (e.situacao && e.situacao !== "OPERATIONAL") novo.situacao = e.situacao;
  if (e.confianca === "alta" && e.lat != null) {
    if (distanciaM(p.lat, p.lng, e.lat, e.lng) > 20) coordTrocadas++;
    novo.lat = e.lat; novo.lng = e.lng; novo.geo_fonte = "google";
    delete novo.geo_jitter;
  }
  return novo;
});
await writeFile(ARQ_PONTOS, JSON.stringify(enriquecidos, null, 2) + "\n");

// Relatório do que precisa de olho humano.
const revisar = pontos.map((p) => ({ p, e: cache[chaveDe(p)] }))
  .filter(({ e }) => e && (!e.achou || e.confianca !== "alta"));
const linhas = revisar.map(({ p, e }) => !e.achou
  ? `| ${p.nome} | ${p.bairro} | — | não encontrado | — |`
  : `| ${p.nome} | ${p.bairro} | ${e.nome_google} | ${e.confianca} (${e.parecenca}) | ${e.distancia_m ?? "—"}m |`);

await writeFile(ARQ_RELATORIO, `# Revisão do enriquecimento (Google Places)

Gerado por \`scripts/enriquecer-places.mjs\`.

- Pontos processados: **${Object.keys(cache).length}**
- Encontrados: **${achados.length}** · confiança alta **${porConf.alta || 0}**, média **${porConf.media || 0}**, baixa **${porConf.baixa || 0}**
- Coordenadas corrigidas: **${coordTrocadas}**
- Com horário de funcionamento: **${achados.filter((c) => c.horarios).length}**
- Com nome em japonês: **${achados.filter((c) => c.nome_ja).length}**

Só os de confiança **alta** tiveram a coordenada sobrescrita. Os de baixa não
receberam nada. A tabela abaixo é o que vale conferir à mão.

| Nosso nome | Bairro | Nome no Google | Confiança | Distância |
|---|---|---|---|---|
${linhas.join("\n") || "| — | — | — | nada a revisar | — |"}
`);

console.log(`coordenadas corrigidas: ${coordTrocadas}`);
console.log(`\nGravado em ${ARQ_PONTOS}`);
console.log(`Revisão manual sugerida: ${ARQ_RELATORIO} (${revisar.length} itens)\n`);

}
