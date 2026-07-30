const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pages = ["fantasy/index.html", "fantasy/fantasy.html"];
const script = fs.readFileSync(path.join(root, "fantasy/assets/fantasy.js"), "utf8");

test("Fantasy opens on a separate, minimal Início view", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    const home = html.match(/<section id="home-view"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || "";

    assert.match(html, /data-view="home">Início<\/button>/);
    assert.match(home, /MONTE SEU TIME\. <em>DISPUTE O TOPO DO FANTASY RK\.<\/em>/);
    assert.match(home, /id="home-login-button"[^>]*>Entrar ou cadastrar-se<\/button>/);
    assert.equal((home.match(/<button\b/g) || []).length, 1);
    assert.doesNotMatch(html, /id="market-intro"/);
  }
});

test("Fantasy account action signs out instead of switching accounts", () => {
  assert.match(script, /apiFetch\("\/api\/fantasy\/auth\/logout",\s*\{\s*method: "POST"/);
  assert.match(script, /state\.userName \? "Sair" : "Entrar"/);
  assert.doesNotMatch(script, /state\.userName \? "Trocar"/);
});

test("Home, ranking and rules remain available while the market is closed", () => {
  assert.match(script, /view: "home"/);
  assert.doesNotMatch(script, /if \(!isMarketOpen\(\) && view !== "market"\)/);
  assert.doesNotMatch(script, /button\.hidden = !open/);
});
