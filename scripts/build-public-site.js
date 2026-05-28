const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const publicFiles = ["index.html", "elite.html", "ascensao.html", "riot.txt"];
const excludedAssetFiles = new Set(["editor.js", "stats-admin.js", "replay-db.js"]);

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile() && !excludedAssetFiles.has(entry.name)) {
      copyFile(sourcePath, targetPath);
    }
  }
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
