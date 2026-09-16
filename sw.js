/* Service worker — deixa o guia funcionar offline e instalável.
   Estratégia:
   - app shell + dados (mesma origem): cache-first
   - tiles do mapa (Esri e OpenStreetMap): cache-first num cache separado
     (o que você já viu continua disponível offline, no Japão inteiro sem sinal)
   - previsão do tempo (open-meteo): rede primeiro (sempre fresca), sem cache
*/
const VERSAO = "guia-toquio-v9";
const CACHE_APP = VERSAO + "-app";
const CACHE_TILES = VERSAO + "-tiles";

const CORE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./data/data_bairros.json",
  "./data/bairros_guia.json",
  "./data/combos.json",
  "./data/datas.json",
  "./data/dias.json",
  "./data/basico.json",
  "./data/comer_perto.json",
  "./data/data_pontos_interesse_geo.json",
];

self.addEventListener("install", (e) => {
  // cache:"reload" garante que o precache pega os arquivos frescos da rede,
  // nunca uma versão velha do cache HTTP do navegador.
  e.waitUntil(
    caches.open(CACHE_APP)
      .then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Tiles do mapa: cache-first, guarda o que foi visto.
  if (/tile\.openstreetmap\.org$/.test(url.hostname) || url.hostname === "server.arcgisonline.com") {
    e.respondWith(
      caches.open(CACHE_TILES).then((c) =>
        c.match(req).then((hit) =>
          hit || fetch(req).then((resp) => { c.put(req, resp.clone()); return resp; }).catch(() => hit)
        )
      )
    );
    return;
  }

  // Previsão do tempo: sempre da rede (não faz sentido offline).
  if (url.hostname.endsWith("open-meteo.com")) {
    e.respondWith(fetch(req).catch(() => new Response("{}", { headers: { "Content-Type": "application/json" } })));
    return;
  }

  // Mesma origem (app + dados): cache-first, atualiza em segundo plano.
  // ignoreSearch faz o ?v=N casar com o arquivo base em cache.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) =>
        hit || fetch(req).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_APP).then((c) => c.put(req, clone));
          return resp;
        }).catch(() => hit)
      )
    );
  }
});
