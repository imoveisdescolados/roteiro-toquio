# Guia Tóquio — Ebisu (19–27 set 2026)

Guia de viagem estático, em português e mobile-first, pra usar no celular durante
a viagem. Sem login e sem backend: tudo roda no navegador a partir de arquivos JSON.

A ideia não é seguir um roteiro fixo, e sim **montar o dia como um lego**: você
decide pela energia (cansaço), pelo clima e pela vibe, e o guia sugere bairros e
combos. As datas só aparecem quando realmente prendem (feira, feriado, sumô,
reserva, fechamento).

## Visões

- **Montar o dia** — o decisor. Você toca em chips de **Energia** (🟢 leve = a pé
  de Ebisu · 🟡 média = 1 trem direto · 🔴 puxada = baldeação/dia à parte),
  **Clima** (☀️ sol · ⛅ nublado · 🌧️ chuva), **Vibe** e **O que fazer**, e o guia
  filtra na hora os bairros e combos compatíveis. No topo, a faixa recolhível
  **"⚠️ Presos a data"**.
- **Bairros** — fichas ricas dos 18 bairros, agrupadas por energia: vibe,
  "melhor para", quanto dedicar, movimento, melhor momento, clima ideal,
  destaques, como chegar e "combina com" (leva pra ficha do bairro emendável).
- **Combos** — ~10 roteiros prontos que juntam bairros que funcionam no mesmo dia,
  com sequência, tempo, energia, clima e o porquê.
- **Mapa** — Leaflet + OpenStreetMap com os ~160 pontos coloridos por categoria;
  popup com descrição, notas e links "Site oficial" e "Ver no Google Maps";
  filtros por bairro e categoria + busca.

## Como o clima é decidido

- **☀️ Sol** — destaques ao ar livre (parques, canais, orla, vielas).
- **🌧️ Chuva** — à prova d'água (shoppings, museus, eletrônicos, teamLab).
- **⛅ Nublado** — quase tudo (o clima ideal de caminhada).

## Estrutura

```
roteiro-toquio/
├── index.html
├── css/style.css
├── js/app.js
├── data/
│   ├── data_bairros.json                 # bruto: como chegar, tempo, atrações…
│   ├── bairros_guia.json                 # curadoria: vibe, clima, tags, combina_com…
│   ├── combos.json                       # roteiros prontos
│   ├── datas.json                        # eventos presos a data
│   ├── data_pontos_interesse.json        # original dos pontos
│   ├── data_pontos_interesse_geo.json    # gerado (com lat/lng) ← usado pelo mapa
│   └── data_dias.json                    # rascunho antigo dos 9 dias (não usado)
├── scripts/
│   ├── geocode.mjs   # geocodifica os endereços (roda 1x)
│   └── serve.mjs     # servidor local só para pré-visualizar
└── README.md
```

## Editar o conteúdo

- Personalidade dos bairros (vibe, clima, tags, tempo, destaques, "combina com"):
  `data/bairros_guia.json` — a chave de cada bairro é idêntica ao campo `zona` de
  `data_bairros.json`.
- Roteiros prontos: `data/combos.json`. Avisos de data: `data/datas.json`.
- A **energia** de cada bairro é calculada do `tipo_acesso` (base/walkable = leve,
  direct_train = média, transfer = puxada) — não precisa preencher à mão.

## Rodar localmente

Precisa de Node 18+ (o guia carrega os JSON via `fetch`, então exige um servidor —
abrir o `index.html` direto pelo `file://` não funciona).

```bash
node scripts/serve.mjs
# abra http://localhost:5173
```

Alternativa: `npx serve` ou `python -m http.server`.

## Regerar o geocoding (só se editar os endereços dos pontos)

```bash
node scripts/geocode.mjs
```

Usa o Nominatim (OpenStreetMap), respeita 1 requisição/segundo, leva ~3 min e é
retomável. Endereços vagos caem no centroide do bairro; pontos com coordenada
idêntica recebem um leve deslocamento pra não se sobreporem.

## Publicar (grátis)

Site 100% estático — a pasta a publicar é a raiz do projeto (onde está o
`index.html`).

### GitHub Pages

```bash
git init && git add . && git commit -m "guia toquio"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/roteiro-toquio.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
O link fica em `https://<seu-usuario>.github.io/roteiro-toquio/`.

### Netlify / Vercel

- **Netlify:** app.netlify.com → aba **Sites** → arraste a pasta inteira pra área
  de deploy. Sai um link na hora.
- **Vercel:** `npx vercel` na pasta e aceite os padrões (site estático, sem build).

Depois é só abrir o link no celular e "Adicionar à tela de início".
