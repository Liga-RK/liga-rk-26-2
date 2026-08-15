import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { __test } from "../worker/fantasy-admin.js";

const require = createRequire(import.meta.url);
const { processarRodadaFantasy } = require("../src/fantasy/formula-v2.cjs");

const ACCOUNT_ID = "a209575f4a37474a86dbdd51f15a6607";
const DATABASE_ID = "cefb6791-1501-4ae1-b04d-2984ef6cf163";
const DIVISION = "ascension";
const TEAM_SLOT = "C2";
const ROUND_ID = "ascension-r4";
const AUDIT_ID = "roster-fix-ascension-c2-botlane-r4";
const ACTOR = "Cress Albane · via Codex";
const mode = String(process.argv[2] || "preview").toLowerCase();

const REPLACEMENTS = Object.freeze([
  Object.freeze({
    role: "ADC",
    oldId: "80883c10-97e8-480b-a1e4-7223a8175885",
    oldName: "TAKOPI",
    newId: "2594034c-9394-4b79-8b59-dedbf66482e5",
    newName: "KAISER"
  }),
  Object.freeze({
    role: "SUP",
    oldId: "122ca6bd-7a58-41fa-9d20-e9c0d58eb90f",
    oldName: "PEN DRIVE",
    newId: "745a0ee6-ebda-4170-a095-68565c5f425b",
    newName: "BURRAXA"
  })
]);

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
const normalizedSource = await __test.normalizeOfficialSource(source);
const sourcePlayers = new Map(
  normalizedSource.players
    .filter((player) => player.division === DIVISION && player.teamSlot === TEAM_SLOT)
    .map((player) => [player.id, player])
);
for (const replacement of REPLACEMENTS) {
  const player = sourcePlayers.get(replacement.newId);
  if (!player || player.name !== replacement.newName || player.role !== replacement.role || !player.isStarter) {
    throw new Error(`A fonte local não confirma ${replacement.newName} como ${replacement.role} titular da Favelinha.`);
  }
}

const historicalScores = await buildHistoricalScores();
const DB = createDatabase({ accountId: ACCOUNT_ID, databaseId: DATABASE_ID, oauthToken });
const before = await readState();
const oldReferenceCount = before.references.filter((row) => REPLACEMENTS.some((item) => item.oldId === row.assetId)).length;
const alreadyApplied = Boolean(before.audit && oldReferenceCount === 0 && REPLACEMENTS.every((replacement) => {
  const market = before.market.find((row) => row.assetId === replacement.newId);
  return market?.active === 1 && market?.displayName === replacement.newName && market?.teamSlot === TEAM_SLOT;
}));

const preview = {
  mode,
  alreadyApplied,
  round: before.round,
  replacements: REPLACEMENTS.map((replacement) => ({
    ...replacement,
    marketBefore: before.market.find((row) => row.assetId === replacement.oldId) || null,
    marketAfter: marketPreview(replacement),
    historicalScores: historicalScores.get(replacement.newId).map((score) => ({
      roundNumber: score.rodadaNumero,
      games: score.mapasDisputados,
      points: score.pontuacaoOficial,
      teamSlot: score.equipeId
    }))
  })),
  affected: {
    references: before.references,
    draftPredictions: before.draftPredictions,
    uniqueLineups: new Set(before.references.map((row) => row.lineupId)).size,
    starters: before.references.filter((row) => row.ownershipType === "starter").length,
    reserves: before.references.filter((row) => row.ownershipType === "reserve").length,
    captains: before.references.filter((row) => row.isCaptain === 1).length
  },
  snapshots: before.snapshots
};

if (mode === "preview") {
  console.log(JSON.stringify(preview, null, 2));
} else if (alreadyApplied) {
  console.log(JSON.stringify({ ...preview, applied: true, idempotent: true }, null, 2));
} else {
  await applyCorrection();
}

async function applyCorrection() {
  if (!before.round || !["locked", "scored"].includes(before.round.status)) {
    throw new Error("A Rodada 4 da Ascensão precisa estar fechada antes da correção.");
  }
  const historicalRoundsResult = await DB.prepare(`
    SELECT id, round_number AS roundNumber
    FROM fantasy_rounds
    WHERE division = ? AND round_number IN (1, 2, 3)
  `).bind(DIVISION).all();
  const historicalRoundIds = new Map(
    historicalRoundsResult.results.map((round) => [Number(round.roundNumber), round.id])
  );
  for (const roundNumber of [1, 2, 3]) {
    if (!historicalRoundIds.has(roundNumber)) {
      throw new Error(`A Rodada ${roundNumber} da Ascensão não foi encontrada no banco.`);
    }
  }
  for (const replacement of REPLACEMENTS) {
    const oldMarket = before.market.find((row) => row.assetId === replacement.oldId);
    const existingNew = before.market.find((row) => row.assetId === replacement.newId);
    if (!oldMarket || oldMarket.displayName !== replacement.oldName || oldMarket.role !== replacement.role || oldMarket.teamSlot !== TEAM_SLOT) {
      throw new Error(`O registro de ${replacement.oldName} não corresponde ao estado esperado.`);
    }
    if (existingNew?.active === 1) {
      throw new Error(`${replacement.newName} já está ativo no mercado; gere uma nova prévia antes de continuar.`);
    }
  }

  const statements = [];
  for (const replacement of REPLACEMENTS) {
    const oldMarket = before.market.find((row) => row.assetId === replacement.oldId);
    const player = sourcePlayers.get(replacement.newId);
    const scores = historicalScores.get(replacement.newId);
    const recentScore = scores.find((score) => score.rodadaNumero === 3);
    const averagePoints = roundMoney(scores.reduce((sum, score) => sum + score.pontuacaoOficial, 0) / scores.length);

    statements.push(DB.prepare(`
      UPDATE fantasy_market
      SET active = 0, official_status = 'inactive', is_starter = 0,
          manual_override = 0, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ?
    `).bind(DIVISION, replacement.oldId));
    statements.push(DB.prepare(`
      UPDATE fantasy_official_players
      SET roster_status = 'inactive', active = 0, synced_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(replacement.oldId));
    statements.push(officialPlayerUpsert(player));
    statements.push(DB.prepare(`
      INSERT INTO fantasy_market
        (division, asset_id, asset_type, role, display_name, team_slot,
         team_name, team_tag, logo, price, previous_price, average_points,
         active, updated_at, price_cents, previous_price_cents,
         official_status, is_starter, source_hash, manual_override,
         last_score_breakdown_json, last_valuation_breakdown_json)
      VALUES (?, ?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
              CURRENT_TIMESTAMP, ?, ?, 'active', 1, ?, 0, ?, '{}')
      ON CONFLICT(division, asset_id) DO UPDATE SET
        role = excluded.role, display_name = excluded.display_name,
        team_slot = excluded.team_slot, team_name = excluded.team_name,
        team_tag = excluded.team_tag, logo = excluded.logo,
        price = excluded.price, previous_price = excluded.previous_price,
        average_points = excluded.average_points, active = 1,
        price_cents = excluded.price_cents,
        previous_price_cents = excluded.previous_price_cents,
        official_status = 'active', is_starter = 1,
        source_hash = excluded.source_hash, manual_override = 0,
        last_score_breakdown_json = excluded.last_score_breakdown_json,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      DIVISION,
      replacement.newId,
      replacement.role,
      replacement.newName,
      TEAM_SLOT,
      player.teamName,
      player.teamTag,
      player.logo,
      oldMarket.price,
      oldMarket.previousPrice,
      averagePoints,
      oldMarket.priceCents,
      oldMarket.previousPriceCents,
      player.sourceHash,
      JSON.stringify(recentScore)
    ));

    for (const score of scores) {
      const normalized = score.__normalized;
      const cleanScore = { ...score };
      delete cleanScore.__normalized;
      statements.push(DB.prepare(`
        INSERT INTO fantasy_asset_round_scores
          (round_id, division, asset_id, role, games, points, breakdown_json,
           formula_version, source_hash, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'fantasy-v2', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(round_id, asset_id) DO UPDATE SET
          division = excluded.division, role = excluded.role,
          games = excluded.games, points = excluded.points,
          breakdown_json = excluded.breakdown_json,
          formula_version = excluded.formula_version,
          source_hash = excluded.source_hash,
          processed_at = CURRENT_TIMESTAMP
      `).bind(
        historicalRoundIds.get(score.rodadaNumero),
        DIVISION,
        replacement.newId,
        replacement.role,
        score.mapasDisputados,
        score.pontuacaoOficial,
        JSON.stringify(cleanScore),
        normalized.hash
      ));
    }

    statements.push(DB.prepare(`
      UPDATE fantasy_lineup_picks
      SET asset_id = ?, team_slot = ?
      WHERE asset_id = ? AND role = ?
        AND lineup_id IN (
          SELECT l.id FROM fantasy_lineups l
          JOIN fantasy_rounds r ON r.id = l.round_id
          WHERE r.id = ? AND r.division = ?
        )
    `).bind(replacement.newId, TEAM_SLOT, replacement.oldId, replacement.role, ROUND_ID, DIVISION));
    statements.push(DB.prepare(`
      UPDATE fantasy_lineup_reserves
      SET asset_id = ?, team_slot = ?
      WHERE asset_id = ? AND role = ?
        AND lineup_id IN (
          SELECT l.id FROM fantasy_lineups l
          JOIN fantasy_rounds r ON r.id = l.round_id
          WHERE r.id = ? AND r.division = ?
        )
    `).bind(replacement.newId, TEAM_SLOT, replacement.oldId, replacement.role, ROUND_ID, DIVISION));
    statements.push(DB.prepare(`
      UPDATE fantasy_lineups
      SET captain_asset_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE captain_asset_id = ? AND round_id = ?
    `).bind(replacement.newId, replacement.oldId, ROUND_ID));
    statements.push(DB.prepare(`
      UPDATE fantasy_lineup_draft_predictions
      SET player_asset_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE player_asset_id = ? AND role = ?
        AND lineup_id IN (
          SELECT id FROM fantasy_lineups WHERE round_id = ?
        )
    `).bind(replacement.newId, replacement.oldId, replacement.role, ROUND_ID));
    statements.push(DB.prepare(`
      INSERT INTO fantasy_market_snapshots
        (round_id, division, asset_id, price_before_cents, price_after_cents,
         formula_version, breakdown_json)
      VALUES (?, ?, ?, ?, NULL, ?, '{}')
      ON CONFLICT(round_id, asset_id) DO UPDATE SET
        division = excluded.division,
        price_before_cents = excluded.price_before_cents,
        price_after_cents = NULL,
        formula_version = excluded.formula_version,
        breakdown_json = '{}'
    `).bind(
      ROUND_ID,
      DIVISION,
      replacement.newId,
      oldMarket.priceCents,
      before.round.formulaVersion
    ));
  }

  statements.push(DB.prepare(`
    INSERT INTO fantasy_audit_log
      (id, actor_user_id, action, target_type, target_id,
       metadata_json, actor_admin_username, before_json, after_json,
       result, error_json, request_id)
    VALUES (?, NULL, 'lineup.roster_substitution', 'round', ?, ?, ?, ?, ?,
            'success', '{}', ?)
  `).bind(
    AUDIT_ID,
    ROUND_ID,
    JSON.stringify({
      reason: "KAISER e BURRAXA foram os titulares da Favelinha na Rodada 4.",
      preservesPricePaid: true,
      preservesCaptain: true,
      transfersDraftPredictionByRole: true,
      source: "Liga RK 26.2"
    }),
    ACTOR,
    JSON.stringify({
      market: before.market,
      references: before.references,
      draftPredictions: before.draftPredictions,
      snapshots: before.snapshots
    }),
    JSON.stringify({ replacements: REPLACEMENTS }),
    AUDIT_ID
  ));

  await DB.batch(statements);
  const after = await readState();
  const remainingOldReferences = after.references.filter((row) =>
    REPLACEMENTS.some((replacement) => replacement.oldId === row.assetId)
  );
  for (const replacement of REPLACEMENTS) {
    const oldMarket = after.market.find((row) => row.assetId === replacement.oldId);
    const newMarket = after.market.find((row) => row.assetId === replacement.newId);
    if (oldMarket?.active !== 0 || newMarket?.active !== 1 || newMarket?.displayName !== replacement.newName) {
      throw new Error(`A verificação final de ${replacement.newName} falhou.`);
    }
  }
  if (remainingOldReferences.length || !after.audit) {
    throw new Error("A verificação final encontrou referências antigas ou auditoria ausente.");
  }

  console.log(JSON.stringify({
    ...preview,
    applied: true,
    verified: {
      market: after.market,
      references: after.references,
      draftPredictions: after.draftPredictions,
      auditId: after.audit.id
    }
  }, null, 2));
}

async function buildHistoricalScores() {
  const result = new Map(REPLACEMENTS.map((replacement) => [replacement.newId, []]));
  for (const roundNumber of [1, 2, 3]) {
    const normalized = await __test.normalizeFormulaV2Round(source, roundNumber, DIVISION);
    const processed = processarRodadaFantasy({
      rodadaId: `ascension-r${roundNumber}`,
      rodadaNumero: roundNumber,
      divisao: DIVISION,
      series: normalized.series
    });
    for (const replacement of REPLACEMENTS) {
      const score = processed.pontuacoes.find((item) => item.atletaId === replacement.newId);
      if (!score || !score.jogou) {
        throw new Error(`Pontuação histórica de ${replacement.newName} ausente na Rodada ${roundNumber}.`);
      }
      result.get(replacement.newId).push({ ...score, __normalized: normalized });
    }
  }
  return result;
}

function marketPreview(replacement) {
  const oldMarket = before.market.find((row) => row.assetId === replacement.oldId);
  const scores = historicalScores.get(replacement.newId);
  return {
    id: replacement.newId,
    name: replacement.newName,
    role: replacement.role,
    teamSlot: TEAM_SLOT,
    price: oldMarket?.price,
    previousPrice: oldMarket?.previousPrice,
    averagePoints: roundMoney(scores.reduce((sum, score) => sum + score.pontuacaoOficial, 0) / scores.length)
  };
}

function officialPlayerUpsert(player) {
  return DB.prepare(`
    INSERT INTO fantasy_official_players
      (id, division, team_id, team_slot, display_name, role, riot_id, opgg,
       roster_status, active, source_hash, source_payload_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'starter', 1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      division = excluded.division, team_id = excluded.team_id,
      team_slot = excluded.team_slot, display_name = excluded.display_name,
      role = excluded.role, riot_id = excluded.riot_id, opgg = excluded.opgg,
      roster_status = 'starter', active = 1,
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
    player.sourceHash,
    JSON.stringify(player.payload)
  );
}

async function readState() {
  const ids = REPLACEMENTS.flatMap((replacement) => [replacement.oldId, replacement.newId]);
  const placeholders = ids.map(() => "?").join(", ");
  const [round, market, officialPlayers, references, draftPredictions, snapshots, audit] = await Promise.all([
    DB.prepare(`
      SELECT id, division, round_number AS roundNumber, status,
             formula_version AS formulaVersion, locks_at AS locksAt
      FROM fantasy_rounds WHERE id = ?
    `).bind(ROUND_ID).first(),
    DB.prepare(`
      SELECT asset_id AS assetId, display_name AS displayName, role,
             team_slot AS teamSlot, price, previous_price AS previousPrice,
             price_cents AS priceCents, previous_price_cents AS previousPriceCents,
             average_points AS averagePoints, active,
             official_status AS officialStatus, is_starter AS isStarter,
             manual_override AS manualOverride
      FROM fantasy_market
      WHERE division = ? AND asset_id IN (${placeholders})
      ORDER BY role, asset_id
    `).bind(DIVISION, ...ids).all(),
    DB.prepare(`
      SELECT id, display_name AS displayName, role, team_slot AS teamSlot,
             roster_status AS rosterStatus, active
      FROM fantasy_official_players
      WHERE id IN (${placeholders}) ORDER BY id
    `).bind(...ids).all(),
    DB.prepare(`
      SELECT l.id AS lineupId, u.username, t.name AS fantasyTeamName,
             p.asset_id AS assetId, p.role, p.price_paid AS pricePaid,
             'starter' AS ownershipType,
             CASE WHEN l.captain_asset_id = p.asset_id THEN 1 ELSE 0 END AS isCaptain
      FROM fantasy_lineups l
      JOIN fantasy_rounds r ON r.id = l.round_id
      JOIN fantasy_teams t ON t.id = l.fantasy_team_id
      JOIN fantasy_users u ON u.id = t.user_id
      JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
      WHERE r.id = ? AND r.division = ? AND p.asset_id IN (${placeholders})
      UNION ALL
      SELECT l.id AS lineupId, u.username, t.name AS fantasyTeamName,
             x.asset_id AS assetId, x.role, x.price_paid AS pricePaid,
             'reserve' AS ownershipType, 0 AS isCaptain
      FROM fantasy_lineups l
      JOIN fantasy_rounds r ON r.id = l.round_id
      JOIN fantasy_teams t ON t.id = l.fantasy_team_id
      JOIN fantasy_users u ON u.id = t.user_id
      JOIN fantasy_lineup_reserves x ON x.lineup_id = l.id
      WHERE r.id = ? AND r.division = ? AND x.asset_id IN (${placeholders})
      ORDER BY username, role
    `).bind(ROUND_ID, DIVISION, ...ids, ROUND_ID, DIVISION, ...ids).all(),
    DB.prepare(`
      SELECT p.lineup_id AS lineupId, p.role, p.player_asset_id AS playerAssetId,
             p.mode, p.champion_id AS championId, p.map_number AS mapNumber,
             p.status
      FROM fantasy_lineup_draft_predictions p
      JOIN fantasy_lineups l ON l.id = p.lineup_id
      WHERE l.round_id = ? AND p.player_asset_id IN (${placeholders})
      ORDER BY p.lineup_id, p.role
    `).bind(ROUND_ID, ...ids).all(),
    DB.prepare(`
      SELECT round_id AS roundId, asset_id AS assetId,
             price_before_cents AS priceBeforeCents,
             price_after_cents AS priceAfterCents, formula_version AS formulaVersion
      FROM fantasy_market_snapshots
      WHERE round_id = ? AND asset_id IN (${placeholders})
      ORDER BY asset_id
    `).bind(ROUND_ID, ...ids).all(),
    DB.prepare(`
      SELECT id, action, target_id AS targetId, result
      FROM fantasy_audit_log WHERE id = ?
    `).bind(AUDIT_ID).first()
  ]);
  return {
    round,
    market: market.results,
    officialPlayers: officialPlayers.results,
    references: references.results,
    draftPredictions: draftPredictions.results,
    snapshots: snapshots.results,
    audit
  };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function tomlString(value, key) {
  const match = value.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] || "";
}

function createDatabase({ accountId, databaseId, oauthToken: token }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const query = async (input) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
      batch: statements.map((item) => ({ sql: item.sql, params: item.params }))
    })
  };
}
