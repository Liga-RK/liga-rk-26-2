const fs = require("node:fs");
const path = require("node:path");
const { PAGE_METADATA, SITE_NAME, organizationGraph, siteUrl } = require("../config/public-site");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const publicFiles = [
  "index.html",
  "sobre/index.html",
  "elite.html",
  "ascensao.html",
  "bolao.html",
  "estatisticas.html",
  "partida.html",
  "jogador.html",
  "time.html",
  "riot.txt"
];
const excludedAssetFiles = new Set([
  "editor.js",
  "inscricao.js",
  "pagamento.js",
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

function copyDirectory(source, target, relative = "", filterAssets = true) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const relativePath = path.join(relative, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, relativePath, filterAssets);
      continue;
    }

    if (entry.isFile() && (!filterAssets || shouldCopyAsset(entry.name, relativePath))) {
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
copyDirectory(path.join(ROOT, "fantasy"), path.join(DIST, "fantasy"), "", false);
applyPublicMetadata();
writeSitemap();
fs.writeFileSync(path.join(DIST, ".nojekyll"), "", "utf8");

console.log(`Site publico gerado em ${path.relative(ROOT, DIST)}`);

function applyPublicMetadata() {
  for (const [file, metadata] of Object.entries(PAGE_METADATA)) {
    const target = path.join(DIST, file);
    if (!fs.existsSync(target)) {
      throw new Error(`Pagina configurada para SEO nao encontrada: ${file}`);
    }

    const canonicalUrl = siteUrl(metadata.path);
    const imageUrl = siteUrl(metadata.image);
    let html = fs.readFileSync(target, "utf8");
    html = removeExistingSeoMetadata(html);
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`);

    const tags = [
      `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
      '<meta name="robots" content="index,follow,max-image-preview:large" />',
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
      '<meta property="og:locale" content="pt_BR" />',
      '<meta property="og:type" content="website" />',
      `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
      `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
      `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
      `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
      `<meta property="og:image:width" content="${metadata.imageWidth}" />`,
      `<meta property="og:image:height" content="${metadata.imageHeight}" />`,
      '<meta property="og:image:alt" content="Identidade visual oficial da Liga RK" />',
      `<meta name="twitter:card" content="${metadata.imageWidth / metadata.imageHeight > 1.5 ? "summary_large_image" : "summary"}" />`,
      `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
    ];

    if (metadata.structuredData) {
      tags.push(
        `<script type="application/ld+json" data-managed-seo>${safeJson(organizationGraph(metadata.path))}</script>`
      );
    }

    html = html.replace(/\s*<\/head>/i, `\n    ${tags.join("\n    ")}\n  </head>`);
    fs.writeFileSync(target, html, "utf8");
  }
}

function removeExistingSeoMetadata(html) {
  const patterns = [
    /\s*<meta\s+name=["'](?:description|robots|twitter:[^"']+)["'][^>]*\/?>/gi,
    /\s*<meta\s+property=["']og:[^"']+["'][^>]*\/?>/gi,
    /\s*<link\s+rel=["']canonical["'][^>]*\/?>/gi,
    /\s*<script\s+type=["']application\/ld\+json["'][^>]*data-managed-seo[^>]*>[\s\S]*?<\/script>/gi
  ];

  return patterns.reduce((result, pattern) => result.replace(pattern, ""), html);
}

function writeSitemap() {
  const locations = Object.values(PAGE_METADATA)
    .filter((metadata) => metadata.sitemap)
    .map((metadata) => `  <url><loc>${escapeXml(siteUrl(metadata.path))}</loc></url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>\n`;
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap, "utf8");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, "&apos;");
}
