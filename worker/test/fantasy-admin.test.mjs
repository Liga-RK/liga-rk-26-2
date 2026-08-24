import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { __test } from "../fantasy-admin.js";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  // Node 20 executa os testes sem SQLite; a integração roda em Node 22+.
}
const sqliteTest = DatabaseSync ? test : test.skip;

const WORKER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(WORKER_ROOT, "..");
const workerSource = fs.readFileSync(path.join(WORKER_ROOT, "fantasy-worker.js"), "utf8");
const adminSource = fs.readFileSync(path.join(WORKER_ROOT, "fantasy-admin.js"), "utf8");
const adminCss = fs.readFileSync(path.join(WORKER_ROOT, "public/admin/admin.css"), "utf8");
const wranglerConfig = fs.readFileSync(path.join(WORKER_ROOT, "wrangler.toml"), "utf8");

test("01 login com usuário e senha corretos", async () => {
  const password = "Senha segura 2026!";
  const hash = await passwordHash(password);
  assert.equal(await __test.verifyPassword(password, hash), true);
});

test("02 login rejeita senha incorreta", async () => {
  const hash = await passwordHash("Senha correta");
  assert.equal(await __test.verifyPassword("Senha errada", hash), false);
});

test("03 sessão administrativa usa cookie HttpOnly, Secure e Strict", () => {
  const value = __test.adminCookie("token", 3600);
  assert.match(value, /HttpOnly/);
  assert.match(value, /Secure/);
  assert.match(value, /SameSite=Strict/);
});

test("04 rotas administrativas passam por autenticação central", () => {
  const guardIndex = adminSource.indexOf("const auth = await requireAdmin");
  const overviewIndex = adminSource.indexOf('["GET", "/api/fantasy/admin/overview"');
  assert.ok(guardIndex > 0 && guardIndex < overviewIndex);
});

test("05 abertura do mercado é somente por rota manual POST", () => {
  assert.match(adminSource, /\["POST", "\/api\/fantasy\/admin\/market\/open"/);
  assert.doesNotMatch(adminSource, /scheduled[\s\S]{0,200}adminOpenMarket/);
});

test("06 janela global exige rodadas nas duas divisões", async () => {
  const result = await __test.resolveMarketWindow(fakeEnv({
    rounds: [{ division: "elite" }],
    matches: []
  }), 2);
  assert.equal(result.canOpen, false);
  assert.match(result.warnings.join(" "), /ascension/);
});

test("07 fechamento manual possui rota exclusiva", () => {
  assert.match(adminSource, /\["POST", "\/api\/fantasy\/admin\/market\/close"/);
  assert.match(adminSource, /status = 'closed'/);
});

test("08 fechamento atualiza as duas divisões", () => {
  assert.match(adminSource, /division IN \('elite', 'ascension'\)/);
});

test("09 fechamento ocorre 25 minutos antes", async () => {
  const startsAt = "2026-08-01T19:00:00.000Z";
  const result = await windowFor([
    match("ascension", startsAt),
    match("elite", "2026-08-02T19:00:00.000Z")
  ]);
  assert.equal(result.closesAt, "2026-08-01T18:35:00.000Z");
  assert.equal(__test.LOCK_MINUTES, 25);
});

test("10 primeira partida pode pertencer à Elite", async () => {
  const result = await windowFor([
    match("elite", "2026-08-01T18:00:00.000Z"),
    match("ascension", "2026-08-01T19:00:00.000Z")
  ]);
  assert.equal(result.match.division, "elite");
});

test("11 primeira partida pode pertencer à Ascensão", async () => {
  const result = await windowFor([
    match("elite", "2026-08-02T18:00:00.000Z"),
    match("ascension", "2026-08-01T19:00:00.000Z")
  ]);
  assert.equal(result.match.division, "ascension");
});

test("12 partidas em dias diferentes usam a mais antiga", async () => {
  const result = await windowFor([
    match("elite", "2026-08-02T19:00:00.000Z"),
    match("ascension", "2026-08-01T22:00:00.000Z")
  ]);
  assert.equal(result.match.division, "ascension");
});

test("13 partidas no mesmo horário produzem uma janela única", async () => {
  const startsAt = "2026-08-01T19:00:00.000Z";
  const result = await windowFor([match("elite", startsAt), match("ascension", startsAt)]);
  assert.equal(result.closesAt, "2026-08-01T18:35:00.000Z");
});

test("14 alteração de horário antes do fechamento recalcula a janela", async () => {
  const before = await windowFor([
    match("elite", "2026-08-02T19:00:00.000Z"),
    match("ascension", "2026-08-01T19:00:00.000Z")
  ]);
  const after = await windowFor([
    match("elite", "2026-08-01T18:00:00.000Z"),
    match("ascension", "2026-08-01T19:00:00.000Z")
  ]);
  assert.notEqual(before.closesAt, after.closesAt);
  assert.equal(after.closesAt, "2026-08-01T17:35:00.000Z");
});

test("15 alteração depois do fechamento não contém caminho de reabertura", () => {
  const automatic = functionBody(adminSource, "ensureAutomaticMarketClose");
  assert.doesNotMatch(automatic, /SET\s+status\s*=\s*'open'/);
});

test("16 mercado nunca reabre automaticamente", () => {
  const openAssignments = [...adminSource.matchAll(/SET status = 'open'/g)];
  const manualOpen = functionBody(adminSource, "adminOpenMarket");
  assert.equal(openAssignments.length, 1);
  assert.equal([...manualOpen.matchAll(/SET status = 'open'/g)].length, 1);
  assert.match(manualOpen, /SET status = CASE WHEN \? <= \? THEN 'locked' ELSE 'open' END/);
});

test("17 nova escalação é recusada após fechamento", () => {
  assert.match(workerSource, /if \(!isDivisionMarketOpen\(marketState, round\)\)/);
});

test("18 alteração de escalação usa o mesmo bloqueio de backend", () => {
  const saveBody = functionBody(workerSource, "saveCurrentLineup");
  assert.ok(saveBody.indexOf("isDivisionMarketOpen") < saveBody.indexOf("env.DB.batch"));
});

test("19 manipulação direta exige ativo existente e papel correto", () => {
  const saveBody = functionBody(workerSource, "saveCurrentLineup");
  assert.match(saveBody, /active = 1/);
  assert.match(saveBody, /row\.role !==/);
});

test("20 normalização sincroniza equipes por ID estável", async () => {
  const snapshot = await __test.normalizeOfficialSource(sampleSource());
  assert.equal(snapshot.teams.length, 2);
  assert.deepEqual(snapshot.teams.map((team) => team.id).sort(), [
    "team:ascension:A1", "team:elite:A1"
  ]);
});

test("21 normalização sincroniza jogadores por playerId", async () => {
  const snapshot = await __test.normalizeOfficialSource(sampleSource());
  assert.deepEqual(snapshot.players.map((player) => player.id).sort(), ["p-asc", "p-elite"]);
});

test("22 normalização sincroniza confrontos por sourceId", async () => {
  const snapshot = await __test.normalizeOfficialSource(sampleSource());
  assert.deepEqual(snapshot.rounds.flatMap((round) => round.matches).map((item) => item.sourceId).sort(), ["r2g1", "r2g1"]);
});

test("23 estatísticas são normalizadas nas duas divisões", async () => {
  const stats = await __test.normalizeRoundStats(sampleSource(), 1);
  assert.equal(stats.items.filter((item) => item.assetType === "player").length, 2);
  assert.equal(stats.items.filter((item) => item.assetType === "team").length, 2);
});

test("24 jogador sem vínculo estável gera alerta e não é importado", async () => {
  const source = sampleSource();
  delete source.divisions.elite.teams[0].players[0].id;
  const snapshot = await __test.normalizeOfficialSource(source);
  assert.match(snapshot.warnings.join(" "), /sem ID estável/);
  assert.equal(snapshot.players.some((player) => player.division === "elite"), false);
});

test("25 jogador duplicado gera alerta", async () => {
  const source = sampleSource();
  source.divisions.elite.teams[0].players.push({ ...source.divisions.elite.teams[0].players[0] });
  const snapshot = await __test.normalizeOfficialSource(source);
  assert.match(snapshot.warnings.join(" "), /duplicado/);
});

test("26 confronto sem data gera alerta", async () => {
  const source = sampleSource();
  source.divisions.elite.rounds[0].matches[0].startsAt = null;
  const snapshot = await __test.normalizeOfficialSource(source);
  assert.match(snapshot.warnings.join(" "), /Horário ausente ou inválido/);
});

test("27 confronto com horário inválido gera alerta", async () => {
  const source = sampleSource();
  source.divisions.ascension.rounds[0].matches[0].startsAt = "não-é-data";
  const snapshot = await __test.normalizeOfficialSource(source);
  assert.match(snapshot.warnings.join(" "), /Horário ausente ou inválido/);
});

test("28 reprocessamento acidental é bloqueado por chave única", () => {
  const migration = migrationText("0002_production_model.sql");
  assert.match(migration, /UNIQUE \(round_id, source_hash, formula_version\)/);
  assert.match(adminSource, /idempotent: true/);
});

test("29 importação da rodada 1 usa avaliações publicadas", async () => {
  const stats = await __test.normalizeRoundStats(sampleSource(), 1);
  const elite = stats.items.find((item) => item.assetId === "p-elite");
  assert.equal(elite.points, 75.5);
  assert.equal(elite.games, 2);
});

test("30 importação da rodada 1 verifica preservação dos preços", () => {
  const body = functionBody(adminSource, "adminRoundOneImport");
  assert.match(body, /beforePrices/);
  assert.match(body, /afterPrices/);
  assert.match(body, /pricesPreserved/);
  assert.doesNotMatch(body, /SET\s+price\s*=/);
});

test("30a elenco ao vivo substitui equipe e jogadores do arquivo estático", () => {
  const source = sampleSource();
  const merged = __test.mergeLiveOfficialContent(source, {
    divisions: {
      elite: {
        teams: {
          A1: {
            name: "SPACE DUCKS",
            tag: "SDK",
            logo: "assets/space-ducks.png",
            players: [{
              playerId: "mack-current",
              player: "MACK",
              lane: "JG",
              riotId: "MacK#shhh",
              opgg: "https://op.gg/pt/lol/summoners/br/MacK-shhh"
            }]
          }
        }
      },
      ascension: { teams: {} }
    }
  }, "2026-07-29T18:33:06.155Z");
  assert.equal(merged.divisions.elite.teams[0].name, "SPACE DUCKS");
  assert.equal(merged.divisions.elite.teams[0].players[0].id, "mack-current");
  assert.equal(merged.divisions.elite.rounds[0].matches[0].homeTeamName, "SPACE DUCKS");
  assert.equal(merged.contentUpdatedAt, "2026-07-29T18:33:06.155Z");
});

test("30a1 Fantasy mantém NIHIL como TOP titular e rebaixa TUTU para reserva", () => {
  const source = sampleSource();
  source.divisions.elite.teams = [{
    id: "team:elite:D1",
    slot: "D1",
    name: "FAVELÃO DO TECHY",
    tag: "FVL",
    players: [{
      id: "ee09cf39-13a1-4268-a363-dbd28955437b",
      name: "NIHIL",
      role: "TOP"
    }, {
      id: "e9f77ada-22dd-4407-8030-c7abf4ebeb23",
      name: "TUTU",
      role: "SUB",
      mainRole: "TOP"
    }]
  }];
  const merged = __test.mergeLiveOfficialContent(source, {
    divisions: {
      elite: { teams: { D1: {
        name: "FAVELÃO DO TECHY",
        tag: "FVL",
        players: [{
          playerId: "e9f77ada-22dd-4407-8030-c7abf4ebeb23",
          player: "TUTU",
          lane: "TOP"
        }, {
          playerId: "ee09cf39-13a1-4268-a363-dbd28955437b",
          player: "NIHIL",
          lane: "SUB"
        }]
      } } },
      ascension: { teams: {} }
    }
  });
  const roster = merged.divisions.elite.teams[0].players;
  const nihil = roster.find((player) => player.name === "NIHIL");
  const tutu = roster.find((player) => player.name === "TUTU");
  assert.equal(nihil.role, "TOP");
  assert.equal(tutu.role, "SUB");
  assert.equal(tutu.mainRole, "TOP");
});

test("30a2 Fantasy escala GUOLHERME como MID da Inazuma e rebaixa YUTA para reserva", () => {
  const source = sampleSource();
  source.divisions.ascension.teams = [{
    id: "team:ascension:D4",
    slot: "D4",
    name: "INAZUMA V",
    tag: "INZ",
    players: [{
      id: "f1dcbe4d-dd34-4451-8e6a-ad6b61a12b7e",
      name: "YUTA",
      role: "MID"
    }, {
      id: "d74532ef-f354-4326-89d9-74c9cc45b1c4",
      name: "GUOLHERME",
      role: "SUB",
      mainRole: "MID"
    }]
  }];
  const merged = __test.mergeLiveOfficialContent(source, {
    divisions: {
      elite: { teams: {} },
      ascension: { teams: { D4: {
        name: "INAZUMA V",
        tag: "INZ",
        players: [{
          playerId: "f1dcbe4d-dd34-4451-8e6a-ad6b61a12b7e",
          player: "YUTA",
          lane: "MID"
        }, {
          playerId: "d74532ef-f354-4326-89d9-74c9cc45b1c4",
          player: "GUOLHERME",
          lane: "SUB"
        }]
      } } }
    }
  });
  const roster = merged.divisions.ascension.teams[0].players;
  const guolherme = roster.find((player) => player.name === "GUOLHERME");
  const yuta = roster.find((player) => player.name === "YUTA");
  assert.equal(guolherme.role, "MID");
  assert.equal(yuta.role, "SUB");
  assert.equal(yuta.mainRole, "MID");
});

test("30aa resultados ao vivo distinguem WO e adiamento da rodada 2", () => {
  const source = sampleSource();
  source.divisions.elite.rounds[0].matches.push({
    id: "schedule:elite:r2g7",
    sourceId: "r2g7",
    stage: "groups",
    homeTeamSlot: "D1",
    awayTeamSlot: "D3",
    startsAt: "2026-08-02T23:30:00.000Z",
    status: "scheduled"
  });
  const merged = __test.mergeLiveOfficialContent(source, {
    divisions: {
      elite: {
        teams: {},
        results: {
          r2g1: { homeScore: 0, awayScore: 2, manualOverride: true },
          r2g7: { homeScore: "", awayScore: "" }
        }
      },
      ascension: { teams: {}, results: {} }
    }
  }, "2026-08-05T22:26:55.282Z");
  const [walkover, postponed] = merged.divisions.elite.rounds[0].matches;
  assert.equal(walkover.status, "completed");
  assert.equal(walkover.isWalkover, true);
  assert.equal(walkover.excludedFromScoring, true);
  assert.equal(walkover.homeScore, 0);
  assert.equal(walkover.awayScore, 2);
  assert.equal(postponed.status, "postponed");
  assert.equal(postponed.excludedFromScoring, true);
  assert.match(postponed.scheduleIssue, /FVL x SDK/);
});

test("30ab rodada fecha com série jogada, WO e partida adiada sem inventar mapas", async () => {
  const source = sampleSource();
  source.divisions.elite.rounds[0].matches = [
    {
      id: "schedule:elite:r2g1", sourceId: "r2g1", stage: "groups",
      homeTeamSlot: "A1", awayTeamSlot: "A2", status: "completed",
      homeScore: 0, awayScore: 2, isWalkover: true, excludedFromScoring: true
    },
    {
      id: "schedule:elite:r2g2", sourceId: "r2g2", stage: "groups",
      homeTeamSlot: "A1", awayTeamSlot: "A2", status: "completed",
      homeScore: 2, awayScore: 0
    },
    {
      id: "schedule:elite:r2g7", sourceId: "r2g7", stage: "groups",
      homeTeamSlot: "D1", awayTeamSlot: "D3", status: "postponed",
      excludedFromScoring: true
    }
  ];
  source.divisions.elite.stats.matches = [1, 2].map((gameNumber) => ({
    id: `elite-r2g2-map-${gameNumber}`,
    seriesId: "groups-r2g2",
    round: "RODADA 2",
    roundNumber: 2,
    gameNumber,
    format: "MD3",
    blueTeamSlot: "A1",
    redTeamSlot: "A2",
    winnerSlot: "A1",
    mvpPlayerId: "p-elite",
    participants: [{
      playerId: "p-elite",
      teamSlot: "A1",
      position: "TOP",
      score: 80,
      won: true,
      deaths: 1
    }]
  }));
  const normalized = await __test.normalizeFormulaV2Round(source, 2, "elite");
  assert.equal(normalized.ready, true);
  assert.equal(normalized.expectedSeries, 3);
  assert.equal(normalized.completedSeries, 3);
  assert.equal(normalized.playedSeries, 1);
  assert.equal(normalized.walkovers, 1);
  assert.equal(normalized.postponed, 1);
  assert.equal(normalized.series.length, 1);
  assert.equal(normalized.series[0].id, "groups-r2g2");
  assert.equal(normalized.series[0].mapas.length, 2);
});

test("30ac playoffs usam o vínculo statsSeriesId mesmo sem número no nome da rodada", async () => {
  const source = sampleSource();
  source.divisions.elite.rounds.push({
    id: "elite-r4",
    roundNumber: 4,
    name: "RODADA 4 · OITAVAS",
    matches: [{
      id: "schedule:elite:p1m1",
      sourceId: "p1m1",
      statsSeriesId: "playoffs-p1m1",
      stage: "playoffs-round-of-16",
      homeTeamSlot: "A1",
      awayTeamSlot: "A2",
      status: "completed",
      homeScore: 2,
      awayScore: 0
    }]
  });
  source.divisions.elite.stats.matches = [1, 2].map((gameNumber) => ({
    id: `playoffs-p1m1-j${gameNumber}`,
    seriesId: "playoffs-p1m1",
    stage: "oitavas",
    round: "OITAVAS 1",
    roundNumber: null,
    gameNumber,
    format: "MD3",
    blueTeamSlot: "A1",
    redTeamSlot: "A2",
    winnerSlot: "A1",
    mvpPlayerId: "p-elite",
    participants: [{
      playerId: "p-elite",
      teamSlot: "A1",
      position: "TOP",
      score: 85,
      won: true,
      deaths: 1
    }]
  }));

  const normalized = await __test.normalizeFormulaV2Round(source, 4, "elite");
  assert.equal(normalized.ready, true);
  assert.equal(normalized.expectedSeries, 1);
  assert.equal(normalized.completedSeries, 1);
  assert.equal(normalized.playedSeries, 1);
  assert.equal(normalized.series[0].id, "playoffs-p1m1");
  assert.equal(normalized.series[0].mapas.length, 2);
});

test("30b estatística histórica é reconciliada com o jogador atual pelo Riot ID", async () => {
  const source = sampleSource();
  source.divisions.elite.teams[0].players = [{
    id: "mack-current",
    playerId: "mack-current",
    name: "MACK",
    role: "JG",
    riotId: "MacK#shhh",
    opgg: "https://op.gg/pt/lol/summoners/br/MacK-shhh"
  }];
  source.divisions.elite.stats.players = [{
    id: "mack-history",
    playerId: "mack-history",
    displayName: "MACK",
    riotId: "mack#SHHH",
    opgg: "https://op.gg/pt/lol/summoners/br/MacK-shhh",
    mainPosition: "JG",
    teams: [{ slot: "A1" }],
    roundRatings: [{
      round: 1,
      position: "JG",
      teamSlot: "A1",
      averageScore: 87.34,
      games: 2,
      wins: 2,
      losses: 0,
      matches: ["elite-map-1", "elite-map-2"]
    }]
  }];
  const stats = await __test.normalizeRoundStats(source, 1);
  const mack = stats.items.find((item) => item.assetId === "mack-current");
  assert.ok(mack);
  assert.equal(mack.points, 87.34);
  assert.equal(mack.games, 2);
  assert.match(stats.warnings.join(" "), /reconciliada/);
});

test("30c estatística de equipe substituída não é atribuída ao novo time", async () => {
  const source = sampleSource();
  source.divisions.elite.teams[0].name = "SPACE DUCKS";
  source.divisions.elite.stats.teams[0].name = "TEAM SOLO BAHIA";
  const stats = await __test.normalizeRoundStats(source, 1);
  assert.equal(
    stats.items.some((item) => item.assetId === "team:elite:A1"),
    false
  );
  assert.match(stats.warnings.join(" "), /não corresponde ao elenco atual/);
});

test("31 simulação de valorização é determinística", () => {
  const settings = defaultSettings();
  const asset = assetInput({ roundPoints: 92, games: 2 });
  const first = __test.valuationItem(asset, [], settings);
  const second = __test.valuationItem(asset, [], settings);
  assert.deepEqual(first, second);
});

test("31a ativo de equipe valoriza pela curva dinâmica", () => {
  const item = __test.valuationItem(assetInput({
    assetId: "team:elite:A1",
    assetType: "team",
    role: "TEAM",
    currentPriceCents: 1456,
    previousPriceCents: 1400,
    roundPoints: 38
  }), [], defaultSettings());
  assert.ok(item.newPriceCents > 1456);
  assert.ok(item.deltaCents > 0);
  assert.equal(item.status, "increased");
  assert.equal(item.played, true);
});

test("32 cancelamento de simulação não contém atualização de mercado", () => {
  const body = functionBody(adminSource, "adminValuationCancel");
  assert.match(body, /status = 'cancelled'/);
  assert.doesNotMatch(body, /UPDATE fantasy_market/);
});

test("33 aplicação de preços exige confirmação explícita", () => {
  const body = functionBody(adminSource, "adminValuationApply");
  assert.match(body, /confirmSimulationId/);
  assert.match(body, /MARKET_MUST_BE_CLOSED/);
});

test("34 aplicação de preços cria backup antes do batch", () => {
  const body = functionBody(adminSource, "adminValuationApply");
  assert.ok(body.indexOf("createBackupRecord") < body.indexOf("env.DB.batch"));
});

sqliteTest("35 migração preserva usuários", () => {
  const db = migratedDatabaseWithFixture();
  assert.equal(db.prepare("SELECT username FROM fantasy_users WHERE id='u1'").get().username, "Usuário");
});

sqliteTest("36 migração preserva escalações", () => {
  const db = migratedDatabaseWithFixture();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM fantasy_lineups").get().count, 1);
});

sqliteTest("37 migração preserva estatísticas", () => {
  const db = migratedDatabaseWithFixture();
  assert.equal(db.prepare("SELECT points FROM fantasy_asset_round_scores").get().points, 71.25);
});

sqliteTest("38 migração preserva preços atuais", () => {
  const db = migratedDatabaseWithFixture();
  const price = db.prepare("SELECT price, price_cents FROM fantasy_market").get();
  assert.equal(price.price, 17.27);
  assert.equal(price.price_cents, 1727);
});

test("34a timestamp do SQLite é comparado em UTC com o fechamento", () => {
  assert.equal(
    __test.timestampMillis("2026-08-01 17:51:19"),
    Date.parse("2026-08-01T17:51:19Z")
  );
  assert.ok(
    __test.timestampMillis("2026-08-01 17:51:19")
      < __test.timestampMillis("2026-08-01T18:35:52.301Z")
  );
});

sqliteTest("38a migração v2 preserva histórico e adiciona versão segura", () => {
  const db = migratedDatabaseWithFixture();
  const score = db.prepare(`
    SELECT points, formula_version AS formulaVersion
    FROM fantasy_asset_round_scores
  `).get();
  assert.equal(score.points, 71.25);
  assert.equal(score.formulaVersion, "stats-only-v1");
  assert.equal(
    db.prepare("SELECT version FROM fantasy_formula_settings WHERE id='global'").get().version,
    "fantasy-v3-dynamic"
  );
});

sqliteTest("38b Elite e Ascensão mantêm patrimônios independentes", () => {
  const db = migratedDatabaseWithFixture();
  db.exec(`
    INSERT INTO fantasy_rounds(id,division,round_number,name,opens_at,locks_at,status)
      VALUES
        ('asc-r2','ascension',2,'Rodada 2','2026-08-01T00:00:00Z','2026-08-02T00:00:00Z','locked'),
        ('elite-r2','elite',2,'Rodada 2','2026-08-01T00:00:00Z','2026-08-02T00:00:00Z','locked');
    INSERT INTO fantasy_price_simulations(
      id,round_id,source_hash,formula_version,settings_json,items_json,status,created_by
    ) VALUES
      ('sim-asc-r2','asc-r2','hash-asc','fantasy-v3-dynamic','{}','[]','applied','test'),
      ('sim-elite-r2','elite-r2','hash-elite','fantasy-v3-dynamic','{}','[]','applied','test');
    UPDATE fantasy_participant_patrimony SET current_cents=11268 WHERE user_id='u1';
    INSERT INTO fantasy_patrimony_history(
      id,simulation_id,user_id,round_id,division,previous_cents,purchases_cents,
      available_balance_cents,previous_assets_cents,updated_assets_cents,
      variation_cents,new_cents,status,formula_version,processed_by
    ) VALUES
      ('h-asc','sim-asc-r2','u1','asc-r2','ascension',10000,9000,1000,9000,9795,795,10795,'PUBLISHED','v2-dynamic-assets','test'),
      ('h-elite','sim-elite-r2','u1','elite-r2','elite',10795,9000,1795,9000,9473,473,11268,'PUBLISHED','v2-dynamic-assets','test');
  `);
  db.exec(migrationText("0010_fantasy_shared_round_patrimony.sql"));
  db.exec(migrationText("0011_fantasy_division_patrimony.sql"));
  const elite = db.prepare(`
    SELECT previous_cents AS previousCents, available_balance_cents AS availableCents,
           new_cents AS newCents, consistency_difference_cents AS differenceCents
    FROM fantasy_patrimony_history WHERE id='h-elite'
  `).get();
  assert.deepEqual({ ...elite }, {
    previousCents: 10000,
    availableCents: 1000,
    newCents: 10473,
    differenceCents: 0
  });
  assert.equal(
    db.prepare("SELECT current_cents AS currentCents FROM fantasy_participant_patrimony WHERE user_id='u1' AND division='elite'").get().currentCents,
    10473
  );
  assert.equal(
    db.prepare("SELECT current_cents AS currentCents FROM fantasy_participant_patrimony WHERE user_id='u1' AND division='ascension'").get().currentCents,
    10795
  );
});

test("39 painel possui layout responsivo para celular", () => {
  assert.match(adminCss, /@media \(max-width: 560px\)/);
  assert.match(adminCss, /\.compact-form \{ grid-template-columns: 1fr; \}/);
});

test("40 painel possui grade para computador", () => {
  assert.match(adminCss, /\.admin-shell \{ display: grid; grid-template-columns: 250px minmax\(0, 1fr\)/);
  assert.match(adminCss, /\.two-columns \{ display: grid; grid-template-columns: repeat\(2/);
});

test("41 módulo do Worker pode ser avaliado sem helpers ausentes", async () => {
  const workerModule = await import("../fantasy-worker.js");
  assert.equal(typeof workerModule.default.fetch, "function");
  assert.equal(typeof workerModule.default.scheduled, "function");
});

test("42 assets administrativos não entram em redirecionamento canônico", () => {
  assert.match(wranglerConfig, /html_handling\s*=\s*"none"/);
  assert.match(workerSource, /serveAdminAsset\(request, env, "\/admin\/index\.html"\)/);
});

function fakeEnv({ rounds, matches }) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async all() {
                return { results: sql.includes("FROM fantasy_rounds") ? rounds : matches };
              }
            };
          }
        };
      }
    }
  };
}

function match(division, startsAt) {
  return {
    id: `${division}:${startsAt}`,
    division,
    round_number: 2,
    starts_at: startsAt,
    status: "scheduled",
    home_team_name: `${division} A`,
    away_team_name: `${division} B`,
    schedule_issue: ""
  };
}

function windowFor(matches) {
  return __test.resolveMarketWindow(fakeEnv({
    rounds: [
      { id: "elite-r2", division: "elite", round_number: 2 },
      { id: "ascension-r2", division: "ascension", round_number: 2 }
    ],
    matches
  }), 2);
}

function sampleSource() {
  const division = (name, playerId) => ({
    teams: [{
      id: `team:${name}:A1`,
      slot: "A1",
      name: `${name} Team`,
      tag: name.slice(0, 3).toUpperCase(),
      logo: `assets/${name}.png`,
      players: [{ id: playerId, name: `${name} Player`, role: "TOP", riotId: "name#tag", opgg: "" }]
    }],
    rounds: [{
      id: `${name}-r2`,
      roundNumber: 2,
      name: "Rodada 2",
      matches: [{
        id: `schedule:${name}:r2g1`,
        sourceId: "r2g1",
        homeTeamSlot: "A1",
        awayTeamSlot: "A2",
        startsAt: name === "elite" ? "2026-08-02T19:00:00.000Z" : "2026-08-01T19:00:00.000Z",
        status: "scheduled"
      }]
    }],
    stats: {
      players: [{
        id: playerId,
        playerId,
        displayName: `${name} Player`,
        mainPosition: "TOP",
        roundRatings: [{
          round: 1,
          position: "TOP",
          teamSlot: "A1",
          averageScore: name === "elite" ? 75.5 : 70.25,
          games: 2,
          wins: 1,
          losses: 1,
          matches: [`${name}-map-1`, `${name}-map-2`]
        }]
      }],
      teams: [{
        slot: "A1",
        name: `${name} Team`,
        games: 2,
        wins: 1,
        losses: 1,
        winRate: 50,
        averageScore: 72
      }],
      matches: [{
        id: `${name}-map-1`,
        seriesId: "groups-r1g1",
        round: "RODADA 1",
        roundNumber: 1,
        blueTeamSlot: "A1",
        redTeamSlot: "A2"
      }]
    }
  });
  return {
    version: 1,
    generatedAt: "2026-07-29T00:00:00.000Z",
    divisions: {
      elite: division("elite", "p-elite"),
      ascension: division("ascension", "p-asc")
    }
  };
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  const asyncStart = source.indexOf(`async function ${name}`);
  const actualStart = start >= 0 ? start : asyncStart;
  assert.ok(actualStart >= 0, `Função ${name} não encontrada`);
  const next = source.indexOf("\nasync function ", actualStart + 20);
  const nextSync = source.indexOf("\nfunction ", actualStart + 20);
  const candidates = [next, nextSync].filter((index) => index > actualStart);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(actualStart, end);
}

function defaultSettings() {
  return {
    expectedPriceMultiplier: 1.6,
    expectedPriceOffset: -8,
    oneHistoryCurrentWeight: 0.75,
    oneHistoryPreviousWeight: 0.25,
    experiencedCurrentWeight: 0.65,
    experiencedRecentWeight: 0.25,
    experiencedSeasonWeight: 0.10,
    recentRounds: 3,
    variationDivisor: 10,
    variationExponent: 0.90,
    positiveFactorNumerator: 14,
    positiveFactorOffset: 4,
    negativeFactorBase: 0.75,
    negativeFactorPriceDivisor: 40,
    lowParticipationThreshold: 0.34,
    lowParticipationFactor: 0.70,
    partialParticipationFactor: 0.90,
    fullParticipationFactor: 1,
    minimumPrice: 4,
    reviewThreshold: 7,
    currencyDecimals: 2,
    didNotPlay: "hold"
  };
}

function assetInput(overrides = {}) {
  return {
    assetId: "p1",
    assetType: "player",
    role: "TOP",
    name: "Player",
    teamName: "Team",
    currentPriceCents: 1700,
    previousPriceCents: 1700,
    roundPoints: 50,
    games: 2,
    scoreDetailsJson: '{"totalMapasEquipe":2}',
    previousValuationJson: '{}',
    ...overrides
  };
}

async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 120000;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  ));
  return `pbkdf2_sha256$${iterations}$${Buffer.from(salt).toString("base64")}$${Buffer.from(derived).toString("base64")}`;
}

function migratedDatabaseWithFixture() {
  const db = new DatabaseSync(":memory:");
  for (const file of ["0001_initial.sql", "0002_production_model.sql", "0003_github_pages_auth.sql", "0004_lineup_reserves.sql"]) {
    db.exec(migrationText(file));
  }
  db.exec(`
    INSERT INTO fantasy_users(id,discord_id,username) VALUES('u1','d1','Usuário');
    INSERT INTO fantasy_rounds(id,division,round_number,name,opens_at,locks_at,status)
      VALUES('elite-r1','elite',1,'Rodada 1','2026-07-20T00:00:00Z','2026-07-25T00:00:00Z','locked');
    INSERT INTO fantasy_market(
      division,asset_id,asset_type,role,display_name,team_slot,team_name,team_tag,
      price,previous_price,price_cents,previous_price_cents
    ) VALUES('elite','p1','player','TOP','Player','A1','Team','TM',17.27,17.27,1727,1727);
    INSERT INTO fantasy_teams(id,user_id,division,name) VALUES('ft1','u1','elite','Meu time');
    INSERT INTO fantasy_lineups(id,fantasy_team_id,round_id,captain_asset_id,total_cost)
      VALUES('l1','ft1','elite-r1','p1',17.27);
    INSERT INTO fantasy_lineup_picks(lineup_id,role,asset_id,price_paid,team_slot)
      VALUES('l1','TOP','p1',17.27,'A1');
    INSERT INTO fantasy_asset_round_scores(round_id,division,asset_id,role,games,points)
      VALUES('elite-r1','elite','p1','TOP',2,71.25);
  `);
  db.exec(migrationText("0005_admin_global_market.sql"));
  db.exec(migrationText("0006_fantasy_formula_v2.sql"));
  db.exec(migrationText("0007_fantasy_dynamic_valuation.sql"));
  db.exec(migrationText("0008_fantasy_dynamic_patrimony.sql"));
  db.exec(migrationText("0009_fantasy_user_notices.sql"));
  db.exec(migrationText("0010_fantasy_shared_round_patrimony.sql"));
  return db;
}

function migrationText(name) {
  return fs.readFileSync(path.join(WORKER_ROOT, "migrations", name), "utf8");
}
