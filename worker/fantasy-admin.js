import formulaV2 from "../src/fantasy/formula-v2.cjs";
import valuationV3 from "../src/fantasy/valuation-v3.cjs";
import patrimonyV2 from "../src/fantasy/patrimony-v2.cjs";
import draftPrediction from "../src/fantasy/draft-prediction.cjs";
import championCatalog from "../src/fantasy/champion-catalog.cjs";

const ADMIN_COOKIE = "fantasy_admin_session";
const ADMIN_SESSION_HOURS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_BLOCK_MS = 30 * 60 * 1000;
const LOCK_MINUTES = 25;
const BUDGET_LIMIT = 100;
const MAX_PLAYERS_PER_REAL_TEAM = 2;
const GLOBAL_MARKET_ID = "global";
const TIMEZONE = "America/Sao_Paulo";
const DIVISIONS = ["elite", "ascension"];
const PLAYER_ROLES = ["TOP", "JG", "MID", "ADC", "SUP"];
const ALL_ROLES = [...PLAYER_ROLES, "TEAM"];
const DEFAULT_SOURCE_URL =
  "https://liga-rk.github.io/liga-rk-26-2/assets/fantasy-source.json";
const OFFICIAL_MATCH_OVERRIDES = Object.freeze({
  "elite:2:r2g7": Object.freeze({
    status: "postponed",
    excludedFromScoring: true,
    reason: "FVL x SDK foi adiado após o fechamento do mercado da rodada 2."
  })
});
const DEFAULT_FORMULA_SETTINGS = valuationV3.DEFAULT_VALUATION_SETTINGS;
const {
  FORMULA_ID,
  processarRodadaFantasy,
  calcularPontuacaoEscalacao
} = formulaV2;
const {
  VALUATION_FORMULA_ID,
  VALUATION_FORMULA_VERSION,
  calculateFantasyValuation
} = valuationV3;
const {
  PATRIMONY_FORMULA_ID,
  calculateParticipantPatrimony
} = patrimonyV2;
const {
  DRAFT_PREDICTION_CONFIG,
  buildDraftPickRateSnapshot,
  calculateDraftPredictionResult,
  calculateFinalPlayerFantasyScore
} = draftPrediction;
const { CHAMPION_CATALOG } = championCatalog;
const BACKUP_TABLES = Object.freeze([
  "d1_migrations",
  "fantasy_users",
  "fantasy_sessions",
  "fantasy_login_codes",
  "fantasy_user_notices",
  "fantasy_rounds",
  "fantasy_market",
  "fantasy_market_state",
  "fantasy_official_teams",
  "fantasy_official_players",
  "fantasy_matches",
  "fantasy_sync_runs",
  "fantasy_teams",
  "fantasy_lineups",
  "fantasy_lineup_picks",
  "fantasy_lineup_reserves",
  "fantasy_draft_pick_rate_snapshots",
  "fantasy_lineup_draft_predictions",
  "fantasy_asset_round_scores",
  "fantasy_team_round_scores",
  "fantasy_round_matches",
  "fantasy_market_snapshots",
  "fantasy_wealth_snapshots",
  "fantasy_participant_patrimony",
  "fantasy_asset_map_scores",
  "fantasy_imports",
  "fantasy_round_processing",
  "fantasy_private_leagues",
  "fantasy_private_league_members",
  "fantasy_formula_settings",
  "fantasy_price_simulations",
  "fantasy_patrimony_history",
  "fantasy_price_history",
  "fantasy_valuation_rollbacks",
  "fantasy_audit_log",
  "fantasy_error_log"
]);
const RESTORE_TABLES = Object.freeze([
  "fantasy_users",
  "fantasy_rounds",
  "fantasy_market",
  "fantasy_market_state",
  "fantasy_official_teams",
  "fantasy_official_players",
  "fantasy_matches",
  "fantasy_sync_runs",
  "fantasy_teams",
  "fantasy_sessions",
  "fantasy_login_codes",
  "fantasy_user_notices",
  "fantasy_lineups",
  "fantasy_lineup_picks",
  "fantasy_lineup_reserves",
  "fantasy_draft_pick_rate_snapshots",
  "fantasy_lineup_draft_predictions",
  "fantasy_asset_round_scores",
  "fantasy_team_round_scores",
  "fantasy_round_matches",
  "fantasy_market_snapshots",
  "fantasy_wealth_snapshots",
  "fantasy_participant_patrimony",
  "fantasy_asset_map_scores",
  "fantasy_imports",
  "fantasy_round_processing",
  "fantasy_private_leagues",
  "fantasy_private_league_members",
  "fantasy_formula_settings",
  "fantasy_price_simulations",
  "fantasy_patrimony_history",
  "fantasy_price_history",
  "fantasy_valuation_rollbacks",
  "fantasy_audit_log",
  "fantasy_error_log"
]);

export async function handleAdminRequest(request, env, requestId) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/fantasy/admin/auth/login" && request.method === "POST") {
    return adminLogin(request, env, requestId);
  }
  if (path === "/api/fantasy/admin/auth/session" && request.method === "GET") {
    return adminSession(request, env);
  }
  if (path === "/api/fantasy/admin/auth/logout" && request.method === "POST") {
    return adminLogout(request, env, requestId);
  }

  const auth = await requireAdmin(request, env, request.method !== "GET");
  if (auth.response) return auth.response;

  const routes = [
    ["GET", "/api/fantasy/admin/overview", adminOverview],
    ["GET", "/api/fantasy/admin/market/status", adminMarketStatus],
    ["POST", "/api/fantasy/admin/market/open", adminOpenMarket],
    ["POST", "/api/fantasy/admin/market/schedule", adminScheduleMarket],
    ["POST", "/api/fantasy/admin/market/close", adminCloseMarket],
    ["GET", "/api/fantasy/admin/market/history", adminMarketHistory],
    ["POST", "/api/fantasy/admin/sync/preview", adminSyncPreview],
    ["POST", "/api/fantasy/admin/sync/apply", adminSyncApply],
    ["GET", "/api/fantasy/admin/sync/runs", adminSyncRuns],
    ["POST", "/api/fantasy/admin/stats/round-1/preview", adminRoundOnePreview],
    ["POST", "/api/fantasy/admin/stats/round-1/import", adminRoundOneImport],
    ["POST", "/api/fantasy/admin/stats/round/preview", adminRoundPreviewV2],
    ["POST", "/api/fantasy/admin/stats/round/process", adminRoundProcessV2],
    ["GET", "/api/fantasy/admin/scores", adminScores],
    ["POST", "/api/fantasy/admin/valuation/simulate", adminValuationSimulate],
    ["POST", "/api/fantasy/admin/valuation/apply", adminValuationApply],
    ["POST", "/api/fantasy/admin/valuation/review", adminValuationReview],
    ["POST", "/api/fantasy/admin/valuation/rollback", adminValuationRollback],
    ["POST", "/api/fantasy/admin/valuation/cancel", adminValuationCancel],
    ["GET", "/api/fantasy/admin/valuation/history", adminValuationHistory],
    ["GET", "/api/fantasy/admin/formula", adminGetFormula],
    ["PUT", "/api/fantasy/admin/formula", adminUpdateFormula],
    ["POST", "/api/fantasy/admin/formula/reset", adminResetFormula],
    ["GET", "/api/fantasy/admin/players", adminListPlayers],
    ["GET", "/api/fantasy/admin/teams", adminListTeams],
    ["GET", "/api/fantasy/admin/users", adminListUsers],
    ["GET", "/api/fantasy/admin/lineups", adminListLineups],
    ["GET", "/api/fantasy/admin/matches/all", adminListMatches],
    ["GET", "/api/fantasy/admin/rounds", adminListRounds],
    ["POST", "/api/fantasy/admin/rounds", adminUpsertRound],
    ["GET", "/api/fantasy/admin/audit", adminAuditLog],
    ["GET", "/api/fantasy/admin/errors", adminErrorLog],
    ["GET", "/api/fantasy/admin/backups", adminListBackups],
    ["POST", "/api/fantasy/admin/backups/create", adminCreateBackup],
    ["POST", "/api/fantasy/admin/backups/restore/preview", adminRestoreBackupPreview],
    ["POST", "/api/fantasy/admin/backups/restore/apply", adminRestoreBackupApply],
    ["POST", "/api/fantasy/admin/scores/correct", adminCorrectScore]
  ];
  for (const [method, route, handler] of routes) {
    if (request.method === method && path === route) {
      return handler(request, env, requestId, auth);
    }
  }

  if (request.method === "PUT" && path.startsWith("/api/fantasy/admin/players/")) {
    return adminUpdatePlayer(request, env, requestId, auth);
  }
  if (request.method === "PUT" && path.startsWith("/api/fantasy/admin/teams/")) {
    return adminUpdateTeam(request, env, requestId, auth);
  }
  if (request.method === "PUT" && path.startsWith("/api/fantasy/admin/users/")) {
    return adminUpdateUser(request, env, requestId, auth);
  }
  if (request.method === "PUT" && path.startsWith("/api/fantasy/admin/matches/")) {
    return adminUpdateMatch(request, env, requestId, auth);
  }
  if (request.method === "PUT" && path.startsWith("/api/fantasy/admin/lineups/")) {
    return adminUpdateLineup(request, env, requestId, auth);
  }
  if (request.method === "GET" && path.startsWith("/api/fantasy/admin/backups/")) {
    return adminDownloadBackup(request, env);
  }

  return failure("ADMIN_ROUTE_NOT_FOUND", "Rota administrativa não encontrada.", 404);
}

export async function serveAdminAsset(request, env, path) {
  if (!env.ASSETS) {
    return new Response("Painel administrativo indisponível: binding ASSETS ausente.", {
      status: 503,
      headers: securityHeaders("text/plain; charset=utf-8")
    });
  }
  const url = new URL(request.url);
  url.pathname = path === "/admin/" ? "/admin/index.html" : path;
  const response = await env.ASSETS.fetch(new Request(url, request));
  const headers = new Headers(response.headers);
  addSecurityHeaders(headers);
  headers.set("Cache-Control", path.endsWith(".html") ? "no-store" : "public, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}

export async function recordError(env, request, requestId, error, actor = null) {
  if (!env.DB) return;
  await env.DB.prepare(`
    INSERT INTO fantasy_error_log
      (id, request_id, route, method, actor, error_name, error_message, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    String(requestId || ""),
    new URL(request.url).pathname,
    request.method,
    actor,
    String(error?.name || "Error").slice(0, 120),
    String(error?.message || error || "Erro desconhecido").slice(0, 1500),
    JSON.stringify({ stack: String(error?.stack || "").slice(0, 5000) })
  ).run();
}

export async function getGlobalMarketState(env) {
  return env.DB.prepare(`
    SELECT id, status, access_mode, opened_at, closes_at, closed_at, opened_by, closed_by,
           close_reason, lock_match_id, lock_division, lock_round_number,
           version, updated_at
    FROM fantasy_market_state WHERE id = ?
  `).bind(GLOBAL_MARKET_ID).first();
}

export function publicMarketState(row) {
  if (!row) {
    return {
      id: GLOBAL_MARKET_ID,
      status: "closed",
      timezone: TIMEZONE,
      lockMinutes: LOCK_MINUTES,
      closeReason: "Estado do mercado indisponível."
    };
  }
  return {
    id: row.id,
    status: row.status,
    accessMode: row.access_mode || "public",
    openedAt: row.opened_at,
    closesAt: row.closes_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason,
    lockMatchId: row.lock_match_id,
    lockDivision: row.lock_division,
    roundNumber: row.lock_round_number,
    timezone: TIMEZONE,
    lockMinutes: LOCK_MINUTES,
    version: row.version,
    updatedAt: row.updated_at
  };
}

export async function ensureAutomaticMarketClose(env, now = new Date(), source = "request") {
  const state = await getGlobalMarketState(env);
  if (!state || state.status !== "open") return state;

  if (String(state.lock_match_id || "").startsWith("manual-schedule:")) {
    const rounds = await dbAll(env, `
      SELECT id, division, round_number, locks_at, status
      FROM fantasy_rounds
      WHERE round_number = ? AND division IN ('elite', 'ascension')
      ORDER BY division
    `, [state.lock_round_number]);
    const nowMs = now.getTime();
    const expired = rounds.filter((round) =>
      round.status === "open" && Number.isFinite(Date.parse(round.locks_at)) && nowMs >= Date.parse(round.locks_at)
    );
    if (expired.length) {
      await env.DB.batch(expired.map((round) => env.DB.prepare(`
        UPDATE fantasy_rounds SET status = 'locked'
        WHERE id = ? AND status = 'open'
      `).bind(round.id)));
      for (const round of expired) {
        await audit(env, {
          actor: "system",
          action: "market.close.division",
          targetType: "global_market",
          targetId: GLOBAL_MARKET_ID,
          after: { division: round.division, roundNumber: round.round_number, closesAt: round.locks_at, source }
        });
      }
    }
    const remaining = rounds.filter((round) =>
      round.status === "open" && !expired.some((expiredRound) => expiredRound.id === round.id) &&
      Number.isFinite(Date.parse(round.locks_at)) && nowMs < Date.parse(round.locks_at)
    );
    if (!remaining.length) {
      await closeMarketWithVersion(
        env,
        state.version,
        "system",
        "Fechamento automático: os prazos das duas divisões foram encerrados.",
        source,
        { preserveRoundLocks: true }
      );
    }
    return getGlobalMarketState(env);
  }

  const window = await resolveMarketWindow(env, state.lock_round_number);
  const nowMs = now.getTime();
  const mustClose = !window.canOpen || nowMs >= Date.parse(window.closesAt);
  if (mustClose) {
    const reason = window.canOpen
      ? `Fechamento automático: faltam ${LOCK_MINUTES} minutos para a primeira partida válida.`
      : `Fechamento automático de segurança: ${window.warnings.join(" ")}`;
    await closeMarketWithVersion(env, state.version, "system", reason, source);
    return getGlobalMarketState(env);
  }

  if (
    state.closes_at !== window.closesAt ||
    state.lock_match_id !== window.match.id ||
    state.lock_division !== window.match.division
  ) {
    await env.DB.prepare(`
      UPDATE fantasy_market_state
      SET closes_at = ?, lock_match_id = ?, lock_division = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'open' AND version = ?
    `).bind(
      window.closesAt,
      window.match.id,
      window.match.division,
      GLOBAL_MARKET_ID,
      state.version
    ).run();
  }
  return getGlobalMarketState(env);
}

async function adminLogin(request, env, requestId) {
  requireSameOrigin(request);
  requireEnv(env, ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH"]);
  const body = await readJson(request);
  const username = clean(body.username);
  const password = String(body.password || "");
  const ipHash = await adminIpHash(request, env);
  const now = new Date();
  const nowIso = now.toISOString();
  const attempt = await env.DB.prepare(`
    SELECT failed_count, first_failed_at, blocked_until
    FROM fantasy_admin_login_attempts WHERE ip_hash = ?
  `).bind(ipHash).first();

  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > now.getTime()) {
    await audit(env, {
      actor: username || "unknown",
      action: "admin.login.blocked",
      targetType: "admin_session",
      targetId: ipHash,
      result: "blocked",
      requestId
    });
    return failure(
      "LOGIN_RATE_LIMITED",
      "Muitas tentativas. Aguarde antes de tentar novamente.",
      429,
      { retryAt: attempt.blocked_until }
    );
  }

  const usernameOk = timingSafeEqual(username, String(env.ADMIN_USERNAME));
  const passwordOk = password.length <= 512 && await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!usernameOk || !passwordOk) {
    const firstAt = attempt?.first_failed_at && now.getTime() - Date.parse(attempt.first_failed_at) < LOGIN_WINDOW_MS
      ? attempt.first_failed_at
      : nowIso;
    const failedCount = firstAt === attempt?.first_failed_at ? Number(attempt?.failed_count || 0) + 1 : 1;
    const blockedUntil = failedCount >= LOGIN_MAX_FAILURES
      ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString()
      : null;
    await env.DB.prepare(`
      INSERT INTO fantasy_admin_login_attempts
        (ip_hash, failed_count, first_failed_at, last_failed_at, blocked_until, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ip_hash) DO UPDATE SET
        failed_count = excluded.failed_count,
        first_failed_at = excluded.first_failed_at,
        last_failed_at = excluded.last_failed_at,
        blocked_until = excluded.blocked_until,
        updated_at = CURRENT_TIMESTAMP
    `).bind(ipHash, failedCount, firstAt, nowIso, blockedUntil).run();
    await audit(env, {
      actor: username || "unknown",
      action: "admin.login.failed",
      targetType: "admin_session",
      targetId: ipHash,
      result: "failed",
      error: { failedCount, blockedUntil },
      requestId
    });
    return failure("INVALID_CREDENTIALS", "Usuário ou senha inválidos.", 401);
  }

  await env.DB.prepare("DELETE FROM fantasy_admin_login_attempts WHERE ip_hash = ?").bind(ipHash).run();
  await env.DB.prepare("DELETE FROM fantasy_admin_sessions WHERE expires_at <= ?").bind(nowIso).run();
  const token = randomToken(48);
  const csrf = randomToken(32);
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(`
    INSERT INTO fantasy_admin_sessions
      (token_hash, username, csrf_token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(await sha256(token), username, await sha256(csrf), expiresAt).run();
  await audit(env, {
    actor: username,
    action: "admin.login.success",
    targetType: "admin_session",
    targetId: await sha256(token),
    requestId
  });
  const response = success({ authenticated: true, username, csrfToken: csrf, expiresAt });
  response.headers.append("Set-Cookie", adminCookie(token, ADMIN_SESSION_HOURS * 3600));
  return response;
}

async function adminSession(request, env) {
  const auth = await requireAdmin(request, env, false);
  if (auth.response) return auth.response;
  const csrf = randomToken(32);
  await env.DB.prepare(`
    UPDATE fantasy_admin_sessions
    SET csrf_token_hash = ?, last_seen_at = CURRENT_TIMESTAMP
    WHERE token_hash = ?
  `).bind(await sha256(csrf), auth.tokenHash).run();
  return success({
    authenticated: true,
    username: auth.username,
    csrfToken: csrf,
    expiresAt: auth.expiresAt
  });
}

async function adminLogout(request, env, requestId) {
  requireSameOrigin(request);
  const auth = await requireAdmin(request, env, true);
  if (!auth.response) {
    await env.DB.prepare("DELETE FROM fantasy_admin_sessions WHERE token_hash = ?")
      .bind(auth.tokenHash)
      .run();
    await audit(env, {
      actor: auth.username,
      action: "admin.logout",
      targetType: "admin_session",
      targetId: auth.tokenHash,
      requestId
    });
  }
  const response = success({ authenticated: false });
  response.headers.append("Set-Cookie", adminCookie("", 0));
  return response;
}

async function requireAdmin(request, env, csrfRequired) {
  const token = parseCookies(request.headers.get("Cookie"))[ADMIN_COOKIE] || "";
  if (!token) return { response: failure("AUTH_REQUIRED", "Autenticação administrativa necessária.", 401) };
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT username, csrf_token_hash, expires_at
    FROM fantasy_admin_sessions
    WHERE token_hash = ? AND expires_at > ?
  `).bind(tokenHash, new Date().toISOString()).first();
  if (!row) {
    const response = failure("SESSION_EXPIRED", "Sessão administrativa expirada.", 401);
    response.headers.append("Set-Cookie", adminCookie("", 0));
    return { response };
  }
  if (csrfRequired) {
    requireSameOrigin(request);
    const csrf = request.headers.get("X-CSRF-Token") || "";
    if (!csrf || !timingSafeEqual(await sha256(csrf), row.csrf_token_hash)) {
      return { response: failure("CSRF_INVALID", "Token de segurança inválido.", 403) };
    }
  }
  await env.DB.prepare(`
    UPDATE fantasy_admin_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?
  `).bind(tokenHash).run();
  return {
    username: row.username,
    expiresAt: row.expires_at,
    tokenHash
  };
}

async function resolveMarketWindow(env, roundNumber) {
  const normalizedRound = Math.trunc(Number(roundNumber));
  const warnings = [];
  if (!Number.isInteger(normalizedRound) || normalizedRound < 1) {
    return { canOpen: false, warnings: ["Rodada global inválida."], matches: [] };
  }
  const rounds = await dbAll(env, `
    SELECT id, division, round_number, name
    FROM fantasy_rounds WHERE round_number = ?
  `, [normalizedRound]);
  for (const division of DIVISIONS) {
    if (!rounds.some((round) => round.division === division)) {
      warnings.push(`A rodada ${normalizedRound} não existe na divisão ${division}.`);
    }
  }
  const rows = await dbAll(env, `
    SELECT id, division, round_number, starts_at, status,
           home_team_name, away_team_name, schedule_issue
    FROM fantasy_matches
    WHERE round_number = ?
      AND status NOT IN ('cancelled', 'postponed')
    ORDER BY starts_at, division, id
  `, [normalizedRound]);
  const valid = rows.filter((row) => row.starts_at && Number.isFinite(Date.parse(row.starts_at)));
  for (const division of DIVISIONS) {
    if (!valid.some((match) => match.division === division)) {
      warnings.push(`Não há horário válido para a divisão ${division}.`);
    }
  }
  if (warnings.length) return { canOpen: false, warnings, matches: valid };
  valid.sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));
  const match = valid[0];
  return {
    canOpen: true,
    warnings,
    match,
    matches: valid,
    closesAt: new Date(Date.parse(match.starts_at) - LOCK_MINUTES * 60 * 1000).toISOString()
  };
}

async function ensureDraftSnapshotsForRound(env, roundNumber) {
  const targetRound = Math.trunc(Number(roundNumber));
  if (targetRound < DRAFT_PREDICTION_CONFIG.enabledFromRound) {
    return { enabled: false, roundNumber: targetRound, snapshots: [] };
  }
  const rounds = await dbAll(env, `
    SELECT id, division FROM fantasy_rounds
    WHERE round_number = ? AND division IN ('elite', 'ascension')
    ORDER BY division
  `, [targetRound]);
  if (rounds.length !== DIVISIONS.length) {
    throw new HttpError(409, `A Rodada ${targetRound} precisa existir nas duas divisões antes de gerar o Pick Rate.`);
  }
  const existing = await dbAll(env, `
    SELECT round_id AS roundId, division, generated_from_rounds_json AS generatedFromRoundsJson,
           generated_at AS generatedAt, source_hash AS sourceHash, totals_json AS totalsJson,
           unknown_champions_json AS unknownChampionsJson
    FROM fantasy_draft_pick_rate_snapshots
    WHERE round_id IN (${rounds.map(() => "?").join(",")})
    ORDER BY division
  `, rounds.map((round) => round.id));
  if (existing.length === rounds.length) {
    return {
      enabled: true,
      roundNumber: targetRound,
      frozen: true,
      snapshots: existing.map(decodeJsonFields)
    };
  }

  const source = await loadOfficialSource(env);
  const statements = [];
  const created = [];
  for (const round of rounds) {
    if (existing.some((row) => row.roundId === round.id)) continue;
    const snapshot = buildDraftPickRateSnapshot({
      source,
      division: round.division,
      roundNumber: targetRound,
      catalog: CHAMPION_CATALOG
    });
    const expectedRounds = Array.from({ length: targetRound - 1 }, (_, index) => index + 1);
    if (expectedRounds.some((number) => !snapshot.generatedFromRounds.includes(number))) {
      throw new HttpError(409, `A base oficial de ${round.division} não contém picks de todas as rodadas anteriores.`);
    }
    if (PLAYER_ROLES.some((role) => Number(snapshot.totals[role]) <= 0)) {
      throw new HttpError(409, `A base oficial de ${round.division} não contém picks suficientes por posição.`);
    }
    const sourceHash = await hashObject({
      division: round.division,
      roundNumber: targetRound,
      generatedFromRounds: snapshot.generatedFromRounds,
      totals: snapshot.totals,
      counts: snapshot.counts
    });
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_draft_pick_rate_snapshots
        (round_id, division, generated_from_rounds_json, generated_at, source_hash,
         totals_json, counts_json, position_pick_rates_json, unknown_champions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(round_id) DO NOTHING
    `).bind(
      round.id,
      round.division,
      JSON.stringify(snapshot.generatedFromRounds),
      snapshot.generatedAt,
      sourceHash,
      JSON.stringify(snapshot.totals),
      JSON.stringify(snapshot.counts),
      JSON.stringify(snapshot.positionPickRates),
      JSON.stringify(snapshot.unknownChampions)
    ));
    created.push({
      roundId: round.id,
      division: round.division,
      generatedFromRounds: snapshot.generatedFromRounds,
      generatedAt: snapshot.generatedAt,
      sourceHash,
      totals: snapshot.totals,
      unknownChampions: snapshot.unknownChampions
    });
  }
  if (statements.length) await env.DB.batch(statements);
  return {
    enabled: true,
    roundNumber: targetRound,
    frozen: true,
    snapshots: [
      ...existing.map(decodeJsonFields),
      ...created
    ].sort((left, right) => left.division.localeCompare(right.division))
  };
}

async function closeMarketWithVersion(env, version, actor, reason, source, options = {}) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE fantasy_market_state
    SET status = 'closed', closed_at = ?, closed_by = ?, close_reason = ?,
        version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'open' AND version = ?
  `).bind(now, actor, reason, GLOBAL_MARKET_ID, version).run();
  if (Number(result?.meta?.changes || 0) > 0) {
    await env.DB.prepare(`
      UPDATE fantasy_rounds
      SET status = 'locked', locks_at = CASE WHEN ? = 1 THEN locks_at ELSE ? END
      WHERE round_number = ? AND division IN ('elite', 'ascension')
    `).bind(
      options.preserveRoundLocks ? 1 : 0,
      now,
      (await getGlobalMarketState(env))?.lock_round_number
    ).run();
    await audit(env, {
      actor,
      action: "market.close",
      targetType: "global_market",
      targetId: GLOBAL_MARKET_ID,
      after: { reason, source, closedAt: now }
    });
  }
}

async function adminOpenMarket(request, env, requestId, auth) {
  const body = await readJson(request);
  const roundNumber = Math.trunc(Number(body.roundNumber));
  const accessMode = clean(body.accessMode) === "admin" ? "admin" : "public";
  const before = await getGlobalMarketState(env);
  if (before?.status === "open") {
    return failure(
      "MARKET_ALREADY_OPEN",
      "O mercado global já está aberto. Feche-o antes de iniciar uma nova janela.",
      409,
      { market: publicMarketState(before) }
    );
  }
  const window = await resolveMarketWindow(env, roundNumber);
  if (!window.canOpen) {
    return failure("SCHEDULE_INCOMPLETE", "O mercado não pode abrir sem horários válidos nas duas divisões.", 409, {
      warnings: window.warnings
    });
  }
  if (Date.now() >= Date.parse(window.closesAt)) {
    return failure(
      "LOCK_WINDOW_REACHED",
      `A janela de fechamento (${LOCK_MINUTES} minutos antes) já foi atingida.`,
      409,
      { closesAt: window.closesAt, match: window.match }
    );
  }
  const draft = await ensureDraftSnapshotsForRound(env, roundNumber);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE fantasy_market_state
      SET status = 'open', access_mode = ?, opened_at = ?, closes_at = ?, closed_at = NULL,
          opened_by = ?, closed_by = NULL, close_reason = NULL,
          lock_match_id = ?, lock_division = ?, lock_round_number = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      accessMode,
      new Date().toISOString(),
      window.closesAt,
      auth.username,
      window.match.id,
      window.match.division,
      roundNumber,
      GLOBAL_MARKET_ID
    ),
    ...DIVISIONS.map((division) => env.DB.prepare(`
      UPDATE fantasy_rounds
      SET status = 'open', opens_at = ?, locks_at = ?
      WHERE division = ? AND round_number = ?
    `).bind(new Date().toISOString(), window.closesAt, division, roundNumber))
  ]);
  const after = await getGlobalMarketState(env);
  await audit(env, {
    actor: auth.username,
    action: "market.open",
    targetType: "global_market",
    targetId: GLOBAL_MARKET_ID,
    before,
    after,
    requestId
  });
  return success({ market: publicMarketState(after), schedule: window, draft });
}

async function adminCloseMarket(request, env, requestId, auth) {
  const body = await readJson(request);
  const state = await getGlobalMarketState(env);
  if (!state || state.status === "closed") {
    return success({ market: publicMarketState(state), alreadyClosed: true });
  }
  const reason = clean(body.reason) || "Fechamento manual pelo administrador.";
  await closeMarketWithVersion(env, state.version, auth.username, reason, "admin");
  const after = await getGlobalMarketState(env);
  await audit(env, {
    actor: auth.username,
    action: "market.close.manual",
    targetType: "global_market",
    targetId: GLOBAL_MARKET_ID,
    before: state,
    after,
    requestId
  });
  return success({ market: publicMarketState(after) });
}

async function adminScheduleMarket(request, env, requestId, auth) {
  const body = await readJson(request);
  const state = await getGlobalMarketState(env);
  const roundNumber = Math.trunc(Number(body.roundNumber || state?.lock_round_number));
  const requested = body.divisionClosesAt && typeof body.divisionClosesAt === "object"
    ? body.divisionClosesAt
    : {};
  if (!state || state.status !== "open") {
    return failure("MARKET_NOT_OPEN", "Abra o mercado antes de definir os horários por divisão.", 409);
  }
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber !== Number(state.lock_round_number)) {
    return failure("ROUND_MISMATCH", "A rodada informada não corresponde à rodada aberta.", 409);
  }
  const schedules = {};
  for (const division of DIVISIONS) {
    const timestamp = Date.parse(requested[division]);
    if (!requested[division] || !Number.isFinite(timestamp)) {
      return failure("INVALID_DIVISION_SCHEDULE", `Informe um horário válido para ${division}.`, 400);
    }
    schedules[division] = new Date(timestamp).toISOString();
  }
  const rounds = await dbAll(env, `
    SELECT id, division FROM fantasy_rounds
    WHERE round_number = ? AND division IN ('elite', 'ascension')
  `, [roundNumber]);
  if (rounds.length !== DIVISIONS.length) {
    return failure("ROUND_INCOMPLETE", "A rodada precisa existir nas duas divisões.", 409);
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const latestClose = new Date(Math.max(...DIVISIONS.map((division) => Date.parse(schedules[division])))).toISOString();
  await env.DB.batch([
    ...DIVISIONS.map((division) => env.DB.prepare(`
      UPDATE fantasy_rounds
      SET locks_at = ?, status = CASE WHEN ? <= ? THEN 'locked' ELSE 'open' END
      WHERE division = ? AND round_number = ?
    `).bind(schedules[division], schedules[division], nowIso, division, roundNumber)),
    env.DB.prepare(`
      UPDATE fantasy_market_state
      SET closes_at = ?, lock_match_id = ?, lock_division = NULL,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'open'
    `).bind(latestClose, `manual-schedule:r${roundNumber}`, GLOBAL_MARKET_ID)
  ]);
  const after = await getGlobalMarketState(env);
  await audit(env, {
    actor: auth.username,
    action: "market.schedule.divisions",
    targetType: "global_market",
    targetId: GLOBAL_MARKET_ID,
    before: state,
    after,
    metadata: { roundNumber, divisionClosesAt: schedules },
    requestId
  });
  await ensureAutomaticMarketClose(env, now, "admin-schedule");
  return success({
    market: publicMarketState(await getGlobalMarketState(env)),
    divisionClosesAt: schedules
  });
}

export async function openMarketFromDiscordAdmin(request, env, requestId, username) {
  return adminOpenMarket(request, env, requestId, { username });
}

export async function closeMarketFromDiscordAdmin(request, env, requestId, username) {
  return adminCloseMarket(request, env, requestId, { username });
}

export async function scheduleMarketFromDiscordAdmin(request, env, requestId, username) {
  return adminScheduleMarket(request, env, requestId, { username });
}

export async function setMarketAccessFromDiscordAdmin(request, env, requestId, username) {
  const body = await readJson(request);
  const accessMode = clean(body.accessMode) === "admin" ? "admin" : "public";
  const before = await getGlobalMarketState(env);
  if (!before || before.status !== "open") {
    return failure("MARKET_NOT_OPEN", "Abra o mercado antes de alterar o acesso.", 409);
  }
  await env.DB.prepare(`
    UPDATE fantasy_market_state
    SET access_mode = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'open'
  `).bind(accessMode, GLOBAL_MARKET_ID).run();
  const after = await getGlobalMarketState(env);
  await audit(env, {
    actor: username,
    action: "market.access",
    targetType: "global_market",
    targetId: GLOBAL_MARKET_ID,
    before,
    after,
    metadata: { accessMode },
    requestId
  });
  return success({ market: publicMarketState(after) });
}

async function adminMarketStatus(_request, env) {
  await ensureAutomaticMarketClose(env);
  const state = await getGlobalMarketState(env);
  const schedule = await resolveMarketWindow(env, state?.lock_round_number);
  const divisionSchedules = await dbAll(env, `
    SELECT division, locks_at AS closesAt, status
    FROM fantasy_rounds
    WHERE round_number = ? AND division IN ('elite', 'ascension')
    ORDER BY division
  `, [state?.lock_round_number]);
  return success({ market: publicMarketState(state), schedule, divisionSchedules });
}

async function adminMarketHistory(request, env) {
  const limit = queryLimit(request, 100);
  const rows = await dbAll(env, `
    SELECT id, actor_admin_username AS actor, action, target_id AS targetId,
           before_json AS beforeJson, after_json AS afterJson,
           result, error_json AS errorJson, created_at AS createdAt
    FROM fantasy_audit_log
    WHERE target_type = 'global_market'
    ORDER BY created_at DESC LIMIT ?
  `, [limit]);
  return success({ history: rows.map(decodeJsonFields) });
}

async function adminSyncPreview(request, env, requestId, auth) {
  const body = await readJson(request);
  const source = await loadOfficialSource(env, body.sourceUrl);
  const snapshot = await normalizeOfficialSource(source);
  const changes = await compareOfficialSource(env, snapshot);
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO fantasy_sync_runs
      (id, source, mode, source_hash, status, summary_json, changes_json, errors_json, created_by)
    VALUES (?, ?, 'preview', ?, 'previewed', ?, ?, ?, ?)
  `).bind(
    id,
    snapshot.sourceUrl,
    snapshot.hash,
    JSON.stringify(changes.summary),
    JSON.stringify(changes.items),
    JSON.stringify(snapshot.warnings),
    auth.username
  ).run();
  await audit(env, {
    actor: auth.username,
    action: "sync.preview",
    targetType: "sync_run",
    targetId: id,
    after: { sourceHash: snapshot.hash, summary: changes.summary, warnings: snapshot.warnings },
    requestId
  });
  return success({
    previewId: id,
    sourceHash: snapshot.hash,
    generatedAt: snapshot.generatedAt,
    summary: changes.summary,
    changes: changes.items,
    warnings: snapshot.warnings
  });
}

async function adminSyncApply(request, env, requestId, auth) {
  const body = await readJson(request);
  const previewId = clean(body.previewId);
  if (!previewId) return failure("PREVIEW_REQUIRED", "Gere e confirme uma prévia antes de aplicar.", 400);
  const preview = await env.DB.prepare(`
    SELECT id, source, source_hash, status
    FROM fantasy_sync_runs WHERE id = ? AND mode = 'preview'
  `).bind(previewId).first();
  if (!preview || preview.status !== "previewed") {
    return failure("PREVIEW_NOT_FOUND", "Prévia inexistente ou já utilizada.", 404);
  }
  const source = await loadOfficialSource(env, preview.source);
  const snapshot = await normalizeOfficialSource(source);
  if (!timingSafeEqual(snapshot.hash, preview.source_hash)) {
    return failure(
      "SOURCE_CHANGED",
      "A fonte mudou desde a prévia. Gere uma nova prévia antes de aplicar.",
      409,
      { previousHash: preview.source_hash, currentHash: snapshot.hash }
    );
  }

  const beforeMarket = await marketPriceState(env);
  const existingTeamNames = new Map(
    (await dbAll(env, "SELECT id, division, name FROM fantasy_official_teams"))
      .map((team) => [`${team.division}:${team.id}`, clean(team.name)])
  );
  const statements = [
    env.DB.prepare("UPDATE fantasy_official_teams SET active = 0"),
    env.DB.prepare("UPDATE fantasy_official_players SET active = 0"),
    env.DB.prepare("UPDATE fantasy_market SET active = 0 WHERE manual_override = 0")
  ];

  for (const team of snapshot.teams) {
    const previousTeamName = existingTeamNames.get(`${team.division}:${team.id}`) || "";
    const teamIdentityChanged = Boolean(
      previousTeamName &&
      normalizeEntityName(previousTeamName) !== normalizeEntityName(team.name)
    );
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_official_teams
        (id, division, slot, name, tag, logo, active, source_hash, source_payload_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        division = excluded.division, slot = excluded.slot, name = excluded.name,
        tag = excluded.tag, logo = excluded.logo, active = 1,
        source_hash = excluded.source_hash,
        source_payload_json = excluded.source_payload_json,
        synced_at = CURRENT_TIMESTAMP
    `).bind(
      team.id,
      team.division,
      team.slot,
      team.name,
      team.tag,
      team.logo,
      team.sourceHash,
      JSON.stringify(team.payload)
    ));
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_market
        (division, asset_id, asset_type, role, display_name, team_slot,
         team_name, team_tag, logo, price, previous_price, average_points,
         active, updated_at, price_cents, previous_price_cents,
         official_status, is_starter, source_hash, manual_override)
      VALUES (?, ?, 'team', 'TEAM', ?, ?, ?, ?, ?, ?, ?, 0, 1,
              CURRENT_TIMESTAMP, ?, ?, 'active', 1, ?, 0)
      ON CONFLICT(division, asset_id) DO UPDATE SET
        display_name = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.display_name ELSE excluded.display_name END,
        team_slot = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.team_slot ELSE excluded.team_slot END,
        team_name = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.team_name ELSE excluded.team_name END,
        team_tag = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.team_tag ELSE excluded.team_tag END,
        logo = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.logo ELSE excluded.logo END,
        average_points = CASE
          WHEN fantasy_market.manual_override = 0 AND fantasy_market.display_name <> excluded.display_name THEN 0
          ELSE fantasy_market.average_points
        END,
        active = 1, official_status = 'active', is_starter = 1,
        source_hash = excluded.source_hash, updated_at = CURRENT_TIMESTAMP
    `).bind(
      team.division,
      team.id,
      team.name,
      team.slot,
      team.name,
      team.tag,
      team.logo,
      initialPrice(team.id, "TEAM"),
      initialPrice(team.id, "TEAM"),
      Math.round(initialPrice(team.id, "TEAM") * 100),
      Math.round(initialPrice(team.id, "TEAM") * 100),
      team.sourceHash
    ));
    if (teamIdentityChanged) {
      statements.push(env.DB.prepare(`
        DELETE FROM fantasy_asset_round_scores
        WHERE division = ? AND asset_id = ?
      `).bind(team.division, team.id));
    }
  }

  for (const player of snapshot.players) {
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_official_players
        (id, division, team_id, team_slot, display_name, role, riot_id, opgg,
         roster_status, active, source_hash, source_payload_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        division = excluded.division, team_id = excluded.team_id,
        team_slot = excluded.team_slot, display_name = excluded.display_name,
        role = excluded.role, riot_id = excluded.riot_id, opgg = excluded.opgg,
        roster_status = excluded.roster_status, active = 1,
        source_hash = excluded.source_hash,
        source_payload_json = excluded.source_payload_json,
        synced_at = CURRENT_TIMESTAMP
    `).bind(
      player.id,
      player.division,
      player.teamId,
      player.teamSlot,
      player.name,
      player.role,
      player.riotId,
      player.opgg,
      player.rosterStatus,
      player.sourceHash,
      JSON.stringify(player.payload)
    ));
    if (player.isStarter) {
      const price = initialPrice(player.id, player.role);
      statements.push(env.DB.prepare(`
        INSERT INTO fantasy_market
          (division, asset_id, asset_type, role, display_name, team_slot,
           team_name, team_tag, logo, price, previous_price, average_points,
           active, updated_at, price_cents, previous_price_cents,
           official_status, is_starter, source_hash, manual_override)
        VALUES (?, ?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, 0, 1,
                CURRENT_TIMESTAMP, ?, ?, 'active', 1, ?, 0)
        ON CONFLICT(division, asset_id) DO UPDATE SET
          role = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.role ELSE excluded.role END,
          display_name = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.display_name ELSE excluded.display_name END,
          team_slot = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.team_slot ELSE excluded.team_slot END,
          team_name = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.team_name ELSE excluded.team_name END,
          team_tag = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.team_tag ELSE excluded.team_tag END,
          logo = CASE WHEN fantasy_market.manual_override = 1 THEN fantasy_market.logo ELSE excluded.logo END,
          active = 1, official_status = 'active', is_starter = 1,
          source_hash = excluded.source_hash, updated_at = CURRENT_TIMESTAMP
      `).bind(
        player.division,
        player.id,
        player.role,
        player.name,
        player.teamSlot,
        player.teamName,
        player.teamTag,
        player.logo,
        price,
        price,
        Math.round(price * 100),
        Math.round(price * 100),
        player.sourceHash
      ));
    }
  }

  const existingRoundRows = await dbAll(env, `
    SELECT id, division, round_number AS roundNumber FROM fantasy_rounds
  `);
  const existingRoundIds = new Map(
    existingRoundRows.map((row) => [`${row.division}:${row.roundNumber}`, row.id])
  );
  for (const round of snapshot.rounds) {
    const roundDbId = existingRoundIds.get(`${round.division}:${round.roundNumber}`) || round.id;
    const validStarts = round.matches
      .map((match) => match.startsAt)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort();
    const firstStarts = validStarts[0] || new Date(Date.now() + 86400000).toISOString();
    const opensAt = new Date(Date.parse(firstStarts) - 7 * 86400000).toISOString();
    const locksAt = new Date(Date.parse(firstStarts) - LOCK_MINUTES * 60000).toISOString();
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_rounds
        (id, division, round_number, name, opens_at, locks_at, status, source_hash, eligibility_json)
      VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
      ON CONFLICT(division, round_number) DO UPDATE SET
        name = excluded.name, source_hash = excluded.source_hash,
        eligibility_json = excluded.eligibility_json
    `).bind(
      roundDbId,
      round.division,
      round.roundNumber,
      round.name,
      opensAt,
      locksAt,
      round.sourceHash,
      JSON.stringify(round.eligibility)
    ));
    for (const match of round.matches) {
      statements.push(env.DB.prepare(`
        INSERT INTO fantasy_matches
          (id, source_id, division, round_id, round_number, stage, order_index,
           home_team_id, away_team_id, home_team_slot, away_team_slot,
           home_team_name, away_team_name, starts_at, timezone, status,
           home_score, away_score, winner_team_id, schedule_issue,
           source_hash, source_payload_json, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          round_id = excluded.round_id, round_number = excluded.round_number,
          stage = excluded.stage, order_index = excluded.order_index,
          home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
          home_team_slot = excluded.home_team_slot, away_team_slot = excluded.away_team_slot,
          home_team_name = excluded.home_team_name, away_team_name = excluded.away_team_name,
          starts_at = CASE WHEN fantasy_matches.manual_override_json IS NULL THEN excluded.starts_at ELSE fantasy_matches.starts_at END,
          status = CASE WHEN fantasy_matches.manual_override_json IS NULL THEN excluded.status ELSE fantasy_matches.status END,
          home_score = excluded.home_score, away_score = excluded.away_score,
          winner_team_id = excluded.winner_team_id,
          schedule_issue = excluded.schedule_issue,
          source_hash = excluded.source_hash,
          source_payload_json = excluded.source_payload_json,
          synced_at = CURRENT_TIMESTAMP
      `).bind(
        match.id,
        match.sourceId,
        match.division,
        roundDbId,
        round.roundNumber,
        match.stage,
        match.orderIndex,
        match.homeTeamId,
        match.awayTeamId,
        match.homeTeamSlot,
        match.awayTeamSlot,
        match.homeTeamName,
        match.awayTeamName,
        match.startsAt,
        TIMEZONE,
        match.status,
        match.homeScore,
        match.awayScore,
        match.winnerTeamId,
        match.scheduleIssue,
        match.sourceHash,
        JSON.stringify(match.payload)
      ));
    }
  }

  const syncBackupId = await createBackupRecord(
    env,
    auth.username,
    `Antes da sincronização em massa ${previewId}`
  );
  await env.DB.batch(statements);
  const afterMarket = await marketPriceState(env);
  const changedPrices = changedExistingPrices(beforeMarket, afterMarket);
  if (changedPrices.length) {
    throw new Error("A sincronização alterou preços, o que é proibido.");
  }
  const beforeMarketHash = await hashObject(beforeMarket);
  const afterMarketHash = await hashObject(afterMarket);
  const changes = await compareOfficialSource(env, snapshot);
  const applyId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO fantasy_sync_runs
        (id, source, mode, source_hash, status, summary_json, changes_json,
         errors_json, created_by, applied_at)
      VALUES (?, ?, 'apply', ?, 'applied', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      applyId,
      snapshot.sourceUrl,
      snapshot.hash,
      JSON.stringify(changes.summary),
      JSON.stringify(changes.items),
      JSON.stringify(snapshot.warnings),
      auth.username
    ),
    env.DB.prepare(`
      UPDATE fantasy_sync_runs SET status = 'applied', applied_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(previewId)
  ]);
  await ensureAutomaticMarketClose(env, new Date(), "sync");
  await audit(env, {
    actor: auth.username,
    action: "sync.apply",
    targetType: "sync_run",
    targetId: applyId,
    before: { previewId, backupId: syncBackupId, priceFingerprint: beforeMarketHash },
    after: {
      sourceHash: snapshot.hash,
      counts: {
        teams: snapshot.teams.length,
        players: snapshot.players.length,
        matches: snapshot.rounds.reduce((sum, round) => sum + round.matches.length, 0)
      },
      priceFingerprint: afterMarketHash
    },
    requestId
  });
  return success({
    syncRunId: applyId,
    backupId: syncBackupId,
    sourceHash: snapshot.hash,
    applied: {
      teams: snapshot.teams.length,
      players: snapshot.players.length,
      rounds: snapshot.rounds.length,
      matches: snapshot.rounds.reduce((sum, round) => sum + round.matches.length, 0)
    },
    pricesPreserved: changedPrices.length === 0,
    warnings: snapshot.warnings
  });
}

async function adminSyncRuns(request, env) {
  const rows = await dbAll(env, `
    SELECT id, source, mode, source_hash AS sourceHash, status,
           summary_json AS summaryJson, changes_json AS changesJson,
           errors_json AS errorsJson, created_by AS createdBy,
           created_at AS createdAt, applied_at AS appliedAt
    FROM fantasy_sync_runs ORDER BY created_at DESC LIMIT ?
  `, [queryLimit(request, 100)]);
  return success({ runs: rows.map(decodeJsonFields) });
}

async function loadOfficialSource(env, requestedUrl) {
  const sourceUrl = clean(requestedUrl) || clean(env.FANTASY_SOURCE_URL) || DEFAULT_SOURCE_URL;
  const configuredSourceUrl = clean(env.FANTASY_SOURCE_URL) || DEFAULT_SOURCE_URL;
  let parsed;
  if (
    env.FANTASY_SOURCE_JSON &&
    (!requestedUrl || sourceUrl === clean(env.FANTASY_SOURCE_URL))
  ) {
    parsed = JSON.parse(env.FANTASY_SOURCE_JSON);
  } else {
    const response = await fetch(sourceUrl, {
      headers: { Accept: "application/json", "User-Agent": "Fantasy-RK-Sync/2" }
    });
    if (!response.ok) {
      throw new HttpError(502, `A fonte oficial respondeu HTTP ${response.status}.`);
    }
    parsed = await response.json();
  }
  if (!parsed || typeof parsed !== "object" || !parsed.divisions) {
    throw new HttpError(422, "Formato da fonte oficial inválido.");
  }
  const contentApiUrl = clean(env.CONTENT_API_URL);
  if (contentApiUrl && (!requestedUrl || sourceUrl === configuredSourceUrl)) {
    const response = await fetch(`${contentApiUrl}${contentApiUrl.includes("?") ? "&" : "?"}v=${Date.now()}`, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store",
        "User-Agent": "Fantasy-RK-Sync/3"
      }
    });
    if (!response.ok) {
      throw new HttpError(502, `O elenco oficial ao vivo respondeu HTTP ${response.status}.`);
    }
    const payload = await response.json();
    const liveContent = payload?.content?.divisions ? payload.content : payload;
    if (!liveContent?.divisions) {
      throw new HttpError(422, "Formato do elenco oficial ao vivo inválido.");
    }
    parsed = mergeLiveOfficialContent(parsed, liveContent, payload?.updatedAt);
  }
  Object.defineProperty(parsed, "__sourceUrl", { value: sourceUrl, enumerable: false });
  return parsed;
}

function mergeLiveOfficialContent(source, liveContent, updatedAt = null) {
  const merged = {
    ...source,
    contentUpdatedAt: isoDate(updatedAt) || clean(updatedAt) || null,
    divisions: { ...source.divisions }
  };
  for (const division of DIVISIONS) {
    const sourceDivision = source.divisions?.[division] || {};
    const liveDivision = liveContent.divisions?.[division];
    if (!liveDivision) {
      merged.divisions[division] = sourceDivision;
      continue;
    }
    const liveTeams = liveDivision.teams || {};
    const teams = Object.entries(liveTeams).map(([rawSlot, rawTeam]) => {
      const slot = clean(rawSlot).toUpperCase();
      return {
        id: `team:${division}:${slot}`,
        slot,
        name: clean(rawTeam?.name),
        tag: clean(rawTeam?.tag) || clean(rawTeam?.name).slice(0, 5).toUpperCase(),
        logo: normalizeAssetPath(rawTeam?.logo),
        players: arrayValues(rawTeam?.players)
          .filter((player) => clean(player?.playerId || player?.id))
          .map((player) => ({
            id: clean(player.playerId || player.id),
            playerId: clean(player.playerId || player.id),
            name: clean(player.player || player.name),
            role: clean(player.lane || player.role).toUpperCase(),
            riotId: clean(player.riotId),
            riotIdAliases: arrayValues(player.riotIdAliases).map(clean).filter(Boolean),
            opgg: clean(player.opgg),
            captain: Boolean(player.captain)
        }))
      };
    });
    const effectiveTeams = teams.length ? teams : arrayValues(sourceDivision.teams);
    const namesBySlot = new Map(effectiveTeams.map((team) => [clean(team.slot).toUpperCase(), team.name]));
    const statSeriesIds = new Set(arrayValues(sourceDivision.stats?.matches)
      .map((match) => clean(match.seriesId))
      .filter(Boolean));
    const liveResults = liveDivision.results || {};
    const livePlayoffResults = liveDivision.playoffResults || {};
    const playoffStandings = officialGroupStandings(sourceDivision, effectiveTeams, liveResults);
    const rounds = arrayValues(sourceDivision.rounds).map((round) => {
      const roundNumber = Math.trunc(Number(round.roundNumber || round.number));
      const playoffRound = roundNumber === 4;
      const eligibility = playoffRound
        ? playoffEligibility(playoffStandings)
        : (round.eligibility || {});
      return {
      ...round,
      eligibility,
      matches: arrayValues(round.matches).map((match) => {
        const sourceId = clean(match.sourceId || match.id);
        const stage = clean(match.stage) || "groups";
        const statsSeriesId = clean(match.statsSeriesId) || `${stage}-${sourceId}`;
        const liveResult = playoffRound ? livePlayoffResults[sourceId] : liveResults[sourceId];
        const homeSlot = playoffRound
          ? resolvePlayoffSeed(playoffStandings, match.homeTeamSeed) || clean(match.homeTeamSlot || match.homeSlot).toUpperCase()
          : clean(match.homeTeamSlot || match.homeSlot).toUpperCase();
        const awaySlot = playoffRound
          ? resolvePlayoffSeed(playoffStandings, match.awayTeamSeed) || clean(match.awayTeamSlot || match.awaySlot).toUpperCase()
          : clean(match.awayTeamSlot || match.awaySlot).toUpperCase();
        const homeScore = nullableInteger(liveResult?.homeScore ?? liveResult?.teamAScore);
        const awayScore = nullableInteger(liveResult?.awayScore ?? liveResult?.teamBScore);
        const hasFinalScore = homeScore !== null && awayScore !== null && homeScore !== awayScore;
        const manualResult = Boolean(liveResult?.manualOverride);
        const hasDetailedStats = statSeriesIds.has(statsSeriesId);
        const override = OFFICIAL_MATCH_OVERRIDES[`${division}:${roundNumber}:${sourceId}`] || null;
        const status = override?.status || (hasFinalScore ? "completed" : validMatchStatus(match.status));
        const isWalkover = !override && hasFinalScore && manualResult && !hasDetailedStats;
        const winnerSlot = hasFinalScore ? (homeScore > awayScore ? homeSlot : awaySlot) : "";
        const startsAt = playoffRound
          ? brazilPlayoffDateToIso(liveResult?.date, liveResult?.time, match.startsAt)
          : match.startsAt;
        return {
          ...match,
          homeTeamSlot: homeSlot,
          awayTeamSlot: awaySlot,
          homeTeamName: namesBySlot.get(homeSlot) || clean(match.homeTeamName),
          awayTeamName: namesBySlot.get(awaySlot) || clean(match.awayTeamName),
          startsAt,
          status,
          homeScore: hasFinalScore ? homeScore : nullableInteger(match.homeScore),
          awayScore: hasFinalScore ? awayScore : nullableInteger(match.awayScore),
          winnerTeamId: winnerSlot ? `team:${division}:${winnerSlot}` : null,
          statsSeriesId,
          isWalkover,
          excludedFromScoring: Boolean(
            override?.excludedFromScoring || isWalkover || ["postponed", "cancelled"].includes(status)
          ),
          scheduleIssue: clean(override?.reason || match.scheduleIssue),
          officialResult: liveResult ? {
            homeScore,
            awayScore,
            manualOverride: manualResult,
            updatedAt: isoDate(updatedAt) || clean(updatedAt) || null
          } : null
        };
      })
    };
    });
    merged.divisions[division] = {
      ...sourceDivision,
      teams: effectiveTeams,
      rounds
    };
  }
  return merged;
}

function officialGroupStandings(sourceDivision, teams, liveResults) {
  const teamBySlot = new Map(arrayValues(teams).map((team) => [clean(team.slot).toUpperCase(), team]));
  const statsBySlot = new Map(arrayValues(sourceDivision.stats?.teams)
    .map((team) => [clean(team.slot).toUpperCase(), team]));
  const standings = {};
  for (const group of ["A", "B", "C", "D"]) {
    standings[group] = [1, 2, 3, 4].map((seed) => {
      const slot = `${group}${seed}`;
      return {
        slot,
        seed,
        wins: 0,
        losses: 0,
        gameDiff: 0,
        avgWinTime: clean(statsBySlot.get(slot)?.avgWinTime || teamBySlot.get(slot)?.avgWinTime) || "00:00"
      };
    });
  }
  const bySlot = new Map(Object.values(standings).flat().map((entry) => [entry.slot, entry]));
  for (const round of arrayValues(sourceDivision.rounds)) {
    const roundNumber = Math.trunc(Number(round.roundNumber || round.number));
    if (roundNumber > 3) continue;
    for (const match of arrayValues(round.matches)) {
      const sourceId = clean(match.sourceId || match.id);
      const result = liveResults[sourceId] || match;
      const homeScore = nullableInteger(result?.homeScore);
      const awayScore = nullableInteger(result?.awayScore);
      const home = bySlot.get(clean(match.homeTeamSlot || match.homeSlot).toUpperCase());
      const away = bySlot.get(clean(match.awayTeamSlot || match.awaySlot).toUpperCase());
      if (!home || !away || homeScore === null || awayScore === null) continue;
      home.gameDiff += homeScore - awayScore;
      away.gameDiff += awayScore - homeScore;
      if (homeScore === awayScore || Math.max(homeScore, awayScore) < 2) continue;
      if (homeScore > awayScore) {
        home.wins += 1;
        away.losses += 1;
      } else {
        away.wins += 1;
        home.losses += 1;
      }
    }
  }
  for (const entries of Object.values(standings)) {
    entries.sort((left, right) => (
      right.wins - left.wins ||
      left.losses - right.losses ||
      right.gameDiff - left.gameDiff ||
      tiebreakSeconds(left.avgWinTime) - tiebreakSeconds(right.avgWinTime) ||
      left.seed - right.seed
    ));
  }
  return standings;
}

function playoffEligibility(standings) {
  const teamStatuses = {};
  for (const group of ["A", "B", "C", "D"]) {
    const entries = standings[group] || [];
    if (entries[0]?.slot) teamStatuses[entries[0].slot] = "qualified-next-round";
    if (entries[1]?.slot) teamStatuses[entries[1].slot] = "playing";
    if (entries[2]?.slot) teamStatuses[entries[2].slot] = "playing";
    if (entries[3]?.slot) teamStatuses[entries[3].slot] = "eliminated";
  }
  return { teamStatuses };
}

function resolvePlayoffSeed(standings, rawSeed) {
  const match = /^([ABCD])([1-4])$/.exec(clean(rawSeed).toUpperCase());
  return match ? standings[match[1]]?.[Number(match[2]) - 1]?.slot || "" : "";
}

function brazilPlayoffDateToIso(rawDate, rawTime, fallback) {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(clean(rawDate));
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(clean(rawTime));
  if (!dateMatch || !timeMatch) return fallback;
  const year = new Date(isoDate(fallback) || Date.now()).getUTCFullYear();
  return new Date(`${year}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`).toISOString();
}

function tiebreakSeconds(value) {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(clean(value));
  if (!match) return Number.MAX_SAFE_INTEGER;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 ? seconds : Number.MAX_SAFE_INTEGER;
}

async function normalizeOfficialSource(source) {
  const teams = [];
  const players = [];
  const rounds = [];
  const warnings = [];
  const playerIds = new Set();
  const teamIds = new Set();
  const matchIds = new Set();

  for (const division of DIVISIONS) {
    const divisionSource = source.divisions?.[division];
    if (!divisionSource) {
      warnings.push(`Divisão ${division} ausente na fonte.`);
      continue;
    }
    for (const rawTeam of arrayValues(divisionSource.teams)) {
      const slot = clean(rawTeam.slot).toUpperCase();
      const id = clean(rawTeam.id) || `team:${division}:${slot}`;
      if (!slot || !rawTeam.name || teamIds.has(id)) {
        warnings.push(`Equipe inválida ou duplicada em ${division}: ${id || "(sem ID)"}.`);
        continue;
      }
      teamIds.add(id);
      const team = {
        id,
        division,
        slot,
        name: clean(rawTeam.name),
        tag: clean(rawTeam.tag) || clean(rawTeam.name).slice(0, 5).toUpperCase(),
        logo: normalizeAssetPath(rawTeam.logo),
        payload: rawTeam
      };
      team.sourceHash = await hashObject({
        id: team.id,
        division,
        slot,
        name: team.name,
        tag: team.tag,
        logo: team.logo
      });
      teams.push(team);

      const starterRoles = [];
      for (const rawPlayer of arrayValues(rawTeam.players)) {
        const id = clean(rawPlayer.id || rawPlayer.playerId);
        const rawRole = clean(rawPlayer.role || rawPlayer.lane).toUpperCase();
        const isStarter = PLAYER_ROLES.includes(rawRole);
        if (isStarter) starterRoles.push(rawRole);
        const role = isStarter ? rawRole : clean(rawPlayer.mainRole || rawPlayer.position).toUpperCase();
        if (!id) {
          warnings.push(`Jogador sem ID estável em ${division}/${slot}: ${clean(rawPlayer.name || rawPlayer.player)}.`);
          continue;
        }
        if (playerIds.has(id)) {
          warnings.push(`ID de jogador duplicado na fonte: ${id}.`);
          continue;
        }
        playerIds.add(id);
        const normalizedRole = PLAYER_ROLES.includes(role) ? role : "SUP";
        const player = {
          id,
          division,
          teamId: id && team.id,
          teamSlot: slot,
          teamName: team.name,
          teamTag: team.tag,
          logo: team.logo,
          name: clean(rawPlayer.name || rawPlayer.player),
          role: normalizedRole,
          riotId: clean(rawPlayer.riotId),
          opgg: clean(rawPlayer.opgg),
          isStarter,
          rosterStatus: isStarter ? "starter" : "reserve",
          payload: rawPlayer
        };
        player.sourceHash = await hashObject(player);
        players.push(player);
      }
      for (const role of PLAYER_ROLES) {
        const count = starterRoles.filter((value) => value === role).length;
        if (count === 0) warnings.push(`Equipe ${division}/${slot} sem titular ${role}.`);
        if (count > 1) warnings.push(`Equipe ${division}/${slot} possui ${count} titulares ${role}.`);
      }
    }

    for (const rawRound of arrayValues(divisionSource.rounds)) {
      const roundNumber = Math.trunc(Number(rawRound.roundNumber || rawRound.number));
      if (!Number.isInteger(roundNumber) || roundNumber < 1) {
        warnings.push(`Rodada inválida na divisão ${division}.`);
        continue;
      }
      const roundId = clean(rawRound.id) || `${division}-r${roundNumber}`;
      const normalizedRound = {
        id: roundId,
        division,
        roundNumber,
        name: clean(rawRound.name) || `Rodada ${roundNumber}`,
        eligibility: normalizeRoundEligibility(rawRound.eligibility),
        matches: []
      };
      for (const [index, rawMatch] of arrayValues(rawRound.matches).entries()) {
        const sourceId = clean(rawMatch.sourceId || rawMatch.id) || `r${roundNumber}g${index + 1}`;
        const id = clean(rawMatch.id) || `schedule:${division}:${sourceId}`;
        if (matchIds.has(id)) {
          warnings.push(`ID de partida duplicado: ${id}.`);
          continue;
        }
        matchIds.add(id);
        const homeSlot = clean(rawMatch.homeTeamSlot || rawMatch.homeSlot).toUpperCase();
        const awaySlot = clean(rawMatch.awayTeamSlot || rawMatch.awaySlot).toUpperCase();
        const homeTeam = teams.find((team) => team.division === division && team.slot === homeSlot);
        const awayTeam = teams.find((team) => team.division === division && team.slot === awaySlot);
        const startsAt = isoDate(rawMatch.startsAt);
        const scheduleIssue = clean(rawMatch.scheduleIssue) ||
          (startsAt ? "" : "Horário ausente ou inválido");
        if (scheduleIssue) warnings.push(`${division} ${sourceId}: ${scheduleIssue}.`);
        const match = {
          id,
          sourceId,
          division,
          stage: clean(rawMatch.stage) || "groups",
          orderIndex: Number.isInteger(Number(rawMatch.orderIndex))
            ? Math.trunc(Number(rawMatch.orderIndex))
            : index,
          homeTeamId: homeTeam?.id || null,
          awayTeamId: awayTeam?.id || null,
          homeTeamSlot: homeSlot,
          awayTeamSlot: awaySlot,
          homeTeamName: homeTeam?.name || clean(rawMatch.homeTeamName),
          awayTeamName: awayTeam?.name || clean(rawMatch.awayTeamName),
          startsAt: startsAt || null,
          status: validMatchStatus(rawMatch.status),
          homeScore: nullableInteger(rawMatch.homeScore),
          awayScore: nullableInteger(rawMatch.awayScore),
          winnerTeamId: clean(rawMatch.winnerTeamId) || null,
          scheduleIssue,
          payload: rawMatch
        };
        match.sourceHash = await hashObject(match);
        normalizedRound.matches.push(match);
      }
      normalizedRound.sourceHash = await hashObject(normalizedRound);
      rounds.push(normalizedRound);
    }
  }

  const normalized = {
    sourceUrl: source.__sourceUrl || "embedded",
    generatedAt: isoDate(source.generatedAt) || null,
    source,
    teams,
    players,
    rounds,
    warnings
  };
  normalized.hash = await hashObject({
    version: source.version,
    generatedAt: source.generatedAt,
    teams,
    players,
    rounds
  });
  return normalized;
}

async function compareOfficialSource(env, snapshot) {
  const existingTeams = await dbAll(env, `
    SELECT id, source_hash AS sourceHash, active FROM fantasy_official_teams
  `);
  const existingPlayers = await dbAll(env, `
    SELECT id, source_hash AS sourceHash, active FROM fantasy_official_players
  `);
  const existingMatches = await dbAll(env, `
    SELECT id, source_hash AS sourceHash FROM fantasy_matches
  `);
  const items = [];
  appendDiff(items, "team", existingTeams, snapshot.teams);
  appendDiff(items, "player", existingPlayers, snapshot.players);
  appendDiff(
    items,
    "match",
    existingMatches,
    snapshot.rounds.flatMap((round) => round.matches)
  );
  const summary = {
    add: items.filter((item) => item.change === "add").length,
    update: items.filter((item) => item.change === "update").length,
    deactivate: items.filter((item) => item.change === "deactivate").length,
    unchanged: items.filter((item) => item.change === "unchanged").length,
    warnings: snapshot.warnings.length
  };
  return { items, summary };
}

function appendDiff(items, type, existing, incoming) {
  const current = new Map(existing.map((row) => [String(row.id), row]));
  const next = new Map(incoming.map((row) => [String(row.id), row]));
  for (const row of incoming) {
    const before = current.get(String(row.id));
    items.push({
      type,
      id: row.id,
      label: row.name || `${row.homeTeamName || ""} x ${row.awayTeamName || ""}`.trim(),
      change: !before ? "add" : before.sourceHash !== row.sourceHash ? "update" : "unchanged"
    });
  }
  for (const row of existing) {
    if (!next.has(String(row.id))) {
      items.push({ type, id: row.id, label: row.id, change: "deactivate" });
    }
  }
}

async function adminRoundOnePreview(request, env, requestId, auth) {
  const body = await readJson(request);
  const source = await loadOfficialSource(env, body.sourceUrl);
  const stats = await normalizeRoundStats(source, 1);
  const existingAssets = new Set(
    (await dbAll(env, "SELECT division || ':' || asset_id AS id FROM fantasy_market"))
      .map((row) => String(row.id))
  );
  const items = stats.items.map((item) => ({
    ...item,
    marketAssetFound: existingAssets.has(`${item.division}:${item.assetId}`)
  }));
  const unmatched = items.filter((item) => !item.marketAssetFound);
  await audit(env, {
    actor: auth.username,
    action: "stats.round1.preview",
    targetType: "round",
    targetId: "1",
    after: {
      sourceHash: stats.hash,
      total: items.length,
      unmatched: unmatched.map((item) => `${item.division}:${item.assetId}`)
    },
    requestId
  });
  return success({
    roundNumber: 1,
    sourceHash: stats.hash,
    summary: {
      players: items.filter((item) => item.assetType === "player").length,
      teams: items.filter((item) => item.assetType === "team").length,
      unmatched: unmatched.length,
      divisions: Object.fromEntries(
        DIVISIONS.map((division) => [
          division,
          items.filter((item) => item.division === division).length
        ])
      )
    },
    warnings: [
      ...stats.warnings,
      ...unmatched.map((item) =>
        `${item.division}:${item.assetId} possui estatística histórica, mas não está no mercado atual.`
      )
    ],
    items
  });
}

async function adminRoundOneImport(request, env, requestId, auth) {
  const body = await readJson(request);
  const expectedHash = clean(body.sourceHash);
  if (!expectedHash) {
    return failure("PREVIEW_REQUIRED", "Confirme o hash exibido na prévia.", 400);
  }
  const source = await loadOfficialSource(env, body.sourceUrl);
  const stats = await normalizeRoundStats(source, 1);
  if (!timingSafeEqual(expectedHash, stats.hash)) {
    return failure(
      "SOURCE_CHANGED",
      "As estatísticas mudaram desde a prévia. Gere uma nova prévia.",
      409,
      { expectedHash, currentHash: stats.hash }
    );
  }

  const roundRows = await dbAll(env, `
    SELECT id, division FROM fantasy_rounds WHERE round_number = 1
  `);
  const rounds = new Map(roundRows.map((round) => [round.division, round]));
  const missingRounds = DIVISIONS.filter((division) => !rounds.has(division));
  if (missingRounds.length) {
    return failure(
      "ROUND_NOT_READY",
      "Sincronize as rodadas antes de importar as estatísticas.",
      409,
      { missingRounds }
    );
  }

  const duplicateImports = [];
  for (const division of DIVISIONS) {
    const existing = await env.DB.prepare(`
      SELECT id, status FROM fantasy_imports
      WHERE round_id = ? AND source_hash = ? AND formula_version = 'stats-only-v1'
    `).bind(rounds.get(division).id, stats.hash).first();
    if (existing?.status === "confirmed") duplicateImports.push(division);
  }
  if (duplicateImports.length === DIVISIONS.length) {
    return success({
      imported: 0,
      idempotent: true,
      sourceHash: stats.hash,
      message: "Esta versão das estatísticas já foi importada nas duas divisões."
    });
  }

  await createBackupRecord(env, auth.username, "Antes da importação das estatísticas da rodada 1");
  const beforePrices = await marketPriceFingerprint(env);
  const statements = [];
  const activeItems = stats.items.filter((item) => !duplicateImports.includes(item.division));
  for (const item of activeItems) {
    const roundId = rounds.get(item.division).id;
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_asset_round_scores
        (round_id, division, asset_id, role, games, points, breakdown_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(round_id, asset_id) DO UPDATE SET
        division = excluded.division, role = excluded.role,
        games = excluded.games, points = excluded.points,
        breakdown_json = excluded.breakdown_json
    `).bind(
      roundId,
      item.division,
      item.assetId,
      item.role,
      item.games,
      item.points,
      JSON.stringify(item.breakdown)
    ));
    statements.push(env.DB.prepare(`
      UPDATE fantasy_market
      SET average_points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(item.points, item.division, item.assetId));
  }

  for (const division of DIVISIONS.filter((value) => !duplicateImports.includes(value))) {
    const round = rounds.get(division);
    const divisionItems = activeItems.filter((item) => item.division === division);
    const matchIds = [...new Set(divisionItems.flatMap((item) => item.matchIds))].sort();
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_imports
        (id, round_id, division, source_hash, formula_version,
         match_ids_json, status, details_json)
      VALUES (?, ?, ?, ?, 'stats-only-v1', ?, 'confirmed', ?)
      ON CONFLICT(round_id, source_hash, formula_version) DO UPDATE SET
        status = 'confirmed', details_json = excluded.details_json
    `).bind(
      `round1:${division}:${stats.hash.slice(0, 24)}`,
      round.id,
      division,
      stats.hash,
      JSON.stringify(matchIds),
      JSON.stringify({
        importedBy: auth.username,
        items: divisionItems.length,
        pricesChanged: false,
        importedAt: new Date().toISOString()
      })
    ));
    statements.push(env.DB.prepare(`
      UPDATE fantasy_rounds
      SET status = 'scored', processed_at = CURRENT_TIMESTAMP,
          formula_version = 'stats-only-v1', source_hash = ?
      WHERE id = ?
    `).bind(stats.hash, round.id));
  }

  const lineupRows = await dbAll(env, `
    SELECT l.id AS lineupId, l.fantasy_team_id AS fantasyTeamId,
           l.round_id AS roundId, l.captain_asset_id AS captainAssetId,
           p.asset_id AS assetId, p.role, t.division,
           lr.asset_id AS reserveAssetId, lr.role AS reserveRole
    FROM fantasy_lineups l
    JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
    LEFT JOIN fantasy_lineup_reserves lr ON lr.lineup_id = l.id
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    JOIN fantasy_rounds r ON r.id = l.round_id
    WHERE r.round_number = 1
    ORDER BY l.id, p.role
  `);
  const scoreByAsset = new Map(
    stats.items.map((item) => [`${item.division}:${item.assetId}`, {
      points: Number(item.points) || 0,
      games: Number(item.games) || 0
    }])
  );
  const lineups = new Map();
  for (const row of lineupRows) {
    const lineup = lineups.get(row.lineupId) || {
      fantasyTeamId: row.fantasyTeamId,
      roundId: row.roundId,
      captainAssetId: row.captainAssetId,
      division: row.division,
      picks: [],
      reserve: row.reserveAssetId ? {
        assetId: row.reserveAssetId,
        role: row.reserveRole
      } : null
    };
    lineup.picks.push({ assetId: row.assetId, role: row.role });
    lineups.set(row.lineupId, lineup);
  }
  for (const lineup of lineups.values()) {
    let total = 0;
    const breakdown = [];
    const absentStarter = lineup.picks.find((pick) => {
      if (!PLAYER_ROLES.includes(pick.role)) return false;
      return (scoreByAsset.get(`${lineup.division}:${pick.assetId}`)?.games || 0) <= 0;
    });
    const reserveScore = lineup.reserve
      ? scoreByAsset.get(`${lineup.division}:${lineup.reserve.assetId}`)
      : null;
    const replaceAssetId = absentStarter && reserveScore?.games > 0
      ? absentStarter.assetId
      : "";
    for (const pick of lineup.picks) {
      if (pick.assetId === replaceAssetId) {
        const points = roundMoney(reserveScore.points);
        total += points;
        breakdown.push({
          ...pick,
          base: 0,
          multiplier: 1,
          points: 0,
          didNotPlay: true,
          reserveUsed: { ...lineup.reserve, base: reserveScore.points, multiplier: 1, points }
        });
        continue;
      }
      const score = scoreByAsset.get(`${lineup.division}:${pick.assetId}`);
      const base = score?.games > 0 ? score.points : 0;
      const multiplier = pick.assetId === lineup.captainAssetId ? 1.5 : 1;
      const points = roundMoney(base * multiplier);
      total += points;
      breakdown.push({
        ...pick,
        base,
        multiplier,
        points,
        didNotPlay: PLAYER_ROLES.includes(pick.role) && !(score?.games > 0)
      });
    }
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_team_round_scores
        (fantasy_team_id, round_id, points, breakdown_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fantasy_team_id, round_id) DO UPDATE SET
        points = excluded.points, breakdown_json = excluded.breakdown_json
    `).bind(lineup.fantasyTeamId, lineup.roundId, roundMoney(total), JSON.stringify(breakdown)));
  }

  if (statements.length) await env.DB.batch(statements);
  const afterPrices = await marketPriceFingerprint(env);
  if (beforePrices !== afterPrices) {
    throw new Error("A importação de estatísticas alterou preços, o que é proibido.");
  }
  await audit(env, {
    actor: auth.username,
    action: "stats.round1.import",
    targetType: "round",
    targetId: "1",
    before: { priceFingerprint: beforePrices },
    after: {
      sourceHash: stats.hash,
      assets: activeItems.length,
      lineups: lineups.size,
      priceFingerprint: afterPrices
    },
    requestId
  });
  return success({
    sourceHash: stats.hash,
    imported: activeItems.length,
    lineupsScored: lineups.size,
    skippedDivisions: duplicateImports,
    pricesPreserved: beforePrices === afterPrices,
    warnings: stats.warnings
  });
}

async function normalizeFormulaV2Round(source, roundNumber, division) {
  const divisionSource = source.divisions?.[division];
  if (!divisionSource) throw new HttpError(400, `Divisão ${division} ausente na fonte oficial.`);
  const scheduledRound = arrayValues(divisionSource.rounds)
    .find((round) => Number(round.roundNumber || round.number) === roundNumber);
  if (!scheduledRound) throw new HttpError(404, `Rodada ${roundNumber} não encontrada na fonte oficial.`);
  const roster = rosterPlayersForStats(source, division);
  const stats = divisionSource.stats || {};
  const statsPlayers = arrayValues(stats.players);
  const identityBySourceId = new Map();
  for (const player of statsPlayers) {
    const rating = arrayValues(player.roundRatings)
      .find((row) => Number(row.round) === roundNumber);
    const resolved = resolveStatsPlayerIdentity(player, rating, roster);
    identityBySourceId.set(clean(player.playerId || player.id), clean(resolved.id));
  }
  const resolveId = (value) => identityBySourceId.get(clean(value)) || clean(value);
  const rawMaps = arrayValues(stats.matches)
    .filter((match) => {
      const parsedRound = Number(match.roundNumber) ||
        Number(String(match.round || "").match(/RODADA\s*(\d+)/i)?.[1]);
      return parsedRound === roundNumber;
    });
  const grouped = new Map();
  for (const rawMap of rawMaps) {
    const seriesId = clean(rawMap.seriesId);
    const mapId = clean(rawMap.id || rawMap.matchId);
    if (!seriesId || !mapId) throw new HttpError(400, "Há mapa oficial sem identificação de série.");
    const series = grouped.get(seriesId) || {
      id: seriesId,
      formato: clean(rawMap.format).toUpperCase() ||
        (/semi|final/i.test(clean(rawMap.stage)) ? "MD5" : "MD3"),
      mapas: []
    };
    const mvpAtletaId = resolveId(rawMap.mvpPlayerId || rawMap.mvp?.playerId);
    series.mapas.push({
      id: mapId,
      gameNumber: Math.max(1, Math.trunc(Number(rawMap.gameNumber) || series.mapas.length + 1)),
      blueTeamSlot: clean(rawMap.blueTeamSlot).toUpperCase(),
      redTeamSlot: clean(rawMap.redTeamSlot).toUpperCase(),
      winnerSlot: clean(rawMap.winnerSlot).toUpperCase(),
      mvpAtletaId: mvpAtletaId || null,
      participantes: arrayValues(rawMap.participants).map((participant) => ({
        atletaId: resolveId(participant.playerId),
        teamSlot: clean(participant.teamSlot).toUpperCase(),
        position: clean(participant.position).toUpperCase(),
        championId: clean(participant.champion),
        score: participant.score,
        won: Boolean(participant.won),
        deaths: participant.deaths
      }))
    });
    grouped.set(seriesId, series);
  }
  const allSeries = [...grouped.values()].map((item) => {
    item.mapas.sort((left, right) => left.gameNumber - right.gameNumber);
    const vitorias = new Map();
    for (const game of item.mapas) {
      if (game.winnerSlot) vitorias.set(game.winnerSlot, (vitorias.get(game.winnerSlot) || 0) + 1);
    }
    const slots = [...new Set(item.mapas.flatMap((game) =>
      [game.blueTeamSlot, game.redTeamSlot].filter(Boolean)
    ))];
    const alvo = item.formato === "MD5" ? 3 : 2;
    const equipes = {};
    for (const slot of slots) {
      const oponente = slots.find((value) => value !== slot);
      const wins = vitorias.get(slot) || 0;
      const opponentWins = vitorias.get(oponente) || 0;
      equipes[slot] = {
        venceuSerie: wins >= alvo,
        vitorias: wins,
        vitoriasAdversario: opponentWins
      };
    }
    return {
      ...item,
      concluida: Math.max(0, ...vitorias.values()) >= alvo,
      equipes
    };
  });
  const scheduledMatches = arrayValues(scheduledRound.matches);
  const seriesIdForMatch = (match) => clean(match.statsSeriesId) ||
    `${clean(match.stage) || "groups"}-${clean(match.sourceId || match.id)}`;
  const terminalStatuses = new Set(["completed", "postponed", "cancelled"]);
  const excludedMatches = scheduledMatches.filter((match) =>
    Boolean(match.excludedFromScoring || match.isWalkover) ||
    ["postponed", "cancelled"].includes(clean(match.status))
  );
  const excludedSeriesIds = new Set(excludedMatches.map(seriesIdForMatch));
  const playableMatches = scheduledMatches.filter((match) => !excludedSeriesIds.has(seriesIdForMatch(match)));
  const playableSeriesIds = new Set(playableMatches.map(seriesIdForMatch));
  const scheduledSeriesIds = new Set(scheduledMatches.map(seriesIdForMatch));
  const series = allSeries.filter((item) => playableSeriesIds.has(item.id));
  const completedPlayableSeries = new Set(
    series.filter((item) => item.concluida).map((item) => item.id)
  );
  const missingPlayableSeries = [...playableSeriesIds]
    .filter((seriesId) => !completedPlayableSeries.has(seriesId));
  const unknownSeries = allSeries.filter((item) => !scheduledSeriesIds.has(item.id));
  const unresolvedSchedule = scheduledMatches.filter((match) =>
    !terminalStatuses.has(clean(match.status))
  );
  const resolvedWithoutPlay = excludedMatches.filter((match) =>
    terminalStatuses.has(clean(match.status))
  );
  const ready = scheduledMatches.length > 0 &&
    unresolvedSchedule.length === 0 &&
    missingPlayableSeries.length === 0 &&
    unknownSeries.length === 0;
  const normalized = {
    roundNumber,
    division,
    roundId: clean(scheduledRound.id) || `${division}-r${roundNumber}`,
    expectedSeries: scheduledMatches.length,
    completedSeries: completedPlayableSeries.size + resolvedWithoutPlay.length,
    playedSeries: completedPlayableSeries.size,
    walkovers: excludedMatches.filter((match) => Boolean(match.isWalkover)).length,
    postponed: excludedMatches.filter((match) => clean(match.status) === "postponed").length,
    cancelled: excludedMatches.filter((match) => clean(match.status) === "cancelled").length,
    ignoredStatSeries: allSeries.filter((item) => excludedSeriesIds.has(item.id)).map((item) => item.id),
    missingPlayableSeries,
    unknownSeries: unknownSeries.map((item) => item.id),
    ready,
    series
  };
  normalized.hash = await hashObject(normalized);
  return normalized;
}

async function adminRoundPreviewV2(request, env, requestId, auth) {
  const body = await readJson(request);
  const roundNumber = Math.trunc(Number(body.roundNumber));
  if (!Number.isInteger(roundNumber) || roundNumber < 2) {
    return failure(
      "ROUND_INVALID",
      "A fórmula v2 vale a partir da rodada 2; a rodada 1 permanece preservada.",
      400
    );
  }
  const divisions = optionalDivision(body.division) ? [requiredDivision(body.division)] : DIVISIONS;
  const source = await loadOfficialSource(env, body.sourceUrl);
  const previews = [];
  for (const division of divisions) {
    const normalized = await normalizeFormulaV2Round(source, roundNumber, division);
    previews.push({
      division,
      roundId: normalized.roundId,
      sourceHash: normalized.hash,
      ready: normalized.ready,
      expectedSeries: normalized.expectedSeries,
      completedSeries: normalized.completedSeries,
      playedSeries: normalized.playedSeries,
      walkovers: normalized.walkovers,
      postponed: normalized.postponed,
      cancelled: normalized.cancelled,
      maps: normalized.series.reduce((total, item) => total + item.mapas.length, 0),
      players: new Set(normalized.series.flatMap((item) =>
        item.mapas.flatMap((game) => game.participantes.map((participant) => participant.atletaId))
      )).size
    });
  }
  const sourceHash = await hashObject(previews.map((item) => ({
    division: item.division,
    sourceHash: item.sourceHash
  })));
  await audit(env, {
    actor: auth.username,
    action: "stats.round.preview.v2",
    targetType: "round",
    targetId: String(roundNumber),
    after: { sourceHash, previews },
    requestId
  });
  return success({
    formulaVersion: 2,
    formulaId: FORMULA_ID,
    roundNumber,
    sourceHash,
    ready: previews.every((item) => item.ready),
    divisions: previews
  });
}

async function adminRoundProcessV2(request, env, requestId, auth) {
  const body = await readJson(request);
  const roundNumber = Math.trunc(Number(body.roundNumber));
  if (!Number.isInteger(roundNumber) || roundNumber < 2) {
    return failure(
      "ROUND_INVALID",
      "A fórmula v2 vale a partir da rodada 2; a rodada 1 permanece preservada.",
      400
    );
  }
  const expectedHash = clean(body.sourceHash);
  if (!expectedHash) return failure("PREVIEW_REQUIRED", "Confirme o hash exibido na prévia.", 400);
  const marketState = await getGlobalMarketState(env);
  if (marketState?.status === "open") {
    return failure("MARKET_OPEN", "Feche o mercado antes de processar pontuação e preços.", 409);
  }
  const divisions = optionalDivision(body.division) ? [requiredDivision(body.division)] : DIVISIONS;
  const source = await loadOfficialSource(env, body.sourceUrl);
  const normalizedByDivision = [];
  for (const division of divisions) {
    normalizedByDivision.push(await normalizeFormulaV2Round(source, roundNumber, division));
  }
  const currentHash = await hashObject(normalizedByDivision.map((item) => ({
    division: item.division,
    sourceHash: item.hash
  })));
  if (!timingSafeEqual(expectedHash, currentHash)) {
    return failure(
      "SOURCE_CHANGED",
      "As estatísticas mudaram desde a prévia. Gere uma nova prévia.",
      409,
      { expectedHash, currentHash }
    );
  }
  const notReady = normalizedByDivision.filter((item) => !item.ready);
  if (notReady.length) {
    return failure(
      "ROUND_NOT_FINALIZED",
      "Todas as séries da rodada precisam estar oficialmente finalizadas.",
      409,
      {
        divisions: notReady.map((item) => ({
          division: item.division,
          expectedSeries: item.expectedSeries,
          completedSeries: item.completedSeries,
          playedSeries: item.playedSeries,
          walkovers: item.walkovers,
          postponed: item.postponed,
          cancelled: item.cancelled,
          missingPlayableSeries: item.missingPlayableSeries,
          unknownSeries: item.unknownSeries
        }))
      }
    );
  }

  const results = [];
  const processable = [];
  for (const normalized of normalizedByDivision) {
    const round = await env.DB.prepare(`
      SELECT id, division, round_number AS roundNumber, status
      FROM fantasy_rounds
      WHERE division = ? AND round_number = ?
    `).bind(normalized.division, roundNumber).first();
    if (!round) return failure("ROUND_NOT_FOUND", `Rodada ausente em ${normalized.division}.`, 404);
    if (["open", "scheduled", "cancelled"].includes(round.status)) {
      return failure(
        "ROUND_STATUS_INVALID",
        `A rodada ${roundNumber} de ${normalized.division} precisa estar fechada.`,
        409,
        { status: round.status }
      );
    }
    const prior = await env.DB.prepare(`
      SELECT source_hash AS sourceHash, status
      FROM fantasy_round_processing
      WHERE round_id = ? AND formula_version = ?
    `).bind(round.id, FORMULA_ID).first();
    if (prior?.status === "completed") {
      if (timingSafeEqual(prior.sourceHash, normalized.hash)) {
        results.push({
          division: normalized.division,
          roundId: round.id,
          idempotent: true,
          sourceHash: normalized.hash
        });
        continue;
      }
      return failure(
        "ROUND_ALREADY_VALUED_SOURCE_CHANGED",
        `A rodada ${roundNumber} de ${normalized.division} já teve os preços aplicados com outra fonte.`,
        409
      );
    }
    if (prior?.status === "scores_saved" && timingSafeEqual(prior.sourceHash, normalized.hash)) {
      results.push({
        division: normalized.division,
        roundId: round.id,
        idempotent: true,
        sourceHash: normalized.hash,
        valuationPending: true
      });
      continue;
    }
    processable.push({ normalized, round });
  }
  if (!processable.length) {
    return success({
      formulaVersion: 2,
      formulaId: FORMULA_ID,
      roundNumber,
      sourceHash: currentHash,
      idempotent: true,
      divisions: results
    });
  }

  const backupId = await createBackupRecord(
    env,
    auth.username,
    `Antes do processamento Fantasy v2 da rodada ${roundNumber}`
  );
  for (const { normalized, round } of processable) {
    const market = await dbAll(env, `
      SELECT asset_id AS assetId, asset_type AS assetType, role,
             team_slot AS teamSlot, price_cents AS priceCents
      FROM fantasy_market
      WHERE division = ? AND active = 1
      ORDER BY asset_type, asset_id
    `, [normalized.division]);
    const processed = processarRodadaFantasy({
      rodadaId: round.id,
      rodadaNumero: roundNumber,
      divisao: normalized.division,
      series: normalized.series
    });
    const byPlayer = new Map(processed.pontuacoes.map((item) => [String(item.atletaId), item]));
    for (const asset of market.filter((item) => item.assetType === "player")) {
      if (byPlayer.has(String(asset.assetId))) continue;
      byPlayer.set(String(asset.assetId), {
        formulaVersion: 2,
        atletaId: asset.assetId,
        equipeId: asset.teamSlot,
        posicao: asset.role,
        jogou: false,
        mapasDisputados: 0,
        totalMapasEquipe: 0,
        pontuacaoMapas: [],
        pontuacaoMediaMapas: 0,
        participacaoSerie: 0,
        participacaoIntegral: false,
        bonusVitoriaSerie: 0,
        bonusSeriePerfeita: 0,
        bonusConsistencia: 0,
        bonusMvpSerie: 0,
        bonusSemMortes: 0,
        bonusTotal: 0,
        pontuacaoOficial: 0
      });
    }
    const playerScores = [...byPlayer.values()];
    const teamScores = market.filter((item) => item.assetType === "team").map((asset) => {
      const played = playerScores.filter((score) =>
        score.equipeId === asset.teamSlot && score.jogou
      );
      const points = played.length
        ? roundMoney(played.reduce((sum, score) => sum + score.pontuacaoOficial, 0) / played.length)
        : 0;
      return {
        formulaVersion: 2,
        assetId: asset.assetId,
        assetType: "team",
        role: "TEAM",
        teamSlot: asset.teamSlot,
        jogou: played.length > 0,
        mapasDisputados: Math.max(0, ...played.map((score) => score.totalMapasEquipe || 0)),
        pontuacaoOficial: points,
        scoreModel: "team-average-of-player-fantasy-v2",
        playerScores: played.map((score) => ({
          atletaId: score.atletaId,
          pontuacaoOficial: score.pontuacaoOficial
        }))
      };
    });
    const sourceHash = normalized.hash;
    const scoreStatements = [];
    for (const score of playerScores) {
      scoreStatements.push(env.DB.prepare(`
        INSERT INTO fantasy_asset_round_scores
          (round_id, division, asset_id, role, games, points, breakdown_json,
           formula_version, source_hash, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(round_id, asset_id) DO UPDATE SET
          division = excluded.division, role = excluded.role,
          games = excluded.games, points = excluded.points,
          breakdown_json = excluded.breakdown_json,
          formula_version = excluded.formula_version,
          source_hash = excluded.source_hash,
          processed_at = CURRENT_TIMESTAMP
      `).bind(
        round.id,
        normalized.division,
        score.atletaId,
        score.posicao || "SUB",
        score.mapasDisputados,
        score.pontuacaoOficial,
        JSON.stringify(score),
        FORMULA_ID,
        sourceHash
      ));
      scoreStatements.push(env.DB.prepare(`
        UPDATE fantasy_market
        SET last_score_breakdown_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE division = ? AND asset_id = ?
      `).bind(JSON.stringify(score), normalized.division, score.atletaId));
      for (const mapScore of score.pontuacaoMapas || []) {
        scoreStatements.push(env.DB.prepare(`
          INSERT INTO fantasy_asset_map_scores
            (round_id, division, match_id, asset_id, asset_type,
             points_milli, breakdown_json, formula_version)
          VALUES (?, ?, ?, ?, 'player', ?, ?, ?)
          ON CONFLICT(round_id, match_id, asset_id) DO UPDATE SET
            points_milli = excluded.points_milli,
            breakdown_json = excluded.breakdown_json,
            formula_version = excluded.formula_version
        `).bind(
          round.id,
          normalized.division,
          mapScore.mapaId,
          score.atletaId,
          Math.round(Number(mapScore.pontuacaoMapa) * 1000),
          JSON.stringify(mapScore),
          FORMULA_ID
        ));
      }
    }
    for (const score of teamScores) {
      scoreStatements.push(env.DB.prepare(`
        INSERT INTO fantasy_asset_round_scores
          (round_id, division, asset_id, role, games, points, breakdown_json,
           formula_version, source_hash, processed_at)
        VALUES (?, ?, ?, 'TEAM', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(round_id, asset_id) DO UPDATE SET
          games = excluded.games, points = excluded.points,
          breakdown_json = excluded.breakdown_json,
          formula_version = excluded.formula_version,
          source_hash = excluded.source_hash,
          processed_at = CURRENT_TIMESTAMP
      `).bind(
        round.id,
        normalized.division,
        score.assetId,
        score.mapasDisputados,
        score.pontuacaoOficial,
        JSON.stringify(score),
        FORMULA_ID,
        sourceHash
      ));
    }
    scoreStatements.push(env.DB.prepare(`
      INSERT INTO fantasy_round_processing
        (round_id, division, formula_version, source_hash, status, score_items, details_json)
      VALUES (?, ?, ?, ?, 'scores_saved', ?, ?)
      ON CONFLICT(round_id, formula_version) DO UPDATE SET
        source_hash = excluded.source_hash,
        status = 'scores_saved',
        score_items = excluded.score_items,
        details_json = excluded.details_json,
        processed_at = CURRENT_TIMESTAMP
    `).bind(
      round.id,
      normalized.division,
      FORMULA_ID,
      sourceHash,
      playerScores.length + teamScores.length,
      JSON.stringify({ processedBy: auth.username, backupId })
    ));
    scoreStatements.push(env.DB.prepare(`
      UPDATE fantasy_rounds
      SET status = 'scored', processed_at = CURRENT_TIMESTAMP,
          formula_version = ?, source_hash = ?
      WHERE id = ?
    `).bind(FORMULA_ID, sourceHash, round.id));
    scoreStatements.push(env.DB.prepare(`
      INSERT INTO fantasy_imports
        (id, round_id, division, source_hash, formula_version,
         match_ids_json, status, details_json)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)
      ON CONFLICT(round_id, source_hash, formula_version) DO UPDATE SET
        status = 'confirmed', details_json = excluded.details_json
    `).bind(
      `v2:${round.id}:${sourceHash.slice(0, 24)}`,
      round.id,
      normalized.division,
      sourceHash,
      FORMULA_ID,
      JSON.stringify(normalized.series.flatMap((item) => item.mapas.map((game) => game.id))),
      JSON.stringify({ processedBy: auth.username, backupId })
    ));
    if (scoreStatements.length) await env.DB.batch(scoreStatements);
    await resolveDraftPredictionsForRound(env, round, normalized.division, normalized.series);
    await recalculateLineupsV2(env, round, normalized.division);

    await updateMarketAverages(env, normalized.division);
    results.push({
      division: normalized.division,
      roundId: round.id,
      sourceHash,
      idempotent: false,
      scores: playerScores.length + teamScores.length,
      maps: processed.mapasProcessados,
      valuationPending: true
    });
  }
  await audit(env, {
    actor: auth.username,
    action: "stats.round.process.v2",
    targetType: "round",
    targetId: String(roundNumber),
    before: { backupId },
    after: { sourceHash: currentHash, divisions: results },
    requestId
  });
  return success({
    formulaVersion: 2,
    formulaId: FORMULA_ID,
    roundNumber,
    sourceHash: currentHash,
    backupId,
    idempotent: false,
    divisions: results
  });
}

async function resolveDraftPredictionsForRound(env, round, division, series) {
  if (Number(round.roundNumber || round.round_number) < DRAFT_PREDICTION_CONFIG.enabledFromRound) return 0;
  const rows = await dbAll(env, `
    SELECT dp.lineup_id AS lineupId, dp.role, dp.player_asset_id AS playerAssetId,
           dp.mode, dp.champion_id AS championId, dp.map_number AS mapNumber,
           dp.pick_rate_position AS pickRatePosition, dp.pick_rate_at_lock AS pickRateAtLock,
           dp.multiplier_at_lock AS multiplierAtLock, dp.base_reward AS baseReward,
           dp.possible_reward AS possibleReward, dp.miss_penalty AS missPenalty,
           dp.status, dp.result_score AS resultScore
    FROM fantasy_lineup_draft_predictions dp
    JOIN fantasy_lineups l ON l.id = dp.lineup_id
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    WHERE l.round_id = ? AND t.division = ?
    ORDER BY dp.lineup_id, dp.role
  `, [round.id, division]);
  const statements = [];
  for (const prediction of rows) {
    const playerSeries = (series || []).find((item) =>
      (item.mapas || []).some((game) => (game.participantes || []).some((participant) =>
        String(participant.atletaId) === String(prediction.playerAssetId)
      ))
    );
    const playerSeriesGames = playerSeries
      ? playerSeries.mapas.flatMap((game) => (game.participantes || [])
        .filter((participant) => String(participant.atletaId) === String(prediction.playerAssetId))
        .map((participant) => ({
          championId: participant.championId,
          mapNumber: game.gameNumber,
          played: true
        })))
      : [];
    const result = calculateDraftPredictionResult({
      prediction,
      playerSeriesGames,
      seriesFormat: playerSeries?.formato || "MD3"
    });
    statements.push(env.DB.prepare(`
      UPDATE fantasy_lineup_draft_predictions
      SET status = ?, result_score = ?, updated_at = CURRENT_TIMESTAMP
      WHERE lineup_id = ? AND role = ?
    `).bind(result.status, result.resultScore, prediction.lineupId, prediction.role));
  }
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}

async function recalculateLineupsV2(env, round, division) {
  const rows = await dbAll(env, `
    SELECT l.id AS lineupId, l.fantasy_team_id AS fantasyTeamId,
           l.captain_asset_id AS captainAssetId,
           p.asset_id AS assetId, p.role,
           lr.asset_id AS reserveAssetId, lr.role AS reserveRole,
           dp.mode AS draftMode, dp.champion_id AS draftChampionId,
           dp.map_number AS draftMapNumber, dp.pick_rate_position AS draftPickRatePosition,
           dp.pick_rate_at_lock AS draftPickRateAtLock,
           dp.multiplier_at_lock AS draftMultiplierAtLock,
           dp.base_reward AS draftBaseReward, dp.possible_reward AS draftPossibleReward,
           dp.miss_penalty AS draftMissPenalty, dp.status AS draftStatus,
           dp.result_score AS draftResultScore
    FROM fantasy_lineups l
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
    LEFT JOIN fantasy_lineup_reserves lr ON lr.lineup_id = l.id
    LEFT JOIN fantasy_lineup_draft_predictions dp
      ON dp.lineup_id = l.id AND dp.role = p.role AND dp.player_asset_id = p.asset_id
    WHERE l.round_id = ? AND t.division = ?
    ORDER BY l.id, p.role
  `, [round.id, division]);
  const scores = await dbAll(env, `
    SELECT asset_id AS assetId, points, games
    FROM fantasy_asset_round_scores
    WHERE round_id = ?
  `, [round.id]);
  const scoreMap = new Map(scores.map((score) => [String(score.assetId), score]));
  const grouped = new Map();
  for (const row of rows) {
    const item = grouped.get(row.lineupId) || {
      fantasyTeamId: row.fantasyTeamId,
      capitaoId: row.captainAssetId,
      titulares: [],
      predictions: new Map(),
      reserva: row.reserveAssetId
        ? { assetId: row.reserveAssetId, role: row.reserveRole }
        : null
    };
    item.titulares.push({ assetId: row.assetId, role: row.role });
    if (row.draftMode && PLAYER_ROLES.includes(row.role)) {
      item.predictions.set(row.role, {
        mode: row.draftMode,
        championId: row.draftChampionId,
        mapNumber: row.draftMapNumber,
        pickRatePosition: row.draftPickRatePosition,
        pickRateAtLock: row.draftPickRateAtLock,
        multiplierAtLock: row.draftMultiplierAtLock,
        baseReward: row.draftBaseReward,
        possibleReward: row.draftPossibleReward,
        missPenalty: row.draftMissPenalty,
        status: row.draftStatus,
        resultScore: Number(row.draftResultScore) || 0
      });
    }
    grouped.set(row.lineupId, item);
  }
  const statements = [];
  for (const lineup of grouped.values()) {
    const score = calcularPontuacaoEscalacao({
      titulares: lineup.titulares,
      capitaoId: lineup.capitaoId,
      reserva: lineup.reserva,
      pontuacoes: scoreMap
    });
    let draftPredictionTotal = 0;
    const details = score.detalhes.map((detail) => {
      const starter = lineup.titulares.find((item) => String(item.assetId) === String(detail.atletaId));
      const prediction = starter ? lineup.predictions.get(starter.role) : null;
      const draftPredictionScore = prediction ? roundMoney(prediction.resultScore) : 0;
      draftPredictionTotal += draftPredictionScore;
      const combined = calculateFinalPlayerFantasyScore({
        playerPerformanceScore: detail.pontuacaoBase || 0,
        isCaptain: String(detail.atletaId) === String(lineup.capitaoId),
        draftPredictionScore
      });
      return {
        ...detail,
        role: starter?.role || "",
        ...combined,
        draftPrediction: prediction,
      };
    });
    const finalScore = roundMoney(score.pontuacaoTotal + draftPredictionTotal);
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_team_round_scores
        (fantasy_team_id, round_id, points, breakdown_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fantasy_team_id, round_id) DO UPDATE SET
        points = excluded.points,
        breakdown_json = excluded.breakdown_json,
        created_at = CURRENT_TIMESTAMP
    `).bind(
      lineup.fantasyTeamId,
      round.id,
      finalScore,
      JSON.stringify({
        formulaVersion: 2,
        ...score,
        pontuacaoDesempenhoComCapitao: score.pontuacaoTotal,
        pontuacaoPalpiteDraft: roundMoney(draftPredictionTotal),
        pontuacaoTotal: finalScore,
        detalhes: details
      })
    ));
  }
  if (statements.length) await env.DB.batch(statements);
  return grouped.size;
}

async function updateMarketAverages(env, division) {
  await env.DB.prepare(`
    UPDATE fantasy_market
    SET average_points = COALESCE((
      SELECT ROUND(AVG(s.points), 2)
      FROM fantasy_asset_round_scores s
      JOIN fantasy_rounds r ON r.id = s.round_id
      WHERE s.division = fantasy_market.division
        AND s.asset_id = fantasy_market.asset_id
        AND s.games > 0
        AND r.status = 'scored'
    ), 0),
    updated_at = CURRENT_TIMESTAMP
    WHERE division = ?
  `).bind(division).run();
}

function rosterPlayersForStats(source, division) {
  return arrayValues(source.divisions?.[division]?.teams).flatMap((team) => {
    const teamSlot = clean(team.slot).toUpperCase();
    return arrayValues(team.players).map((player) => ({
      id: clean(player.playerId || player.id),
      name: clean(player.displayName || player.name || player.player),
      role: clean(player.role || player.lane || player.mainPosition).toUpperCase(),
      teamSlot,
      riotIds: [
        clean(player.riotId),
        ...arrayValues(player.riotIdAliases).flatMap((alias) =>
          typeof alias === "string"
            ? [clean(alias)]
            : [clean(alias?.riotId), clean(alias?.name)]
        )
      ].map(normalizeRiotIdentity).filter(Boolean),
      opgg: normalizeProfileIdentity(player.opgg)
    })).filter((player) => player.id);
  });
}

function resolveStatsPlayerIdentity(player, rating, roster) {
  const sourceId = clean(player.playerId || player.id);
  const direct = roster.find((candidate) => candidate.id === sourceId);
  if (direct) return direct;

  const riotIds = [
    clean(player.riotId),
    ...arrayValues(player.riotIdAliases || player.alsoPlayedAs).flatMap((alias) =>
      typeof alias === "string"
        ? [clean(alias)]
        : [clean(alias?.riotId), clean(alias?.name)]
    )
  ].map(normalizeRiotIdentity).filter(Boolean);
  const byRiotId = roster.filter((candidate) =>
    riotIds.some((riotId) => candidate.riotIds.includes(riotId))
  );
  if (byRiotId.length === 1) return byRiotId[0];

  const opgg = normalizeProfileIdentity(player.opgg);
  const byProfile = opgg ? roster.filter((candidate) => candidate.opgg === opgg) : [];
  if (byProfile.length === 1) return byProfile[0];

  const name = normalizeEntityName(player.displayName || player.name);
  const role = clean(rating?.position || player.mainPosition).toUpperCase();
  const teamSlot = clean(rating?.teamSlot || arrayValues(player.teams)[0]?.slot).toUpperCase();
  const byRosterContext = roster.filter((candidate) =>
    normalizeEntityName(candidate.name) === name &&
    (!role || candidate.role === role) &&
    (!teamSlot || candidate.teamSlot === teamSlot)
  );
  return byRosterContext.length === 1
    ? byRosterContext[0]
    : { id: sourceId, name: clean(player.displayName), role, teamSlot };
}

function normalizeRiotIdentity(value) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, "");
}

function normalizeProfileIdentity(value) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("pt-BR")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function normalizeEntityName(value) {
  return clean(value).normalize("NFKD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "");
}

async function normalizeRoundStats(source, roundNumber) {
  const items = [];
  const warnings = [];
  for (const division of DIVISIONS) {
    const stats = source.divisions?.[division]?.stats;
    if (!stats) {
      warnings.push(`Estatísticas ausentes para ${division}.`);
      continue;
    }
    const roster = rosterPlayersForStats(source, division);
    const itemIds = new Set();
    for (const player of arrayValues(stats.players)) {
      const rating = arrayValues(player.roundRatings)
        .find((row) => Number(row.round) === roundNumber);
      const sourceAssetId = clean(player.playerId || player.id);
      const resolvedPlayer = resolveStatsPlayerIdentity(player, rating, roster);
      const assetId = clean(resolvedPlayer.id || sourceAssetId);
      if (!assetId) continue;
      if (sourceAssetId && sourceAssetId !== assetId) {
        warnings.push(
          `Identidade estatística reconciliada em ${division}: ${clean(player.displayName)} ` +
          `(${sourceAssetId} → ${assetId}).`
        );
      }
      if (itemIds.has(assetId)) {
        warnings.push(`Estatística duplicada para ${division}:${assetId}.`);
        continue;
      }
      itemIds.add(assetId);
      const role = clean(rating?.position || player.mainPosition || "SUB").toUpperCase();
      if (rating && !PLAYER_ROLES.includes(role)) {
        warnings.push(`Posição inválida para ${division}:${assetId}.`);
        continue;
      }
      const didNotPlay = !rating;
      items.push({
        division,
        assetId,
        assetType: "player",
        role: PLAYER_ROLES.includes(role) ? role : "SUB",
        name: clean(player.displayName),
        teamSlot: clean(rating?.teamSlot || arrayValues(player.teams)[0]?.slot),
        games: didNotPlay ? 0 : Math.max(0, Math.trunc(Number(rating.games) || 0)),
        points: didNotPlay ? 0 : roundMoney(Number(rating.averageScore) || 0),
        matchIds: didNotPlay ? [] : arrayValues(rating.matches).map(clean).filter(Boolean).sort(),
        breakdown: {
          source: "LIGA_RK_STATS",
          round: roundNumber,
          wins: Number(rating?.wins) || 0,
          losses: Number(rating?.losses) || 0,
          series: arrayValues(rating?.series),
          didNotPlay,
          scoreModel: "published-round-average"
        }
      });
    }
    for (const team of arrayValues(stats.teams)) {
      const slot = clean(team.slot).toUpperCase();
      if (!slot) continue;
      const officialTeam = arrayValues(source.divisions?.[division]?.teams)
        .find((candidate) => clean(candidate.slot).toUpperCase() === slot);
      if (
        officialTeam &&
        normalizeEntityName(officialTeam.name) !== normalizeEntityName(team.name)
      ) {
        warnings.push(
          `Estatística histórica de equipe ignorada em ${division}/${slot}: ` +
          `${clean(team.name)} não corresponde ao elenco atual ${clean(officialTeam.name)}.`
        );
        continue;
      }
      const matches = arrayValues(stats.matches).filter((match) => {
        const parsedRound = Number(match.roundNumber) ||
          Number(String(match.round || "").match(/RODADA\s*(\d+)/i)?.[1]);
        return parsedRound === roundNumber &&
          [match.blueTeamSlot, match.redTeamSlot].map(clean).includes(slot);
      });
      items.push({
        division,
        assetId: `team:${division}:${slot}`,
        assetType: "team",
        role: "TEAM",
        name: clean(team.name),
        teamSlot: slot,
        games: Math.max(0, Math.trunc(Number(team.games) || matches.length)),
        points: roundMoney(Number(team.averageScore) || 0),
        matchIds: matches.map((match) => clean(match.id)).filter(Boolean).sort(),
        breakdown: {
          source: "LIGA_RK_STATS",
          round: roundNumber,
          wins: Number(team.wins) || 0,
          losses: Number(team.losses) || 0,
          winRate: Number(team.winRate) || 0,
          scoreModel: "published-team-average"
        }
      });
    }
  }
  items.sort((left, right) =>
    left.division.localeCompare(right.division) ||
    left.assetType.localeCompare(right.assetType) ||
    left.assetId.localeCompare(right.assetId)
  );
  return {
    items,
    warnings,
    hash: await hashObject({ roundNumber, items })
  };
}

async function adminScores(request, env) {
  const url = new URL(request.url);
  const division = optionalDivision(url.searchParams.get("division"));
  const roundNumber = optionalPositiveInteger(url.searchParams.get("round"));
  const clauses = [];
  const bindings = [];
  if (division) {
    clauses.push("s.division = ?");
    bindings.push(division);
  }
  if (roundNumber) {
    clauses.push("r.round_number = ?");
    bindings.push(roundNumber);
  }
  bindings.push(queryLimit(request, 500));
  const rows = await dbAll(env, `
    SELECT s.round_id AS roundId, r.round_number AS roundNumber,
           s.division, s.asset_id AS assetId, s.role, s.games, s.points,
           s.breakdown_json AS breakdownJson, s.created_at AS createdAt
    FROM fantasy_asset_round_scores s
    JOIN fantasy_rounds r ON r.id = s.round_id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY r.round_number DESC, s.division, s.points DESC
    LIMIT ?
  `, bindings);
  return success({ scores: rows.map(decodeJsonFields) });
}

async function adminCorrectScore(request, env, requestId, auth) {
  const body = await readJson(request);
  const roundId = clean(body.roundId);
  const assetId = clean(body.assetId);
  const before = await env.DB.prepare(`
    SELECT s.*, r.round_number AS round_number
    FROM fantasy_asset_round_scores s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE s.round_id = ? AND s.asset_id = ?
  `).bind(roundId, assetId).first();
  if (!before) return failure("SCORE_NOT_FOUND", "Pontuação não encontrada.", 404);
  const games = nullableInteger(body.games);
  const points = Number(body.points);
  if (games === null || games < 0 || !Number.isFinite(points) || Math.abs(points) > 10000) {
    return failure("SCORE_INVALID", "Jogos ou pontuação inválidos.", 400);
  }
  const backupId = await createBackupRecord(
    env,
    auth.username,
    `Antes da correção de pontuação ${roundId}:${assetId}`
  );
  const breakdown = safeJson(before.breakdown_json, {});
  breakdown.manualCorrection = {
    by: auth.username,
    at: new Date().toISOString(),
    previousGames: Number(before.games),
    previousPoints: Number(before.points),
    reason: clean(body.reason) || "Correção administrativa"
  };
  await env.DB.prepare(`
    UPDATE fantasy_asset_round_scores
    SET games = ?, points = ?, breakdown_json = ?
    WHERE round_id = ? AND asset_id = ?
  `).bind(games, roundMoney(points), JSON.stringify(breakdown), roundId, assetId).run();
  await env.DB.prepare(`
    UPDATE fantasy_market
    SET average_points = COALESCE((
      SELECT AVG(points) FROM fantasy_asset_round_scores
      WHERE division = ? AND asset_id = ?
    ), 0), updated_at = CURRENT_TIMESTAMP
    WHERE division = ? AND asset_id = ?
  `).bind(before.division, assetId, before.division, assetId).run();
  const lineupsScored = await recalculateRoundLineups(env, roundId);
  const after = await env.DB.prepare(`
    SELECT * FROM fantasy_asset_round_scores
    WHERE round_id = ? AND asset_id = ?
  `).bind(roundId, assetId).first();
  await audit(env, {
    actor: auth.username,
    action: "score.correct",
    targetType: "asset_round_score",
    targetId: `${roundId}:${assetId}`,
    before,
    after,
    metadata: { reason: clean(body.reason), backupId, lineupsScored },
    requestId
  });
  return success({ score: decodeJsonFields(after), backupId, lineupsScored });
}

async function adminValuationSimulate(request, env, requestId, auth) {
  const body = await readJson(request);
  const roundNumber = Math.trunc(Number(body.roundNumber));
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    return failure("ROUND_INVALID", "Informe uma rodada válida.", 400);
  }
  const requestedDivision = optionalDivision(body.division);
  const formula = await getFormula(env);
  const rounds = await dbAll(env, `
    SELECT id, division, round_number AS roundNumber, name, status,
           locks_at AS locksAt
    FROM fantasy_rounds
    WHERE round_number = ?
      ${requestedDivision ? "AND division = ?" : ""}
    ORDER BY division
  `, requestedDivision ? [roundNumber, requestedDivision] : [roundNumber]);
  if (!rounds.length) return failure("ROUND_NOT_FOUND", "Rodada não encontrada.", 404);

  const simulations = [];
  for (const round of rounds) {
    if (round.status !== "scored") {
      return failure(
        "ROUND_SCORES_REQUIRED",
        `Processe primeiro a pontuação da rodada ${roundNumber} de ${round.division}.`,
        409,
        { division: round.division, status: round.status }
      );
    }
    const alreadyApplied = await env.DB.prepare(`
      SELECT id, source_hash AS sourceHash, items_json AS itemsJson,
             formula_version AS formulaVersion
      FROM fantasy_price_simulations
      WHERE round_id = ? AND status = 'applied'
      ORDER BY applied_at DESC LIMIT 1
    `).bind(round.id).first();
    if (alreadyApplied) {
      if (alreadyApplied.formulaVersion !== formula.version) {
        return failure(
          "ROUND_ALREADY_VALUED",
          `A rodada ${roundNumber} de ${round.division} já foi valorizada por ${alreadyApplied.formulaVersion}. A fórmula dinâmica não será aplicada retroativamente.`,
          409,
          { division: round.division, previousFormula: alreadyApplied.formulaVersion }
        );
      }
      const items = safeJson(alreadyApplied.itemsJson, []);
      simulations.push({
        id: alreadyApplied.id,
        round,
        sourceHash: alreadyApplied.sourceHash,
        formulaVersion: formula.version,
        status: "applied",
        idempotent: true,
        summary: valuationSummary(items),
        patrimony: await publishedPatrimonyPreview(env, alreadyApplied.id),
        items
      });
      continue;
    }
    const items = await calculateValuation(env, round, formula);
    const sourceHash = await hashObject({
      roundId: round.id,
      formulaVersion: formula.version,
      settings: formula.settings,
      items: items.map((item) => ({
        assetId: item.assetId,
        currentPriceCents: item.currentPriceCents,
        roundPoints: item.roundPoints,
        games: item.games
      }))
    });
    const existing = await env.DB.prepare(`
      SELECT id, status, items_json AS itemsJson FROM fantasy_price_simulations
      WHERE round_id = ? AND source_hash = ? AND formula_version = ?
    `).bind(round.id, sourceHash, formula.version).first();
    const simulationId = existing?.id || crypto.randomUUID();
    if (!existing || existing.status === "cancelled" || existing.status === "failed") {
      await env.DB.prepare(`
        INSERT INTO fantasy_price_simulations
          (id, round_id, source_hash, formula_version, settings_json,
           items_json, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'previewed', ?)
        ON CONFLICT(round_id, source_hash, formula_version) DO UPDATE SET
          items_json = excluded.items_json, settings_json = excluded.settings_json,
          status = 'previewed', created_by = excluded.created_by,
          created_at = CURRENT_TIMESTAMP, applied_at = NULL, cancelled_at = NULL
      `).bind(
        simulationId,
        round.id,
        sourceHash,
        formula.version,
        JSON.stringify(formula.settings),
        JSON.stringify(items),
        auth.username
      ).run();
    }
    const previewItems = existing?.status === "previewed"
      ? safeJson(existing.itemsJson, items)
      : items;
    simulations.push({
      id: simulationId,
      round,
      sourceHash,
      formulaVersion: formula.version,
      status: existing?.status === "applied" ? "applied" : "previewed",
      summary: valuationSummary(previewItems),
      patrimony: await calculatePatrimonyPreview(env, round, previewItems),
      items: previewItems
    });
  }
  await audit(env, {
    actor: auth.username,
    action: "valuation.simulate",
    targetType: "round",
    targetId: String(roundNumber),
    after: {
      formulaVersion: formula.version,
      simulations: simulations.map((simulation) => ({
        id: simulation.id,
        division: simulation.round.division,
        sourceHash: simulation.sourceHash,
        summary: simulation.summary
      }))
    },
    requestId
  });
  return success({ formula, simulations });
}

async function adminValuationReview(request, env, requestId, auth) {
  const body = await readJson(request);
  const simulationId = clean(body.simulationId);
  const assetId = clean(body.assetId);
  const reviewAction = clean(body.action).toLowerCase();
  if (!simulationId || !assetId || !["approve", "ignore", "edit"].includes(reviewAction)) {
    return failure("REVIEW_INVALID", "Informe simulação, atleta e ação de revisão válidos.", 400);
  }
  const simulation = await env.DB.prepare(`
    SELECT s.id, s.status, s.items_json AS itemsJson,
           r.id AS roundId, r.division, r.round_number AS roundNumber,
           r.name, r.locks_at AS locksAt
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE s.id = ?
  `).bind(simulationId).first();
  if (!simulation) return failure("SIMULATION_NOT_FOUND", "Simulação não encontrada.", 404);
  if (simulation.status !== "previewed") {
    return failure("SIMULATION_NOT_REVIEWABLE", "Apenas prévias pendentes podem ser revisadas.", 409);
  }
  const items = safeJson(simulation.itemsJson, []);
  const item = items.find((candidate) => String(candidate.assetId) === assetId);
  if (!item) return failure("ASSET_NOT_FOUND", "Atleta ausente nesta simulação.", 404);
  const before = structuredClone(item);
  if (reviewAction === "edit") {
    const newPrice = Number(body.newPrice);
    if (!Number.isFinite(newPrice) || newPrice < DEFAULT_FORMULA_SETTINGS.minimumPrice) {
      return failure("PRICE_INVALID", "O preço manual deve ser de pelo menos RK$ 4,00.", 400);
    }
    item.newPriceCents = Math.round(roundMoney(newPrice) * 100);
    item.newPrice = item.newPriceCents / 100;
    item.deltaCents = item.newPriceCents - Number(item.currentPriceCents);
    item.delta = roundMoney(item.deltaCents / 100);
    item.needsReview = Math.abs(item.delta) > DEFAULT_FORMULA_SETTINGS.reviewThreshold;
    item.reviewStatus = "edited";
    item.status = item.delta > 0 ? "increased" : item.delta < 0 ? "decreased" : "unchanged";
    item.manualOverride = {
      by: auth.username,
      at: new Date().toISOString(),
      reason: clean(body.reason) || "Ajuste manual na prévia",
      formulaPrice: before.newPrice
    };
  } else {
    item.reviewStatus = reviewAction === "approve" ? "approved" : "ignored";
    item.reviewNote = {
      by: auth.username,
      at: new Date().toISOString(),
      reason: clean(body.reason) || (reviewAction === "approve" ? "Variação aprovada" : "Alerta ignorado")
    };
  }
  await env.DB.prepare(`
    UPDATE fantasy_price_simulations
    SET items_json = ? WHERE id = ? AND status = 'previewed'
  `).bind(JSON.stringify(items), simulationId).run();
  await audit(env, {
    actor: auth.username,
    action: `valuation.review.${reviewAction}`,
    targetType: "valuation_item",
    targetId: `${simulationId}:${assetId}`,
    before,
    after: item,
    requestId
  });
  const patrimony = await calculatePatrimonyPreview(env, {
    id: simulation.roundId,
    division: simulation.division,
    roundNumber: simulation.roundNumber,
    name: simulation.name,
    locksAt: simulation.locksAt
  }, items);
  return success({ simulationId, item, summary: valuationSummary(items), patrimony });
}

async function adminValuationApply(request, env, requestId, auth) {
  const body = await readJson(request);
  const simulationId = clean(body.simulationId);
  if (!simulationId || !timingSafeEqual(simulationId, clean(body.confirmSimulationId))) {
    return failure(
      "CONFIRMATION_REQUIRED",
      "Confirme explicitamente o mesmo ID da simulação.",
      400
    );
  }
  const market = await ensureAutomaticMarketClose(env);
  if (market?.status !== "closed") {
    return failure(
      "MARKET_MUST_BE_CLOSED",
      "A valorização só pode ser aplicada com o mercado global fechado.",
      409
    );
  }
  const simulation = await env.DB.prepare(`
    SELECT s.*, r.division, r.round_number AS roundNumber,
           r.name AS roundName, r.locks_at AS locksAt
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE s.id = ?
  `).bind(simulationId).first();
  if (!simulation) return failure("SIMULATION_NOT_FOUND", "Simulação não encontrada.", 404);
  if (simulation.status === "applied") {
    return success({ simulationId, idempotent: true, status: "applied" });
  }
  if (simulation.status !== "previewed") {
    return failure("SIMULATION_NOT_APPLICABLE", "A simulação não está pendente.", 409);
  }
  const items = safeJson(simulation.items_json, []);
  const pendingReviews = items.filter((item) => item.needsReview && item.reviewStatus === "pending");
  if (pendingReviews.length) {
    return failure(
      "VALUATION_REVIEW_REQUIRED",
      "Revise todas as variações acima de RK$ 7,00 antes de aplicar.",
      409,
      { assets: pendingReviews.map((item) => item.assetId) }
    );
  }
  const current = await dbAll(env, `
    SELECT asset_id AS assetId, price_cents AS priceCents
    FROM fantasy_market WHERE division = ? AND active = 1
  `, [simulation.division]);
  const priceMap = new Map(current.map((row) => [String(row.assetId), Number(row.priceCents)]));
  const changed = items.filter(
    (item) => priceMap.get(String(item.assetId)) !== Number(item.currentPriceCents)
  );
  if (changed.length) {
    return failure(
      "PRICES_CHANGED",
      "Os preços mudaram desde a simulação. Gere uma nova prévia.",
      409,
      { changedAssets: changed.map((item) => item.assetId) }
    );
  }

  const backupId = await createBackupRecord(
    env,
    auth.username,
    `Antes da valorização ${simulationId}`
  );
  const patrimonyPublication = await preparePatrimonyPublication(env, {
    id: simulation.round_id,
    division: simulation.division,
    roundNumber: simulation.roundNumber,
    name: simulation.roundName,
    locksAt: simulation.locksAt
  }, simulationId, items, auth.username);
  const statements = [];
  for (const item of items) {
    const historyId = crypto.randomUUID();
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_market_snapshots
        (round_id, division, asset_id, price_before_cents,
         price_after_cents, formula_version, breakdown_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(round_id, asset_id) DO UPDATE SET
        price_before_cents = excluded.price_before_cents,
        price_after_cents = excluded.price_after_cents,
        formula_version = excluded.formula_version,
        breakdown_json = excluded.breakdown_json
    `).bind(
      simulation.round_id,
      simulation.division,
      item.assetId,
      item.currentPriceCents,
      item.newPriceCents,
      simulation.formula_version,
      JSON.stringify(item)
    ));
    statements.push(env.DB.prepare(`
      UPDATE fantasy_market
      SET previous_price = price,
          previous_price_cents = price_cents,
          price = ?,
          price_cents = ?,
          last_valuation_breakdown_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(
      item.newPriceCents / 100,
      item.newPriceCents,
      JSON.stringify(item),
      simulation.division,
      item.assetId
    ));
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_price_history
        (id, simulation_id, round_id, division, asset_id, asset_type,
         formula_version, price_before_cents, price_after_cents, delta_cents,
         points, expected_points, adjusted_performance, difference,
         participation_factor, needs_review, review_status, details_json,
         processed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      historyId,
      simulationId,
      simulation.round_id,
      simulation.division,
      item.assetId,
      item.assetType,
      simulation.formula_version,
      item.currentPriceCents,
      item.newPriceCents,
      item.deltaCents,
      item.roundPoints,
      item.expectedScore ?? null,
      item.adjustedPerformance ?? null,
      item.scoreDifference ?? null,
      item.participationFactor || 0,
      item.needsReview ? 1 : 0,
      item.reviewStatus || "ok",
      JSON.stringify(item),
      auth.username
    ));
  }
  statements.push(env.DB.prepare(`
    UPDATE fantasy_price_simulations
    SET status = 'applied', applied_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'previewed'
  `).bind(simulationId));
  statements.push(env.DB.prepare(`
    UPDATE fantasy_round_processing
    SET status = 'completed', price_items = ?, processed_at = CURRENT_TIMESTAMP
    WHERE round_id = ? AND formula_version = ?
  `).bind(items.length, simulation.round_id, FORMULA_ID));
  statements.push(...patrimonyPublication.statements);
  await env.DB.batch(statements);
  await audit(env, {
    actor: auth.username,
    action: "valuation.apply",
    targetType: "price_simulation",
    targetId: simulationId,
    before: { backupId, sourceHash: simulation.source_hash },
    after: { summary: valuationSummary(items), patrimony: patrimonySummary(patrimonyPublication.preview), formulaVersion: simulation.formula_version },
    requestId
  });
  return success({
    simulationId,
    status: "applied",
    backupId,
    summary: valuationSummary(items),
    patrimony: patrimonySummary(patrimonyPublication.preview)
  });
}

async function adminValuationCancel(request, env, requestId, auth) {
  const body = await readJson(request);
  const id = clean(body.simulationId);
  const before = await env.DB.prepare(`
    SELECT id, status FROM fantasy_price_simulations WHERE id = ?
  `).bind(id).first();
  if (!before) return failure("SIMULATION_NOT_FOUND", "Simulação não encontrada.", 404);
  if (before.status === "applied") {
    return failure("SIMULATION_ALREADY_APPLIED", "Uma simulação aplicada não pode ser cancelada.", 409);
  }
  await env.DB.prepare(`
    UPDATE fantasy_price_simulations
    SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();
  await audit(env, {
    actor: auth.username,
    action: "valuation.cancel",
    targetType: "price_simulation",
    targetId: id,
    before,
    after: { status: "cancelled" },
    requestId
  });
  return success({ simulationId: id, status: "cancelled" });
}

async function adminValuationRollback(request, env, requestId, auth) {
  const body = await readJson(request);
  const simulationId = clean(body.simulationId);
  if (!simulationId || !timingSafeEqual(simulationId, clean(body.confirmSimulationId))) {
    return failure("CONFIRMATION_REQUIRED", "Confirme o mesmo ID da valorização aplicada.", 400);
  }
  const reason = clean(body.reason);
  if (!reason) return failure("ROLLBACK_REASON_REQUIRED", "Informe o motivo do rollback.", 400);
  const market = await ensureAutomaticMarketClose(env);
  if (market?.status !== "closed") {
    return failure("MARKET_MUST_BE_CLOSED", "O rollback exige o mercado global fechado.", 409);
  }
  const simulation = await env.DB.prepare(`
    SELECT s.*, r.division, r.round_number AS roundNumber
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE s.id = ?
  `).bind(simulationId).first();
  if (!simulation) return failure("SIMULATION_NOT_FOUND", "Valorização não encontrada.", 404);
  if (simulation.status !== "applied") {
    return failure("VALUATION_NOT_APPLIED", "Somente uma valorização aplicada pode ser revertida.", 409);
  }
  const history = await dbAll(env, `
    SELECT id, asset_id AS assetId, price_before_cents AS priceBeforeCents,
           price_after_cents AS priceAfterCents, details_json AS detailsJson
    FROM fantasy_price_history
    WHERE simulation_id = ? AND review_status <> 'rolled_back'
    ORDER BY processed_at DESC
  `, [simulationId]);
  if (!history.length) {
    return failure("ROLLBACK_HISTORY_MISSING", "Esta aplicação não possui histórico reversível.", 409);
  }
  const current = await dbAll(env, `
    SELECT asset_id AS assetId, price_cents AS priceCents
    FROM fantasy_market WHERE division = ? AND active = 1
  `, [simulation.division]);
  const currentPrices = new Map(current.map((row) => [String(row.assetId), Number(row.priceCents)]));
  const changed = history.filter((row) => currentPrices.get(String(row.assetId)) !== Number(row.priceAfterCents));
  if (changed.length) {
    return failure(
      "ROLLBACK_PRICES_CHANGED",
      "Há preços alterados depois desta valorização. O rollback foi bloqueado para não sobrescrever mudanças posteriores.",
      409,
      { assets: changed.map((row) => row.assetId) }
    );
  }
  const patrimonyBefore = await dbAll(env, `
    SELECT h.id, h.user_id AS userId, h.previous_cents AS previousCents,
           h.new_cents AS newCents, h.variation_cents AS variationCents, h.status,
           p.current_cents AS currentCents
    FROM fantasy_patrimony_history h
    JOIN fantasy_participant_patrimony p
      ON p.user_id = h.user_id AND p.division = h.division
    WHERE h.simulation_id = ?
      AND h.status IN ('PUBLISHED','INCONSISTENT','NO_VALID_LINEUP')
  `, [simulationId]);
  const expectedPatrimony = await dbAll(env, `
    SELECT u.id AS userId, d.division,
           10000 + COALESCE(SUM(CASE
             WHEN h.status IN ('PUBLISHED','INCONSISTENT') THEN h.variation_cents
             ELSE 0 END), 0) AS expectedCents
    FROM fantasy_users u
    CROSS JOIN (SELECT 'elite' AS division UNION ALL SELECT 'ascension') d
    LEFT JOIN fantasy_patrimony_history h
      ON h.user_id = u.id AND h.division = d.division
    GROUP BY u.id, d.division
  `);
  const expectedByUser = new Map(expectedPatrimony.map((row) => [
    `${String(row.userId)}:${String(row.division)}`,
    Number(row.expectedCents)
  ]));
  const patrimonyChanged = patrimonyBefore.filter(
    (row) => Number(row.currentCents) !== expectedByUser.get(`${String(row.userId)}:${String(simulation.division)}`)
  );
  if (patrimonyChanged.length) {
    return failure(
      "ROLLBACK_PATRIMONY_CHANGED",
      "Há patrimônios alterados por processamento posterior. Reverta primeiro a valorização mais recente.",
      409,
      { participants: patrimonyChanged.map((row) => row.userId) }
    );
  }
  const backupId = await createBackupRecord(env, auth.username, `Antes do rollback ${simulationId}`);
  const restoredItems = history.map((row) => {
    const previous = safeJson(row.detailsJson, {});
    return {
      ...previous,
      assetId: row.assetId,
      currentPriceCents: Number(row.priceAfterCents),
      newPriceCents: Number(row.priceBeforeCents),
      currentPrice: Number(row.priceAfterCents) / 100,
      newPrice: Number(row.priceBeforeCents) / 100,
      deltaCents: Number(row.priceBeforeCents) - Number(row.priceAfterCents),
      delta: roundMoney((Number(row.priceBeforeCents) - Number(row.priceAfterCents)) / 100)
    };
  });
  const statements = [];
  for (const item of restoredItems) {
    statements.push(env.DB.prepare(`
      UPDATE fantasy_market
      SET price = ?, price_cents = ?,
          previous_price = ?, previous_price_cents = ?,
          last_valuation_breakdown_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(
      item.newPrice,
      item.newPriceCents,
      Number.isFinite(Number(item.previousPrice)) ? Number(item.previousPrice) : item.newPrice,
      Number.isFinite(Number(item.previousPriceCents)) ? Number(item.previousPriceCents) : item.newPriceCents,
      JSON.stringify(item.previousValuation || {}),
      simulation.division,
      item.assetId
    ));
  }
  statements.push(env.DB.prepare(`
    UPDATE fantasy_price_history
    SET review_status = 'rolled_back', rolled_back_by = ?,
        rolled_back_at = CURRENT_TIMESTAMP, rollback_reason = ?
    WHERE simulation_id = ? AND review_status <> 'rolled_back'
  `).bind(auth.username, reason, simulationId));
  statements.push(env.DB.prepare(`
    UPDATE fantasy_price_simulations
    SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'applied'
  `).bind(simulationId));
  statements.push(env.DB.prepare(`
    UPDATE fantasy_round_processing
    SET status = 'scores_saved', price_items = 0, processed_at = CURRENT_TIMESTAMP
    WHERE round_id = ? AND formula_version = ?
  `).bind(simulation.round_id, FORMULA_ID));
  for (const row of patrimonyBefore) {
    statements.push(env.DB.prepare(`
      UPDATE fantasy_participant_patrimony
      SET current_cents = ?, formula_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND division = ?
    `).bind(
      Number(row.currentCents) - (
        ['PUBLISHED', 'INCONSISTENT'].includes(String(row.status))
          ? Number(row.variationCents || 0)
          : 0
      ),
      PATRIMONY_FORMULA_ID,
      row.userId,
      simulation.division
    ));
  }
  statements.push(env.DB.prepare(`
    UPDATE fantasy_patrimony_history
    SET status = 'ROLLED_BACK', rolled_back_by = ?,
        rolled_back_at = CURRENT_TIMESTAMP, rollback_reason = ?
    WHERE simulation_id = ?
      AND status IN ('PUBLISHED','INCONSISTENT','NO_VALID_LINEUP')
  `).bind(auth.username, reason, simulationId));
  await env.DB.batch(statements);
  const patrimonyAfter = await dbAll(env, `
    SELECT user_id AS userId, current_cents AS currentCents
    FROM fantasy_participant_patrimony
    WHERE division = ? AND user_id IN (
      SELECT user_id FROM fantasy_patrimony_history WHERE simulation_id = ?
    )
  `, [simulation.division, simulationId]);
  const rollbackId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO fantasy_valuation_rollbacks
      (id, simulation_id, round_id, division, formula_version,
       restored_prices_json, restored_wealth_json, reason, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    rollbackId,
    simulationId,
    simulation.round_id,
    simulation.division,
    simulation.formula_version,
    JSON.stringify(restoredItems),
    JSON.stringify({ before: patrimonyBefore, after: patrimonyAfter }),
    reason,
    auth.username
  ).run();
  await audit(env, {
    actor: auth.username,
    action: "valuation.rollback",
    targetType: "price_simulation",
    targetId: simulationId,
    before: { status: "applied", backupId },
    after: { status: "cancelled", rollbackId, restoredAssets: restoredItems.length },
    metadata: { reason },
    requestId
  });
  return success({
    simulationId,
    rollbackId,
    backupId,
    status: "rolled_back",
    restoredAssets: restoredItems.length
  });
}

async function adminValuationHistory(request, env) {
  const rows = await dbAll(env, `
    SELECT s.id, s.round_id AS roundId, r.round_number AS roundNumber,
           r.division, s.source_hash AS sourceHash,
           s.formula_version AS formulaVersion, s.status,
           s.created_by AS createdBy, s.created_at AS createdAt,
           s.applied_at AS appliedAt, s.cancelled_at AS cancelledAt,
           s.items_json AS itemsJson
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    ORDER BY s.created_at DESC LIMIT ?
  `, [queryLimit(request, 100)]);
  const priceHistory = await dbAll(env, `
    SELECT h.id, h.simulation_id AS simulationId, h.round_id AS roundId,
           r.round_number AS roundNumber, h.division, h.asset_id AS assetId,
           m.display_name AS name, h.formula_version AS formulaVersion,
           h.price_before_cents AS priceBeforeCents,
           h.price_after_cents AS priceAfterCents, h.delta_cents AS deltaCents,
           h.points, h.expected_points AS expectedPoints,
           h.adjusted_performance AS adjustedPerformance,
           h.needs_review AS needsReview, h.review_status AS reviewStatus,
           h.processed_by AS processedBy, h.processed_at AS processedAt,
           h.rolled_back_by AS rolledBackBy, h.rolled_back_at AS rolledBackAt,
           h.rollback_reason AS rollbackReason
    FROM fantasy_price_history h
    JOIN fantasy_rounds r ON r.id = h.round_id
    LEFT JOIN fantasy_market m ON m.division = h.division AND m.asset_id = h.asset_id
    ORDER BY h.processed_at DESC LIMIT ?
  `, [queryLimit(request, 100)]);
  const rollbacks = await dbAll(env, `
    SELECT id, simulation_id AS simulationId, round_id AS roundId,
           division, formula_version AS formulaVersion, reason,
           created_by AS createdBy, created_at AS createdAt
    FROM fantasy_valuation_rollbacks
    ORDER BY created_at DESC LIMIT ?
  `, [queryLimit(request, 100)]);
  const patrimonyHistory = await dbAll(env, `
    SELECT h.id, h.simulation_id AS simulationId, h.user_id AS userId,
           u.username AS participant, h.round_id AS roundId,
           r.round_number AS roundNumber, h.division,
           h.previous_cents AS previousCents, h.new_cents AS newCents,
           h.variation_cents AS variationCents,
           h.available_balance_cents AS availableBalanceCents,
           h.consistency_difference_cents AS consistencyDifferenceCents,
           h.status, h.formula_version AS formulaVersion,
           h.processed_by AS processedBy, h.processed_at AS processedAt
    FROM fantasy_patrimony_history h
    JOIN fantasy_users u ON u.id = h.user_id
    JOIN fantasy_rounds r ON r.id = h.round_id
    ORDER BY h.processed_at DESC LIMIT ?
  `, [queryLimit(request, 300)]);
  return success({
    simulations: rows.map((row) => {
      const decoded = decodeJsonFields(row);
      decoded.summary = valuationSummary(decoded.items || []);
      delete decoded.items;
      return decoded;
    }),
    priceHistory,
    patrimonyHistory,
    rollbacks
  });
}

async function calculateValuation(env, round, formula) {
  const market = await dbAll(env, `
    SELECT m.asset_id AS assetId, m.asset_type AS assetType, m.role,
           m.display_name AS name, m.team_name AS teamName,
           m.price_cents AS currentPriceCents,
           m.previous_price_cents AS previousPriceCents,
           COALESCE(s.points, 0) AS roundPoints,
           COALESCE(s.games, 0) AS games,
           COALESCE(s.breakdown_json, '{}') AS scoreDetailsJson,
           m.last_valuation_breakdown_json AS previousValuationJson
    FROM fantasy_market m
    LEFT JOIN fantasy_asset_round_scores s
      ON s.asset_id = m.asset_id AND s.round_id = ?
    WHERE m.division = ? AND m.active = 1
    ORDER BY m.role, m.display_name
  `, [round.id, round.division]);
  const history = await dbAll(env, `
    SELECT s.asset_id AS assetId, s.points, s.games, r.round_number AS roundNumber,
           CASE WHEN r.status = 'scored' THEN 1 ELSE 0 END AS finalized,
           CASE WHEN r.status = 'cancelled' THEN 1 ELSE 0 END AS cancelled
    FROM fantasy_asset_round_scores s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE s.division = ? AND r.round_number < ?
    ORDER BY r.round_number DESC
  `, [round.division, round.roundNumber]);
  const historyByAsset = new Map();
  for (const row of history) {
    const list = historyByAsset.get(String(row.assetId)) || [];
    list.push({
      points: Number(row.points) || 0,
      games: Number(row.games) || 0,
      roundNumber: Number(row.roundNumber),
      finalized: Boolean(row.finalized),
      cancelled: Boolean(row.cancelled)
    });
    historyByAsset.set(String(row.assetId), list);
  }
  return market.map((asset) => valuationItem(
    asset,
    historyByAsset.get(String(asset.assetId)) || [],
    formula.settings,
    round.roundNumber
  ));
}

function valuationItem(asset, history, settings, roundNumber = null) {
  const price = Number(asset.currentPriceCents) / 100;
  const roundPoints = Number(asset.roundPoints) || 0;
  const games = Math.max(0, Math.trunc(Number(asset.games) || 0));
  const scoreDetails = safeJson(asset.scoreDetailsJson, {});
  const teamMaps = Math.max(
    games,
    Math.trunc(Number(scoreDetails.totalMapasEquipe ?? scoreDetails.mapasDisputados) || 0)
  );
  const valuation = calculateFantasyValuation({
    currentPrice: price,
    currentPoints: roundPoints,
    history,
    currentRound: roundNumber,
    playerMaps: games,
    teamMaps,
    settings
  });
  const newPriceCents = Math.round(valuation.newPrice * 100);
  return {
    formulaVersion: VALUATION_FORMULA_VERSION,
    formulaId: VALUATION_FORMULA_ID,
    assetId: asset.assetId,
    assetType: asset.assetType,
    role: asset.role,
    name: asset.name,
    teamName: asset.teamName,
    currentPriceCents: Number(asset.currentPriceCents),
    previousPriceCents: Number(asset.previousPriceCents),
    previousPrice: Number(asset.previousPriceCents) / 100,
    newPriceCents,
    deltaCents: newPriceCents - Number(asset.currentPriceCents),
    currentPrice: roundMoney(price),
    newPrice: valuation.newPrice,
    delta: valuation.finalVariation,
    roundPoints: roundMoney(roundPoints),
    historicalAverage: valuation.seasonAverage,
    recentAverage: valuation.recentAverage,
    recentScores: valuation.recentScores,
    adjustedPerformance: valuation.adjustedPerformance,
    expectedScore: valuation.expectedScore,
    necessaryScore: valuation.expectedScore,
    scoreDifference: valuation.difference,
    baseVariation: valuation.baseVariation,
    priceFactor: valuation.priceFactor,
    participationRate: valuation.participationRate,
    participationFactor: valuation.participationFactor,
    confidence: valuation.participationFactor,
    games,
    playerMaps: games,
    teamMaps,
    totalGames: valuation.validHistoryRounds + (games > 0 ? 1 : 0),
    played: games > 0,
    needsReview: valuation.needsReview,
    reviewStatus: valuation.needsReview ? "pending" : "ok",
    status: valuation.status,
    previousValuation: safeJson(asset.previousValuationJson, {}),
    breakdown: valuation
  };
}

function valuationSummary(items) {
  return {
    assets: items.length,
    increased: items.filter((item) => Number(item.deltaCents) > 0).length,
    decreased: items.filter((item) => Number(item.deltaCents) < 0).length,
    unchanged: items.filter((item) => Number(item.deltaCents) === 0).length,
    largestIncrease: [...items].sort((a, b) => Number(b.deltaCents) - Number(a.deltaCents))[0] || null,
    largestDecrease: [...items].sort((a, b) => Number(a.deltaCents) - Number(b.deltaCents))[0] || null
  };
}

async function calculatePatrimonyPreview(env, round, items) {
  const users = await dbAll(env, `
    SELECT u.id AS userId, u.username,
           COALESCE(p.current_cents, 10000) AS currentCents
    FROM fantasy_users u
    LEFT JOIN fantasy_participant_patrimony p
      ON p.user_id = u.id AND p.division = ?
    ORDER BY u.username, u.id
  `, [round.division]);
  const owned = await dbAll(env, `
    SELECT t.user_id AS userId, t.name AS teamName, l.id AS lineupId,
           l.updated_at AS lineupUpdatedAt,
           o.asset_id AS assetId, o.role, o.price_paid AS purchasePrice,
           o.ownership_type AS ownershipType
    FROM fantasy_lineups l
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    JOIN (
      SELECT lineup_id, asset_id, role, price_paid, 'starter' AS ownership_type
      FROM fantasy_lineup_picks
      UNION ALL
      SELECT lineup_id, asset_id, role, price_paid, 'reserve' AS ownership_type
      FROM fantasy_lineup_reserves
    ) o ON o.lineup_id = l.id
    WHERE l.round_id = ? AND t.division = ?
    ORDER BY t.user_id, l.id, o.ownership_type, o.role
  `, [round.id, round.division]);
  const activeHistory = await dbAll(env, `
    SELECT h.user_id AS userId, h.simulation_id AS simulationId, h.status
    FROM fantasy_patrimony_history h
    WHERE h.round_id = ?
      AND h.status IN ('PUBLISHED','INCONSISTENT','NO_VALID_LINEUP')
  `, [round.id]);
  const alreadyByUser = new Map(activeHistory.map((row) => [String(row.userId), row]));
  const lineupsByUser = new Map();
  for (const row of owned) {
    const group = lineupsByUser.get(String(row.userId)) || {
      lineupId: row.lineupId,
      teamName: row.teamName,
      updatedAt: row.lineupUpdatedAt,
      assets: [],
      starterRoles: new Set()
    };
    const isReserve = row.ownershipType === "reserve";
    if (!isReserve) group.starterRoles.add(String(row.role));
    group.assets.push({
      assetId: String(row.assetId),
      assetType: row.role === "TEAM" ? "team" : "player",
      position: isReserve ? "RESERVE" : String(row.role),
      role: String(row.role),
      isReserve,
      purchasePrice: roundMoney(row.purchasePrice)
    });
    lineupsByUser.set(String(row.userId), group);
  }
  const updatedPrices = Object.fromEntries(items.map((item) => [String(item.assetId), Number(item.newPrice)]));
  const calculatedAt = new Date().toISOString();
  return users.map((user) => {
    const group = lineupsByUser.get(String(user.userId));
    const submittedInTime = !group || !round.locksAt || timestampMillis(group.updatedAt) <= timestampMillis(round.locksAt);
    const isValid = Boolean(group && group.starterRoles.size === 6 && ALL_ROLES.every((role) => group.starterRoles.has(role)) && submittedInTime);
    const previousPatrimony = Number(user.currentCents) / 100;
    const purchases = group ? roundMoney(group.assets.reduce((sum, asset) => sum + asset.purchasePrice, 0)) : 0;
    const result = calculateParticipantPatrimony({
      previousPatrimony,
      availableBalance: roundMoney(previousPatrimony - purchases),
      officialLineup: group ? { roundId: round.id, isValid, assets: group.assets } : null,
      updatedAssetPrices: updatedPrices,
      calculatedAt
    });
    const already = alreadyByUser.get(String(user.userId));
    const variationCents = Math.round(result.assetsVariation * 100);
    return {
      userId: user.userId,
      participant: user.username,
      teamName: group?.teamName || "—",
      lineupId: group?.lineupId || null,
      division: round.division,
      roundId: round.id,
      previousCents: Math.round(result.previousPatrimony * 100),
      purchasesCents: Math.round(purchases * 100),
      availableBalanceCents: Math.round(result.availableBalance * 100),
      previousAssetsCents: Math.round(result.previousAssetsValue * 100),
      updatedAssetsCents: Math.round(result.updatedAssetsValue * 100),
      variationCents,
      newCents: Math.round(result.newPatrimony * 100),
      consistencyDifferenceCents: Math.round(result.consistencyDifference * 100),
      status: already ? "ALREADY_PROCESSED" : result.status,
      originalStatus: result.status,
      reason: !group ? "NO_LINEUP" : !submittedInTime ? "LINEUP_AFTER_LOCK" : !isValid ? "INCOMPLETE_LINEUP" : "",
      alreadyProcessedBy: already?.simulationId || null,
      assets: result.assets
    };
  });
}

async function publishedPatrimonyPreview(env, simulationId) {
  return dbAll(env, `
    SELECT h.user_id AS userId, u.username AS participant,
           COALESCE(t.name, '—') AS teamName, h.lineup_id AS lineupId,
           h.division, h.round_id AS roundId,
           h.previous_cents AS previousCents, h.purchases_cents AS purchasesCents,
           h.available_balance_cents AS availableBalanceCents,
           h.previous_assets_cents AS previousAssetsCents,
           h.updated_assets_cents AS updatedAssetsCents,
           h.variation_cents AS variationCents, h.new_cents AS newCents,
           h.consistency_difference_cents AS consistencyDifferenceCents,
           h.status, h.asset_details_json AS assetsJson
    FROM fantasy_patrimony_history h
    JOIN fantasy_users u ON u.id = h.user_id
    LEFT JOIN fantasy_lineups l ON l.id = h.lineup_id
    LEFT JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    WHERE h.simulation_id = ? AND h.status <> 'ROLLED_BACK'
    ORDER BY h.new_cents DESC, u.username
  `, [simulationId]).then((rows) => rows.map((row) => ({
    ...row,
    originalStatus: row.status,
    assets: safeJson(row.assetsJson, []),
    assetsJson: undefined
  })));
}

async function preparePatrimonyPublication(env, round, simulationId, items, actor) {
  const preview = await calculatePatrimonyPreview(env, round, items);
  const statements = [];
  for (const row of preview) {
    if (row.status === "ALREADY_PROCESSED") continue;
    const historyStatus = row.originalStatus === "NO_VALID_LINEUP"
      ? "NO_VALID_LINEUP"
      : row.originalStatus === "INCONSISTENT" ? "INCONSISTENT" : "PUBLISHED";
    statements.push(env.DB.prepare(`
      UPDATE fantasy_participant_patrimony
      SET current_cents = ?, formula_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND division = ?
    `).bind(row.newCents, PATRIMONY_FORMULA_ID, row.userId, round.division));
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_patrimony_history
        (id, simulation_id, user_id, round_id, division, lineup_id,
         previous_cents, purchases_cents, available_balance_cents,
         previous_assets_cents, updated_assets_cents, variation_cents,
         new_cents, consistency_difference_cents, status,
         asset_details_json, formula_version, processed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), simulationId, row.userId, round.id, round.division,
      row.lineupId, row.previousCents, row.purchasesCents,
      row.availableBalanceCents, row.previousAssetsCents, row.updatedAssetsCents,
      row.variationCents, row.newCents, row.consistencyDifferenceCents,
      historyStatus, JSON.stringify(row.assets), PATRIMONY_FORMULA_ID, actor
    ));
  }
  return { preview, statements };
}

function patrimonySummary(rows) {
  return {
    participants: rows.length,
    processed: rows.filter((row) => ["CALCULATED", "INCONSISTENT"].includes(row.originalStatus)).length,
    noValidLineup: rows.filter((row) => row.originalStatus === "NO_VALID_LINEUP").length,
    inconsistent: rows.filter((row) => row.originalStatus === "INCONSISTENT").length,
    alreadyProcessed: rows.filter((row) => row.status === "ALREADY_PROCESSED").length
  };
}

async function adminGetFormula(_request, env) {
  return success({ formula: await getFormula(env) });
}

async function adminUpdateFormula(request, env, requestId, auth) {
  const body = await readJson(request);
  const before = await getFormula(env);
  const version = clean(body.version);
  const settings = validateFormulaSettings(body.settings);
  if (version !== VALUATION_FORMULA_ID) {
    return failure(
      "FORMULA_VERSION_INVALID",
      "A fórmula oficial ativa é fantasy-v3-dynamic e seus parâmetros são fixos.",
      400
    );
  }
  await env.DB.prepare(`
    UPDATE fantasy_formula_settings
    SET version = ?, settings_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 'global'
  `).bind(version, JSON.stringify(settings), auth.username).run();
  const after = await getFormula(env);
  await audit(env, {
    actor: auth.username,
    action: "formula.update",
    targetType: "formula",
    targetId: "global",
    before,
    after,
    requestId
  });
  return success({ formula: after });
}

async function adminResetFormula(_request, env, requestId, auth) {
  const before = await getFormula(env);
  await env.DB.prepare(`
    UPDATE fantasy_formula_settings
    SET version = 'fantasy-v3-dynamic', settings_json = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 'global'
  `).bind(JSON.stringify(DEFAULT_FORMULA_SETTINGS), auth.username).run();
  const after = await getFormula(env);
  await audit(env, {
    actor: auth.username,
    action: "formula.reset",
    targetType: "formula",
    targetId: "global",
    before,
    after,
    requestId
  });
  return success({ formula: after });
}

async function getFormula(env) {
  const row = await env.DB.prepare(`
    SELECT version, settings_json AS settingsJson,
           updated_by AS updatedBy, updated_at AS updatedAt
    FROM fantasy_formula_settings WHERE id = 'global'
  `).first();
  return {
    version: row.version,
    settings: safeJson(row.settingsJson, {}),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt
  };
}

function validateFormulaSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const settings = {};
  for (const [key, value] of Object.entries(DEFAULT_FORMULA_SETTINGS)) {
    settings[key] = typeof value === "number"
      ? finiteBetween(source[key], value, value)
      : value;
  }
  return settings;
}

function normalizedWeights(settings) {
  const total = Number(settings.roundWeight ?? 0.55) +
    Number(settings.averageWeight ?? 0.25) +
    Number(settings.recentWeight ?? 0.20);
  return {
    round: Number(settings.roundWeight ?? 0.55) / total,
    average: Number(settings.averageWeight ?? 0.25) / total,
    recent: Number(settings.recentWeight ?? 0.20) / total
  };
}

async function adminOverview(_request, env) {
  await ensureAutomaticMarketClose(env);
  const market = await getGlobalMarketState(env);
  const schedule = await resolveMarketWindow(env, market?.lock_round_number);
  const countTables = {
    users: "fantasy_users",
    fantasyTeams: "fantasy_teams",
    lineups: "fantasy_lineups",
    marketAssets: "fantasy_market",
    officialPlayers: "fantasy_official_players",
    officialTeams: "fantasy_official_teams",
    matches: "fantasy_matches",
    rounds: "fantasy_rounds",
    imports: "fantasy_imports",
    errors: "fantasy_error_log",
    backups: "fantasy_backups"
  };
  const counts = {};
  for (const [key, table] of Object.entries(countTables)) {
    counts[key] = Number((await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first())?.count || 0);
  }
  const latest = {
    sync: await env.DB.prepare(`
      SELECT id, status, created_at AS createdAt
      FROM fantasy_sync_runs ORDER BY created_at DESC LIMIT 1
    `).first(),
    import: await env.DB.prepare(`
      SELECT id, division, status, created_at AS createdAt
      FROM fantasy_imports ORDER BY created_at DESC LIMIT 1
    `).first(),
    valuation: await env.DB.prepare(`
      SELECT id, status, created_at AS createdAt
      FROM fantasy_price_simulations ORDER BY created_at DESC LIMIT 1
    `).first(),
    backup: await env.DB.prepare(`
      SELECT id, reason, created_at AS createdAt
      FROM fantasy_backups ORDER BY created_at DESC LIMIT 1
    `).first()
  };
  return success({
    market: publicMarketState(market),
    schedule,
    counts,
    latest,
    timezone: TIMEZONE
  });
}

async function adminListPlayers(request, env) {
  const url = new URL(request.url);
  const division = optionalDivision(url.searchParams.get("division"));
  const query = clean(url.searchParams.get("q"));
  const clauses = [];
  const bindings = [];
  if (division) {
    clauses.push("p.division = ?");
    bindings.push(division);
  }
  if (query) {
    clauses.push("(p.display_name LIKE ? OR p.riot_id LIKE ? OR p.id LIKE ?)");
    const like = `%${escapeLike(query)}%`;
    bindings.push(like, like, like);
  }
  bindings.push(queryLimit(request, 500));
  const rows = await dbAll(env, `
    SELECT p.id, p.division, p.team_id AS teamId, p.team_slot AS teamSlot,
           p.display_name AS name, p.role, p.riot_id AS riotId, p.opgg,
           p.roster_status AS rosterStatus, p.active,
           p.source_hash AS sourceHash, p.synced_at AS syncedAt,
           m.price, m.previous_price AS previousPrice,
           m.average_points AS averagePoints, m.manual_override AS manualOverride,
           m.official_status AS officialStatus, m.is_starter AS isStarter
    FROM fantasy_official_players p
    LEFT JOIN fantasy_market m
      ON m.division = p.division AND m.asset_id = p.id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY p.division, p.team_slot, p.role, p.display_name
    LIMIT ?
  `, bindings);
  return success({ players: rows });
}

async function adminUpdatePlayer(request, env, requestId, auth) {
  const id = decodePathId(request, "/api/fantasy/admin/players/");
  const before = await env.DB.prepare(`
    SELECT p.*, m.price, m.previous_price, m.price_cents,
           m.previous_price_cents, m.manual_override,
           m.team_name, m.team_tag, m.logo
    FROM fantasy_official_players p
    LEFT JOIN fantasy_market m ON m.division = p.division AND m.asset_id = p.id
    WHERE p.id = ?
  `).bind(id).first();
  if (!before) return failure("PLAYER_NOT_FOUND", "Jogador não encontrado.", 404);
  const body = await readJson(request);
  const name = clean(body.name ?? before.display_name);
  const role = clean(body.role ?? before.role).toUpperCase();
  const division = body.division === undefined
    ? before.division
    : requiredDivision(body.division);
  const rosterStatus = clean(body.rosterStatus ?? before.roster_status);
  const active = toBooleanInteger(body.active ?? before.active);
  const manualOverride = toBooleanInteger(body.manualOverride ?? 1);
  if (!name || !PLAYER_ROLES.includes(role)) {
    return failure("PLAYER_INVALID", "Nome ou posição inválidos.", 400);
  }
  if (!["starter", "reserve", "active", "inactive"].includes(rosterStatus)) {
    return failure("ROSTER_STATUS_INVALID", "Status de elenco inválido.", 400);
  }
  const teamId = clean(body.teamId ?? before.team_id);
  const team = teamId
    ? await env.DB.prepare(`
        SELECT id, division, slot, name, tag, logo
        FROM fantasy_official_teams WHERE id = ?
      `).bind(teamId).first()
    : null;
  if (teamId && (!team || team.division !== division)) {
    return failure("PLAYER_TEAM_INVALID", "A equipe deve existir na mesma divisão do jogador.", 400);
  }
  if (division !== before.division) {
    const conflict = await env.DB.prepare(`
      SELECT 1 AS found FROM fantasy_market WHERE division = ? AND asset_id = ?
    `).bind(division, id).first();
    if (conflict) {
      return failure("PLAYER_DIVISION_CONFLICT", "Já existe este ativo na divisão de destino.", 409);
    }
  }
  const requestedPrice = body.price === undefined || body.price === ""
    ? Number(before.price)
    : Number(body.price);
  const priceChanged = Number.isFinite(requestedPrice) &&
    Math.round(requestedPrice * 100) !== Math.round(Number(before.price) * 100);
  if (body.price !== undefined && (!Number.isFinite(requestedPrice) || requestedPrice < 4 || !before.price)) {
    return failure("PLAYER_PRICE_INVALID", "O preço deve ser pelo menos RK$ 4,00 para um ativo de mercado.", 400);
  }
  const price = priceChanged ? roundMoney(requestedPrice) : Number(before.price);
  const priceCents = Math.round(price * 100);
  const backupId = priceChanged
    ? await createBackupRecord(env, auth.username, `Antes do preço manual do jogador ${id}`)
    : null;
  const isStarter = rosterStatus === "starter";
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE fantasy_official_players
      SET division = ?, team_id = ?, team_slot = ?,
          display_name = ?, role = ?, riot_id = ?, opgg = ?,
          roster_status = ?, active = ?, synced_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      division,
      team?.id || null,
      team?.slot || before.team_slot,
      name,
      role,
      clean(body.riotId ?? before.riot_id),
      clean(body.opgg ?? before.opgg),
      rosterStatus,
      active,
      id
    ),
    env.DB.prepare(`
      UPDATE fantasy_market
      SET division = ?, display_name = ?, role = ?,
          team_slot = ?, team_name = ?, team_tag = ?, logo = ?,
          previous_price = CASE WHEN ? = 1 THEN price ELSE previous_price END,
          previous_price_cents = CASE WHEN ? = 1 THEN price_cents ELSE previous_price_cents END,
          price = CASE WHEN ? = 1 THEN ? ELSE price END,
          price_cents = CASE WHEN ? = 1 THEN ? ELSE price_cents END,
          active = ?, is_starter = ?,
          official_status = ?, manual_override = ?, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(
      division,
      name,
      role,
      team?.slot || before.team_slot,
      team?.name || before.team_name,
      team?.tag || before.team_tag,
      team?.logo || before.logo,
      priceChanged ? 1 : 0,
      priceChanged ? 1 : 0,
      priceChanged ? 1 : 0,
      price,
      priceChanged ? 1 : 0,
      priceCents,
      active && isStarter ? 1 : 0,
      isStarter ? 1 : 0,
      active ? "active" : "inactive",
      manualOverride,
      before.division,
      id
    )
  ]);
  const after = await env.DB.prepare(`
    SELECT p.*, m.price, m.manual_override
    FROM fantasy_official_players p
    LEFT JOIN fantasy_market m ON m.asset_id = p.id AND m.division = p.division
    WHERE p.id = ?
  `).bind(id).first();
  await audit(env, {
    actor: auth.username,
    action: "player.update",
    targetType: "player",
    targetId: id,
    before,
    after,
    metadata: { backupId, priceChanged },
    requestId
  });
  return success({ player: after, backupId });
}

async function adminListTeams(request, env) {
  const url = new URL(request.url);
  const division = optionalDivision(url.searchParams.get("division"));
  const bindings = division ? [division, queryLimit(request, 200)] : [queryLimit(request, 200)];
  const rows = await dbAll(env, `
    SELECT t.id, t.division, t.slot, t.name, t.tag, t.logo, t.active,
           t.source_hash AS sourceHash, t.synced_at AS syncedAt,
           m.price, m.previous_price AS previousPrice,
           m.average_points AS averagePoints, m.manual_override AS manualOverride
    FROM fantasy_official_teams t
    LEFT JOIN fantasy_market m
      ON m.division = t.division AND m.asset_id = t.id
    ${division ? "WHERE t.division = ?" : ""}
    ORDER BY t.division, t.slot LIMIT ?
  `, bindings);
  return success({ teams: rows });
}

async function adminUpdateTeam(request, env, requestId, auth) {
  const id = decodePathId(request, "/api/fantasy/admin/teams/");
  const before = await env.DB.prepare(`
    SELECT t.*, m.price, m.previous_price, m.price_cents,
           m.previous_price_cents, m.manual_override
    FROM fantasy_official_teams t
    LEFT JOIN fantasy_market m ON m.division = t.division AND m.asset_id = t.id
    WHERE t.id = ?
  `).bind(id).first();
  if (!before) return failure("TEAM_NOT_FOUND", "Equipe não encontrada.", 404);
  const body = await readJson(request);
  const name = clean(body.name ?? before.name);
  const tag = clean(body.tag ?? before.tag).toUpperCase();
  const logo = normalizeAssetPath(body.logo ?? before.logo);
  const division = body.division === undefined
    ? before.division
    : requiredDivision(body.division);
  const active = toBooleanInteger(body.active ?? before.active);
  const manualOverride = toBooleanInteger(body.manualOverride ?? 1);
  if (!name || !tag) return failure("TEAM_INVALID", "Nome ou tag inválidos.", 400);
  if (division !== before.division) {
    const slotConflict = await env.DB.prepare(`
      SELECT id FROM fantasy_official_teams
      WHERE division = ? AND slot = ? AND id <> ?
    `).bind(division, before.slot, id).first();
    if (slotConflict) {
      return failure("TEAM_DIVISION_CONFLICT", "O slot já está ocupado na divisão de destino.", 409);
    }
  }
  const requestedPrice = body.price === undefined || body.price === ""
    ? Number(before.price)
    : Number(body.price);
  const priceChanged = Number.isFinite(requestedPrice) &&
    Math.round(requestedPrice * 100) !== Math.round(Number(before.price) * 100);
  if (body.price !== undefined && (!Number.isFinite(requestedPrice) || requestedPrice < 4 || !before.price)) {
    return failure("TEAM_PRICE_INVALID", "O preço deve ser pelo menos RK$ 4,00.", 400);
  }
  const price = priceChanged ? roundMoney(requestedPrice) : Number(before.price);
  const priceCents = Math.round(price * 100);
  const backupId = priceChanged || division !== before.division
    ? await createBackupRecord(env, auth.username, `Antes da alteração estrutural da equipe ${id}`)
    : null;
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE fantasy_official_teams
      SET division = ?, name = ?, tag = ?, logo = ?,
          active = ?, synced_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(division, name, tag, logo, active, id),
    env.DB.prepare(`
      UPDATE fantasy_official_players
      SET division = ?, synced_at = CURRENT_TIMESTAMP
      WHERE team_id = ?
    `).bind(division, id),
    env.DB.prepare(`
      UPDATE fantasy_market
      SET division = ?, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND team_slot = ?
    `).bind(division, before.division, before.slot),
    env.DB.prepare(`
      UPDATE fantasy_market
      SET display_name = ?, team_name = ?, team_tag = ?, logo = ?,
          previous_price = CASE WHEN ? = 1 THEN price ELSE previous_price END,
          previous_price_cents = CASE WHEN ? = 1 THEN price_cents ELSE previous_price_cents END,
          price = CASE WHEN ? = 1 THEN ? ELSE price END,
          price_cents = CASE WHEN ? = 1 THEN ? ELSE price_cents END,
          active = ?, official_status = ?, manual_override = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(
      name,
      name,
      tag,
      logo,
      priceChanged ? 1 : 0,
      priceChanged ? 1 : 0,
      priceChanged ? 1 : 0,
      price,
      priceChanged ? 1 : 0,
      priceCents,
      active,
      active ? "active" : "inactive",
      manualOverride,
      division,
      id
    ),
    env.DB.prepare(`
      UPDATE fantasy_market
      SET team_name = ?, team_tag = ?, logo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND team_slot = ? AND manual_override = 0
    `).bind(name, tag, logo, division, before.slot)
  ]);
  const after = await env.DB.prepare(`
    SELECT t.*, m.price, m.manual_override
    FROM fantasy_official_teams t
    LEFT JOIN fantasy_market m ON m.division = t.division AND m.asset_id = t.id
    WHERE t.id = ?
  `).bind(id).first();
  await audit(env, {
    actor: auth.username,
    action: "team.update",
    targetType: "team",
    targetId: id,
    before,
    after,
    metadata: { backupId, priceChanged, divisionChanged: division !== before.division },
    requestId
  });
  return success({ team: after, backupId });
}

async function adminListUsers(request, env) {
  const query = clean(new URL(request.url).searchParams.get("q"));
  const bindings = [];
  let where = "";
  if (query) {
    const like = `%${escapeLike(query)}%`;
    where = "WHERE u.username LIKE ? OR u.discord_id LIKE ? OR u.id LIKE ?";
    bindings.push(like, like, like);
  }
  bindings.push(queryLimit(request, 500));
  const rows = await dbAll(env, `
    SELECT u.id, u.discord_id AS discordId, u.username, u.avatar_url AS avatarUrl,
           u.blocked, u.blocked_reason AS blockedReason,
           u.created_at AS createdAt, u.updated_at AS updatedAt,
           COUNT(DISTINCT t.id) AS fantasyTeams,
           COUNT(DISTINCT l.id) AS lineups
    FROM fantasy_users u
    LEFT JOIN fantasy_teams t ON t.user_id = u.id
    LEFT JOIN fantasy_lineups l ON l.fantasy_team_id = t.id
    ${where}
    GROUP BY u.id
    ORDER BY u.created_at DESC LIMIT ?
  `, bindings);
  return success({ users: rows });
}

async function adminUpdateUser(request, env, requestId, auth) {
  const id = decodePathId(request, "/api/fantasy/admin/users/");
  const before = await env.DB.prepare(`
    SELECT id, discord_id AS discordId, username, blocked,
           blocked_reason AS blockedReason
    FROM fantasy_users WHERE id = ?
  `).bind(id).first();
  if (!before) return failure("USER_NOT_FOUND", "Usuário não encontrado.", 404);
  const body = await readJson(request);
  const blocked = toBooleanInteger(body.blocked ?? before.blocked);
  const reason = blocked ? clean(body.reason ?? before.blockedReason) : "";
  await env.DB.prepare(`
    UPDATE fantasy_users
    SET blocked = ?, blocked_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(blocked, reason, id).run();
  if (blocked) {
    await env.DB.prepare("DELETE FROM fantasy_sessions WHERE user_id = ?").bind(id).run();
  }
  const after = await env.DB.prepare(`
    SELECT id, discord_id AS discordId, username, blocked,
           blocked_reason AS blockedReason
    FROM fantasy_users WHERE id = ?
  `).bind(id).first();
  await audit(env, {
    actor: auth.username,
    action: blocked ? "user.block" : "user.unblock",
    targetType: "user",
    targetId: id,
    before,
    after,
    requestId
  });
  return success({ user: after });
}

async function adminListLineups(request, env) {
  const url = new URL(request.url);
  const division = optionalDivision(url.searchParams.get("division"));
  const roundNumber = optionalPositiveInteger(url.searchParams.get("round"));
  const clauses = [];
  const bindings = [];
  if (division) {
    clauses.push("t.division = ?");
    bindings.push(division);
  }
  if (roundNumber) {
    clauses.push("r.round_number = ?");
    bindings.push(roundNumber);
  }
  const lineups = await dbAll(env, `
    SELECT l.id, l.fantasy_team_id AS fantasyTeamId, t.division,
           t.name AS fantasyTeamName, u.id AS userId, u.username,
           r.id AS roundId, r.round_number AS roundNumber, r.name AS roundName,
           l.captain_asset_id AS captainAssetId, l.total_cost AS totalCost,
           l.submitted_at AS submittedAt, l.updated_at AS updatedAt
    FROM fantasy_lineups l
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    JOIN fantasy_users u ON u.id = t.user_id
    JOIN fantasy_rounds r ON r.id = l.round_id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY r.round_number DESC, t.division, u.username
    LIMIT ?
  `, [...bindings, queryLimit(request, 500)]);
  if (!lineups.length) return success({ lineups: [] });
  const ids = lineups.map((lineup) => lineup.id);
  const placeholders = ids.map(() => "?").join(",");
  const picks = await dbAll(env, `
    SELECT lineup_id AS lineupId, role, asset_id AS assetId,
           price_paid AS pricePaid, team_slot AS teamSlot
    FROM fantasy_lineup_picks
    WHERE lineup_id IN (${placeholders})
    ORDER BY lineup_id, role
  `, ids);
  const reserves = await dbAll(env, `
    SELECT lineup_id AS lineupId, role, asset_id AS assetId,
           price_paid AS pricePaid, team_slot AS teamSlot
    FROM fantasy_lineup_reserves
    WHERE lineup_id IN (${placeholders})
  `, ids);
  return success({
    lineups: lineups.map((lineup) => ({
      ...lineup,
      picks: picks.filter((pick) => pick.lineupId === lineup.id),
      reserve: reserves.find((reserve) => reserve.lineupId === lineup.id) || null,
      validationIssues: lineupValidationIssues(
        lineup,
        picks.filter((pick) => pick.lineupId === lineup.id),
        reserves.find((reserve) => reserve.lineupId === lineup.id) || null
      )
    }))
  });
}

async function adminUpdateLineup(request, env, requestId, auth) {
  const id = decodePathId(request, "/api/fantasy/admin/lineups/");
  const lineup = await env.DB.prepare(`
    SELECT l.*, t.user_id, t.division, t.name AS fantasy_team_name,
           r.round_number AS round_number
    FROM fantasy_lineups l
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    JOIN fantasy_rounds r ON r.id = l.round_id
    WHERE l.id = ?
  `).bind(id).first();
  if (!lineup) return failure("LINEUP_NOT_FOUND", "Escalação não encontrada.", 404);
  const beforePicks = await dbAll(env, `
    SELECT role, asset_id AS assetId, price_paid AS pricePaid, team_slot AS teamSlot
    FROM fantasy_lineup_picks WHERE lineup_id = ? ORDER BY role
  `, [id]);
  const beforeReserve = await env.DB.prepare(`
    SELECT role, asset_id AS assetId, price_paid AS pricePaid, team_slot AS teamSlot
    FROM fantasy_lineup_reserves WHERE lineup_id = ?
  `).bind(id).first();
  const body = await readJson(request);
  const requestedPicks = arrayValues(body.picks);
  if (requestedPicks.length !== ALL_ROLES.length) {
    return failure("LINEUP_INVALID", "Informe exatamente TOP, JG, MID, ADC, SUP e TEAM.", 400);
  }
  const roles = requestedPicks.map((pick) => clean(pick.role).toUpperCase());
  if (new Set(roles).size !== ALL_ROLES.length || ALL_ROLES.some((role) => !roles.includes(role))) {
    return failure("LINEUP_ROLES_INVALID", "As seis posições obrigatórias devem aparecer uma vez.", 400);
  }
  const marketRows = [];
  for (const pick of requestedPicks) {
    const assetId = clean(pick.assetId || pick.id);
    const role = clean(pick.role).toUpperCase();
    const row = await env.DB.prepare(`
      SELECT * FROM fantasy_market
      WHERE division = ? AND asset_id = ? AND active = 1
    `).bind(lineup.division, assetId).first();
    if (!row || row.role !== role) {
      return failure("LINEUP_ASSET_INVALID", `Ativo inválido ou indisponível para ${role}.`, 400, {
        assetId,
        role
      });
    }
    marketRows.push(row);
  }
  if (new Set(marketRows.map((row) => row.asset_id)).size !== marketRows.length) {
    return failure("LINEUP_DUPLICATE_ASSET", "Um ativo não pode ocupar duas posições.", 400);
  }
  const teamCounts = new Map();
  for (const row of marketRows.filter((item) => item.asset_type === "player")) {
    teamCounts.set(row.team_slot, (teamCounts.get(row.team_slot) || 0) + 1);
  }
  if ([...teamCounts.values()].some((count) => count > MAX_PLAYERS_PER_REAL_TEAM)) {
    return failure("LINEUP_TEAM_LIMIT", "Use no máximo dois jogadores da mesma equipe real.", 400);
  }
  const captainId = clean(body.captainAssetId || body.captainPlayerId);
  if (!marketRows.some((row) => row.asset_type === "player" && row.asset_id === captainId)) {
    return failure("LINEUP_CAPTAIN_INVALID", "O capitão deve ser um dos cinco jogadores titulares.", 400);
  }
  const totalCost = roundMoney(marketRows.reduce((sum, row) => sum + Number(row.price), 0));
  const patrimony = await env.DB.prepare(`
    SELECT current_cents FROM fantasy_participant_patrimony
    WHERE user_id = ? AND division = ?
  `).bind(lineup.user_id, lineup.division).first();
  const budget = Number.isFinite(Number(patrimony?.current_cents))
    ? Number(patrimony.current_cents) / 100
    : BUDGET_LIMIT;
  if (totalCost > budget + 0.001) {
    return failure("LINEUP_BUDGET", `A escalação ultrapassa o patrimônio de RK$ ${budget.toFixed(2)}.`, 400);
  }
  let reserveRow = null;
  const reserveId = clean(body.reserve?.assetId || body.reserve?.id || body.reserveAssetId);
  if (reserveId) {
    reserveRow = await env.DB.prepare(`
      SELECT * FROM fantasy_market
      WHERE division = ? AND asset_id = ? AND active = 1
    `).bind(lineup.division, reserveId).first();
    if (!reserveRow || reserveRow.asset_type !== "player") {
      return failure("LINEUP_RESERVE_INVALID", "O reserva deve ser um jogador disponível.", 400);
    }
    if (marketRows.some((row) => row.asset_id === reserveRow.asset_id)) {
      return failure("LINEUP_RESERVE_DUPLICATE", "O reserva não pode ser titular.", 400);
    }
    const reserveBudget = roundMoney(Math.max(0, budget - totalCost));
    if (Number(reserveRow.price) > reserveBudget + 0.001) {
      return failure("LINEUP_RESERVE_BUDGET", `O limite do reserva é RK$ ${reserveBudget.toFixed(2)}.`, 400);
    }
    if ((teamCounts.get(reserveRow.team_slot) || 0) >= MAX_PLAYERS_PER_REAL_TEAM) {
      return failure("LINEUP_RESERVE_TEAM_LIMIT", "O reserva excede o limite da equipe real.", 400);
    }
  }
  const backupId = await createBackupRecord(
    env,
    auth.username,
    `Antes da correção da escalação ${id}`
  );
  const statements = [
    env.DB.prepare("DELETE FROM fantasy_lineup_reserves WHERE lineup_id = ?").bind(id),
    env.DB.prepare("DELETE FROM fantasy_lineup_picks WHERE lineup_id = ?").bind(id),
    env.DB.prepare(`
      UPDATE fantasy_lineups
      SET captain_asset_id = ?, total_cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(captainId, totalCost, id)
  ];
  for (const row of marketRows) {
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_lineup_picks
        (lineup_id, role, asset_id, price_paid, team_slot)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, row.role, row.asset_id, row.price, row.team_slot));
  }
  if (reserveRow) {
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_lineup_reserves
        (lineup_id, role, asset_id, price_paid, team_slot)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, reserveRow.role, reserveRow.asset_id, reserveRow.price, reserveRow.team_slot));
  }
  await env.DB.batch(statements);
  const lineupsScored = await recalculateRoundLineups(env, lineup.round_id);
  const after = {
    captainAssetId: captainId,
    totalCost,
    picks: marketRows.map((row) => ({
      role: row.role,
      assetId: row.asset_id,
      pricePaid: row.price,
      teamSlot: row.team_slot
    })),
    reserve: reserveRow ? {
      role: reserveRow.role,
      assetId: reserveRow.asset_id,
      pricePaid: reserveRow.price,
      teamSlot: reserveRow.team_slot
    } : null
  };
  await audit(env, {
    actor: auth.username,
    action: "lineup.correct",
    targetType: "lineup",
    targetId: id,
    before: {
      captainAssetId: lineup.captain_asset_id,
      totalCost: lineup.total_cost,
      picks: beforePicks,
      reserve: beforeReserve
    },
    after,
    metadata: { reason: clean(body.reason), backupId, lineupsScored },
    requestId
  });
  return success({ lineup: after, backupId, lineupsScored });
}

function lineupValidationIssues(lineup, picks, reserve) {
  const issues = [];
  const roles = picks.map((pick) => clean(pick.role).toUpperCase());
  if (picks.length !== ALL_ROLES.length || ALL_ROLES.some((role) => !roles.includes(role))) {
    issues.push("posições obrigatórias incompletas");
  }
  if (new Set(picks.map((pick) => pick.assetId)).size !== picks.length) {
    issues.push("ativo duplicado");
  }
  if (!picks.some((pick) => pick.assetId === lineup.captainAssetId && PLAYER_ROLES.includes(pick.role))) {
    issues.push("capitão inválido");
  }
  if (Number(lineup.totalCost) > BUDGET_LIMIT + 0.001) issues.push("orçamento excedido");
  const teamCounts = new Map();
  for (const pick of picks.filter((item) => PLAYER_ROLES.includes(item.role))) {
    teamCounts.set(pick.teamSlot, (teamCounts.get(pick.teamSlot) || 0) + 1);
  }
  if ([...teamCounts.values()].some((count) => count > MAX_PLAYERS_PER_REAL_TEAM)) {
    issues.push("limite por equipe excedido");
  }
  if (reserve && picks.some((pick) => pick.assetId === reserve.assetId)) {
    issues.push("reserva também é titular");
  }
  return issues;
}

async function recalculateRoundLineups(env, roundId) {
  const rows = await dbAll(env, `
    SELECT l.id AS lineupId, l.fantasy_team_id AS fantasyTeamId,
           l.captain_asset_id AS captainAssetId, t.division,
           p.asset_id AS assetId, p.role,
           lr.asset_id AS reserveAssetId, lr.role AS reserveRole,
           dp.mode AS draftMode, dp.champion_id AS draftChampionId,
           dp.map_number AS draftMapNumber, dp.pick_rate_position AS draftPickRatePosition,
           dp.pick_rate_at_lock AS draftPickRateAtLock,
           dp.multiplier_at_lock AS draftMultiplierAtLock,
           dp.base_reward AS draftBaseReward, dp.possible_reward AS draftPossibleReward,
           dp.miss_penalty AS draftMissPenalty, dp.status AS draftStatus,
           dp.result_score AS draftResultScore
    FROM fantasy_lineups l
    JOIN fantasy_teams t ON t.id = l.fantasy_team_id
    JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
    LEFT JOIN fantasy_lineup_reserves lr ON lr.lineup_id = l.id
    LEFT JOIN fantasy_lineup_draft_predictions dp
      ON dp.lineup_id = l.id AND dp.role = p.role AND dp.player_asset_id = p.asset_id
    WHERE l.round_id = ?
    ORDER BY l.id, p.role
  `, [roundId]);
  if (!rows.length) return 0;
  const scores = await dbAll(env, `
    SELECT division, asset_id AS assetId, games, points
    FROM fantasy_asset_round_scores WHERE round_id = ?
  `, [roundId]);
  const scoreMap = new Map(scores.map((row) => [`${row.division}:${row.assetId}`, row]));
  const grouped = new Map();
  for (const row of rows) {
    const lineup = grouped.get(row.lineupId) || {
      fantasyTeamId: row.fantasyTeamId,
      captainAssetId: row.captainAssetId,
      division: row.division,
      picks: [],
      predictions: new Map(),
      reserve: row.reserveAssetId ? {
        assetId: row.reserveAssetId,
        role: row.reserveRole
      } : null
    };
    lineup.picks.push({ assetId: row.assetId, role: row.role });
    if (row.draftMode && PLAYER_ROLES.includes(row.role)) {
      lineup.predictions.set(row.role, {
        mode: row.draftMode,
        championId: row.draftChampionId,
        mapNumber: row.draftMapNumber,
        pickRatePosition: row.draftPickRatePosition,
        pickRateAtLock: row.draftPickRateAtLock,
        multiplierAtLock: row.draftMultiplierAtLock,
        baseReward: row.draftBaseReward,
        possibleReward: row.draftPossibleReward,
        missPenalty: row.draftMissPenalty,
        status: row.draftStatus,
        resultScore: Number(row.draftResultScore) || 0
      });
    }
    grouped.set(row.lineupId, lineup);
  }
  const statements = [];
  for (const lineup of grouped.values()) {
    let total = 0;
    const breakdown = [];
    const absentStarter = lineup.picks.find((pick) =>
      PLAYER_ROLES.includes(pick.role) &&
      Number(scoreMap.get(`${lineup.division}:${pick.assetId}`)?.games || 0) <= 0
    );
    const reserveScore = lineup.reserve
      ? scoreMap.get(`${lineup.division}:${lineup.reserve.assetId}`)
      : null;
    const replacedId = absentStarter && Number(reserveScore?.games || 0) > 0
      ? absentStarter.assetId
      : "";
    for (const pick of lineup.picks) {
      if (pick.assetId === replacedId) {
        const points = roundMoney(Number(reserveScore.points) || 0);
        total += points;
        breakdown.push({
          ...pick,
          base: 0,
          multiplier: 1,
          points: 0,
          didNotPlay: true,
          reserveUsed: { ...lineup.reserve, base: points, multiplier: 1, points }
        });
        continue;
      }
      const score = scoreMap.get(`${lineup.division}:${pick.assetId}`);
      const base = Number(score?.games || 0) > 0 ? Number(score.points) || 0 : 0;
      const multiplier = pick.assetId === lineup.captainAssetId ? 1.5 : 1;
      const points = roundMoney(base * multiplier);
      const prediction = lineup.predictions.get(pick.role);
      const draftPredictionScore = prediction ? roundMoney(prediction.resultScore) : 0;
      const combined = calculateFinalPlayerFantasyScore({
        playerPerformanceScore: base,
        isCaptain: pick.assetId === lineup.captainAssetId,
        draftPredictionScore
      });
      total += combined.finalPlayerFantasyScore;
      breakdown.push({
        ...pick,
        base,
        multiplier,
        points: combined.finalPlayerFantasyScore,
        ...combined,
        draftPrediction: prediction || null,
        didNotPlay: PLAYER_ROLES.includes(pick.role) && Number(score?.games || 0) <= 0
      });
    }
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_team_round_scores
        (fantasy_team_id, round_id, points, breakdown_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fantasy_team_id, round_id) DO UPDATE SET
        points = excluded.points, breakdown_json = excluded.breakdown_json
    `).bind(lineup.fantasyTeamId, roundId, roundMoney(total), JSON.stringify(breakdown)));
  }
  await env.DB.batch(statements);
  return statements.length;
}

async function adminListMatches(request, env) {
  const url = new URL(request.url);
  const division = optionalDivision(url.searchParams.get("division"));
  const roundNumber = optionalPositiveInteger(url.searchParams.get("round"));
  const clauses = [];
  const bindings = [];
  if (division) {
    clauses.push("m.division = ?");
    bindings.push(division);
  }
  if (roundNumber) {
    clauses.push("m.round_number = ?");
    bindings.push(roundNumber);
  }
  const rows = await dbAll(env, `
    SELECT m.id, m.source_id AS sourceId, m.division,
           m.round_id AS roundId, m.round_number AS roundNumber,
           m.stage, m.order_index AS orderIndex,
           m.home_team_id AS homeTeamId, m.away_team_id AS awayTeamId,
           m.home_team_slot AS homeTeamSlot, m.away_team_slot AS awayTeamSlot,
           m.home_team_name AS homeTeamName, m.away_team_name AS awayTeamName,
           m.starts_at AS startsAt, m.timezone, m.status,
           m.home_score AS homeScore, m.away_score AS awayScore,
           m.winner_team_id AS winnerTeamId,
           m.schedule_issue AS scheduleIssue,
           m.manual_override_json AS manualOverrideJson,
           m.source_hash AS sourceHash, m.synced_at AS syncedAt
    FROM fantasy_matches m
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY m.round_number DESC, m.starts_at, m.division, m.order_index
    LIMIT ?
  `, [...bindings, queryLimit(request, 500)]);
  return success({ matches: rows.map(decodeJsonFields) });
}

async function adminUpdateMatch(request, env, requestId, auth) {
  const id = decodePathId(request, "/api/fantasy/admin/matches/");
  const before = await env.DB.prepare("SELECT * FROM fantasy_matches WHERE id = ?").bind(id).first();
  if (!before) return failure("MATCH_NOT_FOUND", "Partida não encontrada.", 404);
  const body = await readJson(request);
  const restoreOfficial = body.restoreOfficial === true;
  const official = restoreOfficial ? safeJson(before.source_payload_json, {}) : {};
  const startsAtValue = restoreOfficial ? official.startsAt : body.startsAt;
  const startsAt = startsAtValue === null
    ? null
    : isoDate(startsAtValue ?? before.starts_at);
  const status = validMatchStatus(
    restoreOfficial ? official.status ?? "scheduled" : body.status ?? before.status
  );
  const scheduleIssue = startsAt ? clean(body.scheduleIssue) : "Horário ausente ou inválido";
  const override = restoreOfficial ? null : {
    editedBy: auth.username,
    editedAt: new Date().toISOString(),
    fields: {
      startsAt,
      status,
      scheduleIssue
    }
  };
  await env.DB.prepare(`
    UPDATE fantasy_matches
    SET starts_at = ?, status = ?, schedule_issue = ?,
        home_score = ?, away_score = ?, winner_team_id = ?,
        manual_override_json = ?, synced_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    startsAt,
    status,
    scheduleIssue,
    nullableInteger(restoreOfficial ? official.homeScore : body.homeScore ?? before.home_score),
    nullableInteger(restoreOfficial ? official.awayScore : body.awayScore ?? before.away_score),
    clean(restoreOfficial ? official.winnerTeamId : body.winnerTeamId ?? before.winner_team_id) || null,
    override ? JSON.stringify(override) : null,
    id
  ).run();
  const after = await env.DB.prepare("SELECT * FROM fantasy_matches WHERE id = ?").bind(id).first();
  await ensureAutomaticMarketClose(env, new Date(), "schedule-edit");
  await audit(env, {
    actor: auth.username,
    action: restoreOfficial ? "match.restore-official" : "match.update",
    targetType: "match",
    targetId: id,
    before,
    after,
    requestId
  });
  return success({ match: decodeJsonFields(after), market: publicMarketState(await getGlobalMarketState(env)) });
}

async function adminListRounds(request, env) {
  const division = optionalDivision(new URL(request.url).searchParams.get("division"));
  const rows = await dbAll(env, `
    SELECT id, division, round_number AS roundNumber, name,
           opens_at AS opensAt, locks_at AS locksAt, status,
           formula_version AS formulaVersion, source_hash AS sourceHash,
           processed_at AS processedAt, created_at AS createdAt
    FROM fantasy_rounds
    ${division ? "WHERE division = ?" : ""}
    ORDER BY round_number DESC, division
  `, division ? [division] : []);
  return success({ rounds: rows });
}

async function adminUpsertRound(request, env, requestId, auth) {
  const body = await readJson(request);
  const division = requiredDivision(body.division);
  const roundNumber = Math.trunc(Number(body.roundNumber));
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    return failure("ROUND_INVALID", "Número de rodada inválido.", 400);
  }
  const id = clean(body.id) || `${division}-r${roundNumber}`;
  const before = await env.DB.prepare(`
    SELECT * FROM fantasy_rounds WHERE division = ? AND round_number = ?
  `).bind(division, roundNumber).first();
  const opensAt = isoDate(body.opensAt) || before?.opens_at || new Date().toISOString();
  const locksAt = isoDate(body.locksAt) || before?.locks_at || new Date().toISOString();
  const status = ["scheduled", "open", "locked", "scored"].includes(body.status)
    ? body.status
    : before?.status || "scheduled";
  const backupId = await createBackupRecord(
    env,
    auth.username,
    `Antes da alteração da rodada ${division} ${roundNumber}`
  );
  await env.DB.prepare(`
    INSERT INTO fantasy_rounds
      (id, division, round_number, name, opens_at, locks_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(division, round_number) DO UPDATE SET
      name = excluded.name, opens_at = excluded.opens_at,
      locks_at = excluded.locks_at,
      status = CASE
        WHEN fantasy_rounds.status = 'scored' THEN 'scored'
        ELSE excluded.status
      END
  `).bind(
    id,
    division,
    roundNumber,
    clean(body.name) || `Rodada ${roundNumber}`,
    opensAt,
    locksAt,
    status
  ).run();
  const after = await env.DB.prepare(`
    SELECT * FROM fantasy_rounds WHERE division = ? AND round_number = ?
  `).bind(division, roundNumber).first();
  await audit(env, {
    actor: auth.username,
    action: "round.upsert",
    targetType: "round",
    targetId: after.id,
    before,
    after,
    requestId
  });
  return success({ round: after, backupId });
}

async function adminAuditLog(request, env) {
  const url = new URL(request.url);
  const action = clean(url.searchParams.get("action"));
  const rows = await dbAll(env, `
    SELECT id, actor_user_id AS actorUserId,
           actor_admin_username AS actorAdminUsername,
           action, target_type AS targetType, target_id AS targetId,
           metadata_json AS metadataJson, before_json AS beforeJson,
           after_json AS afterJson, result, error_json AS errorJson,
           request_id AS requestId, created_at AS createdAt
    FROM fantasy_audit_log
    ${action ? "WHERE action LIKE ?" : ""}
    ORDER BY created_at DESC LIMIT ?
  `, action ? [`%${escapeLike(action)}%`, queryLimit(request, 300)] : [queryLimit(request, 300)]);
  return success({ audit: rows.map(decodeJsonFields) });
}

async function adminErrorLog(request, env) {
  const rows = await dbAll(env, `
    SELECT id, request_id AS requestId, route, method, actor,
           error_name AS errorName, error_message AS errorMessage,
           details_json AS detailsJson, created_at AS createdAt
    FROM fantasy_error_log
    ORDER BY created_at DESC LIMIT ?
  `, [queryLimit(request, 300)]);
  return success({ errors: rows.map(decodeJsonFields) });
}

async function adminListBackups(request, env) {
  const rows = await dbAll(env, `
    SELECT id, reason, schema_version AS schemaVersion,
           data_hash AS dataHash, created_by AS createdBy,
           created_at AS createdAt, LENGTH(data_json) AS bytes
    FROM fantasy_backups ORDER BY created_at DESC LIMIT ?
  `, [queryLimit(request, 100)]);
  return success({ backups: rows });
}

async function adminCreateBackup(request, env, requestId, auth) {
  const body = await readJson(request);
  const reason = clean(body.reason) || "Backup manual";
  const id = await createBackupRecord(env, auth.username, reason);
  const backup = await env.DB.prepare(`
    SELECT id, reason, schema_version AS schemaVersion,
           data_hash AS dataHash, created_by AS createdBy,
           created_at AS createdAt, LENGTH(data_json) AS bytes
    FROM fantasy_backups WHERE id = ?
  `).bind(id).first();
  await audit(env, {
    actor: auth.username,
    action: "backup.create",
    targetType: "backup",
    targetId: id,
    after: backup,
    requestId
  });
  return success({ backup });
}

async function adminDownloadBackup(request, env) {
  const id = decodePathId(request, "/api/fantasy/admin/backups/");
  const row = await env.DB.prepare(`
    SELECT id, data_json AS dataJson FROM fantasy_backups WHERE id = ?
  `).bind(id).first();
  if (!row) return failure("BACKUP_NOT_FOUND", "Backup não encontrado.", 404);
  const headers = securityHeaders("application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Disposition", `attachment; filename="fantasy-rk-backup-${safeFilename(id)}.json"`);
  return new Response(row.dataJson, { status: 200, headers });
}

async function adminRestoreBackupPreview(request, env) {
  const body = await readJson(request);
  const backup = await validatedBackup(env, clean(body.backupId));
  if (backup.error) return backup.error;
  const currentCounts = {};
  const backupCounts = {};
  for (const table of RESTORE_TABLES) {
    currentCounts[table] = Number(
      (await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first())?.count || 0
    );
    backupCounts[table] = backup.data.tables[table].length;
  }
  const market = await getGlobalMarketState(env);
  return success({
    backup: backup.meta,
    currentCounts,
    backupCounts,
    market: publicMarketState(market),
    requiresClosedMarket: true,
    confirmation: backup.meta.id,
    warning: "A restauração substitui os dados das tabelas listadas e força o mercado global a permanecer fechado."
  });
}

async function adminRestoreBackupApply(request, env, requestId, auth) {
  const body = await readJson(request);
  const backupId = clean(body.backupId);
  if (!backupId || clean(body.confirmBackupId) !== backupId) {
    return failure(
      "RESTORE_CONFIRMATION_REQUIRED",
      "Digite o identificador completo do backup para confirmar a restauração.",
      400
    );
  }
  const market = await getGlobalMarketState(env);
  if (market?.status !== "closed") {
    return failure("MARKET_MUST_BE_CLOSED", "Feche o mercado global antes de restaurar um backup.", 409);
  }
  const backup = await validatedBackup(env, backupId);
  if (backup.error) return backup.error;
  const safetyBackupId = await createBackupRecord(
    env,
    auth.username,
    `Backup automático antes de restaurar ${backupId}`
  );
  const statements = [];
  for (const table of [...RESTORE_TABLES].reverse()) {
    statements.push(env.DB.prepare(`DELETE FROM ${table}`));
  }
  for (const table of RESTORE_TABLES) {
    for (const row of backup.data.tables[table]) {
      const columns = Object.keys(row);
      if (!columns.length || columns.some((column) => !/^[a-z_][a-z0-9_]*$/i.test(column))) {
        return failure("BACKUP_COLUMNS_INVALID", `Colunas inválidas no backup para ${table}.`, 400);
      }
      const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      statements.push(env.DB.prepare(`
        INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})
      `).bind(...columns.map((column) => row[column] === undefined ? null : row[column])));
    }
  }
  if (statements.length > 5000) {
    return failure(
      "BACKUP_TOO_LARGE",
      "O backup excede o limite seguro de restauração pelo painel. Use o procedimento D1 documentado.",
      413,
      { statements: statements.length, safetyBackupId }
    );
  }
  const now = new Date().toISOString();
  statements.push(
    env.DB.prepare(`
      UPDATE fantasy_market_state
      SET status = 'closed', closes_at = NULL, closed_at = ?,
          closed_by = ?, close_reason = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(now, auth.username, `Restauração segura do backup ${backupId}`, GLOBAL_MARKET_ID),
    env.DB.prepare(`
      UPDATE fantasy_rounds SET status = 'locked'
      WHERE status = 'open'
    `)
  );
  await env.DB.batch(statements);
  await audit(env, {
    actor: auth.username,
    action: "backup.restore",
    targetType: "backup",
    targetId: backupId,
    before: { safetyBackupId },
    after: {
      restoredTables: RESTORE_TABLES.length,
      restoredRows: RESTORE_TABLES.reduce(
        (sum, table) => sum + backup.data.tables[table].length,
        0
      ),
      marketStatus: "closed"
    },
    requestId
  });
  return success({
    restoredBackupId: backupId,
    safetyBackupId,
    restoredTables: RESTORE_TABLES.length,
    market: publicMarketState(await getGlobalMarketState(env))
  });
}

async function validatedBackup(env, id) {
  if (!id) {
    return { error: failure("BACKUP_ID_REQUIRED", "Informe o backup.", 400) };
  }
  const row = await env.DB.prepare(`
    SELECT id, reason, schema_version AS schemaVersion,
           data_hash AS dataHash, data_json AS dataJson,
           created_by AS createdBy, created_at AS createdAt
    FROM fantasy_backups WHERE id = ?
  `).bind(id).first();
  if (!row) return { error: failure("BACKUP_NOT_FOUND", "Backup não encontrado.", 404) };
  if (!timingSafeEqual(await sha256(row.dataJson), row.dataHash)) {
    return { error: failure("BACKUP_HASH_INVALID", "A integridade do backup não confere.", 409) };
  }
  const data = safeJson(row.dataJson, null);
  if (data?.format !== "fantasy-rk-d1-json-backup-v1" || !data.tables) {
    return { error: failure("BACKUP_FORMAT_INVALID", "Formato de backup não reconhecido.", 400) };
  }
  const missingTables = RESTORE_TABLES.filter((table) => !Array.isArray(data.tables[table]));
  if (missingTables.length) {
    return {
      error: failure("BACKUP_INCOMPLETE", "O backup não contém todas as tabelas necessárias.", 400, {
        missingTables
      })
    };
  }
  const currentSchema = String(
    (await env.DB.prepare("SELECT MAX(id) AS version FROM d1_migrations").first())?.version || "unknown"
  );
  if (String(row.schemaVersion) !== currentSchema) {
    return {
      error: failure(
        "BACKUP_SCHEMA_MISMATCH",
        "A restauração pelo painel exige a mesma versão de esquema.",
        409,
        { backupSchema: row.schemaVersion, currentSchema }
      )
    };
  }
  return {
    meta: {
      id: row.id,
      reason: row.reason,
      schemaVersion: row.schemaVersion,
      dataHash: row.dataHash,
      createdBy: row.createdBy,
      createdAt: row.createdAt
    },
    data
  };
}

async function createBackupRecord(env, actor, reason) {
  if (typeof env.__maintenanceBackup === "function") {
    const maintenanceBackupId = clean(await env.__maintenanceBackup({ actor, reason }));
    if (!maintenanceBackupId) throw new Error("O backup externo de manutenção não foi confirmado.");
    return maintenanceBackupId;
  }
  const data = {
    format: "fantasy-rk-d1-json-backup-v1",
    createdAt: new Date().toISOString(),
    timezone: TIMEZONE,
    tables: {}
  };
  for (const table of BACKUP_TABLES) {
    data.tables[table] = await dbAll(env, `SELECT * FROM ${table}`);
  }
  const dataJson = JSON.stringify(data);
  const dataHash = await sha256(dataJson);
  const schemaVersion = String(
    (await env.DB.prepare("SELECT MAX(id) AS version FROM d1_migrations").first())?.version || "unknown"
  );
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO fantasy_backups
      (id, reason, schema_version, data_hash, data_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, clean(reason).slice(0, 500), schemaVersion, dataHash, dataJson, actor).run();
  return id;
}

async function audit(env, {
  actor = "system",
  action,
  targetType,
  targetId,
  before = {},
  after = {},
  metadata = {},
  result = "success",
  error = {},
  requestId = null
}) {
  await env.DB.prepare(`
    INSERT INTO fantasy_audit_log
      (id, actor_user_id, action, target_type, target_id, metadata_json,
       actor_admin_username, before_json, after_json, result, error_json, request_id)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    clean(action),
    clean(targetType),
    clean(targetId),
    JSON.stringify(metadata || {}),
    clean(actor) || "system",
    JSON.stringify(before || {}),
    JSON.stringify(after || {}),
    clean(result) || "success",
    JSON.stringify(error || {}),
    requestId ? clean(requestId) : null
  ).run();
}

async function marketPriceFingerprint(env) {
  return hashObject(await marketPriceState(env));
}

async function marketPriceState(env) {
  return dbAll(env, `
    SELECT division, asset_id AS assetId, price_cents AS priceCents,
           previous_price_cents AS previousPriceCents
    FROM fantasy_market ORDER BY division, asset_id
  `);
}

function changedExistingPrices(before, after) {
  const afterMap = new Map(
    after.map((row) => [`${row.division}:${row.assetId}`, row])
  );
  return before.filter((row) => {
    const current = afterMap.get(`${row.division}:${row.assetId}`);
    return !current ||
      Number(current.priceCents) !== Number(row.priceCents) ||
      Number(current.previousPriceCents) !== Number(row.previousPriceCents);
  }).map((row) => `${row.division}:${row.assetId}`);
}

async function dbAll(env, sql, bindings = []) {
  let statement = env.DB.prepare(sql);
  if (bindings.length) statement = statement.bind(...bindings);
  const result = await statement.all();
  return result.results || [];
}

function success(data = {}, status = 200) {
  const response = new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: securityHeaders("application/json; charset=utf-8")
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function failure(code, message, status = 400, details = undefined) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  const response = new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: securityHeaders("application/json; charset=utf-8")
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function securityHeaders(contentType) {
  const headers = new Headers({ "Content-Type": contentType });
  addSecurityHeaders(headers);
  return headers;
}

function addSecurityHeaders(headers) {
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function requireSameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (origin && origin !== url.origin) {
    throw new HttpError(403, "Origem não autorizada.");
  }
  if (!origin && fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new HttpError(403, "Origem não autorizada.");
  }
}

function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new HttpError(503, `Configuração ausente: ${missing.join(", ")}.`);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}

async function adminIpHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";
  const salt = clean(env.ADMIN_RATE_LIMIT_SALT) || String(env.ADMIN_PASSWORD_HASH || "fantasy-rk");
  return sha256(`${salt}:${ip}`);
}

async function verifyPassword(password, encoded) {
  try {
    const [algorithm, iterationsText, saltText, hashText] = String(encoded).split("$");
    const iterations = Number(iterationsText);
    if (
      algorithm !== "pbkdf2_sha256" ||
      !Number.isInteger(iterations) ||
      iterations < 100000 ||
      iterations > 2000000
    ) {
      return false;
    }
    const salt = decodeBase64(saltText);
    const expected = decodeBase64(hashText);
    if (expected.length < 32) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(password)),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const actual = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      expected.length * 8
    ));
    return timingSafeBytes(actual, expected);
  } catch {
    return false;
  }
}

function decodeBase64(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function timingSafeBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  return timingSafeBytes(a, b);
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashObject(value) {
  return sha256(stableStringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function adminCookie(value, maxAge) {
  return [
    `${ADMIN_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.trunc(Number(maxAge) || 0))}`
  ].join("; ");
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[key] = "";
    }
  }
  return cookies;
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function arrayValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => {
      if (item && typeof item === "object" && !Array.isArray(item) && !item.slot) {
        return { slot: key, ...item };
      }
      return item;
    });
  }
  return [];
}

function isoDate(value) {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function timestampMillis(value) {
  const source = clean(value);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(source)
    ? `${source.replace(" ", "T")}Z`
    : source;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function normalizeAssetPath(value) {
  return clean(value).replace(/\\/g, "/").replace(/^\/+/, "");
}

function validMatchStatus(value) {
  const status = clean(value || "scheduled").toLowerCase();
  return ["scheduled", "live", "completed", "postponed", "cancelled"].includes(status)
    ? status
    : "scheduled";
}

function nullableInteger(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeRoundEligibility(value) {
  const allowed = new Set(["playing", "qualified-next-round", "eliminated"]);
  const teamStatuses = {};
  for (const [rawSlot, rawStatus] of Object.entries(value?.teamStatuses || {})) {
    const slot = clean(rawSlot).toUpperCase();
    const status = clean(rawStatus).toLowerCase();
    if (/^[ABCD][1-4]$/.test(slot) && allowed.has(status)) teamStatuses[slot] = status;
  }
  return { teamStatuses };
}

function optionalDivision(value) {
  if (value === null || value === undefined || clean(value) === "" || value === "all") return null;
  return requiredDivision(value);
}

function requiredDivision(value) {
  const division = clean(value).toLowerCase();
  if (!DIVISIONS.includes(division)) throw new HttpError(400, "Divisão inválida.");
  return division;
}

function optionalPositiveInteger(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const number = Math.trunc(Number(value));
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, "Número inválido.");
  return number;
}

function queryLimit(request, maximum) {
  const value = Math.trunc(Number(new URL(request.url).searchParams.get("limit")));
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : Math.min(100, maximum);
}

function decodePathId(request, prefix) {
  const encoded = new URL(request.url).pathname.slice(prefix.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new HttpError(400, "Identificador inválido.");
  }
}

function decodeJsonFields(row) {
  const output = { ...row };
  for (const key of Object.keys(output)) {
    if (!key.endsWith("Json")) continue;
    const decodedKey = key.slice(0, -4);
    output[decodedKey] = safeJson(output[key], output[key]);
    delete output[key];
  }
  return output;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toBooleanInteger(value) {
  if (value === true || value === 1 || value === "1" || value === "true") return 1;
  return 0;
}

function finiteBetween(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new HttpError(400, `Valor fora do intervalo permitido (${minimum} a ${maximum}).`);
  }
  return number;
}

function escapeLike(value) {
  return String(value).replace(/[%_]/g, (match) => `\\${match}`);
}

function safeFilename(value) {
  return clean(value).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (Number(value) - mean) ** 2)));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function initialPrice(id, role) {
  if (PLAYER_ROLES.includes(clean(role).toUpperCase())) return 12;
  let hash = 2166136261;
  for (const character of `${id}:${role}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const base = { TOP: 11, JG: 12, MID: 13, ADC: 13, SUP: 10, TEAM: 9 }[role] || 10;
  return roundMoney(base + Math.abs(hash >>> 0) % 800 / 100);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const __test = {
  LOCK_MINUTES,
  TIMEZONE,
  adminRoundPreviewV2,
  adminRoundProcessV2,
  adminOpenMarket,
  adminSyncApply,
  adminSyncPreview,
  adminValuationApply,
  adminValuationReview,
  adminValuationRollback,
  adminValuationSimulate,
  adminCookie,
  arrayValues,
  calculateValuation,
  decodeBase64,
  hashObject,
  initialPrice,
  ensureDraftSnapshotsForRound,
  mergeLiveOfficialContent,
  normalizeFormulaV2Round,
  normalizeOfficialSource,
  normalizeRoundStats,
  normalizeRiotIdentity,
  normalizedWeights,
  publicMarketState,
  resolveMarketWindow,
  stableStringify,
  timestampMillis,
  timingSafeEqual,
  validateFormulaSettings,
  valuationItem,
  valuationSummary,
  verifyPassword
};
