const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pages = ["fantasy/index.html", "fantasy/fantasy.html"];
const script = fs.readFileSync(path.join(root, "fantasy/assets/fantasy.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "fantasy/assets/fantasy.css"), "utf8");
const workerScript = fs.readFileSync(path.join(root, "worker/fantasy-worker.js"), "utf8");

test("Fantasy opens on a separate, minimal Início view", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    const home = html.match(/<section id="home-view"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || "";

    assert.match(html, /<title>Fantasy RK \| Liga RK 26\.2<\/title>/);
    assert.match(html, /data-view="home">Início<\/button>/);
    assert.match(home, /class="home-title-primary">ESCALE SEU TIME<\/span>/);
    assert.match(home, /class="home-title-secondary">DISPUTE O TOPO DO RK FANTASY<\/span>/);
    assert.match(home, /id="home-login-button"[^>]*>Entrar ou cadastrar-se<\/button>/);
    assert.equal((home.match(/<button\b/g) || []).length, 1);
    assert.doesNotMatch(html, /id="market-intro"/);
  }

  assert.match(styles, /\.home-title-primary\s*\{[\s\S]*?color: var\(--accent-bright\)/);
  assert.match(styles, /\.home-title-secondary\s*\{[\s\S]*?color: #fff/);
  assert.match(styles, /\.home-title-primary,\s*\.home-title-secondary\s*\{[\s\S]*?white-space: nowrap/);
});

test("Fantasy account action signs out instead of switching accounts", () => {
  assert.match(script, /apiFetch\("\/api\/fantasy\/auth\/logout",\s*\{\s*method: "POST"/);
  assert.match(script, /state\.userName \? "Sair" : "Entrar"/);
  assert.doesNotMatch(script, /state\.userName \? "Trocar"/);
});

test("Login pelo Discord abre o mercado depois da autenticação", () => {
  const initSource = script.match(/async function init\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  const loginSource = script.match(/async function completeCloudLogin\(\) \{[\s\S]*?\n  \}/)?.[0] || "";

  assert.match(script, /initialViewFromUrl\(\)/);
  assert.match(script, /initialViewAfterLogin = "market"/);
  assert.match(script, /if \(initialViewAfterLogin\) setView\(initialViewAfterLogin\)/);
  assert.ok(initSource.indexOf("setView(initialViewAfterLogin)") < initSource.indexOf("loadCloudAccount()"));
  assert.match(loginSource, /initialViewAfterLogin = "market";\s*setView\("market"\)/);
  assert.match(workerScript, /target\.searchParams\.set\("view", "market"\)/);
  assert.doesNotMatch(
    script.match(/if \(loginError\) \{[\s\S]*?\n    \}/)?.[0] || "",
    /initialViewAfterLogin/
  );
});

test("Fechamento do mercado recarrega os destaques com suas contagens", () => {
  const controlSource = script.match(/async function toggleMarketFromFantasy\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(controlSource, /loadCloudPopular\("elite"\)/);
  assert.match(controlSource, /loadCloudPopular\("ascension"\)/);
  assert.match(script, /picks === 1 \? "escalação" : "escalações"/);
});

test("Botão flutuante retorna às divisões no topo do mercado", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="back-to-top"[^>]*aria-label="Voltar ao topo e às divisões"[^>]*hidden/);
    assert.match(html, /<span>Topo<\/span>/);
  }

  assert.match(script, /window\.addEventListener\("scroll", updateBackToTopVisibility, \{ passive: true \}\)/);
  assert.match(script, /divisionTabs\.scrollIntoView\(\{ behavior, block: "start" \}\)/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.back-to-top\s*\{[\s\S]*?position: fixed;/);
  assert.match(styles, /\.division-tabs \{ scroll-margin-top: 152px; \}/);
});

test("Home, ranking and rules remain available while the market is closed", () => {
  assert.match(script, /view: "home"/);
  assert.doesNotMatch(script, /if \(!isMarketOpen\(\) && view !== "market"\)/);
  assert.doesNotMatch(script, /button\.hidden = !open/);
});

test("Patrimônio é individual por divisão e o ranking geral não mostra patrimônio", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="patrimony-summary-body"/);
    assert.match(html, /Saldo anterior/);
    assert.match(html, /Elite e Ascensão possuem patrimônios independentes/);
    assert.doesNotMatch(html, /id="patrimony-history-body"/);
    assert.match(html, /id="ranking-wealth-header"/);
  }
  assert.match(script, /const showWealth = !rankingUsesAllDivisions\(\)/);
  assert.match(script, /rankingWealthHeader\.hidden = allDivisions/);
  assert.match(workerScript, /pp\.division = ft\.division/);
  assert.match(workerScript, /\(user_id, division, current_cents, formula_version\)/);
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

test("Aviso da Rodada 2 exige login e só fecha depois do aceite persistido", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="round-two-notice"[^>]*hidden/);
    assert.match(html, /id="round-two-notice-dialog"/);
    assert.match(html, /id="acknowledge-round-two-notice"[^>]*>Entendido<\/button>/);
    const dialog = html.match(/<dialog id="round-two-notice-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
    assert.doesNotMatch(dialog, /dialog-close/);
  }

  const noticeLoader = script.match(/async function loadRoundTwoNotice\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  const acknowledgment = script.match(/async function acknowledgeRoundTwoNotice\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(noticeLoader, /if \(!state\.userName \|\| config\.backendMode !== "cloud"\)/);
  assert.match(noticeLoader, /\/api\/fantasy\/notices\/round-2-postponement/);
  assert.match(acknowledgment, /\/api\/fantasy\/notices\/round-2-postponement\/ack/);
  assert.ok(acknowledgment.indexOf("apiFetch") < acknowledgment.indexOf("roundTwoNoticeDialog.close()"));
  assert.match(script, /roundTwoNoticeDialog\.addEventListener\("cancel", \(event\) => \{\s*event\.preventDefault\(\)/);
  assert.doesNotMatch(script, /localStorage\.(?:setItem|getItem)\([^\n]*round-two-notice/);
  assert.match(workerScript, /INSERT OR IGNORE INTO fantasy_user_notices/);
  assert.match(styles, /\.round-two-notice\[hidden\] \{ display: none; \}/);
});

test("Admin-only mode keeps the market closed for other players", () => {
  assert.match(script, /marketAccessMode: \{ elite: "public", ascension: "public" \}/);
  assert.match(script, /MERCADO ADMINISTRATIVO/);
  assert.match(script, /Acesso exclusivo da administração/);
  assert.match(workerScript, /function isMarketOpenForUser\(marketState, user, env\)/);
  assert.match(workerScript, /access_mode \|\| "public"/);
  assert.match(workerScript, /temporariamente aberto apenas para a administração/);
  assert.match(workerScript, /marketStateForUser\(marketState, user, env\)/);
});
