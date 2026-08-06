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

  const restricted = await call(env, "/api/fantasy/market/control/access", {
    method: "POST",
    token: controllerToken,
    body: { accessMode: "admin" }
  });
  assert.equal(restricted.response.status, 200);
  assert.equal(restricted.payload.data.market.status, "open");
  assert.equal(restricted.payload.data.market.accessMode, "admin");

  const controllerConfig = await call(env, "/api/fantasy/config?division=elite", {
    token: controllerToken
  });
  assert.equal(controllerConfig.payload.market.status, "open");
  assert.equal(controllerConfig.payload.round.status, "open");

  const otherAdminConfig = await call(env, "/api/fantasy/config?division=elite", {
    token: otherAdminToken
  });
  assert.equal(otherAdminConfig.payload.market.status, "closed");
  assert.equal(otherAdminConfig.payload.market.accessMode, "admin");
  assert.equal(otherAdminConfig.payload.round.status, "locked");

  const anonymousConfig = await call(env, "/api/fantasy/config?division=elite");
  assert.equal(anonymousConfig.payload.market.status, "closed");

  const forbiddenRestrictedWrite = await call(env, "/api/fantasy/lineups/current", {
    method: "PUT",
    token: otherAdminToken,
    body: { division: "elite" }
  });
  assert.equal(forbiddenRestrictedWrite.response.status, 403);
  assert.match(forbiddenRestrictedWrite.payload.error.message, /apenas para a administra/);

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

sqliteTest("destaques usam a rodada vinculada ao mercado mesmo com a próxima agendada", async () => {
  const database = createDatabase();
  seedPopularRound(database);
  const env = {
    DB: d1(database),
    SITE_URL: `${SITE_ORIGIN}/liga-rk-26-2/fantasy/`,
    ALLOWED_ORIGINS: SITE_ORIGIN
  };

  const result = await call(env, "/api/fantasy/popular?division=elite");

  assert.equal(result.response.status, 200);
  assert.equal(result.payload.round.round_number, 2);
  assert.deepEqual(
    result.payload.popular.map(({ role, name, picks }) => ({ role, name, picks })),
    [{ role: "TOP", name: "Mack", picks: 2 }]
  );
  assert.equal(result.payload.highlights.player.name, "Mack");
  assert.equal(result.payload.highlights.player.picks, 2);
  assert.equal(result.payload.highlights.captain.name, "Mack");
  assert.equal(result.payload.highlights.captain.picks, 2);
  assert.equal(result.payload.highlights.team.name, "CASHOUT & TRIMILIQUE LTDA");
  assert.equal(result.payload.highlights.team.picks, 2);
});

sqliteTest("callback do Discord retorna diretamente para a tela do mercado", async () => {
  const database = createDatabase();
  const env = {
    DB: d1(database),
    SITE_URL: `${SITE_ORIGIN}/liga-rk-26-2/fantasy/`,
    ALLOWED_ORIGINS: SITE_ORIGIN,
    DISCORD_CLIENT_ID: "fantasy-client",
    DISCORD_CLIENT_SECRET: "fantasy-secret",
    DISCORD_REDIRECT_URI: "https://fantasy-rk.example/api/fantasy/auth/callback"
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://discord.com/api/oauth2/token") {
      return Response.json({ access_token: "discord-access-token" });
    }
    if (url === "https://discord.com/api/users/@me") {
      return Response.json({ id: "login-user", username: "Jogador Login", avatar: null });
    }
    throw new Error(`Requisição externa inesperada: ${url}`);
  };

  try {
    const response = await fantasyWorker.fetch(new Request(
      "https://fantasy-rk.example/api/fantasy/auth/callback?code=discord-code&state=oauth-state",
      { headers: { Cookie: "fantasy_oauth_state=oauth-state" } }
    ), env);
    const target = new URL(response.headers.get("location"));

    assert.equal(response.status, 302);
    assert.equal(target.origin, SITE_ORIGIN);
    assert.equal(target.pathname, "/liga-rk-26-2/fantasy/");
    assert.equal(target.searchParams.get("view"), "market");
    assert.ok(new URLSearchParams(target.hash.slice(1)).get("loginCode"));
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_login_codes").get().count, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

sqliteTest("aviso da rodada 2 aparece uma vez somente para participante autenticado", async () => {
  const database = createDatabase();
  const controllerToken = "notice-controller-session";
  const otherAdminToken = "notice-other-session";
  await seed(database, controllerToken, otherAdminToken);
  database.exec(`
    INSERT INTO fantasy_teams(id, user_id, division, name)
    VALUES('notice-team', 'discord:${CONTROLLER_ID}', 'elite', 'Time do aviso');
    INSERT INTO fantasy_lineups(
      id, fantasy_team_id, round_id, captain_asset_id, total_cost
    ) VALUES(
      'notice-lineup', 'notice-team', 'elite-r2', 'notice-player', 80
    );
  `);
  const env = {
    DB: d1(database),
    SITE_URL: `${SITE_ORIGIN}/liga-rk-26-2/fantasy/`,
    ALLOWED_ORIGINS: SITE_ORIGIN
  };

  const anonymous = await call(env, "/api/fantasy/notices/round-2-postponement");
  assert.equal(anonymous.response.status, 401);

  const eligible = await call(env, "/api/fantasy/notices/round-2-postponement", {
    token: controllerToken
  });
  assert.equal(eligible.response.status, 200);
  assert.equal(eligible.payload.eligible, true);
  assert.equal(eligible.payload.acknowledged, false);
  assert.equal(eligible.payload.showPopup, true);
  assert.equal(eligible.payload.notice.title, "Aviso sobre a Rodada 2");

  const notEligible = await call(env, "/api/fantasy/notices/round-2-postponement", {
    token: otherAdminToken
  });
  assert.equal(notEligible.payload.eligible, false);
  assert.equal(notEligible.payload.showPopup, false);
  const forbiddenAck = await call(env, "/api/fantasy/notices/round-2-postponement/ack", {
    method: "POST",
    token: otherAdminToken
  });
  assert.equal(forbiddenAck.response.status, 403);

  const acknowledged = await call(env, "/api/fantasy/notices/round-2-postponement/ack", {
    method: "POST",
    token: controllerToken
  });
  assert.equal(acknowledged.response.status, 200);
  assert.equal(acknowledged.payload.acknowledged, true);

  const repeated = await call(env, "/api/fantasy/notices/round-2-postponement/ack", {
    method: "POST",
    token: controllerToken
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM fantasy_user_notices
    WHERE user_id = 'discord:${CONTROLLER_ID}'
  `).get().count, 1);

  const after = await call(env, "/api/fantasy/notices/round-2-postponement", {
    token: controllerToken
  });
  assert.equal(after.payload.eligible, true);
  assert.equal(after.payload.acknowledged, true);
  assert.equal(after.payload.showPopup, false);
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
    "0006_fantasy_formula_v2.sql",
    "0007_fantasy_dynamic_valuation.sql",
    "0008_fantasy_dynamic_patrimony.sql",
    "0009_fantasy_user_notices.sql",
    "0010_fantasy_shared_round_patrimony.sql",
    "0011_fantasy_division_patrimony.sql",
    "0012_fantasy_market_access_mode.sql",
    "0013_fantasy_round3_reserve_budget.sql"
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

function seedPopularRound(database) {
  database.exec(`
    INSERT INTO fantasy_users(id, discord_id, username)
    VALUES
      ('manager:one', 'popular-manager-1', 'Manager 1'),
      ('manager:two', 'popular-manager-2', 'Manager 2');

    INSERT INTO fantasy_rounds(id, division, round_number, name, opens_at, locks_at, status)
    VALUES
      ('elite-r2', 'elite', 2, 'Rodada 2', '2026-07-30T00:00:00.000Z', '2026-08-01T18:35:00.000Z', 'locked'),
      ('elite-r3', 'elite', 3, 'Rodada 3', '2026-08-05T00:00:00.000Z', '2026-08-08T18:35:00.000Z', 'scheduled');

    INSERT INTO fantasy_market(
      division, asset_id, asset_type, role, display_name, team_slot,
      team_name, team_tag, price, previous_price
    ) VALUES
      ('elite', 'elite:COT:TOP', 'player', 'TOP', 'Mack', 'A1',
       'CASHOUT & TRIMILIQUE LTDA', 'COT', 12, 12),
      ('elite', 'elite:COT:TEAM', 'team', 'TEAM', 'CASHOUT & TRIMILIQUE LTDA', 'A1',
       'CASHOUT & TRIMILIQUE LTDA', 'COT', 10, 10);

    INSERT INTO fantasy_teams(id, user_id, division, name)
    VALUES
      ('team:one', 'manager:one', 'elite', 'Time 1'),
      ('team:two', 'manager:two', 'elite', 'Time 2');

    INSERT INTO fantasy_lineups(id, fantasy_team_id, round_id, captain_asset_id, total_cost)
    VALUES
      ('lineup:one', 'team:one', 'elite-r2', 'elite:COT:TOP', 22),
      ('lineup:two', 'team:two', 'elite-r2', 'elite:COT:TOP', 22);

    INSERT INTO fantasy_lineup_picks(lineup_id, role, asset_id, price_paid, team_slot)
    VALUES
      ('lineup:one', 'TOP', 'elite:COT:TOP', 12, 'A1'),
      ('lineup:one', 'TEAM', 'elite:COT:TEAM', 10, 'A1'),
      ('lineup:two', 'TOP', 'elite:COT:TOP', 12, 'A1'),
      ('lineup:two', 'TEAM', 'elite:COT:TEAM', 10, 'A1');

    UPDATE fantasy_market_state
    SET status='closed', lock_round_number=2, version=1
    WHERE id='global';
  `);
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
