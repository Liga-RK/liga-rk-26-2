const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { loadOfficialContent, loadWindowScript } = require("./src/content/official-content");
const { parseReplay } = require("./src/replay/parser-factory");
const { findReplayDuplicates, validateReplaySelection } = require("./src/replay/replay-validator");
const { aggregateDatabase, teamsBySlot } = require("./src/statistics/aggregators");
const {
  assertUniqueMappings,
  buildIdentityIndex,
  normalizeRiotId,
  suggestParticipant
} = require("./src/statistics/player-identity");
const { assertPublicPayloadSafe, createPublicPayload } = require("./src/statistics/public-payload");
const { hydrateRosterIdentities } = require("./src/statistics/roster-identities");
const { atomicWriteFile, atomicWriteJson } = require("./src/storage/atomic-write");
const { StatsDatabase } = require("./src/storage/stats-database");

const ROOT = __dirname;
const ASSETS = path.join(ROOT, "assets");
const DATA_DIR = path.join(ROOT, "data");
const REPLAY_DIR = path.join(DATA_DIR, "replays");
const PREVIEW_DIR = path.join(ROOT, "tmp", "replay-previews");
const CONFIG_DIR = path.join(ROOT, "config");
const DB_PATH = path.join(DATA_DIR, "stats-db.json");
const STATS_CONTENT_PATH = path.join(ASSETS, "stats-content.js");
const PORT = Number(process.env.PORT || 4177);
const MAX_REPLAY_BYTES = 40 * 1024 * 1024;
const MAX_BODY_BYTES = 60 * 1024 * 1024;
const PREVIEW_TTL_MS = 4 * 60 * 60 * 1000;
const DIVISIONS = ["elite", "ascension"];
const GROUPS = ["A", "B", "C", "D"];

const databaseStore = new StatsDatabase({
  filePath: DB_PATH,
  backupDirectory: path.join(ROOT, "backups", "stats-db")
});
const fixedData = loadWindowScript(path.join(ASSETS, "data.js"), "LIGA_RK_DATA");
let officialState = null;
let rosterContent = null;

main().catch((error) => {
  console.error(`Nao foi possivel iniciar o painel: ${messageOf(error)}`);
  process.exitCode = 1;
});

async function main() {
  ensureDirectories();
  databaseStore.ensure();
  removeExpiredPreviews();
  await refreshOfficialContent();

  http.createServer(async (request, response) => {
    try {
      if (request.url.startsWith("/health")) {
        sendJson(response, 200, { ok: true, app: "Liga RK 26.2", replayParser: "ROFL2" });
        return;
      }
      if (request.url.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }
      serveStatic(request, response);
    } catch (error) {
      console.error(messageOf(error));
      sendJson(response, error.statusCode || 500, { ok: false, error: publicError(error) });
    }
  }).listen(PORT, "127.0.0.1", () => {
    console.log(`Liga RK 26.2: http://localhost:${PORT}/stats-admin.html`);
  });
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/admin") && !requireAdminAuth(request, response)) return;

  if (request.method === "GET" && url.pathname === "/api/admin/bootstrap") {
    const database = await refreshOfficialContent();
    const computed = aggregateDatabase(database, rosterContent, fixedData);
    sendJson(response, 200, {
      ok: true,
      contentSource: officialState.source,
      fixedData,
      content: rosterContent,
      db: adminDatabaseView(database),
      series: buildAllSeries(fixedData),
      computed
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/replay/preview") {
    const payload = await readJsonBody(request);
    sendJson(response, 200, await previewReplay(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/replay/confirm") {
    const payload = await readJsonBody(request);
    sendJson(response, 200, await confirmReplay(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/delete-game") {
    const payload = await readJsonBody(request);
    sendJson(response, 200, await deleteGame(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/delete-alias") {
    const payload = await readJsonBody(request);
    sendJson(response, 200, await deactivateAlias(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reprocess-game") {
    const payload = await readJsonBody(request);
    sendJson(response, 200, await reprocessGame(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reprocess") {
    sendJson(response, 200, await reprocessAll());
    return;
  }

  sendJson(response, 404, { ok: false, error: "Endpoint nao encontrado." });
}

async function previewReplay(payload) {
  removeExpiredPreviews();
  const selection = normalizeSelection(payload);
  const selectionErrors = validateReplaySelection(selection);
  if (selectionErrors.length) throw badRequest(selectionErrors[0]);
  assertSeriesSelection(selection);

  const database = await refreshOfficialContent();
  const teams = officialTeams(selection.division);
  const blueTeam = teams[selection.blueTeamSlot];
  const redTeam = teams[selection.redTeamSlot];
  if (!isConfiguredTeam(blueTeam) || !isConfiguredTeam(redTeam)) {
    throw badRequest("Escolha somente times inscritos na divisao selecionada.");
  }

  const fileName = path.basename(String(payload.fileName || "replay.rofl"));
  if (path.extname(fileName).toLowerCase() !== ".rofl") throw badRequest("Selecione um arquivo .rofl.");
  const buffer = decodeReplay(payload.fileBase64);
  const parsed = parseReplay(buffer, { fileName });
  const duplicates = findReplayDuplicates(database, { ...selection, sha256: parsed.sha256, gameId: parsed.gameId });
  const previewId = crypto.randomUUID();
  const suggestions = parsed.participants.map((participant) => {
    const team = participant.team === 100 ? blueTeam : redTeam;
    return buildParticipantSuggestion(participant, team, database);
  });
  const previewRecord = {
    previewId,
    createdAt: new Date().toISOString(),
    selection,
    fileName,
    size: buffer.length,
    parsed,
    duplicates,
    suggestions
  };
  fs.writeFileSync(previewReplayPath(previewId), buffer);
  atomicWriteJson(previewJsonPath(previewId), previewRecord);

  return {
    ok: true,
    preview: {
      previewId,
      selection,
      file: { name: fileName, size: buffer.length, sha256Short: parsed.sha256.slice(0, 12) },
      replay: publicParsedReplay(parsed),
      teams: {
        "100": teamAdminView(blueTeam),
        "200": teamAdminView(redTeam)
      },
      suggestions,
      duplicates
    }
  };
}

async function confirmReplay(payload) {
  const previewId = safeId(payload.previewId);
  const preview = readPreview(previewId);
  if (Date.now() - Date.parse(preview.createdAt) > PREVIEW_TTL_MS) throw badRequest("A pre-visualizacao expirou. Processe o replay novamente.");
  if (!payload.confirmSides) throw badRequest("Confirme explicitamente TEAM 100 e TEAM 200.");
  if (preview.duplicates.length && !payload.replaceExisting) {
    throw conflictError("Este replay ou esta posicao da serie ja esta cadastrado. Confirme a substituicao para continuar.");
  }

  const database = await refreshOfficialContent();
  const teams = officialTeams(preview.selection.division);
  const mappings = normalizeMappings(payload.mappings, preview.parsed.participants, teams, preview.selection);
  assertUniqueMappings(mappings);
  assertNoIdentityConflicts(database, mappings, teams);

  const gameInternalId = `${preview.selection.seriesId}-j${preview.selection.gameNumber}`;
  const now = new Date().toISOString();
  const match = applyMappings(preview.parsed, mappings);
  const blueTeam = teams[preview.selection.blueTeamSlot];
  const redTeam = teams[preview.selection.redTeamSlot];
  const replayTarget = path.join(REPLAY_DIR, preview.selection.division, `${sanitizeFileName(gameInternalId)}-${preview.parsed.sha256.slice(0, 12)}.rofl`);
  fs.copyFileSync(previewReplayPath(previewId), replayTarget);
  const series = findSeries(preview.selection.division, preview.selection.seriesId);
  const game = {
    id: gameInternalId,
    division: preview.selection.division,
    seriesId: preview.selection.seriesId,
    stage: series.stage,
    round: series.title,
    gameNumber: preview.selection.gameNumber,
    date: series.subtitle,
    blueTeamSlot: preview.selection.blueTeamSlot,
    redTeamSlot: preview.selection.redTeamSlot,
    blueTeamSnapshot: teamSnapshot(blueTeam),
    redTeamSnapshot: teamSnapshot(redTeam),
    winnerTeam: match.winnerTeam,
    replay: {
      originalName: preview.fileName,
      storagePath: path.relative(ROOT, replayTarget),
      size: preview.size
    },
    sha256: match.sha256,
    gameId: match.gameId,
    clientVersion: match.clientVersion,
    durationMilliseconds: match.durationMilliseconds,
    durationSeconds: match.durationSeconds,
    parserStatus: "parsed_rofl2",
    parserVersion: match.parserVersion,
    warnings: match.warnings,
    mappings,
    match,
    createdAt: now,
    updatedAt: now
  };

  const divisionGames = database.divisions[preview.selection.division].games;
  const replacedIds = new Set(preview.duplicates.map((item) => item.gameId));
  database.divisions[preview.selection.division].games = divisionGames.filter((existing) => !replacedIds.has(existing.id) && existing.id !== game.id);
  database.divisions[preview.selection.division].games.push(game);
  saveRequestedAliases(database, mappings, game, teams);
  databaseStore.write(database, { reason: "confirm-replay" });
  await rebuildPublicStatistics(database);
  removePreview(previewId);
  return { ok: true, game: adminGameView(game), message: "Replay confirmado e estatisticas recalculadas." };
}

function normalizeMappings(input, participants, teams, selection) {
  const supplied = Array.isArray(input) ? input : [];
  if (supplied.length !== participants.length) throw badRequest("Confirme a identidade dos 10 participantes.");
  return participants.map((participant) => {
    const source = supplied.find((item) => Number(item.participantIndex) === participant.participantIndex) || {};
    const teamSlot = participant.team === 100 ? selection.blueTeamSlot : selection.redTeamSlot;
    const roster = teams[teamSlot] && teams[teamSlot].players || [];
    const playerId = String(source.playerId || "").trim();
    const registered = playerId ? roster.find((player) => player.playerId === playerId) : null;
    if (playerId && !registered) throw badRequest(`O jogador escolhido para ${participant.riotId} nao pertence ao time confirmado.`);
    const status = playerId ? "identified" : ["guest", "substitute", "pending", "unresolved"].includes(source.status) ? source.status : "unresolved";
    return {
      participantIndex: participant.participantIndex,
      riotId: participant.riotId,
      normalizedRiotId: normalizeRiotId(participant.riotId),
      playerId,
      teamSlot,
      status,
      identificationMethod: playerId ? String(source.identificationMethod || "manual") : status === "guest" ? "guest" : "unresolved",
      saveAsAlias: Boolean(source.saveAsAlias && playerId),
      confirmedAt: new Date().toISOString()
    };
  });
}

function applyMappings(parsed, mappings) {
  const match = structuredClone(parsed);
  match.participants = match.participants.map((participant) => {
    const mapping = mappings.find((item) => item.participantIndex === participant.participantIndex) || {
      playerId: "",
      normalizedRiotId: normalizeRiotId(participant.riotId),
      identificationMethod: "unresolved",
      status: "unresolved"
    };
    return {
      ...participant,
      playerId: mapping.playerId,
      normalizedRiotId: mapping.normalizedRiotId,
      identificationMethod: mapping.identificationMethod,
      identificationStatus: mapping.status
    };
  });
  return match;
}

function buildParticipantSuggestion(participant, team, database) {
  const primary = suggestParticipant(participant, team);
  if (primary) {
    return {
      participantIndex: participant.participantIndex,
      playerId: primary.playerId,
      status: primary.method,
      identificationMethod: primary.method
    };
  }
  const normalized = normalizeRiotId(participant.riotId);
  const alias = (database.playerAliases || []).find((item) => item.active !== false && item.normalizedRiotId === normalized);
  const rosterPlayer = alias && (team.players || []).find((player) => player.playerId === alias.playerId);
  if (rosterPlayer) {
    return { participantIndex: participant.participantIndex, playerId: rosterPlayer.playerId, status: "riot-id-alias", identificationMethod: "riot-id-alias" };
  }
  return { participantIndex: participant.participantIndex, playerId: "", status: "unresolved", identificationMethod: "unresolved" };
}

function assertNoIdentityConflicts(database, mappings, teams) {
  const allTeams = teamsBySlot(rosterContent, fixedData, "elite");
  Object.assign(allTeams, Object.fromEntries(Object.entries(teamsBySlot(rosterContent, fixedData, "ascension")).map(([slot, team]) => [`ascension-${slot}`, team])));
  const officialIndex = buildIdentityIndex(allTeams);
  if (officialIndex.conflicts.length) throw conflictError("O cadastro oficial possui Riot IDs duplicados. Corrija o editor antes de importar.");
  const known = new Map();
  for (const entry of officialIndex.index.values()) known.set(normalizeRiotId(entry.riotId), entry.playerId);
  for (const alias of database.playerAliases || []) {
    if (alias.normalizedRiotId) known.set(alias.normalizedRiotId, alias.playerId);
  }
  for (const mapping of mappings.filter((item) => item.saveAsAlias)) {
    const owner = known.get(mapping.normalizedRiotId);
    if (owner && owner !== mapping.playerId) throw conflictError(`O Riot ID ${mapping.riotId} ja pertence a outro jogador.`);
  }
}

function saveRequestedAliases(database, mappings, game, teams) {
  const existing = new Map((database.playerAliases || []).map((alias) => [alias.normalizedRiotId, alias]));
  for (const mapping of mappings.filter((item) => item.saveAsAlias && item.playerId)) {
    const saved = existing.get(mapping.normalizedRiotId);
    if (saved) {
      if (saved.active === false && saved.playerId === mapping.playerId) {
        saved.active = true;
        saved.restoredAt = new Date().toISOString();
        delete saved.removedAt;
        database.identityAudit.push({ action: "restore-alias", aliasId: saved.id, playerId: saved.playerId, riotId: saved.riotId, at: saved.restoredAt, sourceMatchId: game.id });
      }
      continue;
    }
    const alias = {
      id: crypto.randomUUID(),
      playerId: mapping.playerId,
      riotId: mapping.riotId,
      normalizedRiotId: mapping.normalizedRiotId,
      addedAt: new Date().toISOString(),
      source: "replay-import",
      sourceMatchId: game.id,
      active: true
    };
    database.playerAliases.push(alias);
    database.identityAudit.push({ action: "add-alias", aliasId: alias.id, playerId: alias.playerId, riotId: alias.riotId, at: alias.addedAt, sourceMatchId: game.id });
  }
}

async function deactivateAlias(payload) {
  const aliasId = String(payload.aliasId || "").trim();
  if (!aliasId) throw badRequest("Alias invalido.");
  const database = databaseStore.read();
  const alias = (database.playerAliases || []).find((item) => item.id === aliasId);
  if (!alias || alias.active === false) throw badRequest("Alias ativo nao encontrado.");
  alias.active = false;
  alias.removedAt = new Date().toISOString();
  database.identityAudit.push({ action: "remove-alias", aliasId: alias.id, playerId: alias.playerId, riotId: alias.riotId, at: alias.removedAt });
  databaseStore.write(database, { reason: "remove-alias" });
  return { ok: true, message: "Alias desativado. O historico das partidas foi preservado." };
}

async function deleteGame(payload) {
  const division = normalizeDivision(payload.division);
  const gameId = String(payload.gameId || "");
  if (!division || !gameId) throw badRequest("Divisao ou partida invalida.");
  const database = databaseStore.read();
  const games = database.divisions[division].games;
  const next = games.filter((game) => game.id !== gameId);
  if (next.length === games.length) throw badRequest("Partida nao encontrada.");
  database.divisions[division].games = next;
  databaseStore.write(database, { reason: "delete-game" });
  await rebuildPublicStatistics(database);
  return { ok: true };
}

async function reprocessAll() {
  const database = databaseStore.read();
  let processed = 0;
  let failed = 0;
  for (const division of DIVISIONS) {
    for (const game of database.divisions[division].games) {
      if (reprocessGameRecord(game)) processed += 1;
      else failed += 1;
    }
  }
  databaseStore.write(database, { reason: "reprocess-all" });
  await rebuildPublicStatistics(database);
  return { ok: true, processed, failed };
}

async function reprocessGame(payload) {
  const division = normalizeDivision(payload.division);
  const gameId = String(payload.gameId || "").trim();
  if (!division || !gameId) throw badRequest("Divisao ou partida invalida.");
  const database = databaseStore.read();
  const game = (database.divisions[division].games || []).find((item) => item.id === gameId);
  if (!game) throw badRequest("Partida nao encontrada.");
  const processed = reprocessGameRecord(game);
  databaseStore.write(database, { reason: "reprocess-game" });
  await rebuildPublicStatistics(database);
  return { ok: true, processed: processed ? 1 : 0, failed: processed ? 0 : 1, game: adminGameView(game) };
}

function reprocessGameRecord(game) {
  const replayPath = game.replay && path.resolve(ROOT, game.replay.storagePath || "");
  if (!replayPath || !replayPath.startsWith(REPLAY_DIR) || !fs.existsSync(replayPath)) {
    game.parserStatus = "missing_replay";
    game.parserError = "O arquivo de replay salvo nao foi encontrado.";
    game.updatedAt = new Date().toISOString();
    return false;
  }
  try {
    const parsed = parseReplay(fs.readFileSync(replayPath), { fileName: game.replay.originalName });
    game.match = applyMappings(parsed, game.mappings || []);
    game.parserStatus = "parsed_rofl2";
    game.parserVersion = parsed.parserVersion;
    game.warnings = parsed.warnings;
    game.updatedAt = new Date().toISOString();
    delete game.parserError;
    return true;
  } catch (error) {
    game.parserStatus = "parser_error";
    game.parserError = messageOf(error);
    game.updatedAt = new Date().toISOString();
    return false;
  }
}

async function rebuildPublicStatistics(existingDatabase) {
  const database = existingDatabase || await refreshOfficialContent();
  const hydrated = hydrateRosterIdentities(rosterContent || officialState.content, database);
  rosterContent = hydrated.content;
  const computed = aggregateDatabase(database, rosterContent, fixedData);
  const payload = createPublicPayload(computed);
  assertPublicPayloadSafe(payload);
  atomicWriteFile(STATS_CONTENT_PATH, `window.LIGA_RK_STATS = ${JSON.stringify(payload, null, 2)};\n`);
  return payload;
}

function officialTeams(division) {
  return teamsBySlot(rosterContent, fixedData, division);
}

async function refreshOfficialContent() {
  officialState = await loadOfficialContent({ root: ROOT, silent: true });
  const database = databaseStore.read();
  const hydrated = hydrateRosterIdentities(officialState.content, database);
  rosterContent = hydrated.content;
  if (hydrated.changed) databaseStore.write(database, { reason: "roster-identities" });
  return database;
}

function isConfiguredTeam(team) {
  return Boolean(team && String(team.name || "").trim() && String(team.name).trim() !== team.slot);
}

function teamAdminView(team) {
  return {
    slot: team.slot,
    name: team.name,
    tag: team.tag,
    logo: normalizeAssetPath(team.logo),
    players: (team.players || []).filter((player) => String(player.player || player.name || "").trim().toUpperCase() !== "JOGADOR").map((player) => ({
      playerId: player.playerId || "",
      name: player.player || player.name || "JOGADOR",
      lane: player.lane || "",
      riotId: player.riotId || "",
      riotIdAliases: player.riotIdAliases || [],
      opgg: player.opgg || ""
    }))
  };
}

function teamSnapshot(team) {
  return { slot: team.slot, name: team.name, tag: team.tag, logo: normalizeAssetPath(team.logo) };
}

function normalizeAssetPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function publicParsedReplay(parsed) {
  const { admin, sha256, ...safe } = parsed;
  return { ...safe, sha256Short: sha256.slice(0, 12) };
}

function adminGameView(game) {
  const copy = structuredClone(game);
  if (copy.match) delete copy.match.admin;
  if (copy.replay) delete copy.replay.storagePath;
  return copy;
}

function adminDatabaseView(database) {
  return {
    version: database.version,
    updatedAt: database.updatedAt,
    divisions: Object.fromEntries(DIVISIONS.map((division) => [division, {
      ...database.divisions[division],
      games: (database.divisions[division].games || []).map(adminGameView)
    }])),
    playerAliases: database.playerAliases || [],
    identityAudit: database.identityAudit || []
  };
}

function normalizeSelection(payload) {
  return {
    division: normalizeDivision(payload.division),
    seriesId: String(payload.seriesId || "").trim(),
    gameNumber: Number(payload.gameNumber),
    blueTeamSlot: String(payload.blueTeamSlot || "").trim().toUpperCase(),
    redTeamSlot: String(payload.redTeamSlot || "").trim().toUpperCase()
  };
}

function assertSeriesSelection(selection) {
  const series = findSeries(selection.division, selection.seriesId);
  if (!series) throw badRequest("Serie invalida.");
  if (selection.gameNumber > series.maxGames) throw badRequest("Numero de jogo acima do limite da serie.");
}

function findSeries(division, seriesId) {
  return buildSeries(fixedData[division] || {}).find((series) => series.id === seriesId);
}

function buildAllSeries(data) {
  return Object.fromEntries(DIVISIONS.map((division) => [division, buildSeries(data[division] || {})]));
}

function buildSeries(division) {
  const series = [];
  (division.rounds || []).forEach((round, roundIndex) => {
    (round.games || []).forEach((game, gameIndex) => {
      const normalized = Array.isArray(game) ? { time: game[0], home: game[1], away: game[2] } : game;
      series.push({
        id: `groups-r${roundIndex + 1}g${gameIndex + 1}`,
        stage: "grupos",
        title: `${round.name} - ${normalized.home} x ${normalized.away}`,
        subtitle: `${round.date} ${normalized.time}`,
        maxGames: 3,
        teamARef: normalized.home,
        teamBRef: normalized.away
      });
    });
  });
  (division.playoffs || []).forEach((column, columnIndex) => {
    (column || []).forEach((match, matchIndex) => {
      series.push({
        id: `playoffs-p${columnIndex + 1}m${matchIndex + 1}`,
        stage: playoffStage(match.title),
        title: match.title,
        subtitle: `${match.date} ${match.time} ${match.format}`,
        maxGames: String(match.format).toUpperCase() === "MD5" ? 5 : 3,
        teamARef: match.teamA,
        teamBRef: match.teamB
      });
    });
  });
  return series;
}

function playoffStage(title) {
  const value = String(title || "").toUpperCase();
  if (value.includes("OITAVAS")) return "oitavas";
  if (value.includes("QUARTAS")) return "quartas";
  if (value.includes("SEMI")) return "semifinal";
  if (value.includes("FINAL")) return "final";
  return "playoffs";
}

function decodeReplay(fileBase64) {
  const encoded = String(fileBase64 || "");
  if (!encoded) throw badRequest("Selecione o replay antes de processar.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw badRequest("O replay esta vazio.");
  if (buffer.length > MAX_REPLAY_BYTES) throw badRequest("O replay excede o limite de 40 MB.");
  return buffer;
}

function previewReplayPath(previewId) {
  return path.join(PREVIEW_DIR, `${safeId(previewId)}.rofl`);
}

function previewJsonPath(previewId) {
  return path.join(PREVIEW_DIR, `${safeId(previewId)}.json`);
}

function readPreview(previewId) {
  const jsonPath = previewJsonPath(previewId);
  const replayPath = previewReplayPath(previewId);
  if (!fs.existsSync(jsonPath) || !fs.existsSync(replayPath)) throw badRequest("Pre-visualizacao nao encontrada. Processe o replay novamente.");
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function removePreview(previewId) {
  for (const filePath of [previewJsonPath(previewId), previewReplayPath(previewId)]) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  }
}

function removeExpiredPreviews() {
  if (!fs.existsSync(PREVIEW_DIR)) return;
  const cutoff = Date.now() - PREVIEW_TTL_MS;
  for (const name of fs.readdirSync(PREVIEW_DIR)) {
    const filePath = path.join(PREVIEW_DIR, name);
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.rmSync(filePath);
  }
}

function ensureDirectories() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  for (const division of DIVISIONS) fs.mkdirSync(path.join(REPLAY_DIR, division), { recursive: true });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if ((pathname === "/editor.html" || pathname === "/stats-admin.html") && !requireAdminAuth(request, response)) return;
  const filePath = path.resolve(ROOT, `.${pathname}`);
  const privateRoots = [DATA_DIR, CONFIG_DIR, PREVIEW_DIR, path.join(ROOT, "backups"), path.join(ROOT, "src")];
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || privateRoots.some((privateRoot) => filePath === privateRoot || filePath.startsWith(`${privateRoot}${path.sep}`))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mimeType(filePath), "Cache-Control": "no-store" });
  fs.createReadStream(filePath).pipe(response);
}

function requireAdminAuth(request, response) {
  const password = process.env.ADMIN_PASSWORD || "";
  if (!password) return true;
  const expectedUser = process.env.ADMIN_USER || "admin";
  const header = String(request.headers.authorization || "");
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const user = separator >= 0 ? decoded.slice(0, separator) : "";
    const pass = separator >= 0 ? decoded.slice(separator + 1) : "";
    if (safeEqual(user, expectedUser) && safeEqual(pass, password)) return true;
  }
  response.writeHead(401, { "WWW-Authenticate": 'Basic realm="Liga RK 26.2 Admin"', "Content-Type": "text/plain; charset=utf-8" });
  response.end("Autenticacao necessaria.");
  return false;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let finished = false;
    request.on("data", (chunk) => {
      if (finished) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        finished = true;
        reject(badRequest("Upload grande demais."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (finished) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(badRequest("JSON invalido."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function normalizeDivision(value) {
  const division = String(value || "").toLowerCase();
  return DIVISIONS.includes(division) ? division : "";
}

function safeId(value) {
  const id = String(value || "");
  if (!/^[a-z0-9-]{8,80}$/i.test(id)) throw badRequest("Identificador invalido.");
  return id;
}

function sanitizeFileName(value) {
  return String(value || "replay").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "replay";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function conflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function messageOf(error) {
  return error && error.message ? error.message : String(error || "Erro desconhecido.");
}

function publicError(error) {
  return error && error.statusCode && error.statusCode < 500 ? messageOf(error) : "O painel encontrou um erro interno. Consulte o terminal local.";
}

function mimeType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".woff2": "font/woff2"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}
