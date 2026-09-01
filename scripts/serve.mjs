// Servidor estático mínimo (sem dependências) só para pré-visualizar o site
// localmente. Uso:  node scripts/serve.mjs  →  http://localhost:5173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 5173;
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(req.url.split("?")[0]);
    if (caminho === "/") caminho = "/index.html";
    const abs = normalize(join(ROOT, caminho));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end("Proibido");
      return;
    }
    const dados = await readFile(abs);
    res.writeHead(200, { "Content-Type": TIPOS[extname(abs)] || "application/octet-stream" });
    res.end(dados);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
  }
}).listen(PORT, () => console.log(`Servindo em http://localhost:${PORT}`));
