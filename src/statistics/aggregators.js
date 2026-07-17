const crypto = require("node:crypto");
const { damageShare, kda, participation, perMinute, round, winRate } = require("./calculations");
const { normalizeRiotId } = require("./player-identity");

const DIVISIONS = ["elite", "ascension"];

function aggregateDatabase(database, content, fixedData = {}) {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    season: "Liga RK 26.2",
    divisions: Object.fromEntries(DIVISIONS.map((division) => [
      division,
      aggregateDivision(database.divisions && database.divisions[division], content, fixedData, division)
    ]))
  };
}

function aggregateDivision(divisionDatabase, content, fixedData, division) {
  const teams = teamsBySlot(content, fixedData, division);
  const roster = rosterByPlayerId(teams);
  const games = Array.isArray(divisionDatabase && divisionDatabase.games) ? divisionDatabase.games : [];
  const parsedGames = games.filter((game) => game && game.match && /^parsed_/.test(String(game.parserStatus || "")));
  const teamAggregates = Object.fromEntries(Object.entries(teams).map(([slot, team]) => [slot, createTeamAggregate(team)]));
  const playerAggregates = new Map();
  const championAggregates = new Map();
  const matches = [];

  for (const registered of roster.values()) {
    const player = createPlayerAggregate(registered.playerId, {
      playerId: registered.playerId,
      riotId: registered.riotId,
      gameName: registered.displayName
    }, registered);
    if (registered.lane) player.positions.set(registered.lane, 0);
    if (registered.teamSlot) player.teams.set(registered.teamSlot, 0);
    playerAggregates.set(registered.playerId, player);
  }

  for (const game of parsedGames) {
    const match = game.match;
    const durationSeconds = Number(match.durationSeconds || 0);
    if (!(durationSeconds > 0)) continue;
    const sides = [
      { teamNumber: 100, slot: game.blueTeamSlot, stats: teamStats(match, 100) },
      { teamNumber: 200, slot: game.redTeamSlot, stats: teamStats(match, 200) }
    ];
    const mvp = selectMvp(match, durationSeconds);

    for (const side of sides) {
      const aggregate = teamAggregates[side.slot] || createTeamAggregate(teams[side.slot] || { slot: side.slot });
      const won = Number(match.winnerTeam) === side.teamNumber || Boolean(side.stats.won);
      aggregate.games += 1;
      aggregate.wins += won ? 1 : 0;
      aggregate.losses += won ? 0 : 1;
      aggregate.kills += value(side.stats.kills);
      aggregate.deaths += value(side.stats.deaths);
      aggregate.assists += value(side.stats.assists);
      aggregate.gold += value(side.stats.gold);
      aggregate.damage += value(side.stats.damageToChampions);
      aggregate.towers += value(side.stats.towers);
      aggregate.voidGrubs += value(side.stats.voidGrubs);
      aggregate.heralds += value(side.stats.heralds);
      aggregate.dragons += value(side.stats.dragons);
      aggregate.elderDragons += value(side.stats.elderDragons);
      aggregate.barons += value(side.stats.barons);
      aggregate.durationSeconds += durationSeconds;
      if (won) {
        aggregate.winDurationSeconds += durationSeconds;
        aggregate.winDurationCount += 1;
      }
      teamAggregates[side.slot] = aggregate;
    }

    for (const participant of match.participants || []) {
      const teamNumber = Number(participant.team);
      const teamSlot = teamNumber === 100 ? game.blueTeamSlot : game.redTeamSlot;
      const sideStats = teamStats(match, teamNumber);
      const identityKey = participant.playerId || temporaryPlayerId(participant.riotId);
      const registered = roster.get(participant.playerId) || {};
      const player = playerAggregates.get(identityKey) || createPlayerAggregate(identityKey, participant, registered);
      const participantKp = participation(participant.kills, participant.assists, sideStats.kills);
      const participantDamageShare = damageShare(participant.damageToChampions, sideStats.damageToChampions);
      player.displayName = registered.displayName || participant.displayName || player.displayName || participant.gameName || participant.riotId;
      player.riotIds.add(participant.riotId);
      player.games += 1;
      player.wins += participant.won ? 1 : 0;
      player.losses += participant.won ? 0 : 1;
      player.kills += value(participant.kills);
      player.deaths += value(participant.deaths);
      player.assists += value(participant.assists);
      player.gold += value(participant.gold);
      player.damage += value(participant.damageToChampions);
      player.kpSum += participantKp;
      player.damageShareSum += participantDamageShare;
      player.gpmSum += perMinute(participant.gold, durationSeconds);
      player.dpmSum += perMinute(participant.damageToChampions, durationSeconds);
      player.visionScore += value(participant.visionScore);
      player.vpmSum += perMinute(participant.visionScore, durationSeconds);
      player.towers += value(participant.towers);
      player.dragons += value(participant.dragons);
      player.heralds += value(participant.heralds);
      player.barons += value(participant.barons);
      player.positions.set(participant.position, (player.positions.get(participant.position) || 0) + 1);
      player.teams.set(teamSlot, (player.teams.get(teamSlot) || 0) + 1);
      player.champions.set(participant.champion, (player.champions.get(participant.champion) || 0) + 1);
      if (participant.won) player.championWins.set(participant.champion, (player.championWins.get(participant.champion) || 0) + 1);
      player.matches.push(game.id);
      if (mvp && mvp.participantIndex === participant.participantIndex) player.mvps += 1;
      playerAggregates.set(identityKey, player);

      const championKey = normalizeChampion(participant.champion);
      const champion = championAggregates.get(championKey) || createChampionAggregate(participant.champion);
      champion.picks += 1;
      champion.wins += participant.won ? 1 : 0;
      champion.losses += participant.won ? 0 : 1;
      champion.kills += value(participant.kills);
      champion.deaths += value(participant.deaths);
      champion.assists += value(participant.assists);
      champion.gold += value(participant.gold);
      champion.damage += value(participant.damageToChampions);
      champion.dpmSum += perMinute(participant.damageToChampions, durationSeconds);
      champion.positions.set(participant.position, (champion.positions.get(participant.position) || 0) + 1);
      champion.players.add(identityKey);
      champion.teams.add(teamSlot);
      champion.matches.add(game.id);
      championAggregates.set(championKey, champion);
    }

    matches.push(buildMatchSummary(game, teams, mvp));
  }

  const teamList = Object.values(teamAggregates).map(summarizeTeam).sort((a, b) => (
    b.winRate - a.winRate ||
    timeStringToSeconds(a.avgWinTime) - timeStringToSeconds(b.avgWinTime) ||
    b.games - a.games ||
    a.name.localeCompare(b.name)
  ));
  const players = Array.from(playerAggregates.values()).map(summarizePlayer).sort((a, b) => (
    b.kda - a.kda ||
    b.games - a.games ||
    b.winRate - a.winRate ||
    a.displayName.localeCompare(b.displayName, "pt-BR")
  ));
  const champions = Array.from(championAggregates.values()).map(summarizeChampion).sort((a, b) => b.picks - a.picks || b.wins - a.wins);

  return {
    hasData: matches.length > 0,
    overview: {
      games: matches.length,
      teams: teamList.filter((team) => team.games > 0).length,
      players: players.length,
      champions: champions.length
    },
    statistics: buildHeadlineStatistics(players, champions),
    teams: teamList,
    teamSummaries: Object.fromEntries(teamList.map((team) => [team.slot, team])),
    players,
    champions,
    matches
  };
}

function teamsBySlot(content, fixedData, division) {
  const contentDivision = content && content.divisions && content.divisions[division] || {};
  const fixedDivision = fixedData && fixedData[division] || {};
  const legacyTeams = Array.isArray(fixedDivision.teams) ? fixedDivision.teams : [];
  const slots = ["A", "B", "C", "D"].flatMap((group) => [1, 2, 3, 4].map((seed) => `${group}${seed}`));
  return Object.fromEntries(slots.map((slot, index) => {
    const current = contentDivision.teams && contentDivision.teams[slot] || {};
    const legacy = legacyTeams[index] || {};
    const players = Array.isArray(current.players) ? current.players : legacy.players || [];
    return [slot, {
      ...legacy,
      ...current,
      slot,
      name: current.name || legacy.name || slot,
      tag: current.tag || legacy.tag || slot,
      logo: normalizeAssetPath(current.logo || legacy.logo || ""),
      players
    }];
  }));
}

function rosterByPlayerId(teams) {
  const roster = new Map();
  for (const [slot, team] of Object.entries(teams)) {
    for (const player of team.players || []) {
      if (!player || !player.playerId || !isRegisteredRosterPlayer(player)) continue;
      roster.set(player.playerId, {
        playerId: player.playerId,
        displayName: player.player || player.name || player.riotId || "JOGADOR",
        riotId: player.riotId || "",
        opgg: player.opgg || "",
        lane: player.lane || "",
        teamSlot: slot
      });
    }
  }
  return roster;
}

function isRegisteredRosterPlayer(player) {
  const name = String(player && (player.player || player.name) || "").trim().toLocaleUpperCase("pt-BR");
  const placeholders = new Set(["", "-", "--", "SUB", "JOGADOR", "PLAYER", "VAGA DISPONIVEL", "VAGA DISPONÍVEL"]);
  return !placeholders.has(name) || Boolean(String(player && (player.opgg || player.riotId) || "").trim());
}

function teamStats(match, teamNumber) {
  return match.teams && (match.teams[String(teamNumber)] || match.teams[teamNumber]) || {};
}

function createTeamAggregate(team) {
  return {
    slot: team.slot || "",
    name: team.name || team.slot || "",
    tag: team.tag || team.slot || "",
    logo: team.logo || "",
    games: 0,
    wins: 0,
    losses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 0,
    damage: 0,
    towers: 0,
    voidGrubs: 0,
    heralds: 0,
    dragons: 0,
    elderDragons: 0,
    barons: 0,
    durationSeconds: 0,
    winDurationSeconds: 0,
    winDurationCount: 0
  };
}

function createPlayerAggregate(id, participant, registered) {
  return {
    id,
    playerId: participant.playerId || "",
    displayName: registered.displayName || participant.gameName || participant.riotId || "JOGADOR",
    primaryRiotId: registered.riotId || "",
    opgg: registered.opgg || "",
    riotIds: new Set(),
    games: 0,
    wins: 0,
    losses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 0,
    damage: 0,
    visionScore: 0,
    kpSum: 0,
    damageShareSum: 0,
    gpmSum: 0,
    dpmSum: 0,
    vpmSum: 0,
    towers: 0,
    dragons: 0,
    heralds: 0,
    barons: 0,
    mvps: 0,
    positions: new Map(),
    teams: new Map(),
    champions: new Map(),
    championWins: new Map(),
    matches: []
  };
}

function createChampionAggregate(name) {
  return {
    name: name || "",
    picks: 0,
    wins: 0,
    losses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 0,
    damage: 0,
    dpmSum: 0,
    positions: new Map(),
    players: new Set(),
    teams: new Set(),
    matches: new Set()
  };
}

function summarizeTeam(team) {
  const games = team.games || 0;
  return {
    slot: team.slot,
    name: team.name,
    tag: team.tag,
    logo: team.logo,
    games,
    wins: team.wins,
    losses: team.losses,
    winRate: round(winRate(team.wins, games) * 100),
    kills: team.kills,
    deaths: team.deaths,
    assists: team.assists,
    kda: round(kda(team.kills, team.deaths, team.assists)),
    killsAvg: round(team.kills / Math.max(1, games)),
    deathsAvg: round(team.deaths / Math.max(1, games)),
    assistsAvg: round(team.assists / Math.max(1, games)),
    goldAvg: round(team.gold / Math.max(1, games)),
    gpmAvg: round(perMinute(team.gold, team.durationSeconds)),
    damageAvg: round(team.damage / Math.max(1, games)),
    dpmAvg: round(perMinute(team.damage, team.durationSeconds)),
    towersAvg: round(team.towers / Math.max(1, games)),
    voidGrubsAvg: round(team.voidGrubs / Math.max(1, games)),
    heraldsAvg: round(team.heralds / Math.max(1, games)),
    dragonsAvg: round(team.dragons / Math.max(1, games)),
    elderDragons: team.elderDragons,
    baronsAvg: round(team.barons / Math.max(1, games)),
    avgDuration: formatSeconds(team.durationSeconds / Math.max(1, games)),
    avgWinTime: team.winDurationCount ? formatSeconds(team.winDurationSeconds / team.winDurationCount) : "00:00"
  };
}

function summarizePlayer(player) {
  const games = Math.max(1, player.games);
  const positions = sortedMap(player.positions, "position");
  const champions = sortedPlayerChampions(player.champions, player.championWins);
  const teams = sortedMap(player.teams, "slot");
  return {
    id: player.id,
    playerId: player.playerId,
    displayName: player.displayName,
    riotId: player.primaryRiotId || Array.from(player.riotIds)[0] || "",
    alsoPlayedAs: Array.from(player.riotIds).filter((riotId) => riotId && riotId !== player.primaryRiotId),
    opgg: player.opgg,
    games: player.games,
    wins: player.wins,
    losses: player.losses,
    winRate: round(winRate(player.wins, player.games) * 100),
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    kda: round(kda(player.kills, player.deaths, player.assists)),
    killsAvg: round(player.kills / games),
    deathsAvg: round(player.deaths / games),
    assistsAvg: round(player.assists / games),
    kp: round(player.kpSum / games * 100),
    gold: player.gold,
    goldAvg: round(player.gold / games),
    gpm: round(player.gpmSum / games),
    damage: player.damage,
    damageAvg: round(player.damage / games),
    dpm: round(player.dpmSum / games),
    damageShare: round(player.damageShareSum / games * 100),
    visionScore: player.visionScore,
    visionScoreAvg: round(player.visionScore / games),
    vpm: round(player.vpmSum / games),
    towers: player.towers,
    dragons: player.dragons,
    heralds: player.heralds,
    barons: player.barons,
    mvps: player.mvps,
    positions,
    mainPosition: positions[0] ? positions[0].position : "",
    teams,
    champions,
    mostPlayedChampion: champions[0] ? champions[0].champion : "",
    matches: player.matches.slice().reverse()
  };
}

function summarizeChampion(champion) {
  const games = Math.max(1, champion.picks);
  return {
    id: normalizeChampion(champion.name),
    name: champion.name,
    image: championImage(champion.name),
    picks: champion.picks,
    wins: champion.wins,
    losses: champion.losses,
    winRate: round(winRate(champion.wins, champion.picks) * 100),
    kills: champion.kills,
    deaths: champion.deaths,
    assists: champion.assists,
    kda: round(kda(champion.kills, champion.deaths, champion.assists)),
    goldAvg: round(champion.gold / games),
    damageAvg: round(champion.damage / games),
    dpm: round(champion.dpmSum / games),
    positions: sortedMap(champion.positions, "position"),
    players: Array.from(champion.players),
    teams: Array.from(champion.teams),
    matches: Array.from(champion.matches)
  };
}

function buildMatchSummary(game, teams, mvp) {
  const match = game.match;
  const team100 = teamStats(match, 100);
  const team200 = teamStats(match, 200);
  const winnerNumber = Number(match.winnerTeam);
  const winnerSlot = winnerNumber === 100 ? game.blueTeamSlot : game.redTeamSlot;
  const loserSlot = winnerNumber === 100 ? game.redTeamSlot : game.blueTeamSlot;
  return {
    id: game.id,
    division: game.division,
    seriesId: game.seriesId,
    stage: game.stage || "",
    round: replaceSlotReferences(game.round || "", teams),
    gameNumber: game.gameNumber,
    date: game.date || "",
    gameId: match.gameId || "",
    clientVersion: match.clientVersion || "",
    durationSeconds: match.durationSeconds,
    duration: formatSeconds(match.durationSeconds),
    blueTeamSlot: game.blueTeamSlot,
    redTeamSlot: game.redTeamSlot,
    blueTeam: teamSnapshot(teams[game.blueTeamSlot], game.blueTeamSnapshot),
    redTeam: teamSnapshot(teams[game.redTeamSlot], game.redTeamSnapshot),
    winnerSlot,
    loserSlot,
    goldDiff: Math.abs(value(team100.gold) - value(team200.gold)),
    killsDiff: Math.abs(value(team100.kills) - value(team200.kills)),
    mvp: mvp ? { participantIndex: mvp.participantIndex, riotId: mvp.riotId, playerId: mvp.playerId || "" } : null,
    teams: { "100": { ...team100, slot: game.blueTeamSlot }, "200": { ...team200, slot: game.redTeamSlot } },
    participants: (match.participants || []).map((participant) => ({
      participantIndex: participant.participantIndex,
      playerId: participant.playerId || "",
      riotId: participant.riotId,
      gameName: participant.gameName,
      tagLine: participant.tagLine,
      team: participant.team,
      teamSlot: participant.team === 100 ? game.blueTeamSlot : game.redTeamSlot,
      position: participant.position,
      champion: participant.champion,
      won: participant.won,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      gold: participant.gold,
      damageToChampions: participant.damageToChampions,
      visionScore: participant.visionScore,
      wardsPlaced: participant.wardsPlaced,
      wardsKilled: participant.wardsKilled,
      objectives: participant.objectives,
      items: participant.items,
      identificationMethod: participant.identificationMethod || "unresolved"
    }))
  };
}

function selectMvp(match, durationSeconds) {
  let best = null;
  for (const participant of match.participants || []) {
    const side = teamStats(match, participant.team);
    const kp = participation(participant.kills, participant.assists, side.kills);
    const dpm = perMinute(participant.damageToChampions, durationSeconds);
    const gpm = perMinute(participant.gold, durationSeconds);
    const objectiveImpact = value(participant.towers) * 2 + value(participant.dragons) * 2.5 + value(participant.heralds) * 2 + value(participant.barons) * 3;
    const laneWeight = {
      TOP: dpm * 0.01 + participant.kills * 0.7,
      JG: kp * 9 + objectiveImpact * 1.5,
      MID: dpm * 0.014 + participant.kills * 0.8,
      ADC: dpm * 0.017 + participant.kills,
      SUP: kp * 12 + participant.assists * 0.6
    }[participant.position] || 0;
    const score = participant.kills * 3 + participant.assists * 1.4 - participant.deaths * 2.2 + kp * 17 + gpm * 0.016 + dpm * 0.02 + objectiveImpact + laneWeight + (participant.won ? 6 : 0);
    if (!best || score > best.score) best = { ...participant, score };
  }
  return best;
}

function buildHeadlineStatistics(players, champions) {
  if (!players.length || !champions.length) return null;
  const mostPicked = maxBy(champions, (champion) => champion.picks);
  const mostWins = maxBy(champions, (champion) => champion.wins);
  const bestKda = maxBy(players, (player) => player.kda);
  const bestKp = maxBy(players, (player) => player.kp);
  const bestDpm = maxBy(players, (player) => player.dpm);
  const bestGpm = maxBy(players, (player) => player.gpm);
  const bestVision = maxBy(players, (player) => player.visionScoreAvg);
  return {
    mostPicked: headlineChampion("MAIS ESCOLHAS", mostPicked, mostPicked.picks),
    mostWins: headlineChampion("MAIS VITORIAS", mostWins, mostWins.wins),
    playerStats: [
      headlinePlayer("MELHOR KDA", bestKda, bestKda.kda),
      headlinePlayer("MELHOR KP", bestKp, `${bestKp.kp}%`),
      headlinePlayer("MELHOR DPM", bestDpm, bestDpm.dpm),
      headlinePlayer("MELHOR GPM", bestGpm, bestGpm.gpm),
      headlinePlayer("MELHOR VS", bestVision, bestVision.visionScoreAvg)
    ]
  };
}

function headlineChampion(title, champion, valueNumber) {
  return { title, champion: String(champion.name || "").toUpperCase(), value: valueNumber, image: champion.image };
}

function headlinePlayer(label, player, metric) {
  return { label, player: player.displayName || player.riotId || "", playerId: player.id, value: metric };
}

function temporaryPlayerId(riotId) {
  return `unresolved-${crypto.createHash("sha256").update(normalizeRiotId(riotId) || String(riotId || "unknown")).digest("hex").slice(0, 16)}`;
}

function sortedMap(map, key) {
  return Array.from(map.entries()).map(([name, count]) => ({ [key]: name, count })).sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key])));
}

function sortedPlayerChampions(picks, victories) {
  return Array.from(picks.entries()).map(([champion, count]) => {
    const wins = victories.get(champion) || 0;
    return {
      champion,
      image: championImage(champion),
      count,
      wins,
      losses: Math.max(0, count - wins),
      winRate: round(winRate(wins, count) * 100)
    };
  }).sort((a, b) => b.count - a.count || b.wins - a.wins || String(a.champion).localeCompare(String(b.champion)));
}

function teamSnapshot(current, fallback) {
  const source = current || fallback || {};
  return { slot: source.slot || "", name: source.name || source.slot || "", tag: source.tag || source.slot || "", logo: normalizeAssetPath(source.logo) };
}

function replaceSlotReferences(value, teams) {
  return String(value || "").replace(/\b([A-D][1-4])\b/g, (slot) => {
    const team = teams[slot];
    return team && String(team.tag || "").trim() ? String(team.tag).trim().toUpperCase() : slot;
  });
}

function normalizeAssetPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function timeStringToSeconds(value) {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(String(value || "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

function normalizeChampion(name) {
  return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function championImage(name) {
  const aliases = { wukong: "MonkeyKing", nunuwillump: "Nunu", renataglasc: "Renata", kaisa: "Kaisa", chogath: "Chogath", belveth: "Belveth", reksai: "RekSai", khazix: "Khazix", velkoz: "Velkoz", drmundo: "DrMundo", jarvaniv: "JarvanIV", leesin: "LeeSin", masteryi: "MasterYi", missfortune: "MissFortune", aurelionsol: "AurelionSol", tahmkench: "TahmKench", twistedfate: "TwistedFate", xinzhao: "XinZhao", kogmaw: "KogMaw", ksante: "KSante" };
  const key = normalizeChampion(name);
  const file = aliases[key] || String(name || "").replace(/[^a-z0-9]/gi, "");
  return file ? `assets/champions/${file}.jpg` : "";
}

function formatSeconds(seconds) {
  const safe = Math.max(0, Math.round(value(seconds)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function maxBy(items, scorer) {
  return items.reduce((best, item) => !best || scorer(item) > scorer(best) ? item : best, null);
}

function value(input) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = { aggregateDatabase, aggregateDivision, buildHeadlineStatistics, selectMvp, teamsBySlot, temporaryPlayerId };
