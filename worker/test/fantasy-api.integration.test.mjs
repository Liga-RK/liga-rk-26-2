import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { handleAdminRequest } from "../fantasy-admin.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://fantasy-rk.example";

test("API administrativa executa login, sync, mercado, importação e valorização", async () => {
  const database = createDatabase();
  seedLegacyProductionState(database);
  const password = "Senha administrativa!";
  const env = {
    DB: d1(database),
    ADMIN_USERNAME: "admin-rk",
    ADMIN_PASSWORD_HASH: await passwordHash(password),
    ADMIN_RATE_LIMIT_SALT: "test-only",
    FANTASY_SOURCE_URL: "embedded://official",
    FANTASY_SOURCE_JSON: JSON.stringify(sourceFixture())
  };

  const login = await call(env, "/auth/login", {
    method: "POST",
    body: { username: "admin-rk", password }
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.payload.ok, true);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const csrf = login.payload.data.csrfToken;

  const unauthorized = await call(env, "/overview");
  assert.equal(unauthorized.response.status, 401);

  const preview = await call(env, "/sync/preview", {
    method: "POST", body: {}, cookie, csrf
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.payload.data.summary.add, 8);

  const applied = await call(env, "/sync/apply", {
    method: "POST",
    body: { previewId: preview.payload.data.previewId },
    cookie,
    csrf
  });
  assert.equal(applied.response.status, 200);
  assert.equal(applied.payload.data.pricesPreserved, true);
  assert.ok(applied.payload.data.backupId);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_market").get().count, 4);
  assert.equal(database.prepare("SELECT price_cents FROM fantasy_market WHERE division='elite' AND asset_id='elite-player'").get().price_cents, 2345);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_matches WHERE round_id='elite-test-1'").get().count, 1);

  const opened = await call(env, "/market/open", {
    method: "POST", body: { roundNumber: 2 }, cookie, csrf
  });
  assert.equal(opened.response.status, 200);
  assert.equal(opened.payload.data.market.status, "open");
  assert.equal(opened.payload.data.market.lockDivision, "ascension");
  assert.equal(opened.payload.data.market.closesAt, "2026-08-01T18:35:00.000Z");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_rounds WHERE round_number=2 AND status='open'").get().count, 2);
  const duplicateOpen = await call(env, "/market/open", {
    method: "POST", body: { roundNumber: 2 }, cookie, csrf
  });
  assert.equal(duplicateOpen.response.status, 409);
  assert.equal(duplicateOpen.payload.error.code, "MARKET_ALREADY_OPEN");

  const closed = await call(env, "/market/close", {
    method: "POST", body: { reason: "Teste" }, cookie, csrf
  });
  assert.equal(closed.payload.data.market.status, "closed");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_rounds WHERE round_number=2 AND status='locked'").get().count, 2);

  const statsPreview = await call(env, "/stats/round-1/preview", {
    method: "POST", body: {}, cookie, csrf
  });
  assert.equal(statsPreview.response.status, 200);
  assert.equal(statsPreview.payload.data.summary.players, 2);
  assert.equal(statsPreview.payload.data.summary.teams, 2);

  const imported = await call(env, "/stats/round-1/import", {
    method: "POST",
    body: { sourceHash: statsPreview.payload.data.sourceHash },
    cookie,
    csrf
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.payload.data.pricesPreserved, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_asset_round_scores").get().count, 4);
  const corrected = await call(env, "/scores/correct", {
    method: "POST",
    body: {
      roundId: "elite-test-1",
      assetId: "elite-player",
      games: 2,
      points: 83.25,
      reason: "Teste de correção"
    },
    cookie,
    csrf
  });
  assert.equal(corrected.response.status, 200);
  assert.ok(corrected.payload.data.backupId);
  assert.equal(database.prepare(`
    SELECT points FROM fantasy_asset_round_scores
    WHERE round_id='elite-test-1' AND asset_id='elite-player'
  `).get().points, 83.25);
  const pricesAfterStats = database.prepare("SELECT GROUP_CONCAT(price_cents, ',') AS prices FROM fantasy_market ORDER BY division,asset_id").get().prices;

  const duplicate = await call(env, "/stats/round-1/import", {
    method: "POST",
    body: { sourceHash: statsPreview.payload.data.sourceHash },
    cookie,
    csrf
  });
  assert.equal(duplicate.payload.data.idempotent, true);
  assert.equal(database.prepare("SELECT GROUP_CONCAT(price_cents, ',') AS prices FROM fantasy_market ORDER BY division,asset_id").get().prices, pricesAfterStats);

  const simulated = await call(env, "/valuation/simulate", {
    method: "POST",
    body: { roundNumber: 1, division: "elite" },
    cookie,
    csrf
  });
  assert.equal(simulated.response.status, 200);
  assert.equal(simulated.payload.data.simulations.length, 1);
  const simulationId = simulated.payload.data.simulations[0].id;

  const valuationApplied = await call(env, "/valuation/apply", {
    method: "POST",
    body: { simulationId, confirmSimulationId: simulationId },
    cookie,
    csrf
  });
  assert.equal(valuationApplied.response.status, 200);
  assert.equal(valuationApplied.payload.data.status, "applied");
  assert.ok(valuationApplied.payload.data.backupId);
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM fantasy_backups").get().count >= 3);

  const formulaReset = await call(env, "/formula/reset", {
    method: "POST", body: {}, cookie, csrf
  });
  assert.equal(formulaReset.response.status, 200);
  assert.equal(formulaReset.payload.data.formula.version, "rk-value-v2");

  const beforeRestorePrice = database.prepare(`
    SELECT price_cents FROM fantasy_market
    WHERE division='elite' AND asset_id='elite-player'
  `).get().price_cents;
  const backup = await call(env, "/backups/create", {
    method: "POST", body: { reason: "Teste de restauração" }, cookie, csrf
  });
  const restoreId = backup.payload.data.backup.id;
  const editedPlayer = await call(env, "/players/elite-player", {
    method: "PUT",
    body: { price: 31.37 },
    cookie,
    csrf
  });
  assert.equal(editedPlayer.response.status, 200);
  assert.equal(database.prepare(`
    SELECT price_cents FROM fantasy_market
    WHERE division='elite' AND asset_id='elite-player'
  `).get().price_cents, 3137);
  const restorePreview = await call(env, "/backups/restore/preview", {
    method: "POST", body: { backupId: restoreId }, cookie, csrf
  });
  assert.equal(restorePreview.response.status, 200);
  const restored = await call(env, "/backups/restore/apply", {
    method: "POST",
    body: { backupId: restoreId, confirmBackupId: restoreId },
    cookie,
    csrf
  });
  assert.equal(restored.response.status, 200);
  assert.ok(restored.payload.data.safetyBackupId);
  assert.equal(restored.payload.data.market.status, "closed");
  assert.equal(database.prepare(`
    SELECT price_cents FROM fantasy_market
    WHERE division='elite' AND asset_id='elite-player'
  `).get().price_cents, beforeRestorePrice);
});

test("API administrativa rejeita CSRF inválido e limita senha errada", async () => {
  const database = createDatabase();
  const env = {
    DB: d1(database),
    ADMIN_USERNAME: "admin-rk",
    ADMIN_PASSWORD_HASH: await passwordHash("correta"),
    ADMIN_RATE_LIMIT_SALT: "test-only"
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await call(env, "/auth/login", {
      method: "POST",
      body: { username: "admin-rk", password: "errada" }
    });
    assert.equal(result.response.status, 401);
  }
  const blocked = await call(env, "/auth/login", {
    method: "POST",
    body: { username: "admin-rk", password: "correta" }
  });
  assert.equal(blocked.response.status, 429);
});

async function call(env, pathName, { method = "GET", body, cookie, csrf } = {}) {
  const headers = new Headers({ Origin: BASE_URL });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const request = new Request(`${BASE_URL}/api/fantasy/admin${pathName}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const response = await handleAdminRequest(request, env, crypto.randomUUID());
  return {
    response,
    payload: await response.clone().json()
  };
}

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  for (const file of [
    "0001_initial.sql",
    "0002_production_model.sql",
    "0003_github_pages_auth.sql",
    "0004_lineup_reserves.sql",
    "0005_admin_global_market.sql"
  ]) {
    database.exec(fs.readFileSync(path.join(ROOT, "migrations", file), "utf8"));
    database.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(file);
  }
  return database;
}

function d1(database) {
  class Statement {
    constructor(sql, bindings = []) {
      this.sql = sql;
      this.bindings = bindings;
    }
    bind(...bindings) {
      return new Statement(this.sql, bindings);
    }
    async first() {
      return database.prepare(this.sql).get(...this.bindings) || null;
    }
    async all() {
      return { results: database.prepare(this.sql).all(...this.bindings) };
    }
    async run() {
      const result = database.prepare(this.sql).run(...this.bindings);
      return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
    }
  }
  return {
    prepare(sql) {
      return new Statement(sql);
    },
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

function seedLegacyProductionState(database) {
  database.exec(`
    INSERT INTO fantasy_rounds(id,division,round_number,name,opens_at,locks_at,status)
      VALUES
        ('elite-test-1','elite',1,'Rodada 1','2026-07-20T00:00:00Z','2026-07-25T00:00:00Z','open'),
        ('ascension-test-1','ascension',1,'Rodada 1','2026-07-20T00:00:00Z','2026-07-25T00:00:00Z','open');
    INSERT INTO fantasy_market(
      division,asset_id,asset_type,role,display_name,team_slot,team_name,team_tag,
      price,previous_price,price_cents,previous_price_cents
    ) VALUES
      ('elite','elite-player','player','TOP','Elite Player','A1','Elite Team','ELI',23.45,23.45,2345,2345),
      ('elite','team:elite:A1','team','TEAM','Elite Team','A1','Elite Team','ELI',14.56,14.56,1456,1456),
      ('ascension','asc-player','player','TOP','Asc Player','A1','Asc Team','ASC',19.87,19.87,1987,1987),
      ('ascension','team:ascension:A1','team','TEAM','Asc Team','A1','Asc Team','ASC',11.23,11.23,1123,1123);
  `);
}

function sourceFixture() {
  const buildDivision = (division, date, playerId) => ({
    teams: [{
      id: `team:${division}:A1`,
      slot: "A1",
      name: `${division} Team`,
      tag: division.slice(0, 3).toUpperCase(),
      logo: "",
      players: [{
        id: playerId,
        name: `${division} Player`,
        role: "TOP",
        riotId: `${division}#RK`,
        opgg: ""
      }]
    }],
    rounds: [1, 2].map((roundNumber) => ({
      id: `${division}-r${roundNumber}`,
      roundNumber,
      name: `Rodada ${roundNumber}`,
      matches: [{
        id: `schedule:${division}:r${roundNumber}g1`,
        sourceId: `r${roundNumber}g1`,
        homeTeamSlot: "A1",
        awayTeamSlot: "A2",
        startsAt: roundNumber === 2 ? date : "2026-07-25T19:00:00.000Z",
        status: roundNumber === 1 ? "completed" : "scheduled"
      }]
    })),
    stats: {
      players: [{
        id: playerId,
        playerId,
        displayName: `${division} Player`,
        mainPosition: "TOP",
        roundRatings: [{
          round: 1,
          position: "TOP",
          teamSlot: "A1",
          averageScore: division === "elite" ? 82.5 : 78.25,
          games: 2,
          wins: 1,
          losses: 1,
          series: ["groups-r1g1"],
          matches: [`${division}-map-1`, `${division}-map-2`]
        }]
      }],
      teams: [{
        slot: "A1",
        name: `${division} Team`,
        games: 2,
        wins: 1,
        losses: 1,
        winRate: 50,
        averageScore: 75
      }],
      matches: [{
        id: `${division}-map-1`,
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
      elite: buildDivision("elite", "2026-08-02T19:00:00.000Z", "elite-player"),
      ascension: buildDivision("ascension", "2026-08-01T19:00:00.000Z", "asc-player")
    }
  };
}

async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  ));
  return `pbkdf2_sha256$${iterations}$${Buffer.from(salt).toString("base64")}$${Buffer.from(hash).toString("base64")}`;
}
