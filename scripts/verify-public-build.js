const fs = require("node:fs");
const path = require("node:path");
const { PAGE_METADATA, siteUrl } = require("../config/public-site");

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

const requiredPublicRuntimeFiles = ["sobre/index.html", "sitemap.xml", "bolao.html", "assets/player-identity.js", "assets/bolao.js", "assets/champion-list.js", "fantasy/index.html", "fantasy/assets/auto-lineup.js", "fantasy/assets/fantasy.js", "fantasy/assets/fantasy-config.js", "fantasy/assets/champion-list.js", "fantasy/assets/champions/Ahri.png"];
const missingRuntimeFiles = requiredPublicRuntimeFiles.filter((file) => !fs.existsSync(path.join(dist, file)));
if (missingRuntimeFiles.length) throw new Error(`Dependencias publicas ausentes no dist: ${missingRuntimeFiles.join(", ")}`);

for (const file of files) {
  if (!/\.(html|js|css|json|txt)$/i.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (/[A-Za-z]:\\Users\\/i.test(text)) throw new Error(`Caminho local encontrado em ${relative(file)}.`);
  if (/riot-api-key|RIOT_API_KEY|ADMIN_TOKEN\s*[:=]\s*["'][^"']+/i.test(text)) throw new Error(`Possivel segredo encontrado em ${relative(file)}.`);
}

verifySeoMetadata();
verifySitemap();

if (fs.existsSync(path.join(dist, "robots.txt"))) {
  throw new Error("robots.txt nao deve ser publicado em um Project Site sem controle da raiz do host.");
}

console.log(`${files.length} arquivos publicos verificados; nenhum arquivo administrativo encontrado.`);

function verifySeoMetadata() {
  for (const [file, metadata] of Object.entries(PAGE_METADATA)) {
    const html = fs.readFileSync(path.join(dist, file), "utf8");
    const canonicalUrl = siteUrl(metadata.path);
    const imageUrl = siteUrl(metadata.image);
    const requiredFragments = [
      `<title>${escapeHtml(metadata.title)}</title>`,
      `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
      '<meta name="robots" content="index,follow,max-image-preview:large" />',
      `<link rel="canonical" href="${canonicalUrl}" />`,
      `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
      `<meta property="og:url" content="${canonicalUrl}" />`,
      `<meta property="og:image" content="${imageUrl}" />`,
      `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
      `<meta name="twitter:image" content="${imageUrl}" />`
    ];
    const missing = requiredFragments.filter((fragment) => !html.includes(fragment));
    if (missing.length) throw new Error(`Metadata SEO incompleta em ${file}: ${missing.join(", ")}`);
    if (/\bnoindex\b/i.test(html)) throw new Error(`Pagina publica com noindex: ${file}`);

    if (metadata.structuredData) {
      verifyOrganizationGraph(file, html);
    }
  }
}

function verifyOrganizationGraph(file, html) {
  const match = html.match(/<script type="application\/ld\+json" data-managed-seo>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error(`JSON-LD institucional ausente em ${file}.`);

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`JSON-LD invalido em ${file}: ${error.message}`);
  }

  if (data["@context"] !== "https://schema.org" || !Array.isArray(data["@graph"])) {
    throw new Error(`JSON-LD sem @context ou @graph valido em ${file}.`);
  }

  const organization = data["@graph"].find((entity) => entity["@id"] === `${siteUrl()}#organization`);
  const founder = data["@graph"].find((entity) => entity["@id"] === `${siteUrl()}#founder-rk`);
  const leader = data["@graph"].find((entity) => entity["@id"] === `${siteUrl()}#henrique-marques`);
  if (!organization || organization.name !== "Comunidade RK") throw new Error(`Organization incorreta em ${file}.`);
  if (!founder || founder.name !== "Raí Bezerra" || founder.alternateName !== "RK" || founder["@type"] !== "Person") throw new Error(`Fundador Raí Bezerra (RK) incorreto em ${file}.`);
  if (!leader || leader.name !== "Henrique Marques" || leader.alternateName !== "Rick") throw new Error(`Lideranca incorreta em ${file}.`);
  if (organization.founder?.["@id"] !== founder["@id"]) throw new Error(`Vinculo de fundador incorreto em ${file}.`);
  if (leader.worksFor?.["@id"] !== organization["@id"]) throw new Error(`Vinculo worksFor incorreto em ${file}.`);
  if (organization.founder?.["@id"] === leader["@id"]) throw new Error(`Henrique Marques nao pode ser founder em ${file}.`);
}

function verifySitemap() {
  const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
  const expectedUrls = Object.values(PAGE_METADATA)
    .filter((metadata) => metadata.sitemap)
    .map((metadata) => siteUrl(metadata.path));
  const missingUrls = expectedUrls.filter((url) => !sitemap.includes(`<loc>${url}</loc>`));
  if (missingUrls.length) throw new Error(`URLs ausentes no sitemap: ${missingUrls.join(", ")}`);
  if (/admin|editor|inscri(?:cao|coes)|pagamento|api/i.test(sitemap)) {
    throw new Error("Sitemap contem rota administrativa, privada ou de API.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(file) {
  return path.relative(dist, file).replace(/\\/g, "/");
}
