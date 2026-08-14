const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pages = ["fantasy/index.html", "fantasy/fantasy.html"];
const script = fs.readFileSync(path.join(root, "fantasy/assets/fantasy.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "fantasy/assets/fantasy.css"), "utf8");
const workerScript = fs.readFileSync(path.join(root, "worker/fantasy-worker.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "worker/public/admin/index.html"), "utf8");
const adminScript = fs.readFileSync(path.join(root, "worker/public/admin/admin.js"), "utf8");

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

test("Canal de contato aparece apenas para jogador logado no Mercado e chega ao painel", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="market-feedback-button"[^>]*hidden>Fale com a organização<\/button>/);
    assert.match(html, /id="feedback-header-button"[^>]*hidden>Contato<\/button>/);
    assert.match(html, /id="feedback-dialog"/);
    assert.match(html, /Reportar um bug/);
    assert.match(html, /visível somente para a administração/);
  }
  assert.match(script, /const loggedInMarket = Boolean\(state\.userName && state\.view === "market"\)/);
  assert.match(script, /marketFeedbackButton\.hidden = !loggedInMarket \|\| !open/);
  assert.match(script, /feedbackHeaderButton\.hidden = !loggedInMarket \|\| !marketKnown \|\| open/);
  assert.match(script, /apiFetch\("\/api\/fantasy\/feedback"/);
  assert.match(workerScript, /url\.pathname === "\/api\/fantasy\/feedback"/);
  assert.match(adminHtml, /data-panel="feedback"/);
  assert.match(adminScript, /async function loadFeedback\(\)/);
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

test("Reserva da Rodada 3 usa somente o saldo restante", () => {
  const frontendSource = script.match(/function reserveBudget\(lineup\) \{[\s\S]*?\n  \}/)?.[0];
  const backendSource = workerScript.match(/function reserveBudgetForRows\(rows\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(frontendSource);
  assert.ok(backendSource);

  const frontendBudget = new Function(
    "lineupCash",
    "roundMoney",
    `${frontendSource}; return reserveBudget;`
  )(
    (lineup) => lineup.remaining,
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

  assert.equal(frontendBudget({ remaining: 24, players }), 24);
  assert.equal(backendBudget([...players, team]), 24);

  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /A partir da Rodada 3, ele precisa caber integralmente no saldo que restar depois dos seis titulares/);
  }
});

test("Cálculo da última rodada abre em modal responsivo e mostra indisponibilidade", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="calculation-dialog"/);
    assert.match(html, /id="calculation-dialog-body"/);
  }
  assert.match(script, /function openCalculationDialog\(item\)/);
  assert.match(script, /Estatística da última rodada indisponível/);
  assert.doesNotMatch(script, /document\.createElement\("details"\)/);
  assert.doesNotMatch(script, /MPV:/);
  assert.match(styles, /\.calculation-dialog-card\s*\{[\s\S]*?max-height:/);
  assert.match(styles, /\.calculation-dialog-card\s*\{[\s\S]*?overflow-y: auto/);
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

test("Painel administrativo usa a conta Discord exclusiva e aparece somente para o administrador", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="admin-panel-link"[^>]*hidden/);
  }
  assert.match(script, /state\.isAdmin = Boolean\(response\.ok && payload\.authenticated && payload\.canAccessAdminPanel\)/);
  assert.match(script, /adminPanelLink\.hidden = !state\.isAdmin/);
  assert.match(workerScript, /ADMIN_PANEL_DISCORD_IDS/);
  assert.match(adminHtml, /href="\/api\/fantasy\/auth\/login\?returnTo=admin"/);
  assert.doesNotMatch(adminHtml, /type="password"|login-username/);
  assert.match(adminScript, /\/api\/fantasy\/auth\/logout/);
});

test("Rodada 4 mostra somente o aviso com os fechamentos separados", () => {
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(html, /id="round-four-market-schedule-notice"/);
    assert.match(html, /Divisão Ascensão[\s\S]*13\/08\/2026 às 19h/);
    assert.match(html, /Divisão Elite[\s\S]*15\/08\/2026 às 18h/);
    assert.doesNotMatch(html, /round-two-notice|round-three-nkz-notice/);
  }
  assert.doesNotMatch(script, /loadRoundTwoNotice|roundTwoNoticeDialog|roundTwoNoticeBusy/);
  assert.match(styles, /\.market-deadline-list/);
});

test("Admin-only mode keeps the market closed for other players", () => {
  assert.match(script, /marketAccessMode: \{ elite: "public", ascension: "public" \}/);
  assert.match(script, /MERCADO ADMINISTRATIVO/);
  assert.match(script, /Acesso exclusivo da administração/);
  assert.match(workerScript, /function isMarketOpenForUser\(marketState, user, env, round = null\)/);
  assert.match(workerScript, /access_mode \|\| "public"/);
  assert.match(workerScript, /temporariamente aberto apenas para a administração/);
  assert.match(workerScript, /marketStateForUser\(marketState, user, env, round = null\)/);
});

test("Playoffs mantêm equipes não escaláveis visíveis no fim do mercado", () => {
  assert.match(script, /selectable: item\.selectable !== false/);
  assert.match(script, /Classificado para a rodada 5|availabilityLabel/);
  assert.match(script, /Indisponível nesta rodada/);
  assert.match(script, /Number\(a\.selectable === false\) - Number\(b\.selectable === false\)/);
  assert.match(styles, /\.player-card\.unavailable/);
  assert.match(workerScript, /function marketAssetAvailability\(round, teamSlot, roundMatches = \[\]\)/);
  assert.match(workerScript, /não pode ser escalado/);
});
