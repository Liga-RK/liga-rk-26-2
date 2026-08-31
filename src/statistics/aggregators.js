const crypto = require("node:crypto");
const { damageShare, kda, participation, perMinute, round, winRate } = require("./calculations");
const { normalizeRiotId, parseOpggRiotId } = require("./player-identity");

const DIVISIONS = ["elite", "ascension"];
const MVP_MODEL_VERSION = "role-impact-v5";
const ACTIVE_TEAM_OF_WEEK = Object.freeze({
  elite: Object.freeze({ stage: "SEMIFINAL", label: "SEMIFINAIS" }),
  ascension: Object.freeze({ stage: "SEMIFINAL", label: "SEMIFINAIS" })
});
const MIN_TEAM_OF_WEEK_GAMES = 2;
const COMPETITIVE_LANES = ["TOP", "JG", "MID", "ADC", "SUP"];
const PLAYER_IDENTITY_MERGES = Object.freeze({
  elite: Object.freeze({
    // DAVID (Little David#RBRN) and DAVI (DeyraF#LDavi) are the same M7 player.
    "8de67801-d9d0-45c6-ab35-5efaacdacf51": "87b0b01b-0c1d-44ca-8154-ec59da7b80a3"
  }),
  ascension: Object.freeze({})
});
const MVP_ROLE_WEIGHTS = Object.freeze({
  TOP: Object.freeze({ kda: 0.13, kp: 0.10, damage: 0.17, efficiency: 0.08, vision: 0.03, wards: 0.02, towers: 0.15, objectives: 0.05, kills: 0.05, assists: 0.02, survival: 0.08, roleEdge: 0.12 }),
  JG: Object.freeze({ kda: 0.11, kp: 0.18, damage: 0.07, efficiency: 0.04, vision: 0.08, wards: 0.06, towers: 0.03, objectives: 0.20, kills: 0.04, assists: 0.08, survival: 0.04, roleEdge: 0.07 }),
  MID: Object.freeze({ kda: 0.14, kp: 0.15, damage: 0.20, efficiency: 0.10, vision: 0.04, wards: 0.02, towers: 0.08, objectives: 0.04, kills: 0.07, assists: 0.02, survival: 0.07, roleEdge: 0.07 }),
  ADC: Object.freeze({ kda: 0.15, kp: 0.13, damage: 0.24, efficiency: 0.11, vision: 0.02, wards: 0.01, towers: 0.12, objectives: 0.02, kills: 0.10, assists: 0.01, survival: 0.06, roleEdge: 0.03 }),
  SUP: Object.freeze({ kda: 0.10, kp: 0.22, damage: 0.03, efficiency: 0.02, vision: 0.17, wards: 0.12, towers: 0.01, objectives: 0.05, kills: 0.01, assists: 0.18, survival: 0.04, roleEdge: 0.05 })
});
const MVP_ROLE_EDGE_WEIGHTS = Object.freeze({
  TOP: Object.freeze({ kda: 0.18, kp: 0.08, damage: 0.28, gold: 0.22, vision: 0.06, towers: 0.18 }),
  JG: Object.freeze({ kda: 0.14, kp: 0.20, damage: 0.10, gold: 0.10, vision: 0.14, objectives: 0.32 }),
  MID: Object.freeze({ kda: 0.20, kp: 0.15, damage: 0.28, gold: 0.20, vision: 0.07, towers: 0.10 }),
  ADC: Object.freeze({ kda: 0.20, kp: 0.06, damage: 0.30, gold: 0.22, kills: 0.12, towers: 0.10 }),
  SUP: Object.freeze({ kda: 0.15, kp: 0.22, damage: 0.05, vision: 0.28, assists: 0.20, wards: 0.10 })
});
const MVP_ROLE_BASELINES = Object.freeze({
  TOP: Object.freeze({ kda: 0.45, kp: 0.50, damage: 0.23, gold: 0.20, efficiency: 0.72, vision: 0.10, wards: 0.10, towers: 0.25, objectives: 0.08, kills: 0.18, assists: 0.13, survival: 0.45 }),
  JG: Object.freeze({ kda: 0.45, kp: 0.65, damage: 0.15, gold: 0.18, efficiency: 0.55, vision: 0.18, wards: 0.18, towers: 0.08, objectives: 0.65, kills: 0.18, assists: 0.23, survival: 0.45 }),
  MID: Object.freeze({ kda: 0.50, kp: 0.58, damage: 0.24, gold: 0.21, efficiency: 0.72, vision: 0.12, wards: 0.12, towers: 0.20, objectives: 0.08, kills: 0.23, assists: 0.14, survival: 0.45 }),
  ADC: Object.freeze({ kda: 0.55, kp: 0.58, damage: 0.29, gold: 0.23, efficiency: 0.80, vision: 0.08, wards: 0.08, towers: 0.35, objectives: 0.07, kills: 0.32, assists: 0.13, survival: 0.50 }),
  SUP: Object.freeze({ kda: 0.45, kp: 0.68, damage: 0.09, gold: 0.14, efficiency: 0.45, vision: 0.45, wards: 0.50, towers: 0.04, objectives: 0.05, kills: 0.05, assists: 0.40, survival: 0.42 })
});
// Equalizes the performance range between roles after role-specific
// normalization. Jungle remains the reference while lanes whose core metrics
// naturally saturate lower receive a small scale correction.
const MVP_ROLE_CALIBRATION = Object.freeze({
  TOP: 1.09,
  JG: 1,
  MID: 1.07,
  ADC: 1.1,
  SUP: 1.16
});

function aggregateDatabase(database, content, fixedData = {}) {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    season: "Liga RK 26.2",
    divisions: Object.fromEntries(DIVISIONS.map((division) => [
      division,
      aggregateDivision(database.divisions && database.divisions[division], content, fixedData, division, database.rosterIdentities)
    ]))
  };
}

function aggregateDivision(divisionDatabase, content, fixedData, division, rosterIdentities = []) {
  const teams = teamsBySlot(content, fixedData, division);
  const roster = rosterByPlayerId(teams, rosterIdentities, division);
  const rosterByRiotId = indexRosterByRiotId(roster);
  const games = Array.isArray(divisionDatabase && divisionDatabase.games) ? divisionDatabase.games : [];
  const parsedGames = games.filter((game) => game && game.match && /^parsed_/.test(String(game.parserStatus || "")));
  const seriesWinners = buildSeriesWinners(parsedGames);
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
    const match = resolveMatchPlayerIds(game.match, rosterByRiotId, division);
    const durationSeconds = Number(match.durationSeconds || 0);
    if (!(durationSeconds > 0)) continue;
    const sides = [
      { teamNumber: 100, slot: game.blueTeamSlot, stats: teamStats(match, 100) },
      { teamNumber: 200, slot: game.redTeamSlot, stats: teamStats(match, 200) }
    ];
    const performances = scoreMatchParticipants(match, durationSeconds);
    const performanceByParticipant = new Map(performances.map((performance) => [
      Number(performance.participantIndex),
      performance
    ]));
    const mvp = selectMvp(match, durationSeconds, performances);

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
      const performance = performanceByParticipant.get(Number(participant.participantIndex));
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
      if (performance) {
        player.scoreSum += performance.performanceScore;
        player.scoreGames += 1;
        const teamAggregate = teamAggregates[teamSlot] || createTeamAggregate(teams[teamSlot] || { slot: teamSlot });
        teamAggregate.scoreSum += performance.performanceScore;
        teamAggregate.scoreGames += 1;
        teamAggregates[teamSlot] = teamAggregate;
        player.ratings.push({
          matchId: game.id,
          seriesId: game.seriesId || "",
          round: gameRoundNumber(game),
          ...(gameRoundNumber(game) ? {} : { stage: teamOfWeekStage(game) }),
          position: normalizePosition(participant.position),
          teamSlot,
          score: performance.performanceScore,
          won: Boolean(participant.won),
          seriesWon: seriesWinners.get(String(game.seriesId || "")) === teamSlot
        });
      }
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

    matches.push(buildMatchSummary(game, teams, mvp, performances));
  }

  const teamList = Object.values(teamAggregates).map(summarizeTeam).sort((a, b) => (
    b.averageScore - a.averageScore ||
    b.scoreGames - a.scoreGames ||
    b.winRate - a.winRate ||
    timeStringToTiebreakSeconds(a.avgWinTime) - timeStringToTiebreakSeconds(b.avgWinTime) ||
    b.games - a.games ||
    a.name.localeCompare(b.name)
  ));
  const players = Array.from(playerAggregates.values()).map(summarizePlayer).sort((a, b) => (
    b.averageScore - a.averageScore ||
    b.games - a.games ||
    b.kda - a.kda ||
    b.winRate - a.winRate ||
    a.displayName.localeCompare(b.displayName, "pt-BR")
  ));
  const champions = Array.from(championAggregates.values()).map(summarizeChampion).sort((a, b) => b.picks - a.picks || b.wins - a.wins);
  const teamOfWeek = buildTeamOfWeek(players, teams, ACTIVE_TEAM_OF_WEEK[division]);

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
    matches,
    teamOfWeek
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

function rosterByPlayerId(teams, rosterIdentities = [], division = "") {
  const roster = new Map();
  for (const identity of rosterIdentities || []) {
    if (!identity || !identity.playerId) continue;
    if (division && identity.division && identity.division !== division) continue;
    const parsed = parseOpggRiotId(identity.opgg);
    const playerId = canonicalPlayerId(identity.playerId, division);
    upsertRosterPlayer(roster, playerId, {
      playerId,
      displayName: identity.displayName || parsed.gameName || "JOGADOR",
      riotId: parsed.riotId || "",
      riotIdAliases: [],
      opgg: identity.opgg || "",
      image: "",
      lane: identity.lane || "",
      teamSlot: identity.slot || "",
      active: false
    }, false);
  }
  const historicalByRiotId = indexRosterByRiotId(roster);
  for (const [slot, team] of Object.entries(teams)) {
    for (const player of team.players || []) {
      if (!player || !player.playerId || !isRegisteredRosterPlayer(player)) continue;
      const currentRiotId = normalizeRiotId(player.riotId || parseOpggRiotId(player.opgg).riotId);
      const historicalIdentity = currentRiotId ? historicalByRiotId.get(currentRiotId) : null;
      const playerId = canonicalPlayerId(historicalIdentity && historicalIdentity.playerId || player.playerId, division);
      upsertRosterPlayer(roster, playerId, {
        playerId,
        displayName: player.player || player.name || player.riotId || "JOGADOR",
        riotId: player.riotId || "",
        riotIdAliases: player.riotIdAliases || [],
        opgg: player.opgg || "",
        image: normalizeAssetPath(player.image || player.photo || ""),
        lane: player.lane || "",
        teamSlot: slot,
        active: true
      }, true);
    }
  }
  return roster;
}

function canonicalPlayerId(playerId, division) {
  const merges = PLAYER_IDENTITY_MERGES[division] || {};
  return merges[playerId] || playerId;
}

function upsertRosterPlayer(roster, playerId, player, preferIncoming) {
  const previous = roster.get(playerId);
  const primary = preferIncoming || !previous ? player : previous;
  const identities = [
    previous && previous.riotId,
    ...(previous && previous.riotIdAliases || []),
    player.riotId,
    ...(player.riotIdAliases || [])
  ].filter(Boolean);
  const primaryRiotId = normalizeRiotId(primary.riotId);
  const riotIdAliases = Array.from(new Map(identities
    .filter((riotId) => normalizeRiotId(typeof riotId === "string" ? riotId : riotId.riotId) !== primaryRiotId)
    .map((riotId) => {
      const value = typeof riotId === "string" ? riotId : riotId.riotId;
      return [normalizeRiotId(value), value];
    })
    .filter(([normalized]) => normalized))
    .values());
  roster.set(playerId, {
    ...(previous || {}),
    ...(preferIncoming || !previous ? player : {}),
    playerId,
    riotIdAliases
  });
}

function indexRosterByRiotId(roster) {
  const index = new Map();
  const conflicts = new Set();
  for (const player of roster.values()) {
    const identities = [
      player.riotId,
      ...(player.riotIdAliases || []).map((alias) => typeof alias === "string" ? alias : alias.riotId),
      parseOpggRiotId(player.opgg).riotId
    ];
    for (const riotId of identities) {
      const normalized = normalizeRiotId(riotId);
      if (!normalized || conflicts.has(normalized)) continue;
      const previous = index.get(normalized);
      if (previous && previous.playerId !== player.playerId) {
        index.delete(normalized);
        conflicts.add(normalized);
      } else {
        index.set(normalized, player);
      }
    }
  }
  return index;
}

function resolveMatchPlayerIds(match, rosterByRiotId, division = "") {
  return {
    ...match,
    participants: (match.participants || []).map((participant) => {
      const registered = rosterByRiotId.get(normalizeRiotId(participant.riotId));
      const playerId = registered && registered.playerId || canonicalPlayerId(participant.playerId, division);
      return playerId && playerId !== participant.playerId
        ? { ...participant, playerId, identificationMethod: registered ? "roster-riot-id" : "identity-merge" }
        : participant;
    })
  };
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
    winDurationCount: 0,
    scoreSum: 0,
    scoreGames: 0
  };
}

function createPlayerAggregate(id, participant, registered) {
  return {
    id,
    playerId: participant.playerId || "",
    displayName: registered.displayName || participant.gameName || participant.riotId || "JOGADOR",
    primaryRiotId: registered.riotId || "",
    opgg: registered.opgg || "",
    image: registered.image || "",
    currentTeamSlot: registered.active ? registered.teamSlot || "" : "",
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
    scoreSum: 0,
    scoreGames: 0,
    ratings: [],
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
    averageScore: team.scoreGames ? round(team.scoreSum / team.scoreGames) : 0,
    scoreGames: team.scoreGames,
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
  const allTeams = sortedMap(player.teams, "slot");
  const hasPlayedTeam = allTeams.some((entry) => entry.count > 0);
  const teams = allTeams.filter((entry) => (
    !hasPlayedTeam || entry.count > 0 || entry.slot === player.currentTeamSlot
  ));
  if (player.currentTeamSlot) {
    teams.sort((left, right) => (
      Number(right.slot === player.currentTeamSlot) - Number(left.slot === player.currentTeamSlot) ||
      right.games - left.games ||
      left.slot.localeCompare(right.slot)
    ));
  }
  return {
    id: player.id,
    playerId: player.playerId,
    displayName: player.displayName,
    riotId: player.primaryRiotId || Array.from(player.riotIds)[0] || "",
    alsoPlayedAs: Array.from(player.riotIds).filter((riotId) => riotId && riotId !== player.primaryRiotId),
    opgg: player.opgg,
    image: player.image,
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
    averageScore: player.scoreGames ? round(player.scoreSum / player.scoreGames) : 0,
    scoreGames: player.scoreGames,
    ratings: player.ratings.slice().reverse(),
    roundRatings: summarizeRoundRatings(player.ratings),
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

function buildMatchSummary(game, teams, mvp, performances = []) {
  const match = game.match;
  const team100 = teamStats(match, 100);
  const team200 = teamStats(match, 200);
  const winnerNumber = Number(match.winnerTeam);
  const winnerSlot = winnerNumber === 100 ? game.blueTeamSlot : game.redTeamSlot;
  const loserSlot = winnerNumber === 100 ? game.redTeamSlot : game.blueTeamSlot;
  const performanceByParticipant = new Map(performances.map((performance) => [
    Number(performance.participantIndex),
    performance
  ]));
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
    mvp: mvp ? {
      participantIndex: mvp.participantIndex,
      riotId: mvp.riotId,
      playerId: mvp.playerId || "",
      position: mvp.position || "",
      score: mvp.mvpScore,
      model: mvp.mvpModel,
      breakdown: mvp.mvpBreakdown
    } : null,
    teams: { "100": { ...team100, slot: game.blueTeamSlot }, "200": { ...team200, slot: game.redTeamSlot } },
    participants: (match.participants || []).map((participant) => {
      const performance = performanceByParticipant.get(Number(participant.participantIndex));
      return {
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
      score: performance ? performance.performanceScore : 0,
      scoreModel: performance ? performance.performanceModel : MVP_MODEL_VERSION,
      scoreBreakdown: performance ? performance.performanceBreakdown : null,
      identificationMethod: participant.identificationMethod || "unresolved"
      };
    })
  };
}

function scoreMatchParticipants(match, durationSeconds) {
  const participants = Array.isArray(match.participants) ? match.participants : [];
  return participants.map((participant) => scoreParticipant(match, participant, durationSeconds));
}

function scoreParticipant(match, participant, durationSeconds) {
  const rawMetrics = mvpMetrics(match, participant, durationSeconds);
  const role = MVP_ROLE_WEIGHTS[participant.position] ? participant.position : "MID";
  const metrics = normalizeMvpMetrics(rawMetrics, role);
  const roleEdge = mvpRoleEdge(match, participant, durationSeconds);
  const breakdown = { ...metrics, roleEdge };
  const roleCalibration = MVP_ROLE_CALIBRATION[role] || 1;
  const rawScore = weightedScore(breakdown, MVP_ROLE_WEIGHTS[role]) * 100 * roleCalibration;
  const score = performanceGrade(rawScore);
  return {
    ...participant,
    performanceScore: round(score),
    performanceRawScore: round(rawScore),
    performanceModel: MVP_MODEL_VERSION,
    performanceBreakdown: {
      kda: percentage(metrics.kda),
      kp: percentage(metrics.kp),
      damage: percentage(metrics.damage),
      gold: percentage(metrics.gold),
      efficiency: percentage(metrics.efficiency),
      vision: percentage(metrics.vision),
      wards: percentage(metrics.wards),
      towers: percentage(metrics.towers),
      objectives: percentage(metrics.objectives),
      kills: percentage(metrics.kills),
      assists: percentage(metrics.assists),
      survival: percentage(metrics.survival),
      roleEdge: percentage(roleEdge),
      roleCalibration: round(roleCalibration),
      dpm: round(rawMetrics.dpm),
      gpm: round(rawMetrics.gpm)
    }
  };
}

function performanceGrade(rawScore) {
  return Math.max(0, Math.min(100, 25 + value(rawScore) * 1.05));
}

function selectMvp(match, durationSeconds, scoredParticipants = null) {
  const participants = Array.isArray(scoredParticipants)
    ? scoredParticipants
    : scoreMatchParticipants(match, durationSeconds);
  const winnerTeam = Number(match.winnerTeam) || Number((participants.find((participant) => participant.won) || {}).team);
  const eligible = participants.filter((participant) => (
    winnerTeam ? Number(participant.team) === winnerTeam : Boolean(participant.won)
  ));
  const candidates = eligible.length ? eligible : participants;
  let best = null;
  for (const participant of candidates) {
    const candidate = {
      ...participant,
      mvpScore: participant.performanceScore,
      mvpModel: participant.performanceModel,
      mvpBreakdown: participant.performanceBreakdown
    };
    if (!best || compareMvpCandidates(candidate, best) < 0) best = candidate;
  }
  return best;
}

function mvpMetrics(match, participant, durationSeconds) {
  const side = mvpTeamStats(match, participant.team);
  const damage = share(participant.damageToChampions, side.damageToChampions);
  const gold = share(participant.gold, side.gold);
  const wardImpact = value(participant.wardsPlaced) + value(participant.wardsKilled) * 1.5;
  const sideWardImpact = value(side.wardsPlaced) + value(side.wardsKilled) * 1.5;
  return {
    kda: clamp01(kda(participant.kills, participant.deaths, participant.assists) / 8),
    kp: clamp01(participation(participant.kills, participant.assists, side.kills)),
    damage: clamp01(damage),
    gold: clamp01(gold),
    efficiency: clamp01((damage / Math.max(0.01, gold)) / 1.6),
    vision: clamp01(share(participant.visionScore, side.visionScore)),
    wards: clamp01(share(wardImpact, sideWardImpact)),
    towers: clamp01(share(participant.towers, side.towers)),
    objectives: clamp01(share(objectiveImpact(participant), objectiveImpact(side))),
    kills: clamp01(share(participant.kills, side.kills)),
    assists: clamp01(share(participant.assists, side.assists)),
    survival: clamp01(1 / (1 + value(participant.deaths) * 0.65)),
    dpm: perMinute(participant.damageToChampions, durationSeconds),
    gpm: perMinute(participant.gold, durationSeconds)
  };
}

function mvpRoleEdge(match, participant, durationSeconds) {
  const opponent = (match.participants || []).find((candidate) => (
    Number(candidate.team) !== Number(participant.team) &&
    candidate.position === participant.position
  ));
  if (!opponent) return 0.5;

  const current = mvpMetrics(match, participant, durationSeconds);
  const rival = mvpMetrics(match, opponent, durationSeconds);
  const role = MVP_ROLE_EDGE_WEIGHTS[participant.position] ? participant.position : "MID";
  const values = {
    kda: relativeEdge(current.kda, rival.kda),
    kp: relativeEdge(current.kp, rival.kp),
    damage: relativeEdge(current.dpm, rival.dpm),
    gold: relativeEdge(current.gpm, rival.gpm),
    vision: relativeEdge(participant.visionScore, opponent.visionScore),
    wards: relativeEdge(
      value(participant.wardsPlaced) + value(participant.wardsKilled) * 1.5,
      value(opponent.wardsPlaced) + value(opponent.wardsKilled) * 1.5
    ),
    towers: relativeEdge(participant.towers, opponent.towers),
    objectives: relativeEdge(objectiveImpact(participant), objectiveImpact(opponent)),
    kills: relativeEdge(participant.kills, opponent.kills),
    assists: relativeEdge(participant.assists, opponent.assists)
  };
  return weightedScore(values, MVP_ROLE_EDGE_WEIGHTS[role]);
}

function normalizeMvpMetrics(metrics, role) {
  const baselines = MVP_ROLE_BASELINES[role] || MVP_ROLE_BASELINES.MID;
  return Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [
    key,
    Object.hasOwn(baselines, key) ? relativeToRoleBaseline(metric, baselines[key]) : metric
  ]));
}

function mvpTeamStats(match, teamNumber) {
  const stored = teamStats(match, teamNumber);
  if (stored && Object.keys(stored).length) return stored;
  const players = (match.participants || []).filter((participant) => Number(participant.team) === Number(teamNumber));
  return {
    kills: sumValues(players, "kills"),
    assists: sumValues(players, "assists"),
    gold: sumValues(players, "gold"),
    damageToChampions: sumValues(players, "damageToChampions"),
    visionScore: sumValues(players, "visionScore"),
    wardsPlaced: sumValues(players, "wardsPlaced"),
    wardsKilled: sumValues(players, "wardsKilled"),
    towers: sumValues(players, "towers"),
    voidGrubs: sumValues(players, "voidGrubs"),
    heralds: sumValues(players, "heralds"),
    dragons: sumValues(players, "dragons"),
    elderDragons: sumValues(players, "elderDragons"),
    barons: sumValues(players, "barons")
  };
}

function compareMvpCandidates(left, right) {
  return right.mvpScore - left.mvpScore ||
    value(right.mvpBreakdown && right.mvpBreakdown.kp) -
      value(left.mvpBreakdown && left.mvpBreakdown.kp) ||
    value(left.deaths) - value(right.deaths) ||
    value(right.damageToChampions) - value(left.damageToChampions) ||
    value(left.participantIndex) - value(right.participantIndex);
}

function objectiveImpact(stats) {
  return value(stats.voidGrubs) +
    value(stats.heralds) * 2 +
    value(stats.dragons) * 2.5 +
    value(stats.elderDragons) * 4 +
    value(stats.barons) * 4;
}

function weightedScore(metrics, weights) {
  return Object.entries(weights).reduce((total, [key, weight]) => total + clamp01(metrics[key]) * weight, 0);
}

function relativeEdge(left, right) {
  const safeLeft = Math.max(0, value(left));
  const safeRight = Math.max(0, value(right));
  const total = safeLeft + safeRight;
  return total > 0 ? clamp01(safeLeft / total) : 0.5;
}

function relativeToRoleBaseline(input, baseline) {
  return baseline > 0 ? clamp01(value(input) / (baseline * 2)) : clamp01(input);
}

function share(input, total) {
  return value(total) > 0 ? value(input) / value(total) : 0;
}

function clamp01(input) {
  return Math.max(0, Math.min(1, value(input)));
}

function percentage(input) {
  return round(clamp01(input) * 100);
}

function sumValues(items, key) {
  return items.reduce((total, item) => total + value(item[key]), 0);
}

function gameRoundNumber(game) {
  const roundText = String(game && game.round || "");
  const roundMatch = /RODADA\s*(\d+)/i.exec(roundText);
  if (roundMatch) return Number(roundMatch[1]);

  const seriesText = String(game && game.seriesId || "");
  const seriesMatch = /(?:^|-)r(\d+)(?:g\d+)?(?:-|$)/i.exec(seriesText);
  return seriesMatch ? Number(seriesMatch[1]) : 0;
}

function teamOfWeekStage(game) {
  return String(game && game.stage || "").trim().toUpperCase();
}

function buildSeriesWinners(games) {
  const series = new Map();

  for (const game of games || []) {
    const seriesId = String(game && game.seriesId || "");
    const match = game && game.match;
    if (!seriesId || !match) continue;

    const blueSlot = String(game.blueTeamSlot || "");
    const redSlot = String(game.redTeamSlot || "");
    const winnerSlot = Number(match.winnerTeam) === 100 ? blueSlot
      : Number(match.winnerTeam) === 200 ? redSlot
        : "";
    if (!winnerSlot) continue;

    const current = series.get(seriesId) || {
      target: seriesWinTarget(game),
      slots: new Set(),
      wins: new Map()
    };
    if (blueSlot) current.slots.add(blueSlot);
    if (redSlot) current.slots.add(redSlot);
    current.wins.set(winnerSlot, (current.wins.get(winnerSlot) || 0) + 1);
    series.set(seriesId, current);
  }

  const winners = new Map();
  for (const [seriesId, current] of series.entries()) {
    const ordered = Array.from(current.wins.entries()).sort((left, right) => right[1] - left[1]);
    if (ordered[0] && ordered[0][1] >= current.target && (!ordered[1] || ordered[0][1] > ordered[1][1])) {
      winners.set(seriesId, ordered[0][0]);
    }
  }
  return winners;
}

function seriesWinTarget(game) {
  const stage = String(game && game.stage || "").trim().toUpperCase();
  return /SEMI|FINAL/.test(stage) ? 3 : 2;
}

function normalizePosition(position) {
  const normalized = String(position || "").trim().toUpperCase();
  const aliases = {
    JUNGLE: "JG",
    MIDDLE: "MID",
    BOTTOM: "ADC",
    BOT: "ADC",
    UTILITY: "SUP",
    SUPPORT: "SUP"
  };
  return aliases[normalized] || normalized;
}

function summarizeRoundRatings(ratings) {
  const groups = new Map();
  for (const rating of ratings || []) {
    const roundNumber = Number(rating.round || 0);
    const stage = String(rating.stage || "").trim().toUpperCase();
    const position = normalizePosition(rating.position);
    const teamSlot = String(rating.teamSlot || "");
    if ((!roundNumber && !stage) || !COMPETITIVE_LANES.includes(position)) continue;
    const periodKey = roundNumber ? `round:${roundNumber}` : `stage:${stage}`;
    const key = `${periodKey}:${position}:${teamSlot}`;
    const current = groups.get(key) || {
      round: roundNumber,
      stage,
      position,
      teamSlot,
      scoreSum: 0,
      games: 0,
      wins: 0,
      series: new Set(),
      seriesWins: new Set(),
      matches: []
    };
    current.scoreSum += value(rating.score);
    current.games += 1;
    current.wins += rating.won ? 1 : 0;
    if (rating.seriesId) current.series.add(rating.seriesId);
    if (rating.seriesWon && rating.seriesId) current.seriesWins.add(rating.seriesId);
    if (rating.matchId) current.matches.push(rating.matchId);
    groups.set(key, current);
  }

  return Array.from(groups.values()).map((entry) => ({
    round: entry.round,
    ...(entry.stage ? { stage: entry.stage } : {}),
    position: entry.position,
    teamSlot: entry.teamSlot,
    averageScore: round(entry.scoreSum / Math.max(1, entry.games)),
    games: entry.games,
    wins: entry.wins,
    losses: entry.games - entry.wins,
    series: Array.from(entry.series),
    seriesWins: entry.seriesWins.size,
    matches: entry.matches
  })).sort((left, right) => (
    Number(left.round || Number.MAX_SAFE_INTEGER) - Number(right.round || Number.MAX_SAFE_INTEGER) ||
    String(left.stage || "").localeCompare(String(right.stage || ""), "pt-BR") ||
    COMPETITIVE_LANES.indexOf(left.position) - COMPETITIVE_LANES.indexOf(right.position) ||
    right.averageScore - left.averageScore
  ));
}

function buildTeamOfWeek(players, teams, activePeriod) {
  const period = normalizeTeamOfWeekPeriod(activePeriod);
  const selection = COMPETITIVE_LANES.map((role) => {
    const candidates = [];
    for (const player of players || []) {
      for (const rating of player.roundRatings || []) {
        if (
          !matchesTeamOfWeekPeriod(rating, period) ||
          rating.position !== role ||
          Number(rating.games) < MIN_TEAM_OF_WEEK_GAMES ||
          Number(rating.seriesWins) < 1
        ) continue;
        candidates.push({ player, rating });
      }
    }

    candidates.sort((left, right) => (
      right.rating.averageScore - left.rating.averageScore ||
      right.rating.games - left.rating.games ||
      right.player.kda - left.player.kda ||
      String(left.player.displayName || "").localeCompare(String(right.player.displayName || ""), "pt-BR")
    ));

    const winner = candidates[0];
    if (!winner) return null;
    const teamSlot = winner.rating.teamSlot || winner.player.teams && winner.player.teams[0] && winner.player.teams[0].slot || "";
    const team = teams[teamSlot] || { slot: teamSlot, name: teamSlot, tag: teamSlot, logo: "" };
    return {
      role,
      playerId: winner.player.id,
      player: winner.player.displayName || winner.player.riotId || "JOGADOR",
      riotId: winner.player.riotId || "",
      image: winner.player.image || "",
      team: teamSlot,
      teamName: team.name || teamSlot,
      teamTag: team.tag || teamSlot,
      teamLogo: normalizeAssetPath(team.logo || ""),
      averageScore: winner.rating.averageScore,
      games: winner.rating.games,
      wins: winner.rating.wins,
      losses: winner.rating.losses,
      seriesWins: winner.rating.seriesWins,
      series: winner.rating.series || [],
      matches: winner.rating.matches || []
    };
  }).filter(Boolean);

  const highlight = selection.slice().sort((left, right) => (
    right.averageScore - left.averageScore ||
    COMPETITIVE_LANES.indexOf(left.role) - COMPETITIVE_LANES.indexOf(right.role)
  ))[0] || null;

  return {
    round: period.round,
    stage: period.stage,
    label: period.label,
    minimumGames: MIN_TEAM_OF_WEEK_GAMES,
    selection,
    highlightPlayerId: highlight ? highlight.playerId : "",
    highlightRole: highlight ? highlight.role : "",
    highlightScore: highlight ? highlight.averageScore : 0
  };
}

function normalizeTeamOfWeekPeriod(input) {
  if (input && typeof input === "object") {
    const roundNumber = Number(input.round || 0);
    const stage = String(input.stage || "").trim().toUpperCase();
    return {
      round: roundNumber,
      stage,
      label: String(input.label || (roundNumber ? `RODADA ${roundNumber}` : stage)).trim()
    };
  }
  const roundNumber = Number(input || 0);
  return { round: roundNumber, stage: "", label: `RODADA ${roundNumber}` };
}

function matchesTeamOfWeekPeriod(rating, period) {
  if (period.stage) return String(rating.stage || "").trim().toUpperCase() === period.stage;
  return Number(rating.round) === period.round;
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

function timeStringToTiebreakSeconds(value) {
  const seconds = timeStringToSeconds(value);
  return seconds > 0 ? seconds : Number.MAX_SAFE_INTEGER;
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

module.exports = {
  aggregateDatabase,
  aggregateDivision,
  buildHeadlineStatistics,
  buildTeamOfWeek,
  scoreMatchParticipants,
  selectMvp,
  teamsBySlot,
  temporaryPlayerId
};
