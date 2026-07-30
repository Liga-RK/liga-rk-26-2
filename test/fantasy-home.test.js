const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pages = ["fantasy/index.html", "fantasy/fantasy.html"];
const script = fs.readFileSync(path.join(root, "fantasy/assets/fantasy.js"), "utf8");
const workerScript = fs.readFileSync(path.join(root, "worker/fantasy-worker.js"), "utf8");

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

test("Reserva pode usar saldo disponível mais o titular mais barato", () => {
  const frontendSource = script.match(/function reserveBudget\(lineup\) \{[\s\S]*?\n  \}/)?.[0];
  const backendSource = workerScript.match(/function reserveBudgetForRows\(rows\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(frontendSource);
  assert.ok(backendSource);

  const frontendBudget = new Function(
    "lineupCash",
    "starterPlayers",
    "roundMoney",
    `${frontendSource}; return reserveBudget;`
  )(
    (lineup) => lineup.remaining,
    (lineup) => lineup.players,
    (value) => Math.round((value + Number.EPSILON) * 100) / 100
  );
  const backendBudget = new Function(
    `const BUDGET_LIMIT = 100; const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100; ${backendSource}; return reserveBudgetForRows;`
  )();
  const players = [
    { type: "player", asset_type: "player", price: 12 },
    { type: "player", asset_type: "player", price: 13 },
    { type: "player", asset_type: "player", price: 14 },
    { type: "player", asset_type: "player", price: 15 },
    { type: "player", asset_type: "player", price: 16 }
  ];
  const team = { type: "team", asset_type: "team", price: 6 };

  assert.equal(frontendBudget({ remaining: 24, players }), 36);
  assert.equal(backendBudget([...players, team]), 36);

  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /saldo disponível após os seis titulares somado ao preço do jogador titular mais barato/);
  }
});

test("Controle do mercado fica oculto e depende da permissão Discord", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="market-admin-control"[^>]*hidden/);
    assert.match(html, /id="market-admin-toggle"/);
  }

  assert.match(script, /state\.canControlMarket = Boolean\(response\.ok && payload\.authenticated && payload\.canControlMarket\)/);
  assert.match(script, /marketAdminControl\.hidden = !state\.canControlMarket/);
  assert.match(script, /\/api\/fantasy\/market\/control\/\$\{action\}/);
  assert.match(workerScript, /MARKET_CONTROL_DISCORD_IDS/);
  assert.match(workerScript, /Somente o administrador autorizado pode controlar o mercado/);
});
