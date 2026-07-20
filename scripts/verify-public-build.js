const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
if (!fs.existsSync(dist)) throw new Error("Execute npm run build:public antes do smoke test.");

const files = walk(dist);
const forbiddenNames = files.filter((file) => /\.(rofl|tmp|log)$/i.test(file) || /(^|\/)(data|config|backups|samples)(\/|$)/i.test(relative(file)));
if (forbiddenNames.length) throw new Error(`Arquivos privados encontrados no dist: ${forbiddenNames.map(relative).join(", ")}`);

const forbiddenPublicFiles = [
  "inscricao.html",
  "pagamento.html",
  "assets/editor.js",
  "assets/inscricao.js",
  "assets/pagamento.js",
  "assets/stats-admin.js",
  "assets/inscricoes-admin.js",
  "assets/bolao-admin.js",
  "assets/replay-db.js"
];
const leakedAdminFiles = forbiddenPublicFiles.filter((file) => fs.existsSync(path.join(dist, file)));
if (leakedAdminFiles.length) throw new Error(`Ferramentas administrativas encontradas no dist: ${leakedAdminFiles.join(", ")}`);

const requiredPublicRuntimeFiles = ["bolao.html", "assets/player-identity.js", "assets/bolao.js", "assets/champion-list.js"];
const missingRuntimeFiles = requiredPublicRuntimeFiles.filter((file) => !fs.existsSync(path.join(dist, file)));
if (missingRuntimeFiles.length) throw new Error(`Dependencias publicas ausentes no dist: ${missingRuntimeFiles.join(", ")}`);

for (const file of files) {
  if (!/\.(html|js|css|json|txt)$/i.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (/[A-Za-z]:\\Users\\/i.test(text)) throw new Error(`Caminho local encontrado em ${relative(file)}.`);
  if (/riot-api-key|RIOT_API_KEY|ADMIN_TOKEN\s*[:=]\s*["'][^"']+/i.test(text)) throw new Error(`Possivel segredo encontrado em ${relative(file)}.`);
}

console.log(`${files.length} arquivos publicos verificados; nenhum arquivo administrativo encontrado.`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(file) {
  return path.relative(dist, file).replace(/\\/g, "/");
}
