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
  const playoffRound = buildFirstPlayoffRound({
    division,
    dataDivision,
    contentDivision,
    statsDivision,
    teamBySlot,
    standings
  });
  const rounds = playoffRound ? [...groupRounds, playoffRound] : groupRounds;

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
      name: statsPlayer.displayName,
      role,
      riotId: statsPlayer.riotId || "",
      opgg: statsPlayer.opgg || "",
      captain: false
    };
    const starterIndex = players.findIndex((player) => player.role === role);
    if (starterIndex >= 0) players.splice(starterIndex, 1, replacement);
    else players.unshift(replacement);
  }
  return players;
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

function resolveStandingSeed(standings, seed) {
  const match = /^([ABCD])([1-4])$/.exec(String(seed || ""));
  if (!match) return "";
  return standings[match[1]]?.[Number(match[2]) - 1]?.slot || "";
}
