const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const publicFiles = [
  "index.html",
  "elite.html",
  "ascensao.html",
  "inscricao.html",
  "pagamento.html",
  "bolao.html",
  "estatisticas.html",
  "partida.html",
  "jogador.html",
  "time.html",
  "riot.txt"
];
const excludedAssetFiles = new Set([
  "editor.js",
  "inscricoes-admin.js",
  "bolao-admin.js",
  "stats-admin.js",
  "replay-db.js",
  "fundo_elite.png",
  "fundo_ascensao.png",
  "fundo_home.png",
  "logo_liga_rk.png",
  "logo_liga_rk_nobg.png"
]);
const publicSourceFiles = [
  ...publicFiles,
  "assets/app.js",
  "assets/inscricao.js",
  "assets/pagamento.js",
  "assets/bolao.js",
  "assets/champion-list.js",
  "assets/data.js",
  "assets/content.js",
  "assets/player-identity.js",
  "assets/stats-content.js",
  "assets/statistics-pages.js",
  "assets/styles.css"
];
const referencedChampionFiles = collectReferencedChampionFiles();

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, target, relative = "") {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const relativePath = path.join(relative, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, relativePath);
      continue;
    }

    if (entry.isFile() && shouldCopyAsset(entry.name, relativePath)) {
      copyFile(sourcePath, targetPath);
    }
  }
}

function shouldCopyAsset(fileName, relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  if (excludedAssetFiles.has(fileName)) {
    return false;
  }

  if (normalizedPath.startsWith("champions/")) {
    if (publicFiles.includes("bolao.html")) {
      return true;
    }
    return referencedChampionFiles.has(fileName);
  }

  return true;
}

function collectReferencedChampionFiles() {
  const files = new Set(["Aatrox.jpg"]);
  const pattern = /assets\/champions\/([^"'`)\s]+)/g;

  for (const sourceFile of publicSourceFiles) {
    const fullPath = path.join(ROOT, sourceFile);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const text = fs.readFileSync(fullPath, "utf8").replace(/\\/g, "/");
    let match;
    while ((match = pattern.exec(text))) {
      files.add(path.basename(match[1]));
    }
  }

  return files;
}

function ensureInsideWorkspace(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new Error(`Caminho fora do workspace: ${resolved}`);
  }
}

ensureInsideWorkspace(DIST);
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const file of publicFiles) {
  copyFile(path.join(ROOT, file), path.join(DIST, file));
}

copyDirectory(path.join(ROOT, "assets"), path.join(DIST, "assets"));
fs.writeFileSync(path.join(DIST, ".nojekyll"), "", "utf8");

console.log(`Site publico gerado em ${path.relative(ROOT, DIST)}`);
