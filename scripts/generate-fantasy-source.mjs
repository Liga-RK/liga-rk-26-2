import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const groupStandings = require("../assets/group-standings.js");
const content = loadWindowValue("assets/content.js", "LIGA_RK_CONTENT");
const data = loadWindowValue("assets/data.js", "LIGA_RK_DATA");
const stats = loadWindowValue("assets/stats-content.js", "LIGA_RK_STATS");
const generatedYear = new Date(stats.generatedAt || Date.now()).getUTCFullYear();

const FANTASY_STARTER_OVERRIDES = Object.freeze({
  elite: Object.freeze({
    D1: Object.freeze({ TOP: "ee09cf39-13a1-4268-a363-dbd28955437b" })
  }),
  ascension: Object.freeze({
    A1: Object.freeze({ MID: "8b0bb211-5bfd-46c2-819f-161c22c494d6" }),
    C2: Object.freeze({
      ADC: "2594034c-9394-4b79-8b59-dedbf66482e5",
      SUP: "745a0ee6-ebda-4170-a095-68565c5f425b"
    })
  })
});
const PRESERVE_DISPLACED_STARTER_AS_RESERVE = new Set(["ascension:A1:MID"]);

const FANTASY_ROSTER_EXCLUSIONS = Object.freeze({
  ascension: Object.freeze({
    // Cadastro legado da mesma identidade competitiva do YELLOW.
    A1: Object.freeze(["069bc73a-9c08-4d27-9998-f4d3973a17ce"])
  })
});

const ROUND_FIVE_PARTICIPANT_OVERRIDES = Object.freeze({
  elite: Object.freeze({
    p2m1: Object.freeze({ home: "A2", away: "D4" }),
    p2m2: Object.freeze({ home: "B3", away: "D3" }),
    p2m3: Object.freeze({ home: "C4", away: "A3" }),
    p2m4: Object.freeze({ home: "D1", away: "A1" })
  }),
  ascension: Object.freeze({
    p2m1: Object.freeze({ home: "A1", away: "D2" }),
    p2m2: Object.freeze({ home: "B1", away: "D4" }),
    p2m3: Object.freeze({ home: "C4", away: "B4" }),
    p2m4: Object.freeze({ home: "D3", away: "B3" })
  })
});

const output = {
  version: 2,
  schema: "fantasy-rk-official-source-v2",
  generatedAt: stats.generatedAt || new Date().toISOString(),
  season: stats.season || "Liga RK 26.2",
  timezone: "America/Sao_Paulo",
  divisions: {}
};

for (const division of ["elite", "ascension"]) {
  const contentDivision = content.divisions[division];
  const dataDivision = data[division];
  const statsDivision = stats.divisions[division];
  const teams = Object.entries(contentDivision.teams).map(([slot, team]) => ({
    id: `team:${division}:${slot}`,
    slot,
    name: team.name,
    tag: team.tag || team.name.slice(0, 5).toUpperCase(),
    logo: normalizePath(team.logo),
    players: buildFantasyRoster({ division, slot, team, statsDivision })
  }));
  const teamBySlot = new Map(teams.map((team) => [team.slot, team]));

  const groupRounds = (dataDivision.rounds || []).map((round, roundIndex) => {
    const roundNumber = roundIndex + 1;
    const matches = (round.games || []).map((game, matchIndex) => {
      const [time, homeTeamSlot, awayTeamSlot] = game;
      const sourceId = `r${roundNumber}g${matchIndex + 1}`;
      const seriesId = `groups-${sourceId}`;
      const statMatches = (statsDivision.matches || [])
        .filter((match) => match.seriesId === seriesId);
      const wins = new Map();
      for (const match of statMatches) {
        if (match.winnerSlot) {
          wins.set(match.winnerSlot, (wins.get(match.winnerSlot) || 0) + 1);
        }
      }
      const homeScore = statMatches.length ? wins.get(homeTeamSlot) || 0 : null;
      const awayScore = statMatches.length ? wins.get(awayTeamSlot) || 0 : null;
      const winnerSlot = homeScore === awayScore
        ? ""
        : homeScore > awayScore ? homeTeamSlot : awayTeamSlot;
      const format = inferSeriesFormat(statMatches[0]?.stage || "groups");
      const winTarget = format === "MD5" ? 3 : 2;
      const completed = Math.max(homeScore || 0, awayScore || 0) >= winTarget;
      return {
        id: `schedule:${division}:${sourceId}`,
        sourceId,
        stage: "groups",
        orderIndex: matchIndex,
        homeTeamSlot,
        awayTeamSlot,
        homeTeamName: teamBySlot.get(homeTeamSlot)?.name || "",
        awayTeamName: teamBySlot.get(awayTeamSlot)?.name || "",
        startsAt: brazilDateToIso(round.date, time, generatedYear),
        status: completed ? "completed" : statMatches.length ? "live" : "scheduled",
        format,
        homeScore,
        awayScore,
        winnerTeamId: winnerSlot ? `team:${division}:${winnerSlot}` : null
      };
    });
    return {
      id: `${division}-r${roundNumber}`,
      roundNumber,
      name: round.name || `RODADA ${roundNumber}`,
      matches
    };
  });
  const standings = groupStandings.compute({
    rounds: groupRounds.map((round) => ({ games: round.matches.map((match) => ({
      home: match.homeTeamSlot,
      away: match.awayTeamSlot
    })) })),
    resolveResult: (roundIndex, matchIndex) => {
      const match = groupRounds[roundIndex]?.matches?.[matchIndex] || {};
      return { homeScore: match.homeScore, awayScore: match.awayScore };
    },
    resolveTeam: (slot) => ({
      slot,
      avgWinTime: (statsDivision.teams || []).find((team) => team.slot === slot)?.avgWinTime || "00:00"
    })
  });
  const playoffRounds = buildPlayoffRounds({
    division,
    dataDivision,
    contentDivision,
    statsDivision,
    teamBySlot,
    standings
  });
  const rounds = [...groupRounds, ...playoffRounds];

  output.divisions[division] = {
    teams,
    rounds,
    stats: {
      players: (statsDivision.players || []).map((player) => ({
        id: player.id,
        playerId: player.playerId,
        displayName: player.displayName,
        riotId: player.riotId || "",
        riotIdAliases: player.alsoPlayedAs || player.riotIdAliases || [],
        opgg: player.opgg || "",
        mainPosition: player.mainPosition,
        teams: player.teams || [],
        roundRatings: player.roundRatings || []
      })),
      teams: (statsDivision.teams || []).map((team) => ({
        slot: team.slot,
        name: team.name,
        tag: team.tag,
        games: team.games,
        wins: team.wins,
        losses: team.losses,
        winRate: team.winRate,
        averageScore: team.averageScore,
        avgWinTime: team.avgWinTime || "00:00"
      })),
      matches: (statsDivision.matches || []).map((match) => ({
        id: match.id,
        seriesId: match.seriesId,
        stage: match.stage,
        round: match.round,
        roundNumber: extractRoundNumber(match.round),
        gameNumber: match.gameNumber,
        format: inferSeriesFormat(match.stage),
        blueTeamSlot: match.blueTeamSlot,
        redTeamSlot: match.redTeamSlot,
        winnerSlot: match.winnerSlot,
        mvpPlayerId: match.mvp?.playerId || null,
        participants: (match.participants || []).map((participant) => ({
          playerId: participant.playerId,
          riotId: participant.riotId || "",
          teamSlot: participant.teamSlot,
          position: participant.position,
          champion: participant.champion,
          score: participant.score,
          won: Boolean(participant.won),
          deaths: participant.deaths
        }))
      }))
    }
  };
}

const target = path.join(ROOT, "assets", "fantasy-source.json");
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Fonte oficial do Fantasy gerada: ${path.relative(ROOT, target)}`);

function loadWindowValue(relativePath, globalName) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  vm.runInContext(source, sandbox, { filename: relativePath, timeout: 10_000 });
  const value = sandbox.window[globalName];
  if (!value) throw new Error(`${globalName} não foi definido por ${relativePath}.`);
  return value;
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function buildFantasyRoster({ division, slot, team, statsDivision }) {
  const players = (team.players || [])
    .filter((player) => player.playerId || String(player.player || "").trim())
    .map((player) => {
      const statsPlayer = (statsDivision.players || []).find((item) =>
        String(item.playerId || item.id) === String(player.playerId || "")
      );
      const mainRole = String(statsPlayer?.mainPosition || "").toUpperCase();
      return {
        id: player.playerId,
        name: player.player,
        role: player.lane,
        ...(player.lane === "SUB" && ["TOP", "JG", "MID", "ADC", "SUP"].includes(mainRole)
          ? { mainRole }
          : {}),
        riotId: player.riotId || "",
        opgg: player.opgg || "",
        captain: Boolean(player.captain)
      };
    });
  const overrides = FANTASY_STARTER_OVERRIDES[division]?.[slot] || {};
  for (const [role, playerId] of Object.entries(overrides)) {
    const statsPlayer = (statsDivision.players || []).find((player) =>
      String(player.playerId || player.id) === playerId
    );
    if (!statsPlayer) {
      throw new Error(`Titular do Fantasy não encontrado nas estatísticas: ${division}/${slot}/${role}/${playerId}`);
    }
    const replacement = {
      id: playerId,
      name: String(statsPlayer.displayName || "").toUpperCase(),
      role,
      riotId: statsPlayer.riotId || "",
      opgg: statsPlayer.opgg || "",
      captain: false
    };
    let starterIndex = players.findIndex((player) => player.role === role);
    const displacedStarter = starterIndex >= 0 ? { ...players[starterIndex] } : null;
    const existingTargetIndex = players.findIndex((player) => String(player.id) === playerId);
    if (existingTargetIndex >= 0 && existingTargetIndex !== starterIndex) {
      players.splice(existingTargetIndex, 1);
      if (existingTargetIndex < starterIndex) starterIndex -= 1;
    }
    if (starterIndex >= 0) players.splice(starterIndex, 1, replacement);
    else players.unshift(replacement);
    if (displacedStarter && displacedStarter.id !== playerId
      && PRESERVE_DISPLACED_STARTER_AS_RESERVE.has(`${division}:${slot}:${role}`)) {
      players.push({ ...displacedStarter, role: "SUB", mainRole: role });
    }
  }
  const excludedPlayerIds = new Set(FANTASY_ROSTER_EXCLUSIONS[division]?.[slot] || []);
  return players.filter((player) => !excludedPlayerIds.has(String(player.id)));
}

function brazilDateToIso(date, time, year) {
  const match = String(date || "").match(/^(\d{2})\/(\d{2})$/);
  const timeMatch = String(time || "").match(/^(\d{2}):(\d{2})$/);
  if (!match || !timeMatch) return null;
  const [, day, month] = match;
  const [, hour, minute] = timeMatch;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`).toISOString();
}

function extractRoundNumber(value) {
  return Number(String(value || "").match(/RODADA\s*(\d+)/i)?.[1]) || null;
}

function inferSeriesFormat(stage) {
  return /semi|final/i.test(String(stage || "")) ? "MD5" : "MD3";
}

function buildPlayoffRounds(context) {
  const firstRound = buildFirstPlayoffRound(context);
  if (!firstRound) return [];
  const quarterfinals = buildQuarterfinalRound({ ...context, firstRound });
  if (!quarterfinals) return [firstRound];
  const semifinals = buildSemifinalRound({ ...context, quarterfinals });
  if (!semifinals) return [firstRound, quarterfinals];
  const final = buildFinalRound({ ...context, semifinals });
  return final
    ? [firstRound, quarterfinals, semifinals, final]
    : [firstRound, quarterfinals, semifinals];
}

function buildFirstPlayoffRound({ division, dataDivision, contentDivision, statsDivision, teamBySlot, standings }) {
  const playoffMatches = dataDivision.playoffs?.[0] || [];
  if (!playoffMatches.length) return null;
  const eligibility = { teamStatuses: {} };
  for (const group of ["A", "B", "C", "D"]) {
    const entries = standings[group] || [];
    if (entries[0]?.slot) eligibility.teamStatuses[entries[0].slot] = "qualified-next-round";
    if (entries[1]?.slot) eligibility.teamStatuses[entries[1].slot] = "playing";
    if (entries[2]?.slot) eligibility.teamStatuses[entries[2].slot] = "playing";
    if (entries[3]?.slot) eligibility.teamStatuses[entries[3].slot] = "eliminated";
  }
  const matches = playoffMatches.map((match, matchIndex) => {
    const sourceId = `p1m${matchIndex + 1}`;
    const homeTeamSeed = String(match.teamA || "").toUpperCase();
    const awayTeamSeed = String(match.teamB || "").toUpperCase();
    const homeTeamSlot = resolveStandingSeed(standings, homeTeamSeed);
    const awayTeamSlot = resolveStandingSeed(standings, awayTeamSeed);
    const liveSchedule = contentDivision.playoffResults?.[sourceId] || {};
    const statMatches = (statsDivision.matches || [])
      .filter((item) => item.seriesId === `playoffs-${sourceId}`);
    const wins = new Map();
    for (const statMatch of statMatches) {
      if (statMatch.winnerSlot) wins.set(statMatch.winnerSlot, (wins.get(statMatch.winnerSlot) || 0) + 1);
    }
    const homeScore = statMatches.length ? wins.get(homeTeamSlot) || 0 : null;
    const awayScore = statMatches.length ? wins.get(awayTeamSlot) || 0 : null;
    const format = String(match.format || "MD3").toUpperCase();
    const winTarget = format === "MD5" ? 3 : 2;
    const completed = Math.max(homeScore || 0, awayScore || 0) >= winTarget;
    const winnerSlot = completed && homeScore !== awayScore
      ? (homeScore > awayScore ? homeTeamSlot : awayTeamSlot)
      : "";
    return {
      id: `schedule:${division}:${sourceId}`,
      sourceId,
      statsSeriesId: `playoffs-${sourceId}`,
      stage: "playoffs-round-of-16",
      orderIndex: matchIndex,
      homeTeamSeed,
      awayTeamSeed,
      homeTeamSlot,
      awayTeamSlot,
      homeTeamName: teamBySlot.get(homeTeamSlot)?.name || "",
      awayTeamName: teamBySlot.get(awayTeamSlot)?.name || "",
      startsAt: brazilDateToIso(liveSchedule.date || match.date, liveSchedule.time || match.time, generatedYear),
      status: completed ? "completed" : statMatches.length ? "live" : "scheduled",
      format,
      homeScore,
      awayScore,
      winnerTeamId: winnerSlot ? `team:${division}:${winnerSlot}` : null
    };
  });
  return {
    id: `${division}-r4`,
    roundNumber: 4,
    name: "RODADA 4 · OITAVAS",
    eligibility,
    matches
  };
}

function buildQuarterfinalRound({ division, dataDivision, contentDivision, statsDivision, teamBySlot, standings, firstRound }) {
  const playoffMatches = dataDivision.playoffs?.[1] || [];
  if (!playoffMatches.length) return null;
  const matches = playoffMatches.map((match, matchIndex) => {
    const sourceId = `p2m${matchIndex + 1}`;
    const homeTeamSeed = String(match.teamA || "").toUpperCase();
    const awayTeamSeed = String(match.teamB || "").toUpperCase();
    const participantOverride = ROUND_FIVE_PARTICIPANT_OVERRIDES[division]?.[sourceId];
    const homeTeamSlot = participantOverride?.home || resolvePlayoffParticipant(standings, firstRound, homeTeamSeed, "OITAVAS");
    const awayTeamSlot = participantOverride?.away || resolvePlayoffParticipant(standings, firstRound, awayTeamSeed, "OITAVAS");
    const liveSchedule = contentDivision.playoffResults?.[sourceId] || {};
    const statMatches = (statsDivision.matches || [])
      .filter((item) => item.seriesId === `playoffs-${sourceId}`);
    const wins = new Map();
    for (const statMatch of statMatches) {
      if (statMatch.winnerSlot) wins.set(statMatch.winnerSlot, (wins.get(statMatch.winnerSlot) || 0) + 1);
    }
    const homeScore = statMatches.length ? wins.get(homeTeamSlot) || 0 : null;
    const awayScore = statMatches.length ? wins.get(awayTeamSlot) || 0 : null;
    const format = String(match.format || "MD5").toUpperCase();
    const winTarget = format === "MD5" ? 3 : 2;
    const completed = Math.max(homeScore || 0, awayScore || 0) >= winTarget;
    const winnerSlot = completed && homeScore !== awayScore
      ? (homeScore > awayScore ? homeTeamSlot : awayTeamSlot)
      : "";
    return {
      id: `schedule:${division}:${sourceId}`,
      sourceId,
      statsSeriesId: `playoffs-${sourceId}`,
      stage: "playoffs-quarterfinals",
      orderIndex: matchIndex,
      homeTeamSeed,
      awayTeamSeed,
      homeTeamSlot,
      awayTeamSlot,
      homeTeamName: teamBySlot.get(homeTeamSlot)?.name || "",
      awayTeamName: teamBySlot.get(awayTeamSlot)?.name || "",
      startsAt: brazilDateToIso(liveSchedule.date || match.date, liveSchedule.time || match.time, generatedYear),
      status: completed ? "completed" : statMatches.length ? "live" : "scheduled",
      format,
      homeScore,
      awayScore,
      winnerTeamId: winnerSlot ? `team:${division}:${winnerSlot}` : null
    };
  });
  const playing = new Set(matches.flatMap((match) => [match.homeTeamSlot, match.awayTeamSlot]).filter(Boolean));
  const teamStatuses = Object.fromEntries(
    Array.from(teamBySlot.keys()).map((slot) => [slot, playing.has(slot) ? "playing" : "eliminated"])
  );
  return {
    id: `${division}-r5`,
    roundNumber: 5,
    name: "RODADA 5 · QUARTAS DE FINAL",
    eligibility: { teamStatuses },
    matches
  };
}

function buildSemifinalRound({ division, dataDivision, contentDivision, statsDivision, teamBySlot, standings, quarterfinals }) {
  const playoffMatches = dataDivision.playoffs?.[2] || [];
  if (!playoffMatches.length) return null;
  const matches = playoffMatches.map((match, matchIndex) => {
    const sourceId = `p3m${matchIndex + 1}`;
    const homeTeamSeed = String(match.teamA || "").toUpperCase();
    const awayTeamSeed = String(match.teamB || "").toUpperCase();
    const homeTeamSlot = resolvePlayoffParticipant(standings, quarterfinals, homeTeamSeed, "QUARTAS");
    const awayTeamSlot = resolvePlayoffParticipant(standings, quarterfinals, awayTeamSeed, "QUARTAS");
    const liveSchedule = contentDivision.playoffResults?.[sourceId] || {};
    const statMatches = (statsDivision.matches || [])
      .filter((item) => item.seriesId === `playoffs-${sourceId}`);
    const wins = new Map();
    for (const statMatch of statMatches) {
      if (statMatch.winnerSlot) wins.set(statMatch.winnerSlot, (wins.get(statMatch.winnerSlot) || 0) + 1);
    }
    const homeScore = statMatches.length ? wins.get(homeTeamSlot) || 0 : null;
    const awayScore = statMatches.length ? wins.get(awayTeamSlot) || 0 : null;
    const format = String(match.format || "MD5").toUpperCase();
    const winTarget = format === "MD5" ? 3 : 2;
    const completed = Math.max(homeScore || 0, awayScore || 0) >= winTarget;
    const winnerSlot = completed && homeScore !== awayScore
      ? (homeScore > awayScore ? homeTeamSlot : awayTeamSlot)
      : "";
    return {
      id: `schedule:${division}:${sourceId}`,
      sourceId,
      statsSeriesId: `playoffs-${sourceId}`,
      stage: "playoffs-semifinals",
      orderIndex: matchIndex,
      homeTeamSeed,
      awayTeamSeed,
      homeTeamSlot,
      awayTeamSlot,
      homeTeamName: teamBySlot.get(homeTeamSlot)?.name || "",
      awayTeamName: teamBySlot.get(awayTeamSlot)?.name || "",
      startsAt: brazilDateToIso(liveSchedule.date || match.date, liveSchedule.time || match.time, generatedYear),
      status: completed ? "completed" : statMatches.length ? "live" : "scheduled",
      format,
      homeScore,
      awayScore,
      winnerTeamId: winnerSlot ? `team:${division}:${winnerSlot}` : null
    };
  });
  const playing = new Set(matches.flatMap((match) => [match.homeTeamSlot, match.awayTeamSlot]).filter(Boolean));
  const teamStatuses = Object.fromEntries(
    Array.from(teamBySlot.keys()).map((slot) => [slot, playing.has(slot) ? "playing" : "eliminated"])
  );
  return {
    id: `${division}-r6`,
    roundNumber: 6,
    name: "RODADA 6 · SEMIFINAIS",
    eligibility: { teamStatuses },
    matches
  };
}

function buildFinalRound({ division, dataDivision, contentDivision, statsDivision, teamBySlot, standings, semifinals }) {
  const playoffMatches = dataDivision.playoffs?.[3] || [];
  if (!playoffMatches.length) return null;
  const matches = playoffMatches.map((match, matchIndex) => {
    const sourceId = `p4m${matchIndex + 1}`;
    const homeTeamSeed = String(match.teamA || "").toUpperCase();
    const awayTeamSeed = String(match.teamB || "").toUpperCase();
    const homeTeamSlot = resolvePlayoffParticipant(standings, semifinals, homeTeamSeed, "SEMI");
    const awayTeamSlot = resolvePlayoffParticipant(standings, semifinals, awayTeamSeed, "SEMI");
    const liveSchedule = contentDivision.playoffResults?.[sourceId] || {};
    const statMatches = (statsDivision.matches || [])
      .filter((item) => item.seriesId === `playoffs-${sourceId}`);
    const wins = new Map();
    for (const statMatch of statMatches) {
      if (statMatch.winnerSlot) wins.set(statMatch.winnerSlot, (wins.get(statMatch.winnerSlot) || 0) + 1);
    }
    const homeScore = statMatches.length ? wins.get(homeTeamSlot) || 0 : null;
    const awayScore = statMatches.length ? wins.get(awayTeamSlot) || 0 : null;
    const format = String(match.format || "MD5").toUpperCase();
    const winTarget = format === "MD5" ? 3 : 2;
    const completed = Math.max(homeScore || 0, awayScore || 0) >= winTarget;
    const winnerSlot = completed && homeScore !== awayScore
      ? (homeScore > awayScore ? homeTeamSlot : awayTeamSlot)
      : "";
    return {
      id: `schedule:${division}:${sourceId}`,
      sourceId,
      statsSeriesId: `playoffs-${sourceId}`,
      stage: "playoffs-final",
      orderIndex: matchIndex,
      homeTeamSeed,
      awayTeamSeed,
      homeTeamSlot,
      awayTeamSlot,
      homeTeamName: teamBySlot.get(homeTeamSlot)?.name || "",
      awayTeamName: teamBySlot.get(awayTeamSlot)?.name || "",
      startsAt: brazilDateToIso(liveSchedule.date || match.date, liveSchedule.time || match.time, generatedYear),
      status: completed ? "completed" : statMatches.length ? "live" : "scheduled",
      format,
      homeScore,
      awayScore,
      winnerTeamId: winnerSlot ? `team:${division}:${winnerSlot}` : null
    };
  });
  const playing = new Set(matches.flatMap((match) => [match.homeTeamSlot, match.awayTeamSlot]).filter(Boolean));
  const teamStatuses = Object.fromEntries(
    Array.from(teamBySlot.keys()).map((slot) => [slot, playing.has(slot) ? "playing" : "eliminated"])
  );
  return {
    id: `${division}-r7`,
    roundNumber: 7,
    name: "RODADA 7 · GRANDE FINAL",
    eligibility: { teamStatuses },
    matches
  };
}

function resolvePlayoffParticipant(standings, previousRound, descriptor, previousStage) {
  const standingSlot = resolveStandingSeed(standings, descriptor);
  if (standingSlot) return standingSlot;
  const winnerMatch = new RegExp(`VENCEDOR\\s+${previousStage}\\s+(\\d+)`, "i").exec(String(descriptor || ""));
  if (!winnerMatch) return "";
  const previousMatch = previousRound.matches[Number(winnerMatch[1]) - 1];
  return String(previousMatch?.winnerTeamId || "").split(":").pop() || "";
}

function resolveStandingSeed(standings, seed) {
  const match = /^([ABCD])([1-4])$/.exec(String(seed || ""));
  if (!match) return "";
  return standings[match[1]]?.[Number(match[2]) - 1]?.slot || "";
}
