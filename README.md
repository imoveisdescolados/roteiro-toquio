# Guia Tóquio — Ebisu (19–27 set 2026)

Guia de viagem estático, em português e mobile-first, pra usar no celular durante
a viagem. Sem login e sem backend: tudo roda no navegador a partir de arquivos
JSON, e funciona offline depois da primeira visita.

Feito para quem **nunca foi a Tóquio**: cada dia já vem respondido, cada lugar
tem botão de rota no Google Maps, e a aba **Básico** cobre o que ninguém conta
antes de chegar (trem, Suica, dinheiro, etiqueta, tufão).

## As quatro abas

- **Hoje** — o app abre já respondendo "o que eu faço agora?". Mostra o dia da
  viagem (com os 9 dias numa faixa de seleção), a previsão real daquele dia, a
  hora do pôr do sol, os avisos que valem **para aquele dia** (feriado, museu
  fechado, feira, reserva pendente), o plano dividido em manhã/tarde/noite,
  os bairros com o tempo real a partir de Ebisu, e os planos B pra chuva e
  cansaço. No rodapé, a rota de volta pra casa.
- **Explorar** — os 18 bairros agrupados por **como se chega** (a pé · um trem
  direto · com baldeação), cada um com vibe, "não perca", quando ir, e a lista
  dos **lugares mapeados dentro dele**, cada lugar com "Como chegar" e "No Maps".
  Os 10 roteiros prontos ficam no topo. Filtros de clima/vibe/interesse ficam
  recolhidos — o guia mostra tudo por padrão.
- **Mapa** — Leaflet com os 170 pontos coloridos por categoria, filtros por
  bairro e categoria, busca, "perto de mim" e favoritos. Alterna entre rótulos
  em **romaji** (padrão) e em japonês.
- **Básico** — 12 seções de sobrevivência: chegada do aeroporto, Suica, trem,
  dinheiro, konbini, tax-free, etiqueta, horários, tufão/terremoto, frases,
  emergência e takkyubin. É aqui que se guarda o endereço de casa.

## Decisões que valem saber

**"Como chegar" em vez de "energia".** Cada bairro mostra o fato — *"8 min de
trem, direto"*, *"30 min · 1 baldeação em Shimbashi"* — em vez de um rótulo
abstrato de esforço. O campo é `modo` + `tempo_ate` em `bairros_guia.json`.

**Rótulos do mapa em romaji.** O mapa padrão do OpenStreetMap escreve o Japão
só em kanji (渋谷区), o que deixa o mapa mudo. O guia usa o *World Street Map*
da Esri, que escreve o romaji junto do japonês ("Tomigaya" sob 冨ヶ谷) — dá pra
ler **e** pra mostrar ao local. A CARTO foi descartada: passou a exigir API key
e marca as tiles. O botão **🔤 Nomes** alterna para o OSM em japonês.

**Links do Google Maps.** Cada lugar tem dois botões: *Como chegar* (rota de
transporte público a partir de onde você está) e *No Maps*. 41 dos pontos originais
têm coordenada aproximada (marcados com `geo_jitter` pelo geocoding) — nesses,
o link usa **busca por nome e endereço**, que acerta mais que o pin; nos demais,
usa a coordenada exata.

**Pôr do sol calculado offline.** Sem API: é o algoritmo clássico do almanaque,
conferido contra os solstícios e o equinócio (erro ≤ 1 min). Em fim de setembro
o sol se põe ~17h35 em Tóquio, o que muda o planejamento do dia.

**Avisos filtrados pelo dia.** Um aviso de bairro só aparece no dia em que aquele
bairro está no plano — senão "Ginza vira calçadão" apareceria num dia em Ueno.
A lista completa fica no final da aba Hoje, em "📅 Todas as datas presas".

## Estrutura

```
roteiro-toquio/
├── index.html
├── css/style.css
├── js/app.js
├── sw.js                                 # offline + instalável (PWA)
├── data/
│   ├── dias.json                         # os 9 dias: tema, blocos, planos B  ← aba Hoje
│   ├── basico.json                       # guia de sobrevivência              ← aba Básico
│   ├── datas.json                        # avisos presos a data (com ISO)
│   ├── bairros_guia.json                 # curadoria: vibe, clima, modo, tempo_ate…
│   ├── data_bairros.json                 # bruto: como chegar, atrações…
│   ├── combos.json                       # roteiros prontos
│   ├── data_pontos_interesse_geo.json    # os 170 pontos com lat/lng  ← usado pelo mapa
│   ├── data_pontos_interesse.json        # original dos pontos (sem geo)
│   └── data_dias.json                    # rascunho antigo dos 9 dias (substituído por dias.json)
└── scripts/
    ├── geocode.mjs   # geocodifica os endereços (roda 1x)
    └── serve.mjs     # servidor local só para pré-visualizar
```

## Editar o conteúdo

- **Plano de cada dia:** `data/dias.json` — `zonas` precisa bater exatamente com
  o campo `zona` de `data_bairros.json`.
- **Guia básico:** `data/basico.json` (seções com `itens`, cada um `t`/`d`).
- **Avisos de data:** `data/datas.json` — o campo `dias` (array de datas ISO) é o
  que liga o aviso ao dia; `zona` restringe a quando aquele bairro está no plano.
- **Personalidade dos bairros:** `data/bairros_guia.json`.
- **Roteiros prontos:** `data/combos.json`.

## Rodar localmente

Precisa de Node 18+ (o guia carrega os JSON via `fetch`, então exige um servidor —
abrir o `index.html` direto pelo `file://` não funciona).

```bash
node scripts/serve.mjs
```

Depois abra `http://localhost:5173`. Alternativas: `npx serve` ou `python -m http.server`.

## Regerar o geocoding (só se editar os endereços dos pontos)

```bash
node scripts/geocode.mjs
```

Usa o Nominatim (OpenStreetMap), respeita 1 requisição/segundo, leva ~3 min e é
retomável. Endereços vagos caem no centroide do bairro e recebem `geo_jitter`.

## Publicar (grátis)

Site 100% estático — a pasta a publicar é a raiz do projeto (onde está o
`index.html`).

### GitHub Pages

```bash
git remote add origin https://github.com/<seu-usuario>/roteiro-toquio.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
O link fica em `https://<seu-usuario>.github.io/roteiro-toquio/`.

### Netlify / Vercel

- **Netlify:** app.netlify.com → aba **Sites** → arraste a pasta inteira pra área
  de deploy. Sai um link na hora.
- **Vercel:** `npx vercel` na pasta e aceite os padrões (site estático, sem build).

Depois é só abrir o link no celular e **"Adicionar à tela de início"** — a partir
daí abre como app e funciona offline (inclusive as partes do mapa já visitadas).

## Enriquecimento pelo Google Places

Os pontos foram enriquecidos uma vez com a **Places API (New)**. O resultado
está gravado nos JSON — **o site publicado não contém chave nenhuma**.

| de 170 pontos | Antes | Depois |
|---|---|---|
| horário de funcionamento | 2 | **144** |
| nome em japonês | 0 | **168** |
| site oficial | 30 | **155** |
| telefone | 0 | **141** |
| nota do Google | 0 | **161** |
| coordenada aproximada | 41 | **12** |

Com isso, a aba **Hoje** avisa quais lugares *do roteiro daquele dia* fecham
naquele dia — no domingo 20, por exemplo, quatro das lojas centenárias de
Nihonbashi estão fechadas, que é o tema do dia.

### Rodar de novo

```bash
node scripts/enriquecer-places.mjs --teste      # 5 pontos, não grava nada
node scripts/enriquecer-places.mjs              # todos (resumível)
node scripts/enriquecer-places.mjs --corrigir   # só os de places_correcoes.json
node scripts/revisar-ponto.mjs "Meiji Jingu"    # investiga um ponto duvidoso
```

A chave sai de `.env.local` (`GOOGLE_MAPS_API_KEY=...`), que o `.gitignore`
bloqueia. A chave precisa de **Restrições de aplicativo: Nenhuma** — o Node não
envia referenciador HTTP, então uma chave restrita a "Sites" é recusada.

Custo: 1 Text Search (Enterprise) + 1 Place Details (Pro) por ponto. Os 170 pontos
cabem folgado nas cotas grátis mensais (1.000 e 5.000).

### Como a correspondência é conferida

Correspondência automática erra, e pin errado é pior que pin aproximado. Por isso:

- Cada resultado é pontuado por **semelhança de nome + distância**; a coordenada
  só é sobrescrita com confiança **alta**, e os de confiança baixa não recebem nada.
- `data/places_relatorio.md` lista tudo que merece conferência humana.
- **O sinal mais útil de erro é a contagem de avaliações**: o Meiji Jingu casou
  com um *ponto de ônibus* homônimo de 4 avaliações — o santuário tem 52.940.
  Vale desconfiar de qualquer lugar famoso com poucas avaliações.
- Correções ficam em `data/places_correcoes.json` (por `place_id`, ou
  `sem_correspondencia` quando o Google simplesmente não tem o lugar) e
  **sobrevivem a um `--refazer`**.

## O que ainda falta

- **Comida não é categoria.** Dos 170 pontos, 109 são compras — buscar "ramen"
  não devolve nada. É a lacuna mais sentida por quem chega.
- **Fotos.** O enriquecimento guardou a referência da primeira foto de cada lugar
  (`foto_ref` no cache), mas baixá-las é um SKU à parte.
