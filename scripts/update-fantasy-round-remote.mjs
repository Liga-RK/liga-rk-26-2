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
const backupReference = String(process.argv[5] || "").trim();

const ROUND_FIVE_RESERVES = Object.freeze([
  { division: "elite", teamSlot: "A2", id: "715bf93f-f2ea-4097-a5d2-c8ce630e8575", name: "LINK", priceCents: 1300 },
  { division: "elite", teamSlot: "B3", id: "60a4e735-2da3-4fcd-a4d7-9f2d30deb0da", name: "GUSTA", priceCents: 1500 },
  { division: "elite", teamSlot: "B3", id: "29ed2283-7326-46fc-b3a6-532a344eee90", name: "VANFY", priceCents: 1500 },
  { division: "elite", teamSlot: "B3", id: "461313aa-b1c2-4b5d-9d02-098acdc32472", name: "WEEDU", priceCents: 1500 },
  { division: "elite", teamSlot: "C4", id: "e2f08c9f-414d-4591-8d2d-4a17a817d9ae", name: "BOLOTA", priceCents: 1200 },
  { division: "elite", teamSlot: "D1", id: "e9f77ada-22dd-4407-8030-c7abf4ebeb23", name: "TUTU", priceCents: 1600 },
  { division: "elite", teamSlot: "D1", id: "7c61ddca-8673-4050-96ab-a2abef4c5826", name: "FELTRINI", priceCents: 1600 },
  { division: "elite", teamSlot: "D1", id: "6de36187-98dc-49a9-8700-aa44830377a1", name: "CROSS", priceCents: 1600 },
  { division: "elite", teamSlot: "D3", id: "c2b79abc-0122-4930-9127-9a977db71ca6", name: "THOMINHAS", priceCents: 1500 },
  { division: "elite", teamSlot: "A3", id: "80165c7c-806c-4cb3-90f2-a4a969000bfd", name: "ROD", priceCents: 1300 },
  { division: "elite", teamSlot: "A3", id: "7cafc4a2-71a8-4540-8631-b7acc45f65dc", name: "COGNATU", priceCents: 1300 },
  { division: "elite", teamSlot: "A1", id: "92a2c7bf-4ebe-42da-bb50-8f991ad2369f", name: "XK", priceCents: 1300 },
  { division: "elite", teamSlot: "A1", id: "148a9ecf-28de-4d29-b8d8-e1b637aa7f50", name: "KAYIA", priceCents: 1300 },
  { division: "ascension", teamSlot: "A1", id: "8b0bb211-5bfd-46c2-819f-161c22c494d6", name: "YELLOW", priceCents: 1300 },
  { division: "ascension", teamSlot: "A1", id: "dce34e4e-90b8-4cf4-a792-432678ad9e16", name: "HERBERTH", priceCents: 1300 },
  { division: "ascension", teamSlot: "B1", id: "5e286312-66d1-4f61-ac27-0a743414cd91", name: "MISS HOLES", priceCents: 1500 },
  { division: "ascension", teamSlot: "C4", id: "6e072291-7183-4aa7-a2f0-2894dc026fe0", name: "COALA", priceCents: 1500 },
  { division: "ascension", teamSlot: "C4", id: "aef666a4-d7c9-4b54-9d66-6f5dc97bb700", name: "LELEO", priceCents: 1500 },
  { division: "ascension", teamSlot: "D3", id: "08a56d11-f689-4c41-8a2e-1abe6d890eb1", name: "MARCÃO", priceCents: 1500 },
  { division: "ascension", teamSlot: "D3", id: "0e8df0ab-8545-4c2b-814c-97bce3d71b0f", name: "OVER", priceCents: 1500 },
  { division: "ascension", teamSlot: "D3", id: "fa619765-50ba-4fa2-bd9c-e319bcb8c02c", name: "DRAX", priceCents: 1500 },
  { division: "ascension", teamSlot: "D2", id: "3302e62f-4af0-4455-b401-81cf58a86828", name: "ZILIN", priceCents: 1500 },
  { division: "ascension", teamSlot: "D2", id: "e8fa5df2-47ee-4ff4-9f29-80f95ee99aad", name: "POLLO", priceCents: 1500 },
  { division: "ascension", teamSlot: "D4", id: "d74532ef-f354-4326-89d9-74c9cc45b1c4", name: "GUOLHERME", priceCents: 1300 },
  { division: "ascension", teamSlot: "D4", id: "1d401693-8cd1-4dd1-ac42-f8e2f6a6d698", name: "JOSÉ3000", priceCents: 1300 },
  { division: "ascension", teamSlot: "D4", id: "fa30f17a-58a3-4652-af23-d988903bff29", name: "TRJACK", priceCents: 1300 },
  { division: "ascension", teamSlot: "B3", id: "455a9db1-b576-4202-8098-9cdac67d5cdf", name: "PROVÉRBIOS", priceCents: 1400 },
  { division: "ascension", teamSlot: "B3", id: "c2e3a850-d035-470b-8d42-288132b0019e", name: "TIMOR LESTE", priceCents: 1400 },
  { division: "ascension", teamSlot: "B3", id: "cb2737be-8473-4a8f-b365-412524ebf599", name: "PARANOIA", priceCents: 1400 }
]);

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
  __maintenanceBackup: mode === "process" || mode === "prepare-round"
    ? async () => backupReference
    : mode === "apply"
      ? async () => previewId
    : mode === "revalue-teams"
      ? async () => "external-sql:fantasy-production-before-round3-budget-and-team-valuation-20260806.sql"
      : null
};

if (mode === "close") {
  const closed = await invoke(__test.adminCloseMarket, {
    reason: `Fechamento operacional antes da atualização da Rodada ${roundNumber}.`
  });
  console.log(JSON.stringify({ mode, roundNumber, market: closed.market }, null, 2));
} else if (mode === "open-admin" || mode === "open-public") {
  await assertMarketClosed();
  const accessMode = mode === "open-admin" ? "admin" : "public";
  const opened = await invoke(__test.adminOpenMarket, { roundNumber, accessMode });
  console.log(JSON.stringify({
    mode,
    roundNumber,
    market: opened.market,
    draft: opened.draft,
    schedule: {
      closesAt: opened.schedule?.closesAt,
      firstMatch: opened.schedule?.match
    }
  }, null, 2));
} else if (mode === "preview") {
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
} else if (mode === "prepare-round") {
  if (!previewId) throw new Error("Informe o ID da prévia de sincronização.");
  if (!backupReference.startsWith("d1-time-travel:")) {
    throw new Error("Informe também o bookmark externo criado antes da preparação da rodada.");
  }
  await assertMarketClosed();
  const sync = await invoke(__test.adminSyncApply, { previewId });
  const reserves = roundNumber === 5 ? await upsertRoundFiveReserves() : null;
  const prepared = await prepareMarketRound(roundNumber);
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
    reserves,
    prepared
  }, null, 2));
} else if (mode === "process") {
  if (!previewId) throw new Error("Informe o ID da prévia de sincronização.");
  if (!backupReference.startsWith("d1-time-travel:")) {
    throw new Error("Informe também o bookmark externo criado imediatamente antes do processamento.");
  }
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
        reason: "Dados oficiais da rodada, WOs, adiamento e eliminação conferidos."
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
} else if (mode === "revalue-teams") {
  await assertMarketClosed();
  const appliedRows = await DB.prepare(`
    SELECT s.id, r.division
    FROM fantasy_price_simulations s
    JOIN fantasy_rounds r ON r.id = s.round_id
    WHERE r.round_number = ? AND s.status = 'applied'
    ORDER BY r.division
  `).bind(roundNumber).all();
  if ((appliedRows.results || []).length !== 2) {
    throw new Error("As duas valorizações aplicadas da rodada não foram encontradas.");
  }
  const rollbacks = [];
  for (const row of appliedRows.results || []) {
    const rolledBack = await invoke(__test.adminValuationRollback, {
      simulationId: row.id,
      confirmSimulationId: row.id,
      reason: "Reprocessamento oficial para incluir valorização dos ativos de equipe."
    });
    rollbacks.push({ division: row.division, simulationId: row.id, rollbackId: rolledBack.rollbackId });
  }
  const valuation = await invoke(__test.adminValuationSimulate, { roundNumber });
  const applications = [];
  for (const simulation of valuation.simulations) {
    const pending = (simulation.items || []).filter(
      (item) => item.needsReview && item.reviewStatus === "pending"
    );
    for (const item of pending) {
      await invoke(__test.adminValuationReview, {
        simulationId: simulation.id,
        assetId: item.assetId,
        action: "approve",
        reason: "Reprocessamento oficial conferido; inclui atletas e equipes da Rodada 2."
      });
    }
    const applied = await invoke(__test.adminValuationApply, {
      simulationId: simulation.id,
      confirmSimulationId: simulation.id
    });
    applications.push({
      division: simulation.round.division,
      simulationId: simulation.id,
      reviewed: pending.length,
      backupId: applied.backupId,
      summary: applied.summary,
      patrimony: applied.patrimony
    });
  }
  const audit = await finalAudit();
  console.log(JSON.stringify({ mode, roundNumber, rollbacks, applications, audit }, null, 2));
} else {
  throw new Error("Modo inválido. Use preview, process, apply ou revalue-teams.");
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
  if (roundNumber === 3) {
    const elite = preview.divisions.find((item) => item.division === "elite");
    const ascension = preview.divisions.find((item) => item.division === "ascension");
    if (
      elite?.playedSeries !== 4 || elite?.walkovers !== 4 || elite?.postponed !== 0 || elite?.cancelled !== 0 ||
      ascension?.playedSeries !== 7 || ascension?.walkovers !== 1 || ascension?.postponed !== 0 || ascension?.cancelled !== 0
    ) {
      throw new Error("A composição oficial esperada da rodada 3 não confere.");
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
    if (roundNumber === 2 && division === "elite" && isFvlSdk(item.teamName) &&
        (Number(item.games) !== 0 || Number(item.roundPoints) !== 0 || Number(item.deltaCents) !== 0)) {
      throw new Error(`Ativo de FVL/SDK não foi neutralizado: ${item.assetId}.`);
    }
    if (roundNumber === 3 && division === "elite" && isCashNkz(item.teamName) &&
        (Number(item.games) !== 0 || Number(item.roundPoints) !== 0 || Number(item.deltaCents) !== 0)) {
      throw new Error(`Ativo de CASH/NKZ não foi neutralizado: ${item.assetId}.`);
    }
  }
}

function isFvlSdk(teamName) {
  const normalized = String(teamName || "").normalize("NFKD")
    .replace(/\p{M}/gu, "").toUpperCase();
  return normalized === "FAVELAO DO TECHY" || normalized === "SPACE DUCKS";
}

function isCashNkz(teamName) {
  const normalized = String(teamName || "").normalize("NFKD")
    .replace(/\p{M}/gu, "").toUpperCase();
  return normalized === "CASHOUT & TRIMILIQUE LTDA" ||
    normalized === "NKZ REVENGERS" ||
    normalized === "NO KINGS ZONE";
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
  const excludedSlots = roundNumber === 2 ? ["D1", "D3"] :
    roundNumber === 3 ? ["C1", "C4"] : ["", ""];
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
        AND m.team_slot IN (?, ?)
    `).bind(roundNumber, ...excludedSlots).first(),
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
    excludedAssets: {
      reason: roundNumber === 2 ? "FVL x SDK adiado" :
        roundNumber === 3 ? "CASH x NKZ sem pontuação" : "sem exceção específica",
      ...affected
    },
    lineups: substitutions
  };
}

async function upsertRoundFiveReserves() {
  const statements = [];
  const resolved = [];
  for (const reserve of ROUND_FIVE_RESERVES) {
    const player = await DB.prepare(`
      SELECT p.id, p.division, p.team_slot AS teamSlot, p.display_name AS displayName,
             p.role, p.roster_status AS rosterStatus, p.source_hash AS sourceHash,
             t.name AS teamName, t.tag AS teamTag, t.logo
      FROM fantasy_official_players p
      JOIN fantasy_official_teams t ON t.id = p.team_id AND t.division = p.division
      WHERE p.id = ? AND p.division = ?
    `).bind(reserve.id, reserve.division).first();
    if (!player) throw new Error(`Reserva oficial não encontrado: ${reserve.division}/${reserve.name}/${reserve.id}.`);
    if (normalizeReserveName(player.displayName) !== normalizeReserveName(reserve.name)) {
      throw new Error(`Nome divergente para ${reserve.id}: esperado ${reserve.name}, recebido ${player.displayName}.`);
    }
    if (String(player.teamSlot) !== reserve.teamSlot || String(player.rosterStatus) !== "reserve") {
      throw new Error(`Vínculo divergente para ${reserve.name}: ${player.teamSlot}/${player.rosterStatus}.`);
    }
    const price = reserve.priceCents / 100;
    statements.push(DB.prepare(`
      UPDATE fantasy_official_players
      SET roster_status = 'reserve', active = 1, synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND division = ?
    `).bind(reserve.id, reserve.division));
    statements.push(DB.prepare(`
      INSERT INTO fantasy_market
        (division, asset_id, asset_type, role, display_name, team_slot,
         team_name, team_tag, logo, price, previous_price, average_points,
         active, updated_at, price_cents, previous_price_cents,
         official_status, is_starter, source_hash, manual_override)
      VALUES (?, ?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, 0, 1,
              CURRENT_TIMESTAMP, ?, ?, 'active', 0, ?, 1)
      ON CONFLICT(division, asset_id) DO UPDATE SET
        role = excluded.role, display_name = excluded.display_name,
        team_slot = excluded.team_slot, team_name = excluded.team_name,
        team_tag = excluded.team_tag, logo = excluded.logo,
        price = excluded.price, previous_price = excluded.previous_price,
        price_cents = excluded.price_cents,
        previous_price_cents = excluded.previous_price_cents,
        active = 1, official_status = 'active', is_starter = 0,
        source_hash = excluded.source_hash, manual_override = 1,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      reserve.division,
      reserve.id,
      player.role,
      reserve.name,
      reserve.teamSlot,
      player.teamName,
      player.teamTag,
      player.logo,
      price,
      price,
      reserve.priceCents,
      reserve.priceCents,
      player.sourceHash
    ));
    resolved.push({ ...reserve, role: player.role, teamName: player.teamName, teamTag: player.teamTag });
  }
  statements.push(DB.prepare(`
    INSERT INTO fantasy_audit_log
      (id, actor_user_id, action, target_type, target_id, metadata_json,
       actor_admin_username, before_json, after_json, result, error_json, request_id)
    VALUES (?, NULL, 'market.round5.reserves.upsert', 'fantasy_round', '5', ?, ?, '{}', ?, 'success', '{}', NULL)
  `).bind(
    crypto.randomUUID(),
    JSON.stringify({ count: resolved.length, divisions: { elite: 13, ascension: 16 } }),
    ACTOR,
    JSON.stringify({ reserves: resolved })
  ));
  await DB.batch(statements);

  const placeholders = ROUND_FIVE_RESERVES.map(() => "?").join(", ");
  const rows = await DB.prepare(`
    SELECT division, asset_id AS id, display_name AS name, team_slot AS teamSlot,
           price_cents AS priceCents, active, is_starter AS isStarter
    FROM fantasy_market WHERE asset_id IN (${placeholders})
    ORDER BY division, team_slot, display_name
  `).bind(...ROUND_FIVE_RESERVES.map((reserve) => reserve.id)).all();
  if ((rows.results || []).length !== ROUND_FIVE_RESERVES.length) {
    throw new Error(`Foram gravados ${(rows.results || []).length} de ${ROUND_FIVE_RESERVES.length} reservas.`);
  }
  for (const row of rows.results || []) {
    const expected = ROUND_FIVE_RESERVES.find((reserve) => reserve.id === row.id);
    if (!expected || Number(row.active) !== 1 || Number(row.isStarter) !== 0 || Number(row.priceCents) !== expected.priceCents) {
      throw new Error(`Auditoria do reserva falhou: ${row.division}/${row.name}.`);
    }
  }
  return {
    count: resolved.length,
    byDivision: { elite: 13, ascension: 16 },
    prices: resolved.map((reserve) => ({
      division: reserve.division,
      teamSlot: reserve.teamSlot,
      teamName: reserve.teamName,
      name: reserve.name,
      price: reserve.priceCents / 100
    }))
  };
}

function normalizeReserveName(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").trim().toUpperCase();
}

async function prepareMarketRound(targetRoundNumber) {
  const rounds = await DB.prepare(`
    SELECT id, division, round_number AS roundNumber, name, status,
           eligibility_json AS eligibilityJson
    FROM fantasy_rounds WHERE round_number = ?
    ORDER BY division
  `).bind(targetRoundNumber).all();
  if ((rounds.results || []).length !== 2) {
    throw new Error(`A rodada ${targetRoundNumber} precisa existir nas duas divisões.`);
  }
  const matches = await DB.prepare(`
    SELECT id, division, source_id AS sourceId, home_team_slot AS homeTeamSlot,
           away_team_slot AS awayTeamSlot, home_team_name AS homeTeamName,
           away_team_name AS awayTeamName, starts_at AS startsAt, status
    FROM fantasy_matches
    WHERE round_number = ? AND status NOT IN ('cancelled', 'postponed')
    ORDER BY starts_at, division, order_index
  `).bind(targetRoundNumber).all();
  for (const division of ["ascension", "elite"]) {
    const divisionMatches = (matches.results || []).filter((match) => match.division === division);
    if (divisionMatches.length !== 4) throw new Error(`${division} precisa ter quatro confrontos na rodada ${targetRoundNumber}.`);
    const round = (rounds.results || []).find((item) => item.division === division);
    const statuses = JSON.parse(round.eligibilityJson || "{}").teamStatuses || {};
    const counts = Object.values(statuses).reduce((summary, status) => {
      summary[status] = (summary[status] || 0) + 1;
      return summary;
    }, {});
    const eligibilityValid = targetRoundNumber === 4
      ? counts.playing === 8 && counts["qualified-next-round"] === 4 && counts.eliminated === 4
      : counts.playing === 8 && !counts["qualified-next-round"] && counts.eliminated === 8;
    if (!eligibilityValid) {
      throw new Error(`A elegibilidade dos playoffs não confere em ${division}.`);
    }
  }
  const firstMatch = (matches.results || [])[0];
  if (!firstMatch || !Number.isFinite(Date.parse(firstMatch.startsAt))) {
    throw new Error("A primeira partida da rodada não possui horário válido.");
  }
  const divisionClosesAt = Object.fromEntries(["ascension", "elite"].map((division) => {
    const divisionFirstMatch = (matches.results || []).find((match) => match.division === division);
    return [division, new Date(Date.parse(divisionFirstMatch.startsAt) - 25 * 60 * 1000).toISOString()];
  }));
  const closesAt = new Date(Math.max(...Object.values(divisionClosesAt).map(Date.parse))).toISOString();
  const lineupCount = await DB.prepare(`
    SELECT COUNT(*) AS count
    FROM fantasy_lineups l
    JOIN fantasy_rounds r ON r.id = l.round_id
    WHERE r.round_number = ?
  `).bind(targetRoundNumber).first();
  if (Number(lineupCount?.count || 0) !== 0) {
    throw new Error(`A rodada ${targetRoundNumber} já possui escalações e não pode ser preparada automaticamente.`);
  }
  await DB.prepare(`
    UPDATE fantasy_market_state
    SET status = 'closed', access_mode = 'public', closes_at = ?,
        close_reason = ?, lock_match_id = ?, lock_division = NULL,
        lock_round_number = ?, version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 'global' AND status = 'closed'
  `).bind(
    closesAt,
    `Rodada ${targetRoundNumber} preparada; aguardando abertura manual.`,
    `manual-schedule:r${targetRoundNumber}`,
    targetRoundNumber
  ).run();
  return {
    marketStatus: "closed",
    roundNumber: targetRoundNumber,
    closesAt,
    divisionClosesAt,
    firstMatch,
    rounds: (rounds.results || []).map((round) => ({
      division: round.division,
      name: round.name,
      status: round.status,
      eligibility: JSON.parse(round.eligibilityJson || "{}")
    })),
    matches: matches.results || []
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
