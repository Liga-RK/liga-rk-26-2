import fs from "node:fs";
import path from "node:path";

const ACCOUNT_ID = "a209575f4a37474a86dbdd51f15a6607";
const DATABASE_ID = "cefb6791-1501-4ae1-b04d-2984ef6cf163";
const CONTENT_API_URL = "https://liga-rk-api.suporteinhouserk.workers.dev/api/content";
const AUDIT_ID = "roster-names-selected-round4-2026-08-15";
const ACTOR = "Cress Albane · via Codex";
const mode = String(process.argv[2] || "preview").toLowerCase();

const TARGETS = Object.freeze([
  Object.freeze({
    division: "elite",
    teamSlot: "C3",
    role: "TOP",
    id: "0f47f752-dea4-491c-a4b4-9c9187754d2b",
    oldName: "LUFFY",
    newName: "ROMAN"
  }),
  Object.freeze({
    division: "elite",
    teamSlot: "D4",
    role: "MID",
    id: "51ddf34b-a1bd-49d1-9989-9c36de9c16d5",
    oldName: "LOSTKING",
    newName: "GUNGI"
  }),
  Object.freeze({
    division: "elite",
    teamSlot: "D4",
    role: "SUP",
    id: "d34dc7d7-ee25-4b81-8c61-aa437acbe393",
    oldName: "GHOZT",
    newName: "BEBETO"
  }),
  Object.freeze({
    division: "ascension",
    teamSlot: "A4",
    role: "TOP",
    id: "95f1f650-005e-4781-b4cb-8acecd187194",
    oldName: "POLIGONS",
    newName: "DARK"
  }),
  Object.freeze({
    division: "ascension",
    teamSlot: "B1",
    role: "ADC",
    id: "afbe791d-6c49-4fc3-ade7-d00cb9fc5712",
    oldName: "STRONG",
    newName: "TAKOPI"
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

const official = await loadOfficialPlayers();
const DB = createDatabase({ accountId: ACCOUNT_ID, databaseId: DATABASE_ID, oauthToken });
const before = await readState();
const alreadyApplied = Boolean(before.audit) && TARGETS.every((target) => {
  const row = before.market.find((item) => item.assetId === target.id && item.division === target.division);
  return row?.displayName === target.newName && row?.manualOverride === 1;
});

const preview = {
  mode,
  alreadyApplied,
  sourceUpdatedAt: official.updatedAt,
  changes: TARGETS.map((target) => {
    const current = before.market.find((item) => item.assetId === target.id && item.division === target.division) || null;
    const live = official.players.get(targetKey(target));
    return {
      division: target.division,
      teamSlot: target.teamSlot,
      role: target.role,
      assetId: target.id,
      from: current?.displayName || null,
      to: target.newName,
      riotId: live.riotId,
      price: current?.price ?? null,
      previousPrice: current?.previousPrice ?? null,
      averagePoints: current?.averagePoints ?? null,
      lineupReferences: before.references.filter((item) => item.assetId === target.id).length
    };
  }),
  excluded: [
    "Ubers não será alterada.",
    "Favelinha Reformed não será alterada.",
    "Favelão do Techy não será alterado."
  ]
};

if (mode === "preview") {
  console.log(JSON.stringify(preview, null, 2));
} else if (alreadyApplied) {
  console.log(JSON.stringify({ ...preview, applied: true, idempotent: true }, null, 2));
} else {
  await applyCorrection();
}

async function applyCorrection() {
  for (const target of TARGETS) {
    const current = before.market.find((item) => item.assetId === target.id && item.division === target.division);
    if (
      !current ||
      current.displayName !== target.oldName ||
      current.teamSlot !== target.teamSlot ||
      current.role !== target.role
    ) {
      throw new Error(`O registro atual de ${target.division}/${target.teamSlot}/${target.role} não corresponde à prévia.`);
    }
  }

  const statements = [];
  for (const target of TARGETS) {
    const live = official.players.get(targetKey(target));
    statements.push(DB.prepare(`
      UPDATE fantasy_market
      SET display_name = ?, manual_override = 1, updated_at = CURRENT_TIMESTAMP
      WHERE division = ? AND asset_id = ? AND team_slot = ? AND role = ?
    `).bind(target.newName, target.division, target.id, target.teamSlot, target.role));
    statements.push(DB.prepare(`
      UPDATE fantasy_official_players
      SET display_name = ?, team_slot = ?, role = ?, riot_id = ?, opgg = ?,
          roster_status = 'starter', active = 1,
          source_payload_json = ?, synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND division = ?
    `).bind(
      target.newName,
      target.teamSlot,
      target.role,
      live.riotId,
      live.opgg,
      JSON.stringify(live.payload),
      target.id,
      target.division
    ));
  }

  statements.push(DB.prepare(`
    INSERT INTO fantasy_audit_log
      (id, actor_user_id, action, target_type, target_id,
       metadata_json, actor_admin_username, before_json, after_json,
       result, error_json, request_id)
    VALUES (?, NULL, 'roster.names.correct', 'fantasy_market', ?, ?, ?, ?, ?,
            'success', '{}', ?)
  `).bind(
    AUDIT_ID,
    AUDIT_ID,
    JSON.stringify({
      source: CONTENT_API_URL,
      sourceUpdatedAt: official.updatedAt,
      preservesAssetIds: true,
      preservesPrices: true,
      preservesStatistics: true,
      excludedTeams: ["ascension/C3", "ascension/C2", "elite/D1"]
    }),
    ACTOR,
    JSON.stringify({ market: before.market }),
    JSON.stringify({
      changes: TARGETS.map(({ division, teamSlot, role, id, oldName, newName }) => ({
        division,
        teamSlot,
        role,
        id,
        oldName,
        newName
      }))
    }),
    AUDIT_ID
  ));

  await DB.batch(statements);
  const after = await readState();
  for (const target of TARGETS) {
    const previous = before.market.find((item) => item.assetId === target.id && item.division === target.division);
    const current = after.market.find((item) => item.assetId === target.id && item.division === target.division);
    if (
      !current ||
      current.displayName !== target.newName ||
      current.manualOverride !== 1 ||
      current.priceCents !== previous.priceCents ||
      current.previousPriceCents !== previous.previousPriceCents ||
      current.averagePoints !== previous.averagePoints
    ) {
      throw new Error(`A verificação final de ${target.newName} falhou.`);
    }
  }
  if (!after.audit) throw new Error("A auditoria da correção não foi gravada.");

  console.log(JSON.stringify({
    ...preview,
    applied: true,
    verified: after.market.map((row) => ({
      division: row.division,
      teamSlot: row.teamSlot,
      role: row.role,
      assetId: row.assetId,
      displayName: row.displayName,
      price: row.price,
      averagePoints: row.averagePoints,
      manualOverride: row.manualOverride
    })),
    auditId: after.audit.id
  }, null, 2));
}

async function loadOfficialPlayers() {
  const response = await fetch(`${CONTENT_API_URL}?v=${Date.now()}`, {
    headers: { Accept: "application/json", "Cache-Control": "no-store" }
  });
  if (!response.ok) throw new Error(`A API oficial respondeu HTTP ${response.status}.`);
  const payload = await response.json();
  const players = new Map();
  for (const target of TARGETS) {
    const team = payload?.content?.divisions?.[target.division]?.teams?.[target.teamSlot];
    const player = (team?.players || []).find((item) => String(item.lane || "").toUpperCase() === target.role);
    if (
      !player ||
      player.playerId !== target.id ||
      String(player.player || "").toUpperCase() !== target.newName
    ) {
      throw new Error(`A API oficial não confirma ${target.newName} em ${target.division}/${target.teamSlot}/${target.role}.`);
    }
    players.set(targetKey(target), {
      riotId: String(player.riotId || ""),
      opgg: String(player.opgg || ""),
      payload: player
    });
  }
  return { updatedAt: payload.updatedAt || null, players };
}

async function readState() {
  const ids = TARGETS.map((target) => target.id);
  const placeholders = ids.map(() => "?").join(", ");
  const [market, references, audit] = await Promise.all([
    DB.prepare(`
      SELECT division, asset_id AS assetId, display_name AS displayName,
             team_slot AS teamSlot, role, price, previous_price AS previousPrice,
             price_cents AS priceCents, previous_price_cents AS previousPriceCents,
             average_points AS averagePoints, active,
             manual_override AS manualOverride
      FROM fantasy_market
      WHERE asset_id IN (${placeholders})
      ORDER BY division, team_slot, role
    `).bind(...ids).all(),
    DB.prepare(`
      SELECT p.asset_id AS assetId, l.id AS lineupId, l.round_id AS roundId,
             'starter' AS ownershipType
      FROM fantasy_lineup_picks p
      JOIN fantasy_lineups l ON l.id = p.lineup_id
      WHERE p.asset_id IN (${placeholders})
      UNION ALL
      SELECT r.asset_id AS assetId, l.id AS lineupId, l.round_id AS roundId,
             'reserve' AS ownershipType
      FROM fantasy_lineup_reserves r
      JOIN fantasy_lineups l ON l.id = r.lineup_id
      WHERE r.asset_id IN (${placeholders})
    `).bind(...ids, ...ids).all(),
    DB.prepare(`
      SELECT id, action, result FROM fantasy_audit_log WHERE id = ?
    `).bind(AUDIT_ID).first()
  ]);
  return {
    market: market.results,
    references: references.results,
    audit
  };
}

function targetKey(target) {
  return `${target.division}:${target.teamSlot}:${target.role}:${target.id}`;
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
