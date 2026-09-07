const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("linhas de partidas filtradas ficam visualmente ocultas", () => {
  const styles = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");
  const page = fs.readFileSync(path.join(root, "estatisticas.html"), "utf8");

  assert.match(styles, /\.stats-match-row\[hidden\]\s*\{[^}]*display:\s*none\s*;/s);
  assert.match(page, /assets\/styles\.css\?v=20260811-match-filter/);
});

test("Ascensao abre com a arte da campea e um link para a Raising Dragons", () => {
  const script = fs.readFileSync(path.join(root, "assets", "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");
  const page = fs.readFileSync(path.join(root, "ascensao.html"), "utf8");
  const artwork = path.join(root, "assets", "uploads", "rdg-campeoes.png");

  assert.match(script, /\["campeoes", "Campeões"\]/);
  assert.match(script, /\$\{renderChampions\(\)\}/);
  assert.match(script, /champions-section-\$\{escapeAttribute\(divisionKey\)\}/);
  assert.match(script, /time\.html\?division=\$\{divisionKey\}&id=\$\{encodeURIComponent\(championSlot\)\}/);
  assert.match(styles, /\.champions-art\s*\{[^}]*width:\s*100%/s);
  assert.match(page, /assets\/app\.js\?v=20260905-most-victorious/);
  assert.equal(fs.existsSync(artwork), true);
  assert.equal(fs.statSync(artwork).size > 2_000_000, true);
});

test("Elite abre com a arte da campea e um link para a Cupula do Triple T", () => {
  const script = fs.readFileSync(path.join(root, "assets", "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");
  const page = fs.readFileSync(path.join(root, "elite.html"), "utf8");
  const artwork = path.join(root, "assets", "uploads", "ttt-campeoes.png");

  assert.match(script, /teamTag: "TTT"/);
  assert.match(script, /fallbackSlot: "A1"/);
  assert.match(script, /displayName: "CÚPULA DO TRIPLE T"/);
  assert.match(script, /artwork: "assets\/uploads\/ttt-campeoes\.png"/);
  assert.match(styles, /\.champions-section-elite/);
  assert.match(page, /assets\/app\.js\?v=20260906-elite-champions/);
  assert.equal(fs.existsSync(artwork), true);
  assert.equal(fs.statSync(artwork).size > 2_000_000, true);
});

test("card de campeao mais vitorioso exibe win rate e corte minimo de escolhas", () => {
  const script = fs.readFileSync(path.join(root, "assets", "app.js"), "utf8");
  const elitePage = fs.readFileSync(path.join(root, "elite.html"), "utf8");
  const ascensionPage = fs.readFileSync(path.join(root, "ascensao.html"), "utf8");

  assert.match(script, /renderChampionStat\(stats\.mostWins, "MAIS VITORIOSO"\)/);
  assert.match(script, /MÍN\. \$\{minimumPicks\} ESCOLHAS/);
  assert.match(script, /toLocaleString\("pt-BR", \{ maximumFractionDigits: 2 \}\)/);
  assert.match(elitePage, /assets\/stats-content\.js\?v=20260905-most-victorious/);
  assert.match(ascensionPage, /assets\/stats-content\.js\?v=20260905-most-victorious/);
});
