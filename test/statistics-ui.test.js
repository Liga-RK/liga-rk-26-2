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
