import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { __test } from "../worker/fantasy-admin.js";

const require = createRequire(import.meta.url);
const { calculateFantasyValuation } = require("../src/fantasy/valuation-v3.cjs");

const ACCOUNT_ID = "a209575f4a37474a86dbdd51f15a6607";
const DATABASE_ID = "cefb6791-1501-4ae1-b04d-2984ef6cf163";
const DIVISION = "elite";
const TEAM_SLOT = "D1";
const OLD_MARKET_ASSET_ID = "e9f77ada-22dd-4407-8030-c7abf4ebeb23";
const NIHIL_ID = "ee09cf39-13a1-4268-a363-dbd28955437b";
const TUTU_ID = "d9d9c418-c16a-4a24-b475-40de2f2873fe";
const ROUND_2_ID = "elite-r2";
const ROUND_3_ID = "elite-r3";
const ROUND_3_SIMULATION_ID = "3f29da74-015e-43d7-9026-f466564edc14";
const ROUND_2_SOURCE_HASH = "3f450add1989fbab7c73a5db6c927251a398888b5dea8cdf2fd92115c24e1720";
const AUDIT_ID = "roster-fix-elite-d1-top-r4";
const HISTORY_ID = "roster-fix-elite-r3-nihil";
const ACTOR = "Cress Albane · via Codex";
const mode = String(process.argv[2] || "preview").toLowerCase();

if (!new Set(["preview", "apply"]).has(mode)) {
  throw new TypeError("Use preview ou apply.");
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

const source = JSON.parse(fs.readFileSync(new URL("../assets/fantasy-source.json", import.meta.url), "utf8"));
const normalized = await __test.normalizeOfficialSource(source);
const sourceTeam = normalized.teams.find((team) => team.division === DIVISION && team.slot === TEAM_SLOT);
const sourceNihil = normalized.players.find((player) => player.id === NIHIL_ID);
const sourceTutu = normalized.players.find((player) => player.id === TUTU_ID);
if (!sourceTeam || !sourceNihil || !sourceTutu) {
  throw new Error("NIHIL, TUTU ou a equipe D1 não foram encontrados na fonte local.");
}
if (!sourceNihil.isStarter || sourceNihil.role !== "TOP" || sourceTutu.isStarter || sourceTutu.role !== "TOP") {
  throw new Error("A fonte local não representa NIHIL como TOP titular e TUTU como reserva TOP.");
}

const DB = createDatabase({
  accountId: ACCOUNT_ID,
  databaseId: DATABASE_ID,
  oauthToken
});

const state = await readState();
const oldMarket = state.market.find((item) => item.assetId === OLD_MARKET_ASSET_ID) || null;
const nihilMarket = state.market.find((item) => item.assetId === NIHIL_ID) || null;
const round1 = state.scores.find((item) => Number(item.roundNumber) === 1);
const round3 = state.scores.find((item) => Number(item.roundNumber) === 3);
const alreadyApplied = Boolean(
  state.audit
  && nihilMarket?.active === 1
  && nihilMarket?.role === "TOP"
  && oldMarket?.active === 0
);

if (!round1 || Number(round1.games) <= 0 || !round3 || Number(round3.games) <= 0) {
  throw new Error("As pontuações oficiais das rodadas 1 e 3 do NIHIL não estão disponíveis.");
}
if (Number(state.currentRoundPicks) !== 0) {
  throw new Error("A correção foi interrompida porque TUTU ou NIHIL já aparece em uma escalação da Rodada 4.");
}
if (!state.simulation || state.simulation.status !== "applied") {
  throw new Error("A simulação de valorização aplicada da Rodada 3 não foi encontrada.");
}
if (!alreadyApplied && (!oldMarket || oldMarket.active !== 1 || oldMarket.displayName !== "TUTU")) {
  throw new Error("O registro ativo incorreto de TUTU não corresponde ao estado esperado.");
}

const history = [{
  points: Number(round1.points),
  games: Number(round1.games),
  roundNumber: 1,
  finalized: true
}];
const currentPrice = Number(oldMarket?.price || nihilMarket?.previousPrice || 16);
const calculation = calculateFantasyValuation({
  currentPrice,
  currentPoints: Number(round3.points),
  history,
  currentRound: 3,
  playerMaps: Number(round3.games),
  teamMaps: Number(round3.games)
});
const previousCalculation = calculateFantasyValuation({
  currentPrice,
  currentPoints: 0,
  history,
  currentRound: 2,
  playerMaps: 0,
  teamMaps: 0
});
const priceBeforeCents = Math.round(currentPrice * 100);
const priceAfterCents = Math.round(calculation.newPrice * 100);
const averagePoints = roundMoney((Number(round1.points) + Number(round3.points)) / 2);
const previousValuation = valuationDetails({
  calculation: previousCalculation,
  priceBeforeCents,
  priceAfterCents: priceBeforeCents,
  roundPoints: 0,
  historicalAverage: null,
  games: 0,
  playerMaps: 0,
  teamMaps: 0,
  totalGames: 1,
  previousValuation: {}
});
const currentValuation = valuationDetails({
  calculation,
  priceBeforeCents,
  priceAfterCents,
  roundPoints: Number(round3.points),
  historicalAverage: Number(round1.points),
  games: Number(round3.games),
  playerMaps: Number(round3.games),
  teamMaps: Number(round3.games),
  totalGames: Number(round3.games),
  previousValuation
});
const round2Dnp = {
  formulaVersion: 2,
  atletaId: NIHIL_ID,
  equipeId: TEAM_SLOT,
  posicao: "TOP",
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
};

const preview = {
  mode,
  alreadyApplied,
  currentRoundPicks: Number(state.currentRoundPicks),
  before: {
    activeTop: oldMarket,
    nihil: nihilMarket
  },
  after: {
    id: NIHIL_ID,
    displayName: "NIHIL",
    role: "TOP",
    price: calculation.newPrice,
    previousPrice: currentPrice,
    averagePoints,
    round1Points: Number(round1.points),
    round3Points: Number(round3.points),
    sourceHash: sourceNihil.sourceHash,
    active: 1
  },
  valuation: calculation
};

if (mode === "preview") {
  console.log(JSON.stringify(preview, null, 2));
} else if (alreadyApplied) {
  await refreshAppliedSource();
} else {
  await applyCorrection();
}

async function refreshAppliedSource() {
  await DB.batch([
    officialPlayerUpsert(sourceNihil),
    officialPlayerUpsert(sourceTutu),
    DB.prepare(`
      UPDATE fantasy_market
      SET source_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ? AND active = 1
    `).bind(sourceNihil.sourceHash, DIVISION, NIHIL_ID)
  ]);
  const verified = await readState();
  const verifiedNihil = verified.market.find((item) => item.assetId === NIHIL_ID);
  if (verifiedNihil?.sourceHash !== sourceNihil.sourceHash) {
    throw new Error("O hash final da fonte do NIHIL não foi atualizado.");
  }
  console.log(JSON.stringify({
    ...preview,
    applied: true,
    refreshedSourceHash: verifiedNihil.sourceHash
  }, null, 2));
}

async function applyCorrection() {
const beforeAudit = {
  market: state.market,
  officialPlayers: state.officialPlayers,
  currentRoundPicks: Number(state.currentRoundPicks)
};
const afterAudit = {
  market: preview.after,
  oldMarketAsset: { id: OLD_MARKET_ASSET_ID, active: 0, officialStatus: "inactive", isStarter: 0 },
  officialPlayers: {
    nihil: { id: NIHIL_ID, role: "TOP", rosterStatus: "starter", active: 1 },
    tutu: { id: TUTU_ID, role: "TOP", rosterStatus: "reserve", active: 1 },
    obsoleteIdentity: { id: OLD_MARKET_ASSET_ID, rosterStatus: "inactive", active: 0 }
  }
};

const statements = [
  DB.prepare(`
    UPDATE fantasy_market
    SET active = 0, official_status = 'inactive', is_starter = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE division = ? AND asset_id = ?
  `).bind(DIVISION, OLD_MARKET_ASSET_ID),
  DB.prepare(`
    UPDATE fantasy_official_players
    SET roster_status = 'inactive', active = 0, synced_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(OLD_MARKET_ASSET_ID),
  officialPlayerUpsert(sourceNihil),
  officialPlayerUpsert(sourceTutu),
  DB.prepare(`
    INSERT INTO fantasy_market
      (division, asset_id, asset_type, role, display_name, team_slot,
       team_name, team_tag, logo, price, previous_price, average_points,
       active, updated_at, price_cents, previous_price_cents,
       official_status, is_starter, source_hash, manual_override,
       last_score_breakdown_json, last_valuation_breakdown_json)
    VALUES (?, ?, 'player', 'TOP', ?, ?, ?, ?, ?, ?, ?, ?, 1,
            CURRENT_TIMESTAMP, ?, ?, 'active', 1, ?, 0, ?, ?)
    ON CONFLICT(division, asset_id) DO UPDATE SET
      role = 'TOP', display_name = excluded.display_name,
      team_slot = excluded.team_slot, team_name = excluded.team_name,
      team_tag = excluded.team_tag, logo = excluded.logo,
      price = excluded.price, previous_price = excluded.previous_price,
      average_points = excluded.average_points, active = 1,
      price_cents = excluded.price_cents,
      previous_price_cents = excluded.previous_price_cents,
      official_status = 'active', is_starter = 1,
      source_hash = excluded.source_hash, manual_override = 0,
      last_score_breakdown_json = excluded.last_score_breakdown_json,
      last_valuation_breakdown_json = excluded.last_valuation_breakdown_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    DIVISION,
    NIHIL_ID,
    sourceNihil.name,
    sourceNihil.teamSlot,
    sourceNihil.teamName,
    sourceNihil.teamTag,
    sourceNihil.logo,
    calculation.newPrice,
    currentPrice,
    averagePoints,
    priceAfterCents,
    priceBeforeCents,
    sourceNihil.sourceHash,
    round3.breakdownJson,
    JSON.stringify(currentValuation)
  ),
  DB.prepare(`
    INSERT INTO fantasy_asset_round_scores
      (round_id, division, asset_id, role, games, points, breakdown_json,
       formula_version, source_hash, processed_at)
    VALUES (?, ?, ?, 'TOP', 0, 0, ?, 'fantasy-v2', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(round_id, asset_id) DO UPDATE SET
      division = excluded.division, role = 'TOP', games = 0, points = 0,
      breakdown_json = excluded.breakdown_json,
      formula_version = excluded.formula_version,
      source_hash = excluded.source_hash,
      processed_at = CURRENT_TIMESTAMP
  `).bind(ROUND_2_ID, DIVISION, NIHIL_ID, JSON.stringify(round2Dnp), ROUND_2_SOURCE_HASH),
  DB.prepare(`
    INSERT INTO fantasy_market_snapshots
      (round_id, division, asset_id, price_before_cents,
       price_after_cents, formula_version, breakdown_json)
    VALUES (?, ?, ?, ?, ?, 'fantasy-v3-dynamic', ?)
    ON CONFLICT(round_id, asset_id) DO UPDATE SET
      price_before_cents = excluded.price_before_cents,
      price_after_cents = excluded.price_after_cents,
      formula_version = excluded.formula_version,
      breakdown_json = excluded.breakdown_json
  `).bind(
    ROUND_2_ID,
    DIVISION,
    NIHIL_ID,
    priceBeforeCents,
    priceBeforeCents,
    JSON.stringify(previousValuation)
  ),
  DB.prepare(`
    INSERT INTO fantasy_market_snapshots
      (round_id, division, asset_id, price_before_cents,
       price_after_cents, formula_version, breakdown_json)
    VALUES (?, ?, ?, ?, ?, 'fantasy-v3-dynamic', ?)
    ON CONFLICT(round_id, asset_id) DO UPDATE SET
      price_before_cents = excluded.price_before_cents,
      price_after_cents = excluded.price_after_cents,
      formula_version = excluded.formula_version,
      breakdown_json = excluded.breakdown_json
  `).bind(
    ROUND_3_ID,
    DIVISION,
    NIHIL_ID,
    priceBeforeCents,
    priceAfterCents,
    JSON.stringify(currentValuation)
  ),
  DB.prepare(`
    INSERT INTO fantasy_price_history
      (id, simulation_id, round_id, division, asset_id, asset_type,
       formula_version, price_before_cents, price_after_cents, delta_cents,
       points, expected_points, adjusted_performance, difference,
       participation_factor, needs_review, review_status, details_json,
       processed_by)
    VALUES (?, ?, ?, ?, ?, 'player', 'fantasy-v3-dynamic', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ok', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      price_before_cents = excluded.price_before_cents,
      price_after_cents = excluded.price_after_cents,
      delta_cents = excluded.delta_cents,
      points = excluded.points,
      expected_points = excluded.expected_points,
      adjusted_performance = excluded.adjusted_performance,
      difference = excluded.difference,
      participation_factor = excluded.participation_factor,
      needs_review = 0, review_status = 'ok',
      details_json = excluded.details_json,
      processed_by = excluded.processed_by,
      processed_at = CURRENT_TIMESTAMP
  `).bind(
    HISTORY_ID,
    ROUND_3_SIMULATION_ID,
    ROUND_3_ID,
    DIVISION,
    NIHIL_ID,
    priceBeforeCents,
    priceAfterCents,
    priceAfterCents - priceBeforeCents,
    Number(round3.points),
    calculation.expectedScore,
    calculation.adjustedPerformance,
    calculation.difference,
    calculation.participationFactor,
    JSON.stringify(currentValuation),
    ACTOR
  ),
  DB.prepare(`
    INSERT INTO fantasy_audit_log
      (id, actor_user_id, action, target_type, target_id,
       metadata_json, actor_admin_username, before_json, after_json,
       result, error_json, request_id)
    VALUES (?, NULL, 'roster.correct', 'fantasy_market', ?, ?, ?, ?, ?,
            'success', '{}', ?)
    ON CONFLICT(id) DO UPDATE SET
      metadata_json = excluded.metadata_json,
      actor_admin_username = excluded.actor_admin_username,
      before_json = excluded.before_json,
      after_json = excluded.after_json,
      result = 'success', error_json = '{}', request_id = excluded.request_id
  `).bind(
    AUDIT_ID,
    NIHIL_ID,
    JSON.stringify({
      reason: "NIHIL é o TOP titular atual do Favelão do Techy; TUTU constava incorretamente no mercado.",
      preservesHistoricalLineupsAndRankings: true,
      source: "Liga RK 26.2"
    }),
    ACTOR,
    JSON.stringify(beforeAudit),
    JSON.stringify(afterAudit),
    AUDIT_ID
  )
];

await DB.batch(statements);
const verified = await readState();
const verifiedOld = verified.market.find((item) => item.assetId === OLD_MARKET_ASSET_ID);
const verifiedNihil = verified.market.find((item) => item.assetId === NIHIL_ID);
if (
  verifiedOld?.active !== 0
  || verifiedNihil?.active !== 1
  || verifiedNihil?.role !== "TOP"
  || Number(verifiedNihil?.priceCents) !== priceAfterCents
  || !verified.audit
) {
  throw new Error("A verificação após a correção não encontrou o estado esperado.");
}

console.log(JSON.stringify({
  ...preview,
  applied: true,
  verified: {
    oldMarketAsset: verifiedOld,
    nihil: verifiedNihil,
    currentRoundPicks: Number(verified.currentRoundPicks),
    auditId: verified.audit.id
  }
}, null, 2));
}

function officialPlayerUpsert(player) {
  return DB.prepare(`
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
  );
}

function valuationDetails({
  calculation: value,
  priceBeforeCents,
  priceAfterCents,
  roundPoints,
  historicalAverage,
  games,
  playerMaps,
  teamMaps,
  totalGames,
  previousValuation
}) {
  return {
    formulaVersion: 3,
    formulaId: "fantasy-v3-dynamic",
    assetId: NIHIL_ID,
    assetType: "player",
    role: "TOP",
    name: sourceNihil.name,
    teamName: sourceNihil.teamName,
    currentPriceCents: priceBeforeCents,
    previousPriceCents: priceBeforeCents,
    previousPrice: priceBeforeCents / 100,
    newPriceCents: priceAfterCents,
    deltaCents: priceAfterCents - priceBeforeCents,
    currentPrice: priceBeforeCents / 100,
    newPrice: priceAfterCents / 100,
    delta: roundMoney((priceAfterCents - priceBeforeCents) / 100),
    roundPoints,
    historicalAverage,
    recentAverage: value.recentAverage,
    recentScores: value.recentScores,
    adjustedPerformance: value.adjustedPerformance,
    expectedScore: value.expectedScore,
    necessaryScore: value.expectedScore,
    scoreDifference: value.difference,
    baseVariation: value.baseVariation,
    priceFactor: value.priceFactor,
    participationRate: value.participationRate,
    participationFactor: value.participationFactor,
    confidence: value.played ? 1 : 0,
    games,
    playerMaps,
    teamMaps,
    totalGames,
    played: value.played,
    needsReview: value.needsReview,
    reviewStatus: "ok",
    status: value.status,
    previousValuation,
    breakdown: value
  };
}

async function readState() {
  const [market, officialPlayers, scores, simulation, currentRoundPicks, audit] = await Promise.all([
    DB.prepare(`
      SELECT asset_id AS assetId, display_name AS displayName, role,
             price, previous_price AS previousPrice,
             price_cents AS priceCents, previous_price_cents AS previousPriceCents,
             average_points AS averagePoints, active, official_status AS officialStatus,
             is_starter AS isStarter, source_hash AS sourceHash
      FROM fantasy_market
      WHERE division = ? AND asset_id IN (?, ?)
      ORDER BY asset_id
    `).bind(DIVISION, OLD_MARKET_ASSET_ID, NIHIL_ID).all(),
    DB.prepare(`
      SELECT id, display_name AS displayName, role, roster_status AS rosterStatus,
             active, source_hash AS sourceHash
      FROM fantasy_official_players
      WHERE id IN (?, ?, ?)
      ORDER BY id
    `).bind(OLD_MARKET_ASSET_ID, NIHIL_ID, TUTU_ID).all(),
    DB.prepare(`
      SELECT r.round_number AS roundNumber, s.round_id AS roundId,
             s.games, s.points, s.breakdown_json AS breakdownJson,
             s.formula_version AS formulaVersion, s.source_hash AS sourceHash
      FROM fantasy_asset_round_scores s
      JOIN fantasy_rounds r ON r.id = s.round_id
      WHERE s.asset_id = ?
      ORDER BY r.round_number
    `).bind(NIHIL_ID).all(),
    DB.prepare(`
      SELECT id, status, round_id AS roundId, formula_version AS formulaVersion
      FROM fantasy_price_simulations WHERE id = ?
    `).bind(ROUND_3_SIMULATION_ID).first(),
    DB.prepare(`
      SELECT COUNT(*) AS total
      FROM fantasy_lineup_picks p
      JOIN fantasy_lineups l ON l.id = p.lineup_id
      JOIN fantasy_rounds r ON r.id = l.round_id
      WHERE r.round_number = 4 AND p.asset_id IN (?, ?)
    `).bind(OLD_MARKET_ASSET_ID, NIHIL_ID).first(),
    DB.prepare(`
      SELECT id, action, target_id AS targetId, result
      FROM fantasy_audit_log WHERE id = ?
    `).bind(AUDIT_ID).first()
  ]);
  return {
    market: market.results,
    officialPlayers: officialPlayers.results,
    scores: scores.results,
    simulation,
    currentRoundPicks: Number(currentRoundPicks?.total || 0),
    audit
  };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function tomlString(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] || "";
}

function createDatabase({ accountId, databaseId, oauthToken }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const query = async (input) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
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
  };
  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...nextParams) => statement(sql, nextParams),
    all: async () => (await query({ sql, params }))[0],
    first: async () => (await query({ sql, params }))[0].results[0] || null
  });
  return {
    prepare: (sql) => statement(sql),
    batch: (statements) => query({
      batch: statements.map((item) => ({
        sql: item.sql,
        params: item.params
      }))
    }),
    query
  };
}
