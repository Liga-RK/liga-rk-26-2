// worker/fantasy-worker.js
import {
  closeMarketFromDiscordAdmin,
  ensureAutomaticMarketClose,
  getGlobalMarketState,
  handleAdminRequest,
  openMarketFromDiscordAdmin,
  publicMarketState,
  recordError,
  setMarketAccessFromDiscordAdmin,
  serveAdminAsset
} from "./fantasy-admin.js";
import valuationV3 from "../src/fantasy/valuation-v3.cjs";
import patrimonyV2 from "../src/fantasy/patrimony-v2.cjs";
import draftPrediction from "../src/fantasy/draft-prediction.cjs";
import championCatalog from "../src/fantasy/champion-catalog.cjs";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var COOKIE_NAME = "fantasy_session";
var OAUTH_STATE_COOKIE = "fantasy_oauth_state";
var ADMIN_COOKIE_NAME = "fantasy_admin_session";
var SESSION_DAYS = 30;
var ADMIN_SESSION_HOURS = 8;
var ADMIN_LOGIN_WINDOW_MINUTES = 15;
var ADMIN_LOGIN_MAX_FAILURES = 5;
var ADMIN_BLOCK_MINUTES = 30;
var MARKET_LOCK_MINUTES = 25;
var MARKET_STATE_ID = "global";
var MARKET_TIMEZONE = "America/Sao_Paulo";
var DIVISIONS = ["elite", "ascension"];
var ROLES = ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"];
var PLAYER_ROLES = ROLES.filter((role) => role !== "TEAM");
var INITIAL_PATRIMONY = patrimonyV2.PATRIMONY_CONFIG.initialPatrimony;
var PATRIMONY_FORMULA_ID = patrimonyV2.PATRIMONY_FORMULA_ID;
var summarizeParticipantPatrimony = patrimonyV2.summarizeParticipantPatrimony;
var BUDGET_LIMIT = INITIAL_PATRIMONY;
var MAX_PLAYERS_PER_REAL_TEAM = 2;
var DRAFT_PREDICTION_CONFIG = draftPrediction.DRAFT_PREDICTION_CONFIG;
var lockDraftPrediction = draftPrediction.lockDraftPrediction;
var CHAMPION_CATALOG = championCatalog.CHAMPION_CATALOG;
var ROUND_TWO_NOTICE = Object.freeze({
  key: "round2-elite-fvl-sdk-postponed-v1",
  title: "Aviso sobre a Rodada 2",
  message: "A partida Favelão do Techy (FVL) x Space Ducks (SDK), válida pela Rodada 2 da Elite, foi adiada após o fechamento do mercado. Por isso, os atletas das duas equipes não pontuarão na Rodada 2. Quando houver um reserva válido, ele substituirá automaticamente um dos titulares que não atuou, conforme as regras do Fantasy. A Rodada 3 seguirá normalmente, sem contabilizar essa partida adiada."
});
var fantasy_worker_default = {
  async fetch(request, env) {
    const requestId = request.headers.get("CF-Ray") || crypto.randomUUID();
    try {
      return await route(request, env, requestId);
    } catch (error) {
      console.error("Fantasy RK Worker", error);
      const explicitStatus = Number(error?.status);
      const status = Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus < 600
        ? explicitStatus
        : error instanceof HttpError ? error.status : 500;
      const message = status < 500 ? String(error?.message || "Requisição inválida.") : "Erro interno do Fantasy RK.";
      await recordError(env, request, requestId, error).catch(() => {});
      return json({ error: message, requestId }, status, request, env);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(ensureAutomaticMarketClose(env, new Date(controller.scheduledTime || Date.now()), "cron"));
  }
};
async function route(request, env, requestId) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request, env);
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ service: "fantasy-rk", status: "ok", time: new Date().toISOString() }, 200, request, env);
  }
  if ((url.pathname === "/admin" || url.pathname === "/admin/") && request.method === "GET") {
    return serveAdminAsset(request, env, "/admin/index.html");
  }
  if (url.pathname.startsWith("/admin/") && request.method === "GET") {
    return serveAdminAsset(request, env, url.pathname);
  }
  if (url.pathname === "/api/fantasy/auth/login" && request.method === "GET") return authLogin(request, env);
  if (url.pathname === "/api/fantasy/auth/callback" && request.method === "GET") return authCallback(request, env);
  if (url.pathname === "/api/fantasy/auth/exchange" && request.method === "POST") return authExchange(request, env);
  if (url.pathname === "/api/fantasy/auth/logout" && request.method === "POST") return authLogout(request, env);
  if (url.pathname === "/api/fantasy/me" && request.method === "GET") return getMe(request, env);
  if (url.pathname === "/api/fantasy/config" && request.method === "GET") return getConfig(request, env);
  if (url.pathname === "/api/fantasy/market" && request.method === "GET") return getMarket(request, env);
  if (url.pathname === "/api/fantasy/draft" && request.method === "GET") return getDraftPredictionData(request, env);
  if (url.pathname === "/api/fantasy/market/control/open" && request.method === "POST") {
    return controlMarketFromDiscord(request, env, requestId, "open");
  }
  if (url.pathname === "/api/fantasy/market/control/close" && request.method === "POST") {
    return controlMarketFromDiscord(request, env, requestId, "close");
  }
  if (url.pathname === "/api/fantasy/market/control/access" && request.method === "POST") {
    return controlMarketFromDiscord(request, env, requestId, "access");
  }
  if (url.pathname === "/api/fantasy/notices/round-2-postponement" && request.method === "GET") {
    return getRoundTwoPostponementNotice(request, env);
  }
  if (url.pathname === "/api/fantasy/notices/round-2-postponement/ack" && request.method === "POST") {
    return acknowledgeRoundTwoPostponementNotice(request, env);
  }
  if (url.pathname === "/api/fantasy/popular" && request.method === "GET") return getPopularPicks(request, env);
  if (url.pathname === "/api/fantasy/lineups/current" && request.method === "GET") return getCurrentLineup(request, env);
  if (url.pathname === "/api/fantasy/lineups/current" && request.method === "PUT") return saveCurrentLineup(request, env);
  if (url.pathname === "/api/fantasy/ranking" && request.method === "GET") return getRanking(request, env);
  if (url.pathname === "/api/fantasy/rounds" && request.method === "GET") return listRounds(request, env);
  if (url.pathname === "/api/fantasy/scores/me" && request.method === "GET") return getMyScores(request, env);
  if (url.pathname === "/api/fantasy/history/me" && request.method === "GET") return getMyHistory(request, env);
  if (url.pathname.startsWith("/api/fantasy/admin/")) {
    return handleAdminRequest(request, env, requestId);
  }
  if (env.ASSETS && request.method === "GET" && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  return json({ error: "Rota n\xE3o encontrada." }, 404, request, env);
}
__name(route, "route");
async function authLogin(request, env) {
  requireEnv(env, ["DISCORD_CLIENT_ID", "DISCORD_REDIRECT_URI"]);
  const state = randomToken(24);
  const discord = new URL("https://discord.com/oauth2/authorize");
  discord.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  discord.searchParams.set("response_type", "code");
  discord.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
  discord.searchParams.set("scope", "identify");
  discord.searchParams.set("state", state);
  const headers = new Headers({ Location: discord.toString() });
  headers.append("Set-Cookie", cookie(OAUTH_STATE_COOKIE, state, { maxAge: 600, httpOnly: true }));
  return new Response(null, { status: 302, headers });
}
__name(authLogin, "authLogin");
async function authCallback(request, env) {
  requireEnv(env, ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "SITE_URL"]);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("Cookie"));
  if (!code || !state || !timingSafeEqual(state, cookies[OAUTH_STATE_COOKIE] || "")) {
    return redirectWithError(env, "Falha ao validar o login do Discord.");
  }
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI
    })
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) return redirectWithError(env, "O Discord recusou o login.");
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const discordUser = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !discordUser.id) return redirectWithError(env, "N\xE3o foi poss\xEDvel consultar seu perfil do Discord.");
  const userId = `discord:${discordUser.id}`;
  const avatarUrl = discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128` : "";
  await env.DB.prepare(`
    INSERT INTO fantasy_users (id, discord_id, username, avatar_url, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, avatar_url=excluded.avatar_url, updated_at=CURRENT_TIMESTAMP
  `).bind(userId, String(discordUser.id), String(discordUser.global_name || discordUser.username || "Jogador RK"), avatarUrl).run();
  await Promise.all(DIVISIONS.map((division) => ensureParticipantPatrimony(env, userId, division)));
  const account = await env.DB.prepare(`
    SELECT blocked, blocked_reason AS blockedReason FROM fantasy_users WHERE id = ?
  `).bind(userId).first();
  if (Number(account?.blocked) === 1) {
    return redirectWithError(env, account.blockedReason || "Sua conta está bloqueada no Fantasy.");
  }
  const sessionToken2 = randomToken(40);
  const tokenHash = await sha256(sessionToken2);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO fantasy_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, userId, expiresAt).run();
  const loginCode = randomToken(32);
  const loginCodeHash = await sha256(loginCode);
  const loginCodeExpiresAt = new Date(Date.now() + 2 * 6e4).toISOString();
  await env.DB.prepare("DELETE FROM fantasy_login_codes WHERE expires_at <= ?").bind((/* @__PURE__ */ new Date()).toISOString()).run();
  await env.DB.prepare("INSERT INTO fantasy_login_codes (code_hash, session_token, expires_at) VALUES (?, ?, ?)").bind(loginCodeHash, sessionToken2, loginCodeExpiresAt).run();
  const target = siteEntryUrl(env);
  target.searchParams.set("view", "market");
  target.hash = new URLSearchParams({ loginCode }).toString();
  const headers = new Headers({ Location: target.toString() });
  headers.append("Set-Cookie", cookie(OAUTH_STATE_COOKIE, "", { maxAge: 0, httpOnly: true }));
  headers.append("Set-Cookie", cookie(COOKIE_NAME, sessionToken2, { maxAge: SESSION_DAYS * 86400, httpOnly: true, sameSite: "Lax" }));
  return new Response(null, { status: 302, headers });
}
__name(authCallback, "authCallback");
async function authExchange(request, env) {
  const body = await readJson(request);
  const code = cleanText(body.code);
  if (!code || code.length > 256) return json({ error: "C\xF3digo de login inv\xE1lido." }, 400, request, env);
  const codeHash = await sha256(code);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const row = await env.DB.prepare("SELECT session_token AS sessionToken, expires_at AS expiresAt FROM fantasy_login_codes WHERE code_hash = ?").bind(codeHash).first();
  await env.DB.prepare("DELETE FROM fantasy_login_codes WHERE code_hash = ? OR expires_at <= ?").bind(codeHash, now).run();
  if (!row || row.expiresAt <= now) return json({ error: "Este login expirou. Entre novamente pelo Discord." }, 401, request, env);
  return json({ token: row.sessionToken, expiresAt: row.expiresAt }, 200, request, env);
}
__name(authExchange, "authExchange");
async function authLogout(request, env) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare("DELETE FROM fantasy_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  const response = json({ ok: true }, 200, request, env);
  response.headers.append("Set-Cookie", cookie(COOKIE_NAME, "", { maxAge: 0, httpOnly: true, sameSite: "Lax" }));
  return response;
}
__name(authLogout, "authLogout");
async function getMe(request, env) {
  const user = await optionalUser(request, env);
  const patrimony = user ? await participantPatrimonyProfiles(env, user.id) : null;
  return json({
    authenticated: Boolean(user),
    user,
    patrimony,
    isAdmin: user ? adminIds(env).has(String(user.discordId)) : false,
    canControlMarket: user ? marketControlIds(env).has(String(user.discordId)) : false
  }, 200, request, env);
}
__name(getMe, "getMe");
async function getRoundTwoPostponementNotice(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const status = await roundTwoNoticeStatus(env, user.id);
  return json({
    notice: ROUND_TWO_NOTICE,
    eligible: status.eligible,
    acknowledged: status.acknowledged,
    acknowledgedAt: status.acknowledgedAt,
    showPopup: status.eligible && !status.acknowledged
  }, 200, request, env);
}
__name(getRoundTwoPostponementNotice, "getRoundTwoPostponementNotice");
async function acknowledgeRoundTwoPostponementNotice(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const status = await roundTwoNoticeStatus(env, user.id);
  if (!status.eligible) {
    return json({ error: "Este aviso é destinado aos participantes que escalaram na Rodada 2." }, 403, request, env);
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO fantasy_user_notices
      (user_id, notice_key, acknowledged_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).bind(user.id, ROUND_TWO_NOTICE.key).run();
  const acknowledgment = await env.DB.prepare(`
    SELECT acknowledged_at AS acknowledgedAt
    FROM fantasy_user_notices
    WHERE user_id = ? AND notice_key = ?
  `).bind(user.id, ROUND_TWO_NOTICE.key).first();
  return json({
    noticeKey: ROUND_TWO_NOTICE.key,
    acknowledged: true,
    acknowledgedAt: acknowledgment?.acknowledgedAt || null
  }, 200, request, env);
}
__name(acknowledgeRoundTwoPostponementNotice, "acknowledgeRoundTwoPostponementNotice");
async function roundTwoNoticeStatus(env, userId) {
  const eligibility = await env.DB.prepare(`
    SELECT EXISTS (
      SELECT 1
      FROM fantasy_lineups l
      JOIN fantasy_teams t ON t.id = l.fantasy_team_id
      JOIN fantasy_rounds r ON r.id = l.round_id
      WHERE t.user_id = ? AND r.round_number = 2
      LIMIT 1
    ) AS eligible
  `).bind(userId).first();
  const acknowledgment = await env.DB.prepare(`
    SELECT acknowledged_at AS acknowledgedAt
    FROM fantasy_user_notices
    WHERE user_id = ? AND notice_key = ?
  `).bind(userId, ROUND_TWO_NOTICE.key).first();
  return {
    eligible: Boolean(Number(eligibility?.eligible)),
    acknowledged: Boolean(acknowledgment),
    acknowledgedAt: acknowledgment?.acknowledgedAt || null
  };
}
__name(roundTwoNoticeStatus, "roundTwoNoticeStatus");
async function controlMarketFromDiscord(request, env, requestId, action) {
  const origin = request.headers.get("Origin") || "";
  if (!origin || !allowedOrigins(request, env).has(origin)) {
    return json({ error: "Origem não autorizada para controlar o mercado." }, 403, request, env);
  }
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  if (!marketControlIds(env).has(String(user.discordId))) {
    return json({ error: "Somente o administrador autorizado pode controlar o mercado." }, 403, request, env);
  }
  const actor = `${cleanText(user.username) || "Administrador Discord"} (${user.discordId})`;
  const response = action === "open"
    ? await openMarketFromDiscordAdmin(request, env, requestId, actor)
    : action === "close"
      ? await closeMarketFromDiscordAdmin(request, env, requestId, actor)
      : await setMarketAccessFromDiscordAdmin(request, env, requestId, actor);
  return cors(response, request, env);
}
__name(controlMarketFromDiscord, "controlMarketFromDiscord");
async function listRounds(request, env) {
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  const rows = await env.DB.prepare("SELECT id, round_number AS roundNumber, name, opens_at AS opensAt, locks_at AS locksAt, status, formula_version AS formulaVersion FROM fantasy_rounds WHERE division = ? ORDER BY round_number DESC").bind(division).all();
  return json({ division, rounds: rows.results || [] }, 200, request, env);
}
__name(listRounds, "listRounds");
async function getMyScores(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  const rows = await env.DB.prepare("SELECT r.id AS roundId, r.name, s.points, s.breakdown_json AS breakdown FROM fantasy_teams t JOIN fantasy_team_round_scores s ON s.fantasy_team_id=t.id JOIN fantasy_rounds r ON r.id=s.round_id WHERE t.user_id=? AND t.division=? ORDER BY r.round_number DESC").bind(user.id, division).all();
  return json({ division, scores: (rows.results || []).map((row) => ({ ...row, breakdown: JSON.parse(row.breakdown || "[]") })) }, 200, request, env);
}
__name(getMyScores, "getMyScores");
async function getMyHistory(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const profiles = await participantPatrimonyProfiles(env, user.id);
  const rows = await env.DB.prepare(`
    SELECT h.id, h.round_id AS roundId, r.round_number AS roundNumber, r.name,
           h.division, h.previous_cents AS previousCents, h.new_cents AS newCents,
           h.variation_cents AS variationCents,
           h.available_balance_cents AS availableBalanceCents,
           h.updated_assets_cents AS assetsValueCents,
           h.consistency_difference_cents AS consistencyDifferenceCents,
           h.status, h.processed_at AS calculatedAt
    FROM fantasy_patrimony_history h
    JOIN fantasy_rounds r ON r.id = h.round_id
    WHERE h.user_id = ?
    ORDER BY h.processed_at DESC
  `).bind(user.id).all();
  const history = rows.results || [];
  return json({
    profiles,
    history
  }, 200, request, env);
}
__name(getMyHistory, "getMyHistory");
async function getConfig(request, env) {
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  await ensureAutomaticMarketClose(env, new Date(), "request");
  const marketState = await getGlobalMarketState(env);
  const user = await optionalUser(request, env);
  const visibleMarketState = marketStateForUser(marketState, user, env);
  const round = await currentRound(env, division, marketState?.lock_round_number);
  const compatibleRound = round ? {
    ...round,
    status: visibleMarketState.status === "open" ? "open" : "locked",
    opens_at: marketState?.opened_at || round.opens_at,
    locks_at: marketState?.closes_at || round.locks_at
  } : null;
  const patrimony = user ? await participantPatrimonyProfile(env, user.id, division) : null;
  const budget = patrimony ? Number(patrimony.currentCents) / 100 : INITIAL_PATRIMONY;
  return json({
    division,
    round: compatibleRound,
    market: visibleMarketState,
    patrimony,
    rules: { budget, initialPatrimony: INITIAL_PATRIMONY, patrimonyFormulaVersion: PATRIMONY_FORMULA_ID, maxPlayersPerRealTeam: 2, captainMultiplier: 1.5, requiredRoles: ROLES }
  }, 200, request, env);
}
__name(getConfig, "getConfig");
async function getDraftPredictionData(request, env) {
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  const marketState = await getGlobalMarketState(env);
  const round = await currentRound(env, division, marketState?.lock_round_number);
  const roundNumber = Math.trunc(Number(round?.round_number || 0));
  if (!round || roundNumber < DRAFT_PREDICTION_CONFIG.enabledFromRound) {
    return json({
      division,
      enabled: false,
      enabledFromRound: DRAFT_PREDICTION_CONFIG.enabledFromRound,
      roundNumber,
      champions: []
    }, 200, request, env);
  }
  const snapshotRow = await env.DB.prepare(`
    SELECT round_id AS roundId, generated_from_rounds_json AS generatedFromRoundsJson,
           generated_at AS generatedAt, source_hash AS sourceHash, totals_json AS totalsJson,
           position_pick_rates_json AS positionPickRatesJson
    FROM fantasy_draft_pick_rate_snapshots
    WHERE round_id = ? AND division = ?
  `).bind(round.id, division).first();
  if (!snapshotRow) {
    return json({ error: "O snapshot congelado do Pick Rate ainda não foi gerado para esta rodada." }, 503, request, env);
  }
  const matches = await env.DB.prepare(`
    SELECT home_team_slot AS homeTeamSlot, away_team_slot AS awayTeamSlot,
           source_payload_json AS sourcePayloadJson
    FROM fantasy_matches
    WHERE division = ? AND round_number = ?
      AND status NOT IN ('cancelled', 'postponed')
  `).bind(division, roundNumber).all();
  const teamSeriesFormats = {};
  for (const match of matches.results || []) {
    const payload = parseJsonObject(match.sourcePayloadJson);
    const format = String(payload.format || (/semi|final/i.test(String(payload.stage || "")) ? "MD5" : "MD3")).toUpperCase() === "MD5"
      ? "MD5"
      : "MD3";
    if (match.homeTeamSlot) teamSeriesFormats[match.homeTeamSlot] = format;
    if (match.awayTeamSlot) teamSeriesFormats[match.awayTeamSlot] = format;
  }
  return json({
    division,
    enabled: true,
    enabledFromRound: DRAFT_PREDICTION_CONFIG.enabledFromRound,
    roundNumber,
    config: DRAFT_PREDICTION_CONFIG,
    snapshot: {
      roundId: snapshotRow.roundId,
      generatedFromRounds: JSON.parse(snapshotRow.generatedFromRoundsJson || "[]"),
      generatedAt: snapshotRow.generatedAt,
      sourceHash: snapshotRow.sourceHash,
      totals: JSON.parse(snapshotRow.totalsJson || "{}"),
      positionPickRates: JSON.parse(snapshotRow.positionPickRatesJson || "{}")
    },
    champions: CHAMPION_CATALOG,
    teamSeriesFormats
  }, 200, request, env);
}
__name(getDraftPredictionData, "getDraftPredictionData");
async function getMarket(request, env) {
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  await ensureAutomaticMarketClose(env, new Date(), "request");
  const marketState = await getGlobalMarketState(env);
  const user = await optionalUser(request, env);
  const round = await currentRound(env, division, marketState?.lock_round_number);
  const result = await env.DB.prepare(`
    SELECT asset_id AS id, asset_type AS type, role, display_name AS name, team_slot AS teamSlot,
           team_name AS teamName, team_tag AS teamTag, logo, price, previous_price AS previousPrice,
           average_points AS average,
           last_score_breakdown_json AS scoreDetailsJson,
           last_valuation_breakdown_json AS valuationDetailsJson
    FROM fantasy_market WHERE division = ? AND active = 1 ORDER BY role, price DESC, display_name
  `).bind(division).all();
  const latestScoredRound = await env.DB.prepare(`
    SELECT MAX(round_number) AS roundNumber
    FROM fantasy_rounds
    WHERE division = ? AND status = 'scored'
  `).bind(division).first();
  const roundMatchesResult = round ? await env.DB.prepare(`
    SELECT home_team_slot AS homeTeamSlot, away_team_slot AS awayTeamSlot,
           home_team_name AS homeTeamName, away_team_name AS awayTeamName
    FROM fantasy_matches
    WHERE division = ? AND round_number = ?
      AND status NOT IN ('cancelled', 'postponed')
    ORDER BY order_index, starts_at
  `).bind(division, round.round_number).all() : { results: [] };
  const performanceRoundNumber = Math.max(
    0,
    Math.trunc(Number(
      latestScoredRound?.roundNumber
      || (Number(round?.round_number || marketState?.lock_round_number || 0) - 1)
    ))
  );
  const recentResult = await env.DB.prepare(`
    SELECT s.asset_id AS id, ROUND(s.points, 2) AS points
    FROM fantasy_asset_round_scores s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE s.division = ? AND r.round_number = ? AND s.games > 0
    ORDER BY s.created_at DESC
  `).bind(division, performanceRoundNumber).all();
  const recent = /* @__PURE__ */ new Map();
  for (const row of recentResult.results || []) {
    const id = String(row.id);
    if (!recent.has(id)) recent.set(id, [roundMoney(row.points)]);
  }
  const marketRows = result.results || [];
  const roundMatches = roundMatchesResult.results || [];
  const matchups = buildRoundMatchups(marketRows, roundMatches);
  const market = marketRows.map((row) => {
    const opponent = matchups.get(String(row.teamSlot));
    const availability = marketAssetAvailability(round, row.teamSlot, roundMatches);
    return {
      ...row,
      selectable: availability.selectable,
      availabilityStatus: availability.status,
      availabilityLabel: availability.label,
      previousPrice: Number(row.previousPrice) || Number(row.price) || 0,
      priceDelta: roundMoney((Number(row.price) || 0) - (Number(row.previousPrice) || Number(row.price) || 0)),
      opponentName: opponent?.teamName || "",
      opponentTag: opponent?.teamTag || "",
      opponentSlot: opponent?.teamSlot || "",
      matchup: opponent ? `vs ${opponent.teamTag || opponent.teamName}` : "Confronto a definir",
      recentPoints: recent.get(String(row.id)) || [],
      maintenanceScore: row.type === "player"
        ? valuationV3.calculateExpectedScore(Number(row.price))
        : null,
      scoreDetails: parseJsonObject(row.scoreDetailsJson),
      valuationDetails: parseJsonObject(row.valuationDetailsJson),
      scoreDetailsJson: undefined,
      valuationDetailsJson: undefined
    };
  });
  return json({
    division,
    performanceRoundNumber,
    market,
    marketState: marketStateForUser(marketState, user, env)
  }, 200, request, env);
}
__name(getMarket, "getMarket");
function buildRoundMatchups(marketRows, roundMatches = []) {
  const bySlot = /* @__PURE__ */ new Map();
  for (const row of marketRows) {
    if (!row.teamSlot || bySlot.has(String(row.teamSlot))) continue;
    bySlot.set(String(row.teamSlot), { teamSlot: String(row.teamSlot), teamName: row.teamName, teamTag: row.teamTag });
  }
  const matchups = /* @__PURE__ */ new Map();
  for (const match of roundMatches) {
    const home = String(match.homeTeamSlot || "");
    const away = String(match.awayTeamSlot || "");
    if (bySlot.has(home) && bySlot.has(away)) {
      matchups.set(home, bySlot.get(away));
      matchups.set(away, bySlot.get(home));
    }
  }
  return matchups;
}
__name(buildRoundMatchups, "buildRoundMatchups");
function marketAssetAvailability(round, teamSlot, roundMatches = []) {
  const roundNumber = Math.trunc(Number(round?.round_number || round?.roundNumber || 0));
  if (roundNumber < 4) return { selectable: true, status: "playing", label: "" };
  const slot = String(teamSlot || "");
  const statuses = parseJsonObject(round?.eligibility_json).teamStatuses || {};
  const scheduled = roundMatches.some((match) =>
    String(match.homeTeamSlot || "") === slot || String(match.awayTeamSlot || "") === slot
  );
  const status = scheduled ? "playing" : String(statuses[slot] || "unavailable");
  if (status === "playing") return { selectable: true, status, label: "Joga a rodada 4" };
  if (status === "qualified-next-round") {
    return { selectable: false, status, label: "Classificado para a rodada 5" };
  }
  if (status === "eliminated") return { selectable: false, status, label: "Eliminado dos playoffs" };
  return { selectable: false, status: "unavailable", label: "Não disputa a rodada 4" };
}
__name(marketAssetAvailability, "marketAssetAvailability");
async function getPopularPicks(request, env) {
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  const marketState = await getGlobalMarketState(env);
  const round = await currentRound(env, division, marketState?.lock_round_number);
  if (!round) return json({ division, round: null, popular: [] }, 200, request, env);
  const result = await env.DB.prepare(`
    WITH counts AS (
      SELECT p.role, p.asset_id, COUNT(*) AS picks
      FROM fantasy_lineups l
      JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
      JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
      WHERE l.round_id = ? AND ft.division = ? AND p.role IN ('TOP','JG','MID','ADC','SUP')
      GROUP BY p.role, p.asset_id
    ),
    ranked AS (
      SELECT c.*,
             ROW_NUMBER() OVER (PARTITION BY c.role ORDER BY c.picks DESC, m.price DESC, m.display_name ASC) AS position
      FROM counts c
      JOIN fantasy_market m ON m.division = ? AND m.asset_id = c.asset_id
    )
    SELECT r.role, r.asset_id AS id, r.picks, m.display_name AS name, m.team_name AS teamName,
           m.team_tag AS teamTag, m.team_slot AS teamSlot, m.logo, m.price, m.average_points AS average
    FROM ranked r
    JOIN fantasy_market m ON m.division = ? AND m.asset_id = r.asset_id
    WHERE r.position = 1
    ORDER BY CASE r.role WHEN 'TOP' THEN 1 WHEN 'JG' THEN 2 WHEN 'MID' THEN 3 WHEN 'ADC' THEN 4 WHEN 'SUP' THEN 5 ELSE 6 END
  `).bind(round.id, division, division, division).all();
  const [player, captain, team] = await Promise.all([
    env.DB.prepare(`
      SELECT p.asset_id AS id, m.asset_type AS type, m.role, m.display_name AS name, m.team_name AS teamName,
             m.team_tag AS teamTag, m.team_slot AS teamSlot, m.logo, m.price, m.previous_price AS previousPrice,
             m.average_points AS average, COUNT(*) AS picks
      FROM fantasy_lineups l
      JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
      JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
      JOIN fantasy_market m ON m.division = ? AND m.asset_id = p.asset_id
      WHERE l.round_id = ? AND ft.division = ? AND p.role IN ('TOP','JG','MID','ADC','SUP')
      GROUP BY p.asset_id
      ORDER BY picks DESC, m.price DESC, m.display_name ASC
      LIMIT 1
    `).bind(division, round.id, division).first(),
    env.DB.prepare(`
      SELECT l.captain_asset_id AS id, m.asset_type AS type, m.role, m.display_name AS name, m.team_name AS teamName,
             m.team_tag AS teamTag, m.team_slot AS teamSlot, m.logo, m.price, m.previous_price AS previousPrice,
             m.average_points AS average, COUNT(*) AS picks
      FROM fantasy_lineups l
      JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
      JOIN fantasy_market m ON m.division = ? AND m.asset_id = l.captain_asset_id
      WHERE l.round_id = ? AND ft.division = ?
      GROUP BY l.captain_asset_id
      ORDER BY picks DESC, m.price DESC, m.display_name ASC
      LIMIT 1
    `).bind(division, round.id, division).first(),
    env.DB.prepare(`
      SELECT p.asset_id AS id, m.asset_type AS type, m.role, m.display_name AS name, m.team_name AS teamName,
             m.team_tag AS teamTag, m.team_slot AS teamSlot, m.logo, m.price, m.previous_price AS previousPrice,
             m.average_points AS average, COUNT(*) AS picks
      FROM fantasy_lineups l
      JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
      JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
      JOIN fantasy_market m ON m.division = ? AND m.asset_id = p.asset_id
      WHERE l.round_id = ? AND ft.division = ? AND p.role = 'TEAM'
      GROUP BY p.asset_id
      ORDER BY picks DESC, m.price DESC, m.display_name ASC
      LIMIT 1
    `).bind(division, round.id, division).first()
  ]);
  return json({ division, round, popular: result.results || [], highlights: { player, captain, team } }, 200, request, env);
}
__name(getPopularPicks, "getPopularPicks");
async function getCurrentLineup(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const url = new URL(request.url);
  const division = validDivision(url.searchParams.get("division") || "elite");
  const marketState = await getGlobalMarketState(env);
  const round = await currentRound(env, division, marketState?.lock_round_number);
  if (!round) return json({ error: "Nenhuma rodada cadastrada." }, 404, request, env);
  const patrimony = await participantPatrimonyProfile(env, user.id, division);
  const team = await env.DB.prepare("SELECT * FROM fantasy_teams WHERE user_id = ? AND division = ?").bind(user.id, division).first();
  if (!team) return json({ division, round, patrimony, lineup: null }, 200, request, env);
  const lineup = await env.DB.prepare("SELECT * FROM fantasy_lineups WHERE fantasy_team_id = ? AND round_id = ?").bind(team.id, round.id).first();
  if (!lineup) return json({ division, round, patrimony, team, lineup: null }, 200, request, env);
  const picks = await env.DB.prepare("SELECT role, asset_id AS id, price_paid AS price, team_slot AS teamSlot FROM fantasy_lineup_picks WHERE lineup_id = ?").bind(lineup.id).all();
  const reserve = await env.DB.prepare("SELECT role, asset_id AS id, price_paid AS price, team_slot AS teamSlot FROM fantasy_lineup_reserves WHERE lineup_id = ?").bind(lineup.id).first();
  const predictions = await env.DB.prepare(`
    SELECT role, player_asset_id AS playerAssetId, mode, champion_id AS championId,
           map_number AS mapNumber, pick_rate_position AS pickRatePosition,
           pick_rate_at_lock AS pickRateAtLock, multiplier_at_lock AS multiplierAtLock,
           base_reward AS baseReward, possible_reward AS possibleReward,
           miss_penalty AS missPenalty, status, result_score AS resultScore
    FROM fantasy_lineup_draft_predictions
    WHERE lineup_id = ? ORDER BY role
  `).bind(lineup.id).all();
  return json({
    division,
    round,
    patrimony,
    team,
    lineup: { ...lineup, picks: picks.results || [], reserve: reserve || null, draftPredictions: predictions.results || [] }
  }, 200, request, env);
}
__name(getCurrentLineup, "getCurrentLineup");
async function saveCurrentLineup(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  if (Number(user.blocked) === 1) return json({ error: "Sua conta está bloqueada para alterações no Fantasy." }, 403, request, env);
  const body = await readJson(request);
  const division = validDivision(body.division);
  await ensureAutomaticMarketClose(env, new Date(), "lineup-write");
  const marketState = await getGlobalMarketState(env);
  if (!isGlobalMarketOpen(marketState)) return json({ error: "O mercado global está fechado para as duas divisões." }, 409, request, env);
  if (!isMarketOpenForUser(marketState, user, env)) {
    return json({ error: "O mercado está temporariamente aberto apenas para a administração." }, 403, request, env);
  }
  const round = await currentRound(env, division, marketState.lock_round_number);
  if (!round) return json({ error: "Nenhuma rodada dispon\xEDvel." }, 409, request, env);
  const teamName = cleanText(body.teamName).slice(0, 32);
  const picks = Array.isArray(body.picks) ? body.picks : [];
  const reservePick = body.reserve && cleanText(body.reserve.id) ? body.reserve : null;
  const draftInputs = Array.isArray(body.draftPredictions) ? body.draftPredictions : [];
  const captainId = cleanText(body.captainPlayerId);
  if (!teamName) return json({ error: "Informe o nome do seu time." }, 400, request, env);
  if (picks.length !== 6) return json({ error: "A escala\xE7\xE3o deve possuir exatamente seis escolhas." }, 400, request, env);
  const roleSet = new Set(picks.map((pick) => cleanText(pick.role).toUpperCase()));
  if (ROLES.some((role) => !roleSet.has(role)) || roleSet.size !== 6) return json({ error: "Escolha exatamente um TOP, JG, MID, ADC, SUP e uma equipe." }, 400, request, env);
  const marketRows = [];
  for (const pick of picks) {
    const row = await env.DB.prepare("SELECT * FROM fantasy_market WHERE division = ? AND asset_id = ? AND active = 1").bind(division, cleanText(pick.id)).first();
    if (!row || row.role !== cleanText(pick.role).toUpperCase()) return json({ error: "Uma escolha n\xE3o est\xE1 dispon\xEDvel no mercado." }, 400, request, env);
    const availability = marketAssetAvailability(round, row.team_slot);
    if (!availability.selectable) return json({ error: `${row.display_name} não pode ser escalado: ${availability.label.toLowerCase()}.` }, 400, request, env);
    marketRows.push(row);
  }
  const playerTeamCounts = /* @__PURE__ */ new Map();
  for (const row of marketRows.filter((item) => item.asset_type === "player")) {
    playerTeamCounts.set(row.team_slot, (playerTeamCounts.get(row.team_slot) || 0) + 1);
  }
  if ([...playerTeamCounts.values()].some((count) => count > MAX_PLAYERS_PER_REAL_TEAM)) return json({ error: "Use no m\xE1ximo dois jogadores da mesma equipe real." }, 400, request, env);
  if (!marketRows.some((row) => row.asset_type === "player" && row.asset_id === captainId)) return json({ error: "O capit\xE3o deve ser um dos cinco jogadores." }, 400, request, env);
  const totalCost = roundMoney(marketRows.reduce((sum, row) => sum + Number(row.price), 0));
  const patrimony = await ensureParticipantPatrimony(env, user.id, division);
  const budget = Number(patrimony.current_cents) / 100;
  if (totalCost > budget + 1e-3) return json({ error: `A escalação ultrapassa seu patrimônio de RK$ ${formatMoney(budget)}.` }, 400, request, env);
  let reserveRow = null;
  if (reservePick) {
    reserveRow = await env.DB.prepare("SELECT * FROM fantasy_market WHERE division = ? AND asset_id = ? AND active = 1").bind(division, cleanText(reservePick.id)).first();
    if (!reserveRow || reserveRow.asset_type !== "player") return json({ error: "O reserva precisa ser um jogador dispon\xEDvel no mercado." }, 400, request, env);
    const reserveAvailability = marketAssetAvailability(round, reserveRow.team_slot);
    if (!reserveAvailability.selectable) return json({ error: `${reserveRow.display_name} não pode ser reserva: ${reserveAvailability.label.toLowerCase()}.` }, 400, request, env);
    if (marketRows.some((row) => row.asset_id === reserveRow.asset_id)) return json({ error: "O reserva n\xE3o pode ser um dos titulares." }, 400, request, env);
    const reserveBudget = reserveBudgetForPatrimony(marketRows, budget);
    if (Number(reserveRow.price) > reserveBudget + 1e-3) return json({ error: `Seu limite para reserva \xE9 RK$ ${formatMoney(reserveBudget)}.` }, 400, request, env);
    if ((playerTeamCounts.get(reserveRow.team_slot) || 0) >= MAX_PLAYERS_PER_REAL_TEAM) return json({ error: "Escolha um reserva de uma equipe com no m\xE1ximo um jogador titular no seu time." }, 400, request, env);
  }
  const lockedDraftPredictions = [];
  if (Number(round.round_number) >= DRAFT_PREDICTION_CONFIG.enabledFromRound) {
    const snapshotRow = await env.DB.prepare(`
      SELECT position_pick_rates_json AS positionPickRatesJson
      FROM fantasy_draft_pick_rate_snapshots
      WHERE round_id = ? AND division = ?
    `).bind(round.id, division).first();
    if (!snapshotRow) return json({ error: "O snapshot do Palpite de Draft não está disponível para esta rodada." }, 409, request, env);
    const snapshot = { positionPickRates: JSON.parse(snapshotRow.positionPickRatesJson || "{}") };
    const matchRows = await env.DB.prepare(`
      SELECT home_team_slot AS homeTeamSlot, away_team_slot AS awayTeamSlot,
             source_payload_json AS sourcePayloadJson
      FROM fantasy_matches
      WHERE division = ? AND round_number = ?
        AND status NOT IN ('cancelled', 'postponed')
    `).bind(division, round.round_number).all();
    const teamFormats = new Map();
    for (const match of matchRows.results || []) {
      const sourcePayload = parseJsonObject(match.sourcePayloadJson);
      const format = String(sourcePayload.format || (/semi|final/i.test(String(sourcePayload.stage || "")) ? "MD5" : "MD3")).toUpperCase();
      teamFormats.set(String(match.homeTeamSlot), format);
      teamFormats.set(String(match.awayTeamSlot), format);
    }
    for (const row of marketRows.filter((item) => item.asset_type === "player")) {
      const input = draftInputs.find((item) => cleanText(item.role).toUpperCase() === row.role && cleanText(item.playerAssetId || item.id) === row.asset_id);
      if (!input) return json({ error: `Escolha o Palpite de Draft de ${row.display_name}.` }, 400, request, env);
      try {
        lockedDraftPredictions.push({
          role: row.role,
          playerAssetId: row.asset_id,
          ...lockDraftPrediction({
            input,
            role: row.role,
            seriesFormat: teamFormats.get(String(row.team_slot)) || "MD3",
            snapshot,
            catalog: CHAMPION_CATALOG
          })
        });
      } catch (error) {
        return json({ error: `${row.display_name}: ${error.message}` }, 400, request, env);
      }
    }
  }
  const fantasyTeamId = await ensureFantasyTeam(env, user.id, division, teamName);
  const existing = await env.DB.prepare("SELECT id FROM fantasy_lineups WHERE fantasy_team_id = ? AND round_id = ?").bind(fantasyTeamId, round.id).first();
  const lineupId = existing?.id || crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      INSERT INTO fantasy_lineups (id, fantasy_team_id, round_id, captain_asset_id, total_cost, submitted_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(fantasy_team_id, round_id) DO UPDATE SET captain_asset_id=excluded.captain_asset_id, total_cost=excluded.total_cost, updated_at=CURRENT_TIMESTAMP
    `).bind(lineupId, fantasyTeamId, round.id, captainId, totalCost),
    env.DB.prepare("DELETE FROM fantasy_lineup_picks WHERE lineup_id = ?").bind(lineupId),
    env.DB.prepare("DELETE FROM fantasy_lineup_reserves WHERE lineup_id = ?").bind(lineupId),
    env.DB.prepare("DELETE FROM fantasy_lineup_draft_predictions WHERE lineup_id = ?").bind(lineupId)
  ];
  for (const row of marketRows) {
    statements.push(env.DB.prepare("INSERT INTO fantasy_lineup_picks (lineup_id, role, asset_id, price_paid, team_slot) VALUES (?, ?, ?, ?, ?)").bind(lineupId, row.role, row.asset_id, row.price, row.team_slot));
  }
  if (reserveRow) {
    statements.push(env.DB.prepare("INSERT INTO fantasy_lineup_reserves (lineup_id, role, asset_id, price_paid, team_slot) VALUES (?, ?, ?, ?, ?)").bind(lineupId, reserveRow.role, reserveRow.asset_id, reserveRow.price, reserveRow.team_slot));
  }
  for (const prediction of lockedDraftPredictions) {
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_lineup_draft_predictions
        (lineup_id, role, player_asset_id, mode, champion_id, map_number,
         pick_rate_position, pick_rate_at_lock, multiplier_at_lock, base_reward,
         possible_reward, miss_penalty, status, result_score, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      lineupId,
      prediction.role,
      prediction.playerAssetId,
      prediction.mode,
      prediction.championId,
      prediction.mapNumber,
      prediction.pickRatePosition,
      prediction.pickRateAtLock,
      prediction.multiplierAtLock,
      prediction.baseReward,
      prediction.possibleReward,
      prediction.missPenalty,
      prediction.status,
      prediction.resultScore
    ));
  }
  await env.DB.batch(statements);
  return json({ ok: true, lineupId, roundId: round.id, patrimonyCents: Number(patrimony.current_cents), totalCost, reserveBudget: reserveBudgetForPatrimony(marketRows, budget), reserveCost: reserveRow ? Number(reserveRow.price) : 0 }, 200, request, env);
}
__name(saveCurrentLineup, "saveCurrentLineup");
async function getRanking(request, env) {
  const url = new URL(request.url);
  const scope = rankingScope(url.searchParams.get("scope"));
  const requestedDivision = cleanText(url.searchParams.get("division") || "elite");
  const division = scope === "overall" ? "all" : validDivision(requestedDivision);
  const where = division === "all" ? "" : "WHERE ft.division = ?";
  const statement = env.DB.prepare(`
    SELECT ft.id, ft.division, ft.name AS teamName, u.id AS userId, u.username AS manager,
           COALESCE(ROUND(SUM(s.points), 2), 0) AS totalPoints,
           COALESCE(ROUND(SUM(CASE WHEN s.round_id = (
             SELECT s2.round_id
             FROM fantasy_team_round_scores s2
             JOIN fantasy_rounds r2 ON r2.id = s2.round_id
             WHERE s2.fantasy_team_id = ft.id
             ORDER BY r2.round_number DESC LIMIT 1
           ) THEN s.points ELSE 0 END), 2), 0) AS roundPoints,
           COALESCE(ROUND(AVG(s.points), 2), 0) AS averagePoints,
           COALESCE(ROUND(MAX(s.points), 2), 0) AS bestRoundPoints,
           COUNT(s.round_id) AS scoredRounds,
           COALESCE((SELECT MIN(l.submitted_at) FROM fantasy_lineups l WHERE l.fantasy_team_id = ft.id), ft.created_at) AS firstValidLineupAt,
           COALESCE(pp.current_cents, 10000) AS wealthCents
    FROM fantasy_teams ft
    JOIN fantasy_users u ON u.id = ft.user_id
    LEFT JOIN fantasy_participant_patrimony pp
      ON pp.user_id = u.id AND pp.division = ft.division
    LEFT JOIN fantasy_team_round_scores s ON s.fantasy_team_id = ft.id
    ${where}
    GROUP BY ft.id, ft.division, ft.name, u.id, u.username, pp.current_cents
    LIMIT 500
  `);
  const result = division === "all" ? await statement.all() : await statement.bind(division).all();
  let rows = (result.results || []).map((row) => ({
    id: row.id,
    division: row.division,
    teamName: row.teamName,
    userId: row.userId,
    manager: row.manager,
    totalPoints: roundMoney(row.totalPoints),
    roundPoints: roundMoney(row.roundPoints),
    averagePoints: roundMoney(row.averagePoints),
    bestRoundPoints: roundMoney(row.bestRoundPoints),
    wealthCents: Number.isFinite(Number(row.wealthCents)) ? Math.trunc(Number(row.wealthCents)) : 10000,
    scoredRounds: Math.trunc(Number(row.scoredRounds) || 0),
    firstValidLineupAt: row.firstValidLineupAt
  }));
  if (scope === "overall") rows = combineOverallRankingRows(rows);
  const previousRows = rows.map((row) => ({ ...row, totalPoints: roundMoney(Number(row.totalPoints) - Number(row.roundPoints)), roundPoints: 0 })).filter((row) => Number(row.totalPoints) > 0);
  const previousPositions = new Map(rankRankingRows(previousRows, "championship").map((row, index) => [row.id, index + 1]));
  const ranking = rankRankingRows(rows, scope).slice(0, 200).map((row, index) => {
    const position = index + 1;
    const previous = previousPositions.get(row.id);
    return { position, positionChange: previous ? previous - position : 0, ...row };
  });
  return json({ division, scope, ranking }, 200, request, env);
}
__name(getRanking, "getRanking");
function combineOverallRankingRows(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = row.userId || row.manager || row.id;
    const current = grouped.get(key) || {
      id: `user:${key}`,
      userId: key,
      division: "all",
      teamName: "",
      manager: row.manager,
      totalPoints: 0,
      roundPoints: 0,
      averagePoints: 0,
      bestRoundPoints: 0,
      wealthCents: Number.isFinite(Number(row.wealthCents)) ? Math.trunc(Number(row.wealthCents)) : 10000,
      scoredRounds: 0,
      firstValidLineupAt: row.firstValidLineupAt,
      teamNames: []
    };
    current.totalPoints = roundMoney(Number(current.totalPoints) + Number(row.totalPoints || 0));
    current.roundPoints = roundMoney(Number(current.roundPoints) + Number(row.roundPoints || 0));
    current.bestRoundPoints = Math.max(Number(current.bestRoundPoints) || 0, Number(row.bestRoundPoints) || 0);
    current.wealthCents = Number.isFinite(Number(row.wealthCents))
      ? Math.trunc(Number(row.wealthCents))
      : current.wealthCents;
    current.scoredRounds += Math.trunc(Number(row.scoredRounds) || 0);
    if (row.teamName) current.teamNames.push(`${row.division === "ascension" ? "Ascens\xE3o" : "Elite"}: ${row.teamName}`);
    if (!current.firstValidLineupAt || row.firstValidLineupAt && String(row.firstValidLineupAt).localeCompare(String(current.firstValidLineupAt)) < 0) {
      current.firstValidLineupAt = row.firstValidLineupAt;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()].map((row) => ({
    id: row.id,
    userId: row.userId,
    division: "all",
    teamName: row.teamNames.length ? row.teamNames.join(" + ") : "Times combinados",
    manager: row.manager,
    totalPoints: roundMoney(row.totalPoints),
    roundPoints: roundMoney(row.roundPoints),
    averagePoints: row.scoredRounds > 0 ? roundMoney(Number(row.totalPoints) / row.scoredRounds) : 0,
    bestRoundPoints: roundMoney(row.bestRoundPoints),
    wealthCents: null,
    scoredRounds: row.scoredRounds,
    firstValidLineupAt: row.firstValidLineupAt
  }));
}
__name(combineOverallRankingRows, "combineOverallRankingRows");
function rankingScope(value) {
  const scope = cleanText(value || "championship");
  return ["championship", "round", "overall", "wealth"].includes(scope) ? scope : "championship";
}
__name(rankingScope, "rankingScope");
function rankRankingRows(rows, scope) {
  const metric = scope === "round" ? (row) => Number(row.roundPoints) || 0 : scope === "wealth" ? (row) => Number(row.wealthCents) || 0 : (row) => Number(row.totalPoints) || 0;
  return [...rows].sort(
    (a, b) => metric(b) - metric(a) || Number(b.totalPoints || 0) - Number(a.totalPoints || 0) || Number(b.roundPoints || 0) - Number(a.roundPoints || 0) || Number(b.wealthCents || 0) - Number(a.wealthCents || 0) || String(a.firstValidLineupAt || "9999").localeCompare(String(b.firstValidLineupAt || "9999")) || String(a.teamName || "").localeCompare(String(b.teamName || ""), "pt-BR", { sensitivity: "base" })
  );
}
__name(rankRankingRows, "rankRankingRows");
async function adminUpsertRound(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const body = await readJson(request);
  const division = validDivision(body.division);
  const roundNumber = Number(body.roundNumber);
  const name = cleanText(body.name) || `Rodada ${roundNumber}`;
  const opensAt = isoDate(body.opensAt);
  const locksAt = isoDate(body.locksAt);
  const status = ["scheduled", "open", "locked", "scored"].includes(body.status) ? body.status : "scheduled";
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || !opensAt || !locksAt) return json({ error: "Dados da rodada inv\xE1lidos." }, 400, request, env);
  const id = cleanText(body.id) || `${division}-r${roundNumber}`;
  await env.DB.prepare(`
    INSERT INTO fantasy_rounds (id, division, round_number, name, opens_at, locks_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(division, round_number) DO UPDATE SET name=excluded.name, opens_at=excluded.opens_at, locks_at=excluded.locks_at, status=excluded.status
  `).bind(id, division, roundNumber, name, opensAt, locksAt, status).run();
  return json({ ok: true, id }, 200, request, env);
}
__name(adminUpsertRound, "adminUpsertRound");
async function adminSyncMarket(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const body = await readJson(request);
  const division = validDivision(body.division);
  const assets = Array.isArray(body.assets) ? body.assets : [];
  if (!assets.length) return json({ error: "Nenhum ativo informado." }, 400, request, env);
  const statements = [env.DB.prepare("UPDATE fantasy_market SET active = 0 WHERE division = ?").bind(division)];
  for (const asset of assets) {
    const role = cleanText(asset.role).toUpperCase();
    if (!ROLES.includes(role)) continue;
    const id = cleanText(asset.id);
    if (!id) continue;
    const price = roundMoney(Number(asset.price) || initialPrice(id, role));
    const priceCents = Math.max(400, Math.round(price * 100));
    statements.push(env.DB.prepare(`
      INSERT INTO fantasy_market (division, asset_id, asset_type, role, display_name, team_slot, team_name, team_tag, logo, price, previous_price, average_points, active, updated_at, price_cents, previous_price_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?)
      ON CONFLICT(division, asset_id) DO UPDATE SET asset_type=excluded.asset_type, role=excluded.role, display_name=excluded.display_name,
        team_slot=excluded.team_slot, team_name=excluded.team_name, team_tag=excluded.team_tag, logo=excluded.logo,
        price=excluded.price, previous_price=excluded.previous_price, average_points=excluded.average_points,
        price_cents=excluded.price_cents, previous_price_cents=excluded.previous_price_cents, active=1, updated_at=CURRENT_TIMESTAMP
    `).bind(division, id, asset.type === "team" ? "team" : "player", role, cleanText(asset.name), cleanText(asset.teamSlot), cleanText(asset.teamName), cleanText(asset.teamTag), cleanText(asset.logo), price, price, Number(asset.average) || 0, priceCents, priceCents));
  }
  await env.DB.batch(statements);
  return json({ ok: true, imported: statements.length - 1 }, 200, request, env);
}
__name(adminSyncMarket, "adminSyncMarket");
async function adminScoreRound(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const body = await readJson(request);
  const division = validDivision(body.division);
  const roundId = cleanText(body.roundId);
  const round = await env.DB.prepare("SELECT * FROM fantasy_rounds WHERE id = ? AND division = ?").bind(roundId, division).first();
  if (!round) return json({ error: "Rodada n\xE3o encontrada." }, 404, request, env);
  const scores = [...body.playerScores || [], ...body.teamScores || []];
  if (!scores.length) return json({ error: "Nenhuma pontua\xE7\xE3o recebida." }, 400, request, env);
  const scoreStatements = [env.DB.prepare("DELETE FROM fantasy_asset_round_scores WHERE round_id = ?").bind(roundId)];
  for (const score of scores) {
    scoreStatements.push(env.DB.prepare(`
      INSERT INTO fantasy_asset_round_scores (round_id, division, asset_id, role, games, points, breakdown_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(roundId, division, cleanText(score.assetId), cleanText(score.role), Number(score.games) || 0, Number(score.points) || 0, JSON.stringify(score.breakdown || {})));
  }
  await env.DB.batch(scoreStatements);
  const lineups = await env.DB.prepare(`
    SELECT l.id, l.fantasy_team_id AS fantasyTeamId, l.captain_asset_id AS captainId,
           p.asset_id AS assetId, p.role, p.team_slot AS teamSlot,
           r.asset_id AS reserveAssetId, r.role AS reserveRole, r.team_slot AS reserveTeamSlot, r.price_paid AS reservePrice
    FROM fantasy_lineups l
    JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
    LEFT JOIN fantasy_lineup_reserves r ON r.lineup_id = l.id
    WHERE l.round_id = ?
  `).bind(roundId).all();
  const grouped = /* @__PURE__ */ new Map();
  for (const row of lineups.results || []) {
    const group = grouped.get(row.fantasyTeamId) || { captainId: row.captainId, picks: [], reserve: null };
    group.picks.push(row);
    if (row.reserveAssetId) {
      group.reserve = { assetId: row.reserveAssetId, role: row.reserveRole, teamSlot: row.reserveTeamSlot, price: row.reservePrice };
    }
    grouped.set(row.fantasyTeamId, group);
  }
  const scoreMap = new Map(scores.map((score) => [String(score.assetId), { points: Number(score.points) || 0, games: Number(score.games) || 0, role: cleanText(score.role) }]));
  const teamScoreStatements = [env.DB.prepare("DELETE FROM fantasy_team_round_scores WHERE round_id = ?").bind(roundId)];
  for (const [fantasyTeamId, group] of grouped) {
    let total = 0;
    const detail = [];
    const absentStarter = group.picks.filter((pick) => PLAYER_ROLES.includes(pick.role)).find((pick) => !assetPlayed(scoreMap.get(String(pick.assetId))));
    const reserveScore = group.reserve ? scoreMap.get(String(group.reserve.assetId)) : null;
    const useReserveFor = absentStarter && group.reserve && assetPlayed(reserveScore) ? absentStarter.assetId : "";
    for (const pick of group.picks) {
      if (useReserveFor && pick.assetId === useReserveFor) {
        const base2 = Number(reserveScore.points) || 0;
        const points2 = roundMoney(base2);
        total += points2;
        detail.push({
          assetId: pick.assetId,
          role: pick.role,
          base: 0,
          multiplier: 1,
          points: 0,
          didNotPlay: true,
          reserveUsed: { assetId: group.reserve.assetId, role: group.reserve.role, base: base2, multiplier: 1, points: points2 }
        });
        continue;
      }
      const score = scoreMap.get(String(pick.assetId));
      const base = assetPlayed(score) ? Number(score.points) || 0 : 0;
      const multiplier = pick.assetId === group.captainId ? 1.5 : 1;
      const points = roundMoney(base * multiplier);
      total += points;
      detail.push({ assetId: pick.assetId, role: pick.role, base, multiplier, points, didNotPlay: PLAYER_ROLES.includes(pick.role) && !assetPlayed(score) });
    }
    teamScoreStatements.push(env.DB.prepare(`
      INSERT INTO fantasy_team_round_scores (fantasy_team_id, round_id, points, breakdown_json)
      VALUES (?, ?, ?, ?)
    `).bind(fantasyTeamId, roundId, roundMoney(total), JSON.stringify(detail)));
  }
  teamScoreStatements.push(env.DB.prepare("UPDATE fantasy_rounds SET status = 'scored' WHERE id = ?").bind(roundId));
  await env.DB.batch(teamScoreStatements);
  const averageUpdates = [];
  for (const score of scores) {
    const assetId = cleanText(score.assetId);
    const games = Number(score.games) || 0;
    if (games <= 0) continue;
    const roundAverage = Number(score.average ?? Number(score.points) / Math.max(1, games)) || 0;
    averageUpdates.push(env.DB.prepare(`
      UPDATE fantasy_market SET average_points = ROUND(?, 2), updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(roundMoney(roundAverage), division, assetId));
  }
  if (averageUpdates.length) await env.DB.batch(averageUpdates);
  return json({ ok: true, assetsScored: scores.length, fantasyTeamsScored: grouped.size }, 200, request, env);
}
__name(adminScoreRound, "adminScoreRound");
async function adminListMatches(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const division = validDivision(new URL(request.url).searchParams.get("division") || "elite");
  const response = await fetch(env.STATS_JSON_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) return json({ error: "Fonte oficial indispon\xEDvel." }, 502, request, env);
  const stats = await response.json();
  const attached = await env.DB.prepare("SELECT match_id AS matchId,round_id AS roundId FROM fantasy_round_matches WHERE division=?").bind(division).all();
  const used = new Map((attached.results || []).map((row) => [String(row.matchId), row.roundId]));
  const matches = (stats?.divisions?.[division]?.matches || []).map((match) => ({ matchId: String(match.id ?? match.matchId), blueName: match.blueTeam?.name || match.teams?.["100"]?.name || "Azul", redName: match.redTeam?.name || match.teams?.["200"]?.name || "Vermelho", durationSeconds: match.durationSeconds, roundId: used.get(String(match.id ?? match.matchId)) || null }));
  return json({ division, matches }, 200, request, env);
}
__name(adminListMatches, "adminListMatches");
async function adminRoundStatus(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const body = await readJson(request);
  if (!["scheduled", "open", "locked", "cancelled"].includes(body.status)) return json({ error: "Status inv\xE1lido." }, 400, request, env);
  await env.DB.prepare("UPDATE fantasy_rounds SET status=? WHERE id=?").bind(body.status, cleanText(body.roundId)).run();
  return json({ ok: true }, 200, request, env);
}
__name(adminRoundStatus, "adminRoundStatus");
async function adminAssociateMatches(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const body = await readJson(request);
  const round = await env.DB.prepare("SELECT division FROM fantasy_rounds WHERE id=?").bind(cleanText(body.roundId)).first();
  if (!round) return json({ error: "Rodada inexistente." }, 404, request, env);
  const ids = [...new Set((body.matchIds || []).map(cleanText).filter(Boolean))];
  try {
    await env.DB.batch(ids.map((id) => env.DB.prepare("INSERT INTO fantasy_round_matches(round_id,division,match_id,source_hash) VALUES(?,?,?,?)").bind(body.roundId, round.division, id, "pending")));
  } catch {
    return json({ error: "Um mapa j\xE1 est\xE1 associado a outra rodada desta divis\xE3o." }, 409, request, env);
  }
  return json({ ok: true, associated: ids.length }, 200, request, env);
}
__name(adminAssociateMatches, "adminAssociateMatches");
async function adminMarketSnapshot(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "N\xE3o autorizado." }, 401, request, env);
  const body = await readJson(request);
  const round = await env.DB.prepare("SELECT id,division,formula_version FROM fantasy_rounds WHERE id=?").bind(cleanText(body.roundId)).first();
  if (!round) return json({ error: "Rodada inexistente." }, 404, request, env);
  await env.DB.prepare("INSERT OR IGNORE INTO fantasy_market_snapshots(round_id,division,asset_id,price_before_cents,formula_version) SELECT ?,division,asset_id,price_cents,? FROM fantasy_market WHERE division=? AND active=1").bind(round.id, round.formula_version, round.division).run();
  return json({ ok: true }, 200, request, env);
}
__name(adminMarketSnapshot, "adminMarketSnapshot");
async function currentRound(env, division, roundNumber = null) {
  if (Number.isInteger(Number(roundNumber)) && Number(roundNumber) > 0) {
    return env.DB.prepare("SELECT * FROM fantasy_rounds WHERE division = ? AND round_number = ? LIMIT 1")
      .bind(division, Math.trunc(Number(roundNumber)))
      .first();
  }
  return env.DB.prepare(`
    SELECT * FROM fantasy_rounds WHERE division = ?
    ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'locked' THEN 2 ELSE 3 END, round_number DESC
    LIMIT 1
  `).bind(division).first();
}
__name(currentRound, "currentRound");
function isRoundOpen(round) {
  const now = Date.now();
  return round && round.status === "open" && now >= Date.parse(round.opens_at) && now < Date.parse(round.locks_at);
}
__name(isRoundOpen, "isRoundOpen");
function isGlobalMarketOpen(marketState) {
  const closesAt = Date.parse(marketState?.closes_at);
  return Boolean(
    marketState &&
    marketState.status === "open" &&
    Number.isFinite(closesAt) &&
    Date.now() < closesAt
  );
}
__name(isGlobalMarketOpen, "isGlobalMarketOpen");
function isMarketOpenForUser(marketState, user, env) {
  if (!isGlobalMarketOpen(marketState)) return false;
  if (String(marketState?.access_mode || "public") !== "admin") return true;
  return Boolean(user && marketControlIds(env).has(String(user.discordId)));
}
__name(isMarketOpenForUser, "isMarketOpenForUser");
function marketStateForUser(marketState, user, env) {
  const visible = publicMarketState(marketState);
  if (visible.accessMode !== "admin" || isMarketOpenForUser(marketState, user, env)) return visible;
  return {
    ...visible,
    status: "closed",
    closeReason: "Mercado temporariamente disponível apenas para a administração."
  };
}
__name(marketStateForUser, "marketStateForUser");
async function ensureParticipantPatrimony(env, userId, division) {
  const validPatrimonyDivision = validDivision(division);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO fantasy_participant_patrimony
      (user_id, division, current_cents, formula_version)
    VALUES (?, ?, ?, ?)
  `).bind(userId, validPatrimonyDivision, Math.round(INITIAL_PATRIMONY * 100), PATRIMONY_FORMULA_ID).run();
  return env.DB.prepare(`
    SELECT user_id, division, current_cents, formula_version, created_at, updated_at
    FROM fantasy_participant_patrimony WHERE user_id = ? AND division = ?
  `).bind(userId, validPatrimonyDivision).first();
}
__name(ensureParticipantPatrimony, "ensureParticipantPatrimony");
async function participantPatrimonyProfiles(env, userId) {
  const [elite, ascension] = await Promise.all(
    DIVISIONS.map((division) => participantPatrimonyProfile(env, userId, division))
  );
  return { elite, ascension };
}
__name(participantPatrimonyProfiles, "participantPatrimonyProfiles");
async function participantPatrimonyProfile(env, userId, division) {
  const validPatrimonyDivision = validDivision(division);
  const current = await ensureParticipantPatrimony(env, userId, validPatrimonyDivision);
  const history = await env.DB.prepare(`
    SELECT h.round_id AS roundId, r.round_number AS roundNumber,
           h.variation_cents AS variationCents, h.status,
           h.processed_at AS calculatedAt
    FROM fantasy_patrimony_history h
    JOIN fantasy_rounds r ON r.id = h.round_id
    WHERE h.user_id = ? AND h.division = ?
    ORDER BY r.round_number, h.processed_at
  `).bind(userId, validPatrimonyDivision).all();
  const stats = summarizeParticipantPatrimony({
    currentCents: Number(current.current_cents),
    historyRows: history.results || []
  });
  const latest = await env.DB.prepare(`
    SELECT previous_cents AS previousCents, variation_cents AS variationCents,
           round_id AS roundId, division, status
    FROM fantasy_patrimony_history
    WHERE user_id = ? AND division = ?
      AND status IN ('PUBLISHED','INCONSISTENT','NO_VALID_LINEUP')
    ORDER BY processed_at DESC LIMIT 1
  `).bind(userId, validPatrimonyDivision).first();
  return {
    division: validPatrimonyDivision,
    previousCents: Number(latest?.previousCents ?? current.current_cents),
    currentCents: Number(current.current_cents),
    roundVariationCents: stats.roundVariationCents,
    totalVariationCents: stats.totalVariationCents,
    maximumCents: stats.maximumCents,
    minimumCents: stats.minimumCents,
    latestRoundId: latest?.roundId || null,
    latestDivision: latest?.division || null,
    formulaVersion: current.formula_version,
    updatedAt: current.updated_at
  };
}
__name(participantPatrimonyProfile, "participantPatrimonyProfile");
async function ensureFantasyTeam(env, userId, division, name) {
  const existing = await env.DB.prepare("SELECT id FROM fantasy_teams WHERE user_id = ? AND division = ?").bind(userId, division).first();
  const id = existing?.id || crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO fantasy_teams (id, user_id, division, name, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, division) DO UPDATE SET name=excluded.name, updated_at=CURRENT_TIMESTAMP
  `).bind(id, userId, division, name).run();
  return id;
}
__name(ensureFantasyTeam, "ensureFantasyTeam");
async function optionalUser(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT u.id, u.discord_id AS discordId, u.username, u.avatar_url AS avatarUrl,
           COALESCE(u.blocked, 0) AS blocked, COALESCE(u.blocked_reason, '') AS blockedReason
    FROM fantasy_sessions s JOIN fantasy_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), (/* @__PURE__ */ new Date()).toISOString()).first();
  return row || null;
}
__name(optionalUser, "optionalUser");
async function requireUser(request, env) {
  const user = await optionalUser(request, env);
  return user ? user : { response: json({ error: "Fa\xE7a login pelo Discord." }, 401, request, env) };
}
__name(requireUser, "requireUser");
async function isAdmin(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("X-Admin-Token") || "";
  if (Boolean(env.ADMIN_TOKEN) && timingSafeEqual(token, env.ADMIN_TOKEN)) return true;
  const user = await optionalUser(request, env);
  return Boolean(user && adminIds(env).has(String(user.discordId)));
}
__name(isAdmin, "isAdmin");
function adminIds(env) {
  return new Set(String(env.ADMIN_DISCORD_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
}
__name(adminIds, "adminIds");
function marketControlIds(env) {
  return new Set(String(env.MARKET_CONTROL_DISCORD_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
}
__name(marketControlIds, "marketControlIds");
function validDivision(value) {
  const division = cleanText(value).toLowerCase();
  if (!["elite", "ascension"].includes(division)) throw new HttpError(400, "Divis\xE3o inv\xE1lida.");
  return division;
}
__name(validDivision, "validDivision");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "JSON inv\xE1lido.");
  }
}
__name(readJson, "readJson");
function json(data, status, request, env) {
  const normalized = data?.error ? { ok: false, error: { code: errorCode(status, data.error), message: String(data.error) } } : { ...data, ok: true, data: { ...data, ok: void 0 } };
  const response = new Response(JSON.stringify(normalized), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  response.headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; style-src 'self'; script-src 'self'");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return cors(response, request, env);
}
__name(json, "json");
function errorCode(status, message) {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (/mercado|fechad/i.test(message)) return "MARKET_LOCKED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  return status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR";
}
__name(errorCode, "errorCode");
function cors(response, request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(request, env);
  if (origin && allowed.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  return response;
}
__name(cors, "cors");
function allowedOrigins(request, env) {
  const values = [env.ALLOWED_ORIGINS, env.ALLOWED_ORIGIN].flatMap((value) => String(value || "").split(",")).map((value) => value.trim()).filter(Boolean);
  try {
    values.push(new URL(String(env.SITE_URL || "")).origin);
  } catch {
  }
  try {
    values.push(new URL(request.url).origin);
  } catch {
  }
  return new Set(values);
}
__name(allowedOrigins, "allowedOrigins");
function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `SameSite=${options.sameSite || "Lax"}`, "Secure"];
  if (options.httpOnly) parts.push("HttpOnly");
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join("; ");
}
__name(cookie, "cookie");
function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}
__name(parseCookies, "parseCookies");
function sessionToken(request) {
  const authorization = String(request.headers.get("Authorization") || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || parseCookies(request.headers.get("Cookie"))[COOKIE_NAME] || "";
}
__name(sessionToken, "sessionToken");
function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(randomToken, "randomToken");
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
function initialPrice(id, role) {
  if (PLAYER_ROLES.includes(cleanText(role).toUpperCase())) return 12;
  let hash = 2166136261;
  for (const char of `${id}:${role}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const base = { TOP: 11, JG: 12, MID: 13, ADC: 13, SUP: 10, TEAM: 9 }[role] || 10;
  return roundMoney(base + Math.abs(hash >>> 0) % 800 / 100);
}
__name(initialPrice, "initialPrice");
function redirectWithError(env, message) {
  const target = siteEntryUrl(env);
  target.hash = new URLSearchParams({ loginError: message }).toString();
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": cookie(OAUTH_STATE_COOKIE, "", { maxAge: 0, httpOnly: true }) } });
}
__name(redirectWithError, "redirectWithError");
function siteEntryUrl(env) {
  return new URL(String(env.SITE_URL || ""));
}
__name(siteEntryUrl, "siteEntryUrl");
function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Vari\xE1veis ausentes: ${missing.join(", ")}`);
}
__name(requireEnv, "requireEnv");
function cleanText(value) {
  return String(value == null ? "" : value).trim();
}
__name(cleanText, "cleanText");
function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseJsonObject, "parseJsonObject");
function isoDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}
__name(isoDate, "isoDate");
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
__name(roundMoney, "roundMoney");
function formatMoney(value) {
  return roundMoney(value).toFixed(2).replace(".", ",");
}
__name(formatMoney, "formatMoney");
function reserveBudgetForRows(rows) {
  const starterCost = rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
  return roundMoney(Math.max(0, BUDGET_LIMIT - starterCost));
}
__name(reserveBudgetForRows, "reserveBudgetForRows");
function reserveBudgetForPatrimony(rows, patrimony) {
  const starterCost = rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
  return roundMoney(Math.max(0, Number(patrimony) - starterCost));
}
__name(reserveBudgetForPatrimony, "reserveBudgetForPatrimony");
function assetPlayed(score) {
  return Boolean(score && Number(score.games) > 0);
}
__name(assetPlayed, "assetPlayed");
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
export {
  fantasy_worker_default as default
};
//# sourceMappingURL=fantasy-worker.js.map
