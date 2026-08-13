const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "fantasy", "index.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "fantasy", "assets", "fantasy.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "fantasy", "assets", "fantasy.css"), "utf8");

test("modal do Palpite de Draft oferece NONE, SIMPLE e PRECISE", () => {
  assert.match(html, /id="draft-prediction-dialog"/);
  assert.match(html, /data-draft-mode="NONE"/);
  assert.match(html, /data-draft-mode="SIMPLE"/);
  assert.match(html, /data-draft-mode="PRECISE"/);
  assert.match(html, /Buscar campeão/);
});

test("titular abre modal após validações, equipe não abre e reserva continua separado", () => {
  assert.match(script, /item\.type === "player" && draftPredictionEnabled\(\)/);
  assert.match(script, /openDraftPredictionDialog\(item\)/);
  assert.match(script, /function setReserve\(item\)/);
  assert.doesNotMatch(script.match(/function setReserve\(item\)[\s\S]*?\n  \}/)?.[0] || "", /openDraftPredictionDialog/);
});

test("interface bloqueia mapa 4 e 5 em MD3 e permite edição no mercado aberto", () => {
  assert.match(script, /format === "MD3" && mapNumber > 3/);
  assert.match(script, /openDraftPredictionDialog\(item, true\)/);
  assert.match(css, /draft-champion-grid/);
  assert.match(css, /draft-map-button:disabled/);
});

test("payload envia palpites somente dos cinco titulares", () => {
  assert.match(script, /draftPredictions: PLAYER_ROLES\.map/);
  assert.match(script, /delete lineup\.draftPredictions\[role\]/);
});
