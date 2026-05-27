const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = __dirname;
const ASSETS = path.join(ROOT, "assets");
const DATA_DIR = path.join(ROOT, "data");
const REPLAY_DIR = path.join(DATA_DIR, "replays");
const CONFIG_DIR = path.join(ROOT, "config");
const DB_PATH = path.join(DATA_DIR, "stats-db.json");
const API_KEY_PATH = path.join(CONFIG_DIR, "riot-api-key.txt");
const STATS_CONTENT_PATH = path.join(ASSETS, "stats-content.js");
const REPLAY_DB_PATH = path.join(ASSETS, "replay-db.js");
const PORT = Number(process.env.PORT || 4177);
const MAX_BODY_BYTES = 350 * 1024 * 1024;
const DIVISIONS = ["elite", "ascension"];
const GROUPS = ["A", "B", "C", "D"];
const LANES = ["TOP", "JG", "MID", "ADC", "SUP", "SUB", "SUB", "SUB"];
const PLATFORM_DEFAULT = process.env.RIOT_PLATFORM || "BR1";
const REGIONAL_ROUTE = process.env.RIOT_REGIONAL_ROUTE || "americas";

ensureDirectories();
ensureDatabase();
writePublicFiles();

http
  .createServer(async (request, response) => {
    try {
      if (request.url.startsWith("/health")) {
        sendJson(response, 200, { ok: true, app: "Liga RK 26.2" });
        return;
      }
      if (request.url.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }
      serveStatic(request, response);
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) });
    }
  })
  .listen(PORT, () => {
    console.log(`Liga RK 26.2: http://localhost:${PORT}/stats-admin.html`);
  });

async function handleApi(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/admin") && !requireAdminAuth(request, response)) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/bootstrap") {
    const db = readDatabase();
    const fixedData = loadWindowScript(path.join(ASSETS, "data.js"), "LIGA_RK_DATA");
    const content = loadWindowScript(path.join(ASSETS, "content.js"), "LIGA_RK_CONTENT");
    const computed = computeAll(db, content, fixedData);
    sendJson(response, 200, {
      ok: true,
      hasApiKey: Boolean(readApiKey()),
      fixedData,
      content,
      db,
      series: buildAllSeries(fixedData),
      computed
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/api-key") {
    const payload = await readJsonBody(request);
    const key = String(payload.apiKey || "").trim();
    if (!key) {
      sendJson(response, 400, { ok: false, error: "API key vazia." });
      return;
    }
    fs.writeFileSync(API_KEY_PATH, key, "utf8");
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/game") {
    const payload = await readJsonBody(request);
    const result = await upsertGame(payload);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/delete-game") {
    const payload = await readJsonBody(request);
    const result = deleteGame(payload);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reprocess") {
    const result = await reprocessAll();
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { ok: false, error: "Endpoint nao encontrado." });
}

async function upsertGame(payload) {
  const division = normalizeDivision(payload.division);
  const seriesId = safeText(payload.seriesId);
  const gameNumber = Number(payload.gameNumber);
  if (!division || !seriesId || !Number.isInteger(gameNumber) || gameNumber < 1) {
    return { ok: false, error: "Divisao, serie ou jogo invalido." };
  }

  const db = readDatabase();
  const fixedData = loadWindowScript(path.join(ASSETS, "data.js"), "LIGA_RK_DATA");
  const content = loadWindowScript(path.join(ASSETS, "content.js"), "LIGA_RK_CONTENT");
  const teams = teamsBySlot(content, fixedData, division);
  const gameId = `${seriesId}-j${gameNumber}`;
  const divisionDb = ensureDivisionDb(db, division);
  let game = divisionDb.games.find((item) => item.id === gameId);

  if (!game) {
    game = {
      id: gameId,
      division,
      seriesId,
      gameNumber,
      createdAt: new Date().toISOString(),
      updatedAt: "",
      blueTeamSlot: "",
      redTeamSlot: "",
      matchId: "",
      rofl: null,
      parserStatus: "empty",
      match: null
    };
    divisionDb.games.push(game);
  }

  game.blueTeamSlot = safeText(payload.blueTeamSlot);
  game.redTeamSlot = safeText(payload.redTeamSlot);
  const payloadMatchId = normalizeMatchId(payload.matchId || "");
  game.matchId = payloadMatchId || game.matchId || "";
  game.updatedAt = new Date().toISOString();

  if (!game.blueTeamSlot || !game.redTeamSlot) {
    return { ok: false, error: "Escolha o time azul e o time vermelho." };
  }

  if (payload.fileBase64 && payload.fileName) {
    game.rofl = saveReplayFile(division, gameId, payload.fileName, payload.fileBase64);
    if (!payloadMatchId) {
      game.matchId = "";
    }
  }

  const explicitMatchIds = explicitMatchIdsForGame(game, payloadMatchId);
  const matchIdCandidates = unique([...explicitMatchIds, ...extractMatchIdCandidatesFromGame(game)]);
  const extracted = explicitMatchIds[0] || matchIdCandidates[0] || "";
  if (extracted && !game.matchId) {
    game.matchId = extracted;
  }

  if (payload.matchJson) {
    try {
      const raw = typeof payload.matchJson === "string" ? JSON.parse(payload.matchJson) : payload.matchJson;
      game.match = normalizeMatchData(raw, game.blueTeamSlot, game.redTeamSlot, teams);
      game.parserStatus = "parsed_manual_json";
      delete game.parserError;
    } catch (error) {
      game.parserStatus = "parse_error";
      game.parserError = messageOf(error);
    }
  } else if (game.matchId || matchIdCandidates.length) {
    const usedMatchIds = usedMatchIdsForDivision(divisionDb.games, gameId);
    await hydrateGameFromRiot(game, teams, matchIdCandidates, { usedMatchIds, strictMatchIds: explicitMatchIds });
  } else {
    game.parserStatus = game.rofl ? "missing_match_id" : "empty";
    game.parserError = game.rofl
      ? "Replay salvo, mas nao encontrei o Match ID. Preencha o campo Match ID Riot desse jogo e salve novamente."
      : "";
  }

  db.updatedAt = new Date().toISOString();
  writeDatabase(db);
  writePublicFiles(db, content, fixedData);
  return { ok: true, game };
}

async function hydrateGameFromRiot(game, teams, candidates = [], options = {}) {
  const apiKey = readApiKey();
  if (!apiKey) {
    game.parserStatus = "pending_api_key";
    game.parserError = "Salve a Riot API Key no topo do painel para buscar dados automaticamente.";
    return;
  }

  const strictMatchIds = unique((options.strictMatchIds || []).map(normalizeMatchId).filter(Boolean));
  const matchIds = unique([...(strictMatchIds.length ? strictMatchIds : candidates), game.matchId].map(normalizeMatchId).filter(Boolean)).slice(0, 24);
  if (!matchIds.length) {
    game.parserStatus = "missing_match_id";
    game.parserError = "Nao encontrei Match ID no replay. Preencha o campo Match ID Riot desse jogo e salve novamente.";
    return;
  }

  const notFound = [];
  const duplicates = [];
  const usedMatchIds = options.usedMatchIds || new Set();
  for (const matchId of matchIds) {
    try {
      const matchJson = await fetchRiotMatch(matchId, apiKey);
      const resolvedMatchId = normalizeMatchId((matchJson.metadata && matchJson.metadata.matchId) || matchId);
      if (usedMatchIds.has(resolvedMatchId)) {
        duplicates.push(resolvedMatchId);
        continue;
      }
      game.match = normalizeRiotMatchJson(matchJson, game.blueTeamSlot, game.redTeamSlot, teams);
      game.matchId = resolvedMatchId;
      game.parserStatus = "parsed_riot_api";
      delete game.parserError;
      return;
    } catch (error) {
      if (error.status === 404) {
        notFound.push(matchId);
        continue;
      }

      game.parserStatus = "riot_api_error";
      game.parserError = messageOf(error);
      return;
    }
  }

  game.matchId = matchIds[0];
  if (duplicates.length) {
    game.match = null;
    game.parserStatus = "duplicate_match_id";
    game.parserError = `Esse replay aponta para ${unique(duplicates).join(", ")}, que ja esta cadastrado em outro jogo da divisao. Se for outra partida, envie o replay correto ou preencha o Match ID correto manualmente.`;
    return;
  }

  game.parserStatus = "riot_api_error";
  game.parserError = strictMatchIds.length
    ? `A Riot API nao encontrou ${notFound.join(", ")}. O ID esta fixado pelo nome do replay/campo manual, entao nao usei candidatos aleatorios do arquivo. Se foi uma partida custom comum/inhouse, ela pode nao estar disponivel no Match-V5; para automatizar custom games, use codigos da Tournament API nas proximas partidas.`
    : `Partida nao encontrada. Testei: ${notFound.join(", ")}. Se souber o Match ID correto, preencha no campo do jogo e salve de novo.`;
}

function usedMatchIdsForDivision(games, currentGameId) {
  return new Set(
    (games || [])
      .filter((game) => game.id !== currentGameId && game.parserStatus === "parsed_riot_api")
      .map(resolvedGameMatchId)
      .filter(Boolean)
  );
}

function resolvedGameMatchId(game) {
  return normalizeMatchId((game && game.match && game.match.gameId) || (game && game.matchId) || "");
}

function deleteGame(payload) {
  const division = normalizeDivision(payload.division);
  const gameId = safeText(payload.gameId);
  if (!division || !gameId) {
    return { ok: false, error: "Jogo invalido." };
  }

  const db = readDatabase();
  const divisionDb = ensureDivisionDb(db, division);
  const before = divisionDb.games.length;
  divisionDb.games = divisionDb.games.filter((game) => game.id !== gameId);
  if (divisionDb.games.length === before) {
    return { ok: false, error: "Jogo nao encontrado." };
  }

  db.updatedAt = new Date().toISOString();
  writeDatabase(db);
  writePublicFiles();
  return { ok: true };
}

async function reprocessAll() {
  const db = readDatabase();
  const fixedData = loadWindowScript(path.join(ASSETS, "data.js"), "LIGA_RK_DATA");
  const content = loadWindowScript(path.join(ASSETS, "content.js"), "LIGA_RK_CONTENT");

  for (const division of DIVISIONS) {
    const teams = teamsBySlot(content, fixedData, division);
    const usedMatchIds = new Set();
    for (const game of db.divisions[division].games) {
      const explicitMatchIds = explicitMatchIdsForGame(game);
      const candidates = unique([...explicitMatchIds, ...extractMatchIdCandidatesFromGame(game)]);
      const matchId = normalizeMatchId(explicitMatchIds[0] || candidates[0] || game.matchId || "");
      if (matchId || candidates.length) {
        game.matchId = matchId;
        await hydrateGameFromRiot(game, teams, candidates, { usedMatchIds, strictMatchIds: explicitMatchIds });
        if (game.parserStatus === "parsed_riot_api") {
          const resolved = resolvedGameMatchId(game);
          if (resolved) usedMatchIds.add(resolved);
        }
      }
    }
  }

  db.updatedAt = new Date().toISOString();
  writeDatabase(db);
  writePublicFiles(db, content, fixedData);
  return { ok: true };
}

function saveReplayFile(division, gameId, fileName, fileBase64) {
  const buffer = Buffer.from(String(fileBase64), "base64");
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const safeName = sanitizeFileName(fileName || "replay.rofl");
  const replayPath = path.join(REPLAY_DIR, division, `${gameId}-${hash.slice(0, 10)}-${safeName}`);
  fs.writeFileSync(replayPath, buffer);
  return {
    originalName: fileName,
    storagePath: path.relative(ROOT, replayPath).replace(/\\/g, "/"),
    size: buffer.length,
    sha256: hash,
    uploadedAt: new Date().toISOString()
  };
}

async function fetchRiotMatch(matchId, apiKey) {
  const endpoint = `https://${REGIONAL_ROUTE}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  const response = await fetch(endpoint, { headers: { "X-Riot-Token": apiKey } });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const error = new Error("Riot API Key invalida ou expirada. Gere uma chave nova no Riot Developer Portal e salve no topo do painel.");
      error.status = response.status;
      throw error;
    }
    if (response.status === 404) {
      const error = new Error(`Partida nao encontrada para ${matchId}. Confira se o Match ID esta correto e se a partida pertence a regiao BR1.`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 429) {
      const error = new Error("Limite de requisicoes da Riot API atingido. Aguarde alguns minutos e clique em Reprocessar jogos pendentes.");
      error.status = response.status;
      throw error;
    }
    const error = new Error(`Riot API retornou ${response.status} para ${matchId}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function explicitMatchIdsForGame(game, priorityMatchId = "") {
  const replayIds = [
    game && game.rofl && game.rofl.originalName,
    game && game.rofl && game.rofl.storagePath
  ].flatMap(extractExplicitMatchIdsFromText);
  const manualIds = [priorityMatchId, game && game.matchId].flatMap(extractExplicitMatchIdsFromText);
  return unique([priorityMatchId, ...replayIds, ...manualIds].map(normalizeMatchId).filter(Boolean));
}

function extractExplicitMatchIdsFromText(value) {
  const text = String(value || "");
  const matches = [];
  const platformPattern = /(?:BR1|LA1|LA2|NA1|EUW1|EUN1|KR|JP1|OC1|TR1|RU|PH2|SG2|TH2|TW2|VN2)[_-](\d{9,11})(?!\d)/gi;
  let platformMatch;

  while ((platformMatch = platformPattern.exec(text))) {
    matches.push(normalizeMatchId(platformMatch[0]));
  }

  return matches;
}

function extractMatchIdCandidatesFromGame(game) {
  const candidates = [game.rofl && game.rofl.originalName, game.rofl && game.rofl.storagePath, game.matchId].filter(Boolean);
  const matches = [];

  for (const candidate of candidates) {
    matches.push(...extractMatchIdCandidatesFromText(candidate));
  }

  const replayPath = game.rofl && game.rofl.storagePath ? path.join(ROOT, game.rofl.storagePath) : "";
  if (!replayPath || !fs.existsSync(replayPath)) return unique(matches).slice(0, 24);

  const buffer = fs.readFileSync(replayPath);
  const sample = Buffer.concat([
    buffer.subarray(0, Math.min(buffer.length, 2 * 1024 * 1024)),
    buffer.subarray(Math.max(0, buffer.length - 2 * 1024 * 1024))
  ]).toString("latin1");
  matches.push(...extractMatchIdCandidatesFromText(sample));

  return unique(matches).slice(0, 24);
}

function extractMatchIdCandidatesFromText(value) {
  const text = String(value || "");
  const matches = [];
  const platformPattern = /(?:BR1|LA1|LA2|NA1|EUW1|EUN1|KR|JP1|OC1|TR1|RU|PH2|SG2|TH2|TW2|VN2)[_-](\d{6,18})/gi;
  let platformMatch;

  while ((platformMatch = platformPattern.exec(text))) {
    matches.push(...candidateIdsFromDigits(platformMatch[1], platformMatch[0].slice(0, 3).toUpperCase()));
  }

  const gameIdPattern = /["']?gameId["']?\s*[:=]\s*["']?(\d{6,18})/gi;
  let gameIdMatch;
  while ((gameIdMatch = gameIdPattern.exec(text))) {
    matches.push(...candidateIdsFromDigits(gameIdMatch[1], PLATFORM_DEFAULT));
  }

  const digitsPattern = /(?:^|[^\d])(\d{9,11})(?:[^\d]|$)/g;
  let digitsMatch;
  while ((digitsMatch = digitsPattern.exec(text))) {
    matches.push(...candidateIdsFromDigits(digitsMatch[1], PLATFORM_DEFAULT));
  }

  const longDigitsPattern = /(?:^|[^\d])(\d{12,18})(?:[^\d]|$)/g;
  let longDigitsMatch;
  while ((longDigitsMatch = longDigitsPattern.exec(text))) {
    matches.push(...candidateIdsFromDigits(longDigitsMatch[1], PLATFORM_DEFAULT));
  }

  return matches;
}

function candidateIdsFromDigits(rawDigits, platform) {
  const digits = String(rawDigits || "").replace(/\D/g, "");
  const ids = [];

  if (digits.length >= 9 && digits.length <= 11) {
    ids.push(`${platform}_${digits}`);
  }

  if (digits.length > 11) {
    [10, 11, 9].forEach((length) => {
      ids.push(`${platform}_${digits.slice(0, length)}`);
    });
  }

  return ids;
}

function normalizeMatchData(rawInput, blueTeamSlot, redTeamSlot, teams) {
  const raw = rawInput && rawInput.match ? rawInput.match : rawInput;
  if (!raw || typeof raw !== "object") throw new Error("JSON de partida vazio.");
  if (raw.info && Array.isArray(raw.info.participants)) {
    return normalizeRiotMatchJson(raw, blueTeamSlot, redTeamSlot, teams);
  }
  return normalizeCustomMatchJson(raw, blueTeamSlot, redTeamSlot, teams);
}

function normalizeRiotMatchJson(raw, blueTeamSlot, redTeamSlot, teams) {
  const info = raw.info || {};
  const durationSeconds = secondsFromDuration(info.gameDuration || 0);
  const participants = info.participants || [];
  const riotTeams = info.teams || [];
  const blueWon = Boolean((riotTeams.find((team) => Number(team.teamId) === 100) || {}).win);
  const redWon = Boolean((riotTeams.find((team) => Number(team.teamId) === 200) || {}).win);
  const players = participants.map((participant) => {
    const side = Number(participant.teamId) === 100 ? "blue" : "red";
    return normalizePlayer({
      side,
      teamSlot: side === "blue" ? blueTeamSlot : redTeamSlot,
      name: participant.riotIdGameName || participant.summonerName || participant.puuid || "JOGADOR",
      lane: participant.teamPosition || participant.individualPosition || participant.lane || participant.role,
      champion: participant.championName || "",
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      gold: participant.goldEarned,
      damage: participant.totalDamageDealtToChampions,
      visionScore: participant.visionScore,
      won: Boolean(participant.win)
    });
  });
  const match = {
    source: "riot-match-v5",
    gameId: (raw.metadata && raw.metadata.matchId) || info.gameId || "",
    gameVersion: info.gameVersion || "",
    durationSeconds,
    winnerSide: blueWon ? "blue" : redWon ? "red" : "",
    teams: {
      blue: buildSideStats("blue", blueTeamSlot, players, teams),
      red: buildSideStats("red", redTeamSlot, players, teams)
    },
    players
  };
  syncWinnerFlags(match);
  return match;
}

function normalizeCustomMatchJson(raw, blueTeamSlot, redTeamSlot, teams) {
  const durationSeconds = secondsFromDuration(raw.durationSeconds || raw.duration || raw.gameDuration || 0);
  const rawPlayers = Array.isArray(raw.players) ? raw.players : Array.isArray(raw.participants) ? raw.participants : [];
  const players = rawPlayers.map((player) => {
    const side = normalizeSide(player.side || player.teamSide || player.teamId || player.team);
    return normalizePlayer({
      side,
      teamSlot: side === "blue" ? blueTeamSlot : redTeamSlot,
      name: player.name || player.player || player.summonerName || player.riotIdGameName || "JOGADOR",
      lane: player.lane || player.role || player.position || player.teamPosition || player.individualPosition,
      champion: player.champion || player.championName || "",
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      gold: player.gold || player.goldEarned,
      damage: player.damage || player.dpmDamage || player.totalDamageDealtToChampions,
      visionScore: player.visionScore || player.vs,
      won: player.won || player.win
    });
  });
  const rawTeams = raw.teams || {};
  const match = {
    source: raw.source || "normalized-json",
    gameId: raw.gameId || raw.matchId || "",
    gameVersion: raw.gameVersion || raw.version || "",
    durationSeconds,
    winnerSide: normalizeSide(raw.winnerSide || raw.winner || (raw.result && raw.result.winnerSide)),
    teams: {
      blue: { ...buildSideStats("blue", blueTeamSlot, players, teams), ...normalizeTeamTotals(rawTeams.blue || raw.blue || {}) },
      red: { ...buildSideStats("red", redTeamSlot, players, teams), ...normalizeTeamTotals(rawTeams.red || raw.red || {}) }
    },
    players
  };
  syncWinnerFlags(match);
  return match;
}

function normalizePlayer(raw) {
  return {
    side: normalizeSide(raw.side),
    teamSlot: safeText(raw.teamSlot),
    name: safeText(raw.name) || "JOGADOR",
    lane: normalizeLane(raw.lane),
    champion: safeText(raw.champion) || "CAMPEAO",
    kills: number(raw.kills),
    deaths: number(raw.deaths),
    assists: number(raw.assists),
    gold: number(raw.gold),
    damage: number(raw.damage),
    visionScore: number(raw.visionScore),
    won: Boolean(raw.won)
  };
}

function normalizeTeamTotals(raw) {
  return {
    kills: number(raw.kills),
    deaths: number(raw.deaths),
    assists: number(raw.assists),
    gold: number(raw.gold || raw.totalGold),
    damage: number(raw.damage || raw.totalDamage),
    visionScore: number(raw.visionScore || raw.vs),
    won: Boolean(raw.won || raw.win)
  };
}

function buildSideStats(side, slot, players, teams) {
  const sidePlayers = players.filter((player) => player.side === side);
  const team = teams[slot] || {};
  return {
    slot,
    name: team.name || slot || "",
    tag: team.tag || slot || "",
    kills: sum(sidePlayers, "kills"),
    deaths: sum(sidePlayers, "deaths"),
    assists: sum(sidePlayers, "assists"),
    gold: sum(sidePlayers, "gold"),
    damage: sum(sidePlayers, "damage"),
    visionScore: sum(sidePlayers, "visionScore"),
    won: sidePlayers.some((player) => player.won)
  };
}

function syncWinnerFlags(match) {
  if (!match.winnerSide) {
    if (match.teams.blue.won) match.winnerSide = "blue";
    if (match.teams.red.won) match.winnerSide = "red";
  }
  if (match.winnerSide === "blue") {
    match.teams.blue.won = true;
    match.teams.red.won = false;
  }
  if (match.winnerSide === "red") {
    match.teams.red.won = true;
    match.teams.blue.won = false;
  }
  match.players.forEach((player) => {
    player.won = player.side === match.winnerSide;
  });
}

function computeAll(db, content, fixedData) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    divisions: Object.fromEntries(DIVISIONS.map((division) => [division, computeDivision(db, content, fixedData, division)]))
  };
}

function computeDivision(db, content, fixedData, division) {
  const teams = teamsBySlot(content, fixedData, division);
  const parsedGames = db.divisions[division].games.filter((game) => game.match && game.match.durationSeconds);
  const teamAggregates = createTeamAggregates(teams);
  const playerAggregates = {};
  const championStats = {};
  const matchSummaries = [];

  parsedGames.forEach((game) => {
    const match = game.match;
    const durationMin = Math.max(1 / 60, match.durationSeconds / 60);
    const blue = match.teams.blue;
    const red = match.teams.red;
    const winner = match.winnerSide === "blue" ? blue : red;
    const loser = match.winnerSide === "blue" ? red : blue;
    const mvp = pickMvp(match, durationMin);

    matchSummaries.push({
      id: game.id,
      seriesId: game.seriesId,
      gameNumber: game.gameNumber,
      duration: formatTime(match.durationSeconds),
      durationSeconds: match.durationSeconds,
      result: `${winner.tag || winner.name} venceu`,
      winnerSlot: winner.slot,
      winnerTeam: winner.name || winner.slot,
      loserSlot: loser.slot,
      loserTeam: loser.name || loser.slot,
      goldDiff: Math.round((winner.gold || 0) - (loser.gold || 0)),
      killsDiff: Math.round((winner.kills || 0) - (loser.kills || 0)),
      mvp: mvp ? mvp.name : ""
    });

    [blue, red].forEach((sideStats) => {
      const aggregate = teamAggregates[sideStats.slot] || createTeamAggregate(sideStats.slot, teams[sideStats.slot] || {});
      const won = sideStats.slot === winner.slot;
      aggregate.games += 1;
      aggregate.wins += won ? 1 : 0;
      aggregate.losses += won ? 0 : 1;
      aggregate.kills += number(sideStats.kills);
      aggregate.deaths += number(sideStats.deaths);
      aggregate.assists += number(sideStats.assists);
      aggregate.gold += number(sideStats.gold);
      aggregate.gpmSum += number(sideStats.gold) / durationMin;
      if (won) {
        aggregate.winDurationSeconds += match.durationSeconds;
        aggregate.winDurationCount += 1;
      }
      teamAggregates[sideStats.slot] = aggregate;
    });

    match.players.forEach((player) => {
      const sideStats = match.teams[player.side] || {};
      const teamKills = Math.max(0, number(sideStats.kills));
      const key = `${player.teamSlot || player.side}:${player.lane}:${normalizeKey(player.name)}`;
      const aggregate = playerAggregates[key] || createPlayerAggregate(player);
      const championKey = normalizeKey(player.champion);
      const champion = championStats[championKey] || createChampionAggregate(player.champion);
      const kp = teamKills ? (player.kills + player.assists) / teamKills : 0;
      const gpm = player.gold / durationMin;
      const dpm = player.damage / durationMin;
      const vpm = player.visionScore / durationMin;

      aggregate.games += 1;
      aggregate.wins += player.won ? 1 : 0;
      aggregate.kills += player.kills;
      aggregate.deaths += player.deaths;
      aggregate.assists += player.assists;
      aggregate.gold += player.gold;
      aggregate.damage += player.damage;
      aggregate.visionScore += player.visionScore;
      aggregate.kpSum += kp;
      aggregate.gpmSum += gpm;
      aggregate.dpmSum += dpm;
      aggregate.vpmSum += vpm;
      aggregate.mvp += mvp && mvp.key === key ? 1 : 0;
      aggregate.champions[player.champion] = (aggregate.champions[player.champion] || 0) + 1;
      champion.name = player.champion || champion.name;
      champion.picks += 1;
      champion.wins += player.won ? 1 : 0;
      playerAggregates[key] = aggregate;
      championStats[championKey] = champion;
    });
  });

  const teamSummaries = Object.fromEntries(Object.entries(teamAggregates).map(([slot, aggregate]) => [slot, summarizeTeam(aggregate)]));
  const players = Object.values(playerAggregates).map(summarizePlayer).sort((a, b) => b.games - a.games || b.kda - a.kda);
  const champions = Object.values(championStats);

  return {
    hasData: parsedGames.length > 0,
    statistics: buildPublicStatistics(parsedGames.length, players, champions),
    matches: matchSummaries,
    teams: Object.values(teamSummaries),
    players,
    teamSummaries
  };
}

function pickMvp(match, durationMin) {
  let best = null;
  match.players.forEach((player) => {
    const sideStats = match.teams[player.side] || {};
    const teamKills = Math.max(0, number(sideStats.kills));
    const kp = teamKills ? (player.kills + player.assists) / teamKills : 0;
    const gpm = player.gold / durationMin;
    const dpm = player.damage / durationMin;
    const vpm = player.visionScore / durationMin;
    const laneBonus = { TOP: dpm * 0.012 + player.kills * 0.7, JG: kp * 10 + player.assists * 0.45, MID: dpm * 0.015 + player.kills * 0.9, ADC: dpm * 0.018 + player.kills, SUP: vpm * 5 + player.assists * 0.75 }[player.lane] || 0;
    const score = player.kills * 3.2 + player.assists * 1.55 - player.deaths * 2.25 + kp * 18 + gpm * 0.018 + dpm * 0.022 + vpm * 2.4 + (player.won ? 6 : 0) + laneBonus;
    const key = `${player.teamSlot || player.side}:${player.lane}:${normalizeKey(player.name)}`;
    if (!best || score > best.score) best = { key, name: player.name, score };
  });
  return best;
}

function buildPublicStatistics(matchCount, players, champions) {
  if (!matchCount) return null;
  const mostPicked = maxBy(champions, (champion) => champion.picks) || createChampionAggregate("Aatrox");
  const mostWins = maxBy(champions, (champion) => champion.wins) || createChampionAggregate("Aatrox");
  const bestKda = maxBy(players, (player) => player.kda);
  const bestKp = maxBy(players, (player) => player.kp);
  const bestDpm = maxBy(players, (player) => player.dpm);
  const bestGpm = maxBy(players, (player) => player.gpm);
  const bestVs = maxBy(players, (player) => player.visionScoreAvg);
  return {
    hasData: true,
    mostPicked: { title: "MAIS ESCOLHAS", champion: upperChampion(mostPicked.name), value: mostPicked.picks || 0, image: championImagePath(mostPicked.name) },
    mostWins: { title: "MAIS VITORIAS", champion: upperChampion(mostWins.name), value: mostWins.wins || 0, image: championImagePath(mostWins.name) },
    playerStats: [
      { label: "MELHOR KDA", player: playerName(bestKda), value: formatNumber(bestKda && bestKda.kda) },
      { label: "MELHOR KP", player: playerName(bestKp), value: `${formatNumber(bestKp && bestKp.kp)}%` },
      { label: "MELHOR DPM", player: playerName(bestDpm), value: formatNumber(bestDpm && bestDpm.dpm) },
      { label: "MELHOR GPM", player: playerName(bestGpm), value: formatNumber(bestGpm && bestGpm.gpm) },
      { label: "MELHOR VS", player: playerName(bestVs), value: formatNumber(bestVs && bestVs.visionScoreAvg) }
    ]
  };
}

function writePublicFiles(existingDb, existingContent, existingFixedData) {
  const db = existingDb || readDatabase();
  const fixedData = existingFixedData || loadWindowScript(path.join(ASSETS, "data.js"), "LIGA_RK_DATA");
  const content = existingContent || loadWindowScript(path.join(ASSETS, "content.js"), "LIGA_RK_CONTENT");
  const computed = computeAll(db, content, fixedData);
  fs.writeFileSync(STATS_CONTENT_PATH, `window.LIGA_RK_STATS = ${JSON.stringify(computed, null, 2)};\n`, "utf8");
  fs.writeFileSync(REPLAY_DB_PATH, `window.LIGA_RK_REPLAY_DB = ${JSON.stringify(db, null, 2)};\n`, "utf8");
}

function buildAllSeries(fixedData) {
  return Object.fromEntries(DIVISIONS.map((division) => [division, buildSeries(fixedData[division] || {})]));
}

function buildSeries(division) {
  const series = [];
  (division.rounds || []).forEach((round, roundIndex) => {
    (round.games || []).forEach((game, gameIndex) => {
      const normalized = Array.isArray(game) ? { time: game[0], home: game[1], away: game[2] } : game;
      series.push({ id: `groups-r${roundIndex + 1}g${gameIndex + 1}`, stage: "grupos", title: `${round.name} - ${normalized.home} x ${normalized.away}`, subtitle: `${round.date} ${normalized.time}`, maxGames: 2, teamARef: normalized.home, teamBRef: normalized.away });
    });
  });
  (division.playoffs || []).forEach((column, columnIndex) => {
    (column || []).forEach((match, matchIndex) => {
      series.push({ id: `playoffs-p${columnIndex + 1}m${matchIndex + 1}`, stage: playoffStage(match.title), title: match.title, subtitle: `${match.date} ${match.time} ${match.format}`, maxGames: String(match.format).toUpperCase() === "MD5" ? 5 : 3, teamARef: match.teamA, teamBRef: match.teamB });
    });
  });
  return series;
}

function teamsBySlot(content, fixedData, divisionKey) {
  const fixedDivision = fixedData[divisionKey] || {};
  const contentDivision = (content.divisions && content.divisions[divisionKey]) || {};
  return Object.fromEntries(
    GROUPS.flatMap((group) => [1, 2, 3, 4].map((seed) => `${group}${seed}`)).map((slot, index) => {
      const raw = (contentDivision.teams && contentDivision.teams[slot]) || {};
      const legacy = (fixedDivision.teams && fixedDivision.teams[index]) || {};
      return [slot, { slot, name: raw.name || legacy.name || slot, tag: raw.tag || slot, logo: raw.logo || legacy.logo || "", players: LANES.map((lane, playerIndex) => ({ lane, name: ((raw.players && raw.players[playerIndex]) || (legacy.players && legacy.players[playerIndex]) || {}).player || "JOGADOR" })) }];
    })
  );
}

function createTeamAggregates(teams) {
  return Object.fromEntries(Object.entries(teams).map(([slot, team]) => [slot, createTeamAggregate(slot, team)]));
}

function createTeamAggregate(slot, team) {
  return { slot, name: team.name || slot, tag: team.tag || slot, logo: team.logo || "", games: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, gold: 0, gpmSum: 0, winDurationSeconds: 0, winDurationCount: 0 };
}

function createPlayerAggregate(player) {
  return { name: player.name, lane: player.lane, teamSlot: player.teamSlot, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, gold: 0, damage: 0, visionScore: 0, kpSum: 0, gpmSum: 0, dpmSum: 0, vpmSum: 0, mvp: 0, champions: {} };
}

function createChampionAggregate(name) {
  return { name: name || "Aatrox", picks: 0, wins: 0 };
}

function summarizeTeam(team) {
  const games = Math.max(1, team.games);
  return { slot: team.slot, name: team.name, tag: team.tag, logo: team.logo, games: team.games, wins: team.wins, losses: team.losses, avgWinTime: team.winDurationCount ? formatTime(Math.round(team.winDurationSeconds / team.winDurationCount)) : "00:00", killsAvg: round(team.kills / games), deathsAvg: round(team.deaths / games), assistsAvg: round(team.assists / games), gpmAvg: round(team.gpmSum / games) };
}

function summarizePlayer(player) {
  const games = Math.max(1, player.games);
  const champions = Object.entries(player.champions).map(([champion, count]) => ({ champion, count })).sort((a, b) => b.count - a.count || a.champion.localeCompare(b.champion));
  return { name: player.name, lane: player.lane, teamSlot: player.teamSlot, games: player.games, wins: player.wins, champions, kills: player.kills, deaths: player.deaths, assists: player.assists, kda: round((player.kills + player.assists) / Math.max(1, player.deaths)), kp: round((player.kpSum / games) * 100), gpm: round(player.gpmSum / games), dpm: round(player.dpmSum / games), vpm: round(player.vpmSum / games), visionScoreAvg: round(player.visionScore / games), mvps: player.mvp };
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if ((pathname === "/editor.html" || pathname === "/stats-admin.html") && !requireAdminAuth(request, response)) {
    return;
  }
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT) || filePath.startsWith(DATA_DIR) || filePath.startsWith(CONFIG_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mimeType(filePath) });
  fs.createReadStream(filePath).pipe(response);
}

function requireAdminAuth(request, response) {
  const password = process.env.ADMIN_PASSWORD || "";
  if (!password) {
    return true;
  }

  const expectedUser = process.env.ADMIN_USER || "admin";
  const header = String(request.headers.authorization || "");
  const prefix = "Basic ";
  if (header.startsWith(prefix)) {
    const decoded = Buffer.from(header.slice(prefix.length), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const user = separator >= 0 ? decoded.slice(0, separator) : "";
    const pass = separator >= 0 ? decoded.slice(separator + 1) : "";
    if (safeEqual(user, expectedUser) && safeEqual(pass, password)) {
      return true;
    }
  }

  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Liga RK 26.2 Admin"',
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end("Autenticacao necessaria.");
  return false;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Upload grande demais."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(new Error("JSON invalido."));
      }
    });
    request.on("error", reject);
  });
}

function ensureDirectories() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(path.join(REPLAY_DIR, "elite"), { recursive: true });
  fs.mkdirSync(path.join(REPLAY_DIR, "ascension"), { recursive: true });
}

function ensureDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    writeDatabase({ version: 1, updatedAt: "", divisions: { elite: { games: [] }, ascension: { games: [] } } });
  }
}

function readDatabase() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  DIVISIONS.forEach((division) => ensureDivisionDb(db, division));
  return db;
}

function writeDatabase(db) {
  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function ensureDivisionDb(db, division) {
  db.divisions = db.divisions || {};
  db.divisions[division] = db.divisions[division] || {};
  db.divisions[division].games = Array.isArray(db.divisions[division].games) ? db.divisions[division].games : [];
  return db.divisions[division];
}

function loadWindowScript(filePath, property) {
  const source = fs.readFileSync(filePath, "utf8");
  const context = { window: {}, console };
  vm.runInNewContext(source, context, { filename: filePath });
  return context.window[property] || {};
}

function readApiKey() {
  return process.env.RIOT_API_KEY || (fs.existsSync(API_KEY_PATH) ? fs.readFileSync(API_KEY_PATH, "utf8").trim() : "");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function normalizeDivision(value) {
  const division = String(value || "").trim();
  return DIVISIONS.includes(division) ? division : "";
}

function normalizeMatchId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const full = /^(BR1|LA1|LA2|NA1|EUW1|EUN1|KR|JP1|OC1|TR1|RU|PH2|SG2|TH2|TW2|VN2)[_-](\d+)$/i.exec(text);
  if (full) return `${full[1].toUpperCase()}_${full[2]}`;
  if (/^\d{6,}$/.test(text)) return `${PLATFORM_DEFAULT}_${text}`;
  return text;
}

function normalizeSide(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "100" || text === "blue" || text === "azul") return "blue";
  if (text === "200" || text === "red" || text === "vermelho") return "red";
  return "";
}

function normalizeLane(value) {
  const text = String(value || "").trim().toUpperCase();
  const aliases = { JUNGLE: "JG", JUNGLER: "JG", MIDDLE: "MID", MIDLANE: "MID", BOTTOM: "ADC", BOT: "ADC", UTILITY: "SUP", SUPPORT: "SUP" };
  return aliases[text] || (["TOP", "JG", "MID", "ADC", "SUP", "SUB"].includes(text) ? text : "SUB");
}

function secondsFromDuration(value) {
  if (typeof value === "number") return Math.max(0, Math.round(value));
  const text = String(value || "").trim();
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Math.max(0, Math.round(Number(text) || 0));
}

function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function championImagePath(name) {
  const champion = String(name || "Aatrox").replace(/[^A-Za-z0-9]/g, "");
  const direct = path.join(ASSETS, "champions", `${champion}.jpg`);
  if (fs.existsSync(direct)) return `assets/champions/${champion}.jpg`;
  const championDir = path.join(ASSETS, "champions");
  const files = fs.existsSync(championDir) ? fs.readdirSync(championDir) : [];
  const wanted = normalizeKey(champion);
  const match = files.find((file) => normalizeKey(path.basename(file, path.extname(file))) === wanted);
  return match ? `assets/champions/${match}` : "assets/champions/Aatrox.jpg";
}

function playoffStage(title) {
  const text = String(title || "").toUpperCase();
  if (text.includes("OITAVAS")) return "oitavas";
  if (text.includes("QUARTAS")) return "quartas";
  if (text.includes("SEMI")) return "semis";
  if (text.includes("FINAL")) return "final";
  return "playoffs";
}

function playerName(player) {
  return player && player.name ? player.name : "JOGADOR";
}

function upperChampion(name) {
  return String(name || "AATROX").toUpperCase();
}

function maxBy(items, score) {
  return items.reduce((best, item) => (!best || score(item) > score(best) ? item : best), null);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function sum(items, key) {
  return items.reduce((total, item) => total + number(item[key]), 0);
}

function number(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function round(value) {
  return Math.round(number(value) * 100) / 100;
}

function formatNumber(value) {
  return round(value).toFixed(2);
}

function safeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function sanitizeFileName(value) {
  return String(value || "replay.rofl").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, "-").slice(0, 120);
}

function mimeType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function messageOf(error) {
  return error && error.message ? error.message : String(error || "Erro");
}
