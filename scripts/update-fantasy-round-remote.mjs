import fs from "node:fs";
import path from "node:path";
import { __test } from "../worker/fantasy-admin.js";

const ACCOUNT_ID = "a209575f4a37474a86dbdd51f15a6607";
const DATABASE_ID = "cefb6791-1501-4ae1-b04d-2984ef6cf163";
const ACTOR = "Codex · atualização oficial da rodada";
const SOURCE_URL = "https://liga-rk.github.io/liga-rk-26-2/assets/fantasy-source.json";
const CONTENT_API_URL = "https://liga-rk-api.suporteinhouserk.workers.dev/api/content";
const mode = String(process.argv[2] || "preview").toLowerCase();
const roundNumber = Math.trunc(Number(process.argv[3] || 2));
const previewId = String(process.argv[4] || "").trim();

if (!Number.isInteger(roundNumber) || roundNumber < 2) {
  throw new TypeError("Informe uma rodada válida a partir da rodada 2.");
}
if (!process.env.APPDATA) throw new Error("APPDATA não está disponível.");

const authConfigPath = path.join(
  process.env.APPDATA,
  "xdg.config",
  ".wrangler",
  "config",
  "default.toml"
);
const oauthToken = tomlString(fs.readFileSync(authConfigPath, "utf8"), "oauth_token");
if (!oauthToken) throw new Error("A sessão OAuth do Wrangler não foi encontrada.");

let DB;
let env;
const auth = { username: ACTOR };

async function main() {
DB = new RemoteD1Database({ accountId: ACCOUNT_ID, databaseId: DATABASE_ID, oauthToken });
env = {
  DB,
  FANTASY_SOURCE_URL: SOURCE_URL,
  CONTENT_API_URL,
  __maintenanceBackup: mode === "apply" ? async () => previewId : null
};

if (mode === "preview") {
  const sync = await invoke(__test.adminSyncPreview, {});
  const round = await invoke(__test.adminRoundPreviewV2, { roundNumber });
  console.log(JSON.stringify({
    mode,
    roundNumber,
    sync: {
      previewId: sync.previewId,
      sourceHash: sync.sourceHash,
      generatedAt: sync.generatedAt,
      summary: sync.summary,
      warnings: sync.warnings,
      changed: sync.changes.filter((item) => item.change !== "unchanged")
    },
    round
  }, null, 2));
} else if (mode === "roster-audit") {
  if (!previewId) throw new Error("Informe o ID da prévia de sincronização.");
  const preview = await DB.prepare(`
    SELECT changes_json AS changesJson
    FROM fantasy_sync_runs WHERE id = ? AND mode = 'preview'
  `).bind(previewId).first();
  if (!preview) throw new Error("Prévia de sincronização não encontrada.");
  const changes = JSON.parse(preview.changesJson || "[]");
  const deactivatedIds = changes
    .filter((item) => item.type === "player" && item.change === "deactivate")
    .map((item) => item.id);
  const placeholders = deactivatedIds.map(() => "?").join(", ");
  const deactivated = deactivatedIds.length
    ? await DB.prepare(`
        SELECT p.id, p.division, p.display_name AS displayName,
               p.team_slot AS teamSlot, p.role, p.roster_status AS rosterStatus,
               m.active AS marketActive, m.price_cents AS priceCents
        FROM fantasy_official_players p
        LEFT JOIN fantasy_market m ON m.division = p.division AND m.asset_id = p.id
        WHERE p.id IN (${placeholders})
        ORDER BY p.division, p.team_slot, p.role
      `).bind(...deactivatedIds).all()
    : { results: [] };
  const selected = deactivatedIds.length
    ? await DB.prepare(`
        SELECT r.division, r.round_number AS roundNumber, l.id AS lineupId,
               COALESCE(p.asset_id, lr.asset_id) AS assetId,
               CASE WHEN p.asset_id IS NOT NULL THEN 'starter' ELSE 'reserve' END AS pickType
        FROM fantasy_lineups l
        JOIN fantasy_rounds r ON r.id = l.round_id
        LEFT JOIN fantasy_lineup_picks p
          ON p.lineup_id = l.id AND p.asset_id IN (${placeholders})
        LEFT JOIN fantasy_lineup_reserves lr
          ON lr.lineup_id = l.id AND lr.asset_id IN (${placeholders})
        WHERE r.round_number = ? AND (p.asset_id IS NOT NULL OR lr.asset_id IS NOT NULL)
        ORDER BY r.division, l.id
      `).bind(...deactivatedIds, ...deactivatedIds, roundNumber).all()
    : { results: [] };
  console.log(JSON.stringify({
    mode,
    roundNumber,
    deactivated: deactivated.results || [],
    selectedInLockedLineups: selected.results || []
  }, null, 2));
} else if (mode === "score-audit") {
  console.log(JSON.stringify({ mode, roundNumber, audit: await scoringAudit() }, null, 2));
} else if (mode === "valuation-audit") {
  const rows = await DB.prepare(`
    SELECT s.id, s.status, s.items_json AS itemsJson, r.division
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE r.round_number = ?
    ORDER BY r.division, s.created_at DESC
  `).bind(roundNumber).all();
  const latest = [];
  const seen = new Set();
  for (const row of rows.results || []) {
    if (seen.has(row.division)) continue;
    seen.add(row.division);
    const items = JSON.parse(row.itemsJson || "[]");
    latest.push({
      id: row.id,
      division: row.division,
      status: row.status,
      summary: __test.valuationSummary(items),
      assets: items.length,
      changedAssets: items.filter((item) => Number(item.deltaCents) !== 0).length,
      didNotPlay: items.filter((item) => Number(item.games) === 0).length,
      pendingReview: items.filter((item) => item.needsReview && item.reviewStatus === "pending").length,
      zeroGamePriceChanges: items.filter((item) => Number(item.games) === 0 && Number(item.deltaCents) !== 0),
      fvlSdk: items.filter((item) => row.division === "elite" && isFvlSdk(item.teamName))
        .map((item) => ({
          assetId: item.assetId,
          name: item.name,
          teamSlot: item.teamSlot,
          games: item.games,
          roundPoints: item.roundPoints,
          deltaCents: item.deltaCents
        }))
    });
  }
  console.log(JSON.stringify({ mode, roundNumber, latest }, null, 2));
} else if (mode === "process") {
  if (!previewId) throw new Error("Informe o ID da prévia de sincronização.");
  await assertMarketClosed();
  const sync = await invoke(__test.adminSyncApply, { previewId });
  const preview = await invoke(__test.adminRoundPreviewV2, { roundNumber });
  assertRoundPreview(preview);
  const processed = await invoke(__test.adminRoundProcessV2, {
    roundNumber,
    sourceHash: preview.sourceHash
  });
  const valuation = await invoke(__test.adminValuationSimulate, { roundNumber });
  const audit = await scoringAudit();
  console.log(JSON.stringify({
    mode,
    roundNumber,
    sync: {
      syncRunId: sync.syncRunId,
      backupId: sync.backupId,
      applied: sync.applied,
      pricesPreserved: sync.pricesPreserved,
      warnings: sync.warnings
    },
    preview,
    processed,
    valuation: valuation.simulations.map(summarizeSimulation),
    audit
  }, null, 2));
} else if (mode === "apply") {
  if (!previewId.startsWith("d1-time-travel:")) {
    throw new Error("Informe o bookmark externo criado imediatamente antes da aplicação.");
  }
  await assertMarketClosed();
  const rows = await DB.prepare(`
    SELECT s.id, s.status, s.items_json AS itemsJson,
           r.division, r.round_number AS roundNumber
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE r.round_number = ? AND s.status IN ('previewed', 'applied')
    ORDER BY r.division, s.created_at DESC
  `).bind(roundNumber).all();
  const latestByDivision = new Map();
  for (const row of rows.results || []) {
    if (!latestByDivision.has(row.division)) latestByDivision.set(row.division, row);
  }
  if (latestByDivision.size !== 2) {
    throw new Error("As duas prévias de valorização não foram encontradas.");
  }
  const applications = [];
  for (const division of ["ascension", "elite"]) {
    const simulation = latestByDivision.get(division);
    if (simulation.status === "applied") {
      applications.push({ simulationId: simulation.id, division, idempotent: true });
      continue;
    }
    const items = JSON.parse(simulation.itemsJson || "[]");
    validateValuationItems(items, division);
    const pending = items.filter((item) => item.needsReview && item.reviewStatus === "pending");
    for (const item of pending) {
      await invoke(__test.adminValuationReview, {
        simulationId: simulation.id,
        assetId: item.assetId,
        action: "approve",
        reason: "Dados oficiais da rodada, WOs e adiamento conferidos."
      });
    }
    const applied = await invoke(__test.adminValuationApply, {
      simulationId: simulation.id,
      confirmSimulationId: simulation.id
    });
    applications.push({
      simulationId: simulation.id,
      division,
      reviewed: pending.length,
      backupId: applied.backupId,
      summary: applied.summary,
      patrimony: applied.patrimony,
      idempotent: Boolean(applied.idempotent)
    });
  }
  const audit = await finalAudit();
  console.log(JSON.stringify({ mode, roundNumber, applications, audit }, null, 2));
} else {
  throw new Error("Modo inválido. Use preview, process ou apply.");
}
}

async function invoke(handler, body) {
  const request = new Request("https://fantasy-rk.local/maintenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const response = await handler(request, env, crypto.randomUUID(), auth);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    const error = new Error(payload?.error?.message || `Operação respondeu HTTP ${response.status}.`);
    error.details = payload?.error?.details || null;
    throw error;
  }
  return payload.data;
}

async function assertMarketClosed() {
  const row = await DB.prepare(`
    SELECT status, lock_round_number AS lockRoundNumber
    FROM fantasy_market_state WHERE id = 'global'
  `).first();
  if (row?.status !== "closed") throw new Error("O mercado precisa permanecer fechado.");
  return row;
}

function assertRoundPreview(preview) {
  if (!preview.ready || preview.divisions?.length !== 2) {
    throw new Error("A rodada oficial ainda não está pronta para processamento.");
  }
  for (const division of preview.divisions) {
    if (division.completedSeries !== division.expectedSeries) {
      throw new Error(`A divisão ${division.division} possui séries não resolvidas.`);
    }
  }
  if (roundNumber === 2) {
    const elite = preview.divisions.find((item) => item.division === "elite");
    const ascension = preview.divisions.find((item) => item.division === "ascension");
    if (
      elite?.playedSeries !== 5 || elite?.walkovers !== 2 || elite?.postponed !== 1 ||
      ascension?.playedSeries !== 7 || ascension?.walkovers !== 1 || ascension?.postponed !== 0
    ) {
      throw new Error("A composição oficial esperada da rodada 2 não confere.");
    }
  }
}

function validateValuationItems(items, division) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error(`A simulação de ${division} não possui ativos.`);
  }
  for (const item of items) {
    if (!Number.isInteger(Number(item.newPriceCents)) || Number(item.newPriceCents) < 400) {
      throw new Error(`Preço inválido para ${division}:${item.assetId}.`);
    }
    if (Number(item.games) === 0 && Number(item.deltaCents) !== 0) {
      throw new Error(`Ativo sem jogo teve preço alterado: ${division}:${item.assetId}.`);
    }
    if (division === "elite" && isFvlSdk(item.teamName) &&
        (Number(item.games) !== 0 || Number(item.roundPoints) !== 0 || Number(item.deltaCents) !== 0)) {
      throw new Error(`Ativo de FVL/SDK não foi neutralizado: ${item.assetId}.`);
    }
  }
}

function isFvlSdk(teamName) {
  const normalized = String(teamName || "").normalize("NFKD")
    .replace(/\p{M}/gu, "").toUpperCase();
  return normalized === "FAVELAO DO TECHY" || normalized === "SPACE DUCKS";
}

function summarizeSimulation(simulation) {
  const reviewItems = (simulation.items || [])
    .filter((item) => item.needsReview)
    .map((item) => ({
      assetId: item.assetId,
      name: item.name,
      teamSlot: item.teamSlot,
      games: item.games,
      roundPoints: item.roundPoints,
      currentPrice: item.currentPrice,
      newPrice: item.newPrice,
      delta: item.delta,
      status: item.status,
      reviewStatus: item.reviewStatus
    }));
  return {
    id: simulation.id,
    division: simulation.round.division,
    status: simulation.status,
    summary: simulation.summary,
    patrimony: simulation.patrimony?.summary || simulation.patrimony,
    reviewItems,
    didNotPlay: (simulation.items || []).filter((item) => Number(item.games) === 0).length,
    changedAssets: (simulation.items || []).filter((item) => Number(item.deltaCents) !== 0).length
  };
}

async function scoringAudit() {
  const [state, rounds, scores, affected, substitutions] = await Promise.all([
    assertMarketClosed(),
    DB.prepare(`
      SELECT division, status, formula_version AS formulaVersion
      FROM fantasy_rounds WHERE round_number = ? ORDER BY division
    `).bind(roundNumber).all(),
    DB.prepare(`
      SELECT r.division, COUNT(*) AS assets,
             SUM(CASE WHEN games > 0 THEN 1 ELSE 0 END) AS playedAssets,
             SUM(CASE WHEN games = 0 THEN 1 ELSE 0 END) AS didNotPlayAssets
      FROM fantasy_asset_round_scores s
      JOIN fantasy_rounds r ON r.id = s.round_id
      WHERE r.round_number = ? AND s.formula_version = 'fantasy-v2'
      GROUP BY r.division ORDER BY r.division
    `).bind(roundNumber).all(),
    DB.prepare(`
      SELECT COUNT(*) AS assets,
             SUM(CASE WHEN s.games = 0 AND s.points = 0 THEN 1 ELSE 0 END) AS zeroed
      FROM fantasy_asset_round_scores s
      JOIN fantasy_rounds r ON r.id = s.round_id
      JOIN fantasy_market m ON m.division = s.division AND m.asset_id = s.asset_id
      WHERE r.round_number = ? AND s.division = 'elite'
        AND m.asset_type = 'player' AND m.team_slot IN ('D1','D3')
    `).bind(roundNumber).first(),
    DB.prepare(`
      SELECT COUNT(*) AS lineups,
             SUM(CASE WHEN json_extract(ts.breakdown_json, '$.substituidoId') IS NOT NULL THEN 1 ELSE 0 END) AS reserveSubstitutions
      FROM fantasy_team_round_scores ts
      JOIN fantasy_rounds r ON r.id = ts.round_id
      WHERE r.round_number = ?
    `).bind(roundNumber).first()
  ]);
  return {
    market: state,
    rounds: rounds.results,
    scores: scores.results,
    affectedFvlSdkAssets: affected,
    lineups: substitutions
  };
}

async function finalAudit() {
  const [scoring, prices, patrimony, history] = await Promise.all([
    scoringAudit(),
    DB.prepare(`
      SELECT division, COUNT(*) AS assets,
             SUM(price_cents) AS priceSumCents,
             MIN(price_cents) AS minPriceCents,
             MAX(price_cents) AS maxPriceCents
      FROM fantasy_market WHERE active = 1
      GROUP BY division ORDER BY division
    `).all(),
    DB.prepare(`
      SELECT COUNT(*) AS accounts, MIN(current_cents) AS minimumCents,
             MAX(current_cents) AS maximumCents,
             SUM(current_cents) AS totalCents
      FROM fantasy_participant_patrimony
    `).first(),
    DB.prepare(`
      SELECT r.division, COUNT(*) AS rows,
             SUM(CASE WHEN h.status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published,
             SUM(CASE WHEN h.status = 'NO_VALID_LINEUP' THEN 1 ELSE 0 END) AS noValidLineup,
             SUM(CASE WHEN h.status = 'INCONSISTENT' THEN 1 ELSE 0 END) AS inconsistent
      FROM fantasy_patrimony_history h
      JOIN fantasy_rounds r ON r.id = h.round_id
      WHERE r.round_number = ?
      GROUP BY r.division ORDER BY r.division
    `).bind(roundNumber).all()
  ]);
  return {
    ...scoring,
    prices: prices.results,
    patrimony,
    patrimonyHistory: history.results
  };
}

function tomlString(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] || "";
}

class RemoteD1Database {
  constructor({ accountId, databaseId, oauthToken }) {
    this.url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.oauthToken = oauthToken;
  }

  prepare(sql) {
    return new RemoteD1Statement(this, sql, []);
  }

  async batch(statements) {
    const queries = statements.map((statement) => ({
      sql: statement.sql,
      params: statement.params
    }));
    return this.query({ batch: queries });
  }

  async query(queries) {
    const input = Array.isArray(queries) ? queries : [queries];
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.oauthToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input.length === 1 ? input[0] : input)
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload?.errors?.[0]?.message || `Cloudflare D1 respondeu HTTP ${response.status}.`);
    }
    const results = Array.isArray(payload.result) ? payload.result : [payload.result];
    const failed = results.find((result) => result?.success === false);
    if (failed) throw new Error(failed.error || "Uma consulta D1 falhou.");
    return results.map((result) => ({
      success: result?.success !== false,
      results: result?.results || [],
      meta: result?.meta || {}
    }));
  }
}

class RemoteD1Statement {
  constructor(database, sql, params) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new RemoteD1Statement(this.database, this.sql, params);
  }

  async all() {
    return (await this.database.query({ sql: this.sql, params: this.params }))[0];
  }

  async first() {
    return (await this.all()).results[0] || null;
  }

  async run() {
    return (await this.database.query({ sql: this.sql, params: this.params }))[0];
  }
}

await main();
