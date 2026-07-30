import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import fantasyWorker from "../fantasy-worker.js";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  // Node 20 valida o restante; a integração SQLite roda em Node 22+.
}
const sqliteTest = DatabaseSync ? test : test.skip;
const WORKER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://liga-rk.github.io";
const CONTROLLER_ID = "244286189144768523";
const OTHER_ADMIN_ID = "228178970850492417";

sqliteTest("controle do mercado aparece e funciona somente para Cress Albane", async () => {
  const database = createDatabase();
  const controllerToken = "controller-session";
  const otherAdminToken = "other-admin-session";
  await seed(database, controllerToken, otherAdminToken);
  const env = {
    DB: d1(database),
    SITE_URL: `${SITE_ORIGIN}/liga-rk-26-2/fantasy/`,
    ALLOWED_ORIGINS: SITE_ORIGIN,
    ADMIN_DISCORD_IDS: `${CONTROLLER_ID},${OTHER_ADMIN_ID}`,
    MARKET_CONTROL_DISCORD_IDS: CONTROLLER_ID
  };

  const controllerMe = await call(env, "/api/fantasy/me", {
    token: controllerToken
  });
  assert.equal(controllerMe.response.status, 200);
  assert.equal(controllerMe.payload.authenticated, true);
  assert.equal(controllerMe.payload.isAdmin, true);
  assert.equal(controllerMe.payload.canControlMarket, true);

  const otherAdminMe = await call(env, "/api/fantasy/me", {
    token: otherAdminToken
  });
  assert.equal(otherAdminMe.payload.isAdmin, true);
  assert.equal(otherAdminMe.payload.canControlMarket, false);

  const forbidden = await call(env, "/api/fantasy/market/control/open", {
    method: "POST",
    token: otherAdminToken,
    body: { roundNumber: 2 }
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(marketState(database).status, "closed");

  const untrustedOrigin = await call(env, "/api/fantasy/market/control/open", {
    method: "POST",
    token: controllerToken,
    origin: "https://example.invalid",
    body: { roundNumber: 2 }
  });
  assert.equal(untrustedOrigin.response.status, 403);
  assert.equal(marketState(database).status, "closed");

  const opened = await call(env, "/api/fantasy/market/control/open", {
    method: "POST",
    token: controllerToken,
    body: { roundNumber: 2 }
  });
  assert.equal(opened.response.status, 200);
  assert.equal(opened.response.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  assert.equal(opened.payload.data.market.status, "open");
  assert.equal(marketState(database).status, "open");
  assert.deepEqual(
    database.prepare("SELECT DISTINCT status FROM fantasy_rounds WHERE round_number=2").all().map((row) => row.status),
    ["open"]
  );

  const duplicateOpen = await call(env, "/api/fantasy/market/control/open", {
    method: "POST",
    token: controllerToken,
    body: { roundNumber: 2 }
  });
  assert.equal(duplicateOpen.response.status, 409);

  const closed = await call(env, "/api/fantasy/market/control/close", {
    method: "POST",
    token: controllerToken,
    body: { reason: "Teste do controle Discord" }
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.payload.data.market.status, "closed");
  assert.equal(marketState(database).status, "closed");
  assert.deepEqual(
    database.prepare("SELECT DISTINCT status FROM fantasy_rounds WHERE round_number=2").all().map((row) => row.status),
    ["locked"]
  );
  assert.ok(
    database.prepare(
      "SELECT COUNT(*) AS count FROM fantasy_audit_log WHERE actor_admin_username LIKE 'Cress Albane%' AND action LIKE 'market.%'"
    ).get().count >= 2
  );
});

async function call(env, pathname, {
  method = "GET",
  token = "",
  origin = SITE_ORIGIN,
  body
} = {}) {
  const headers = new Headers({ Origin: origin });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fantasyWorker.fetch(new Request(`https://fantasy-rk.example${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
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
    "0005_admin_global_market.sql",
    "0006_fantasy_formula_v2.sql"
  ]) {
    database.exec(fs.readFileSync(path.join(WORKER_ROOT, "migrations", file), "utf8"));
    database.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(file);
  }
  return database;
}

async function seed(database, controllerToken, otherAdminToken) {
  database.exec(`
    INSERT INTO fantasy_users(id, discord_id, username)
    VALUES
      ('discord:${CONTROLLER_ID}', '${CONTROLLER_ID}', 'Cress Albane'),
      ('discord:${OTHER_ADMIN_ID}', '${OTHER_ADMIN_ID}', 'Marí');

    INSERT INTO fantasy_rounds(id, division, round_number, name, opens_at, locks_at, status)
    VALUES
      ('elite-r2', 'elite', 2, 'Rodada 2', '2099-07-30T00:00:00.000Z', '2099-08-01T18:35:00.000Z', 'scheduled'),
      ('ascension-r2', 'ascension', 2, 'Rodada 2', '2099-07-30T00:00:00.000Z', '2099-08-01T18:35:00.000Z', 'scheduled');

    INSERT INTO fantasy_matches(
      id, source_id, division, round_id, round_number, home_team_name,
      away_team_name, starts_at, status, source_hash
    ) VALUES
      ('elite-match-r2', 'elite-source-r2', 'elite', 'elite-r2', 2, 'Elite A', 'Elite B', '2099-08-01T20:00:00.000Z', 'scheduled', 'fixture'),
      ('asc-match-r2', 'asc-source-r2', 'ascension', 'ascension-r2', 2, 'Asc A', 'Asc B', '2099-08-01T19:00:00.000Z', 'scheduled', 'fixture');

    UPDATE fantasy_market_state
    SET status='closed', lock_round_number=2, version=1
    WHERE id='global';
  `);
  database.prepare(
    "INSERT INTO fantasy_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)"
  ).run(await hash(controllerToken), `discord:${CONTROLLER_ID}`, "2099-12-31T23:59:59.000Z");
  database.prepare(
    "INSERT INTO fantasy_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)"
  ).run(await hash(otherAdminToken), `discord:${OTHER_ADMIN_ID}`, "2099-12-31T23:59:59.000Z");
}

function marketState(database) {
  return database.prepare("SELECT * FROM fantasy_market_state WHERE id='global'").get();
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
