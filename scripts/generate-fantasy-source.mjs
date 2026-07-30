import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = loadWindowValue("assets/content.js", "LIGA_RK_CONTENT");
const data = loadWindowValue("assets/data.js", "LIGA_RK_DATA");
const stats = loadWindowValue("assets/stats-content.js", "LIGA_RK_STATS");
const generatedYear = new Date(stats.generatedAt || Date.now()).getUTCFullYear();

const output = {
  version: 1,
  schema: "fantasy-rk-official-source-v1",
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
    players: (team.players || [])
      .filter((player) => player.playerId || String(player.player || "").trim())
      .map((player) => ({
        id: player.playerId,
        name: player.player,
        role: player.lane,
        riotId: player.riotId || "",
        opgg: player.opgg || "",
        captain: Boolean(player.captain)
      }))
  }));
  const teamBySlot = new Map(teams.map((team) => [team.slot, team]));

  const rounds = (dataDivision.rounds || []).map((round, roundIndex) => {
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
        status: statMatches.length ? "completed" : "scheduled",
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
        averageScore: team.averageScore
      })),
      matches: (statsDivision.matches || []).map((match) => ({
        id: match.id,
        seriesId: match.seriesId,
        round: match.round,
        roundNumber: extractRoundNumber(match.round),
        blueTeamSlot: match.blueTeamSlot,
        redTeamSlot: match.redTeamSlot,
        winnerSlot: match.winnerSlot
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
