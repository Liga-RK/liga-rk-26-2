const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const autoLineup = require(path.join(ROOT, "fantasy", "assets", "auto-lineup.js"));
const html = fs.readFileSync(path.join(ROOT, "fantasy", "index.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "fantasy", "assets", "fantasy.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "fantasy", "assets", "fantasy.css"), "utf8");

function asset(id, role, price, average, recent, teamSlot, extra = {}) {
  return {
    id,
    role,
    price,
    average,
    recentPoints: [recent],
    priceDelta: extra.priceDelta || 0,
    teamSlot,
    teamTag: teamSlot,
    type: role === "TEAM" ? "team" : "player",
    selectable: extra.selectable !== false,
    isStarter: role === "TEAM" ? true : extra.isStarter !== false,
    ...extra
  };
}

function sampleMarket() {
  const roles = ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"];
  return roles.flatMap((role, index) => [
    asset(`${role}-premium`, role, role === "TEAM" ? 14 : 18, 80 - index, 85 - index, `P${index}`, { priceDelta: 2 }),
    asset(`${role}-cheap`, role, role === "TEAM" ? 6 : 9, 35 - index, 32 - index, `C${index}`),
    asset(`${role}-blocked`, role, 4, 100, 100, `B${index}`, { selectable: false })
  ]);
}

test("otimizador monta as seis posições dentro do patrimônio e ignora indisponíveis", () => {
  const result = autoLineup.buildAutomaticLineup({
    market: sampleMarket(),
    budget: 82,
    maxPlayersPerTeam: 2,
    strategy: "balanced",
    includeReserve: true
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.slots), ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"]);
  assert.ok(result.totalCost <= 82);
  assert.ok(result.remaining >= 0);
  assert.ok(Object.values(result.slots).every((item) => item.selectable !== false));
  assert.ok(result.captainId);
});

test("limite de dois jogadores da mesma equipe também é respeitado pelo reserva", () => {
  const market = [
    asset("top-a", "TOP", 10, 90, 90, "A"), asset("top-b", "TOP", 11, 40, 40, "B"),
    asset("jg-a", "JG", 10, 90, 90, "A"), asset("jg-b", "JG", 11, 40, 40, "B"),
    asset("mid-a", "MID", 10, 90, 90, "A"), asset("mid-c", "MID", 11, 50, 50, "C"),
    asset("adc-d", "ADC", 10, 60, 60, "D"), asset("adc-e", "ADC", 11, 50, 50, "E"),
    asset("sup-f", "SUP", 10, 60, 60, "F"), asset("sup-g", "SUP", 11, 50, 50, "G"),
    asset("team-a", "TEAM", 8, 60, 60, "A"), asset("team-h", "TEAM", 9, 50, 50, "H"),
    asset("reserve-a", "SUP", 5, 80, 80, "A", { isStarter: false }), asset("reserve-h", "TOP", 5, 30, 30, "H", { isStarter: false })
  ];
  const result = autoLineup.buildAutomaticLineup({ market, budget: 90, maxPlayersPerTeam: 2, strategy: "average", includeReserve: true });
  const players = Object.values(result.slots).filter((item) => item.type === "player");
  const teamCounts = new Map();
  for (const item of players) teamCounts.set(item.teamSlot, (teamCounts.get(item.teamSlot) || 0) + 1);

  assert.equal(result.ok, true);
  assert.ok([...teamCounts.values()].every((count) => count <= 2));
  assert.equal(result.reserve?.isStarter, false);
  assert.ok((teamCounts.get(result.reserve.teamSlot) || 0) < 2);
});

test("reservas reais nunca ocupam as seis vagas titulares automáticas", () => {
  const market = sampleMarket();
  market.push(asset("reserve-super", "TOP", 4, 999, 999, "R1", { isStarter: false }));
  market.push(asset("reserve-flex", "SUP", 7, 70, 70, "R2", { isStarter: false }));
  const result = autoLineup.buildAutomaticLineup({ market, budget: 120, strategy: "average", includeReserve: true });

  assert.equal(result.ok, true);
  assert.ok(Object.values(result.slots).every((item) => item.type === "team" || item.isStarter !== false));
  assert.equal(result.reserve?.id, "reserve-super");
  assert.equal(result.reserve?.isStarter, false);
});

test("estratégia econômica gasta menos do que a estratégia de maior média", () => {
  const market = sampleMarket();
  const average = autoLineup.buildAutomaticLineup({ market, budget: 120, strategy: "average", includeReserve: false });
  const economic = autoLineup.buildAutomaticLineup({ market, budget: 120, strategy: "economic", includeReserve: false });
  assert.equal(average.ok, true);
  assert.equal(economic.ok, true);
  assert.ok(economic.totalCost < average.totalCost);
});

test("interface oferece sete estratégias, prévia e fluxo seguro de Palpite de Draft", () => {
  assert.match(html, /id="auto-lineup"[^>]*>[^<]*<span[^>]*>✦<\/span> Montar automaticamente<\/button>/);
  assert.equal((html.match(/data-auto-strategy=/g) || []).length, 7);
  assert.match(html, /id="auto-lineup-preview"/);
  assert.match(html, /Aplicar sem palpites/);
  assert.match(html, /Aplicar e revisar Draft/);
  assert.match(script, /function noDraftPrediction\(item\)/);
  assert.match(script, /for \(const role of PLAYER_ROLES\) lineup\.draftPredictions\[role\] = noDraftPrediction/);
  assert.match(script, /function startAutomaticDraftReview\(\)/);
  assert.match(script, /Palpite \$\{state\.autoDraftReview\.completed \+ 1\} de \$\{state\.autoDraftReview\.total\}/);
  assert.match(script, /RESERVA DO ELENCO/);
  assert.match(script, /Somente como reserva/);
  assert.match(css, /\.roster-status-badge\.reserve/);
});

test("modal automático mantém ações visíveis e vira tela inteira no celular", () => {
  assert.match(css, /\.auto-lineup-dialog-card \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.auto-lineup-content \{[\s\S]*?overflow-y: auto;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.auto-lineup-dialog-card \{[^}]*width: 100vw;[^}]*height: 100dvh;/);
  assert.match(css, /\.auto-lineup-footer \{[\s\S]*?border-top:/);
  assert.match(css, /\.dialog-card \.auto-reserve-option > span \{[^}]*display: grid;[^}]*gap: 5px;/);
  assert.match(css, /\.auto-reserve-option strong \{[^}]*display: block;/);
  assert.match(css, /\.auto-reserve-option small \{[^}]*display: block;/);
});
