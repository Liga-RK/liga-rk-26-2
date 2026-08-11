const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const editorScript = fs.readFileSync(path.join(root, "assets", "editor.js"), "utf8");
const publicScript = fs.readFileSync(path.join(root, "assets", "app.js"), "utf8");

test("editor permite alterar data e horario de cada partida dos playoffs", () => {
  assert.match(editorScript, /date:\s*match\.date\s*\|\|\s*""/);
  assert.match(editorScript, /time:\s*match\.time\s*\|\|\s*""/);
  assert.match(editorScript, /playoffResults\.\$\{resultKey\}\.date/);
  assert.match(editorScript, /playoffResults\.\$\{resultKey\}\.time/);
});

test("chaveamento publico usa os horarios publicados pelo editor", () => {
  assert.match(publicScript, /date:\s*String\(result\.date\s*\|\|\s*match\.date/);
  assert.match(publicScript, /time:\s*String\(result\.time\s*\|\|\s*match\.time/);
  assert.match(publicScript, /state\.date\s*\|\|\s*match\.date/);
  assert.match(publicScript, /state\.time\s*\|\|\s*match\.time/);
});
