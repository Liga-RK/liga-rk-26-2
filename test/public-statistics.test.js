const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parseReplay } = require("../src/replay/parser-factory");
const { aggregateDatabase } = require("../src/statistics/aggregators");
const { assertPublicPayloadSafe, createPublicPayload } = require("../src/statistics/public-payload");

const replayPath = path.resolve(__dirname, "..", "samples", "BR1-3262336523.rofl");

test("agrega replay e publica somente estatisticas sanitizadas", { skip: !fs.existsSync(replayPath) }, () => {
  const parsed = parseReplay(fs.readFileSync(replayPath), { fileName: path.basename(replayPath), importedAt: "2026-07-16T00:00:00.000Z" });
  parsed.participants = parsed.participants.map((participant, index) => ({ ...participant, playerId: `player-${index + 1}`, identificationMethod: "primary" }));
  const content = {
    divisions: {
      elite: {
        teams: {
          A1: { name: "Time Azul", tag: "AZUL", players: parsed.participants.slice(0, 5).map(playerRecord) },
          A2: { name: "Time Vermelho", tag: "VERM", players: parsed.participants.slice(5).map(playerRecord) }
        }
      },
      ascension: { teams: {} }
    }
  };
  const database = {
    version: 2,
    divisions: {
      elite: { games: [{ id: "game-1", division: "elite", seriesId: "serie-1", gameNumber: 1, blueTeamSlot: "A1", redTeamSlot: "A2", parserStatus: "parsed_rofl2", stage: "GRUPOS", round: "R1", sha256: parsed.sha256, storagePath: "C:\\private\\game.rofl", match: parsed }] },
      ascension: { games: [] }
    }
  };

  const publicPayload = createPublicPayload(aggregateDatabase(database, content, {}));
  assertPublicPayloadSafe(publicPayload);
  assert.equal(publicPayload.version, 2);
  assert.equal(publicPayload.divisions.elite.overview.games, 1);
  assert.equal(publicPayload.divisions.elite.players.length, 10);
  assert.deepEqual(
    publicPayload.divisions.elite.players.map((player) => player.kda),
    publicPayload.divisions.elite.players.map((player) => player.kda).slice().sort((left, right) => right - left)
  );
  assert.ok(publicPayload.divisions.elite.players.some((player) => player.visionScoreAvg > 0));
  assert.ok(publicPayload.divisions.elite.teams.some((team) => team.dpmAvg > 0));
  const playerChampion = publicPayload.divisions.elite.players[0].champions[0];
  assert.equal(playerChampion.count, 1);
  assert.equal(playerChampion.wins + playerChampion.losses, playerChampion.count);
  assert.ok([0, 100].includes(playerChampion.winRate));
  assert.match(playerChampion.image, /^assets\/champions\/.+\.jpg$/);
  assert.equal(publicPayload.divisions.elite.matches[0].participants.length, 10);
  assert.ok(publicPayload.divisions.elite.matches[0].participants.some((participant) => participant.visionScore > 0));
  const serialized = JSON.stringify(publicPayload);
  assert.equal(serialized.includes(parsed.sha256), false);
  assert.equal(serialized.includes("rawMetadata"), false);
  assert.equal(serialized.includes("storagePath"), false);
});

test("gera estado publico vazio sem inventar estatisticas", () => {
  const content = { divisions: { elite: { teams: {} }, ascension: { teams: {} } } };
  const database = { version: 2, divisions: { elite: { games: [] }, ascension: { games: [] } } };
  const publicPayload = createPublicPayload(aggregateDatabase(database, content, {}));
  assertPublicPayloadSafe(publicPayload);
  assert.equal(publicPayload.divisions.elite.hasData, false);
  assert.equal(publicPayload.divisions.ascension.hasData, false);
  assert.equal(publicPayload.divisions.elite.statistics, null);
  assert.deepEqual(publicPayload.divisions.elite.matches, []);
});

test("publica jogadores inscritos sem partidas com estatisticas zeradas", () => {
  const content = {
    divisions: {
      elite: { teams: { A1: { name: "Time Teste", tag: "TT", players: [{ playerId: "player-zero", player: "Zero", riotId: "Zero#BR1", lane: "TOP", opgg: "https://op.gg/lol/summoners/br/Zero-BR1" }] } } },
      ascension: { teams: {} }
    }
  };
  const database = { version: 2, divisions: { elite: { games: [] }, ascension: { games: [] } } };
  const player = createPublicPayload(aggregateDatabase(database, content, {})).divisions.elite.players.find((entry) => entry.id === "player-zero");

  assert.ok(player);
  assert.equal(player.displayName, "Zero");
  assert.equal(player.games, 0);
  assert.equal(player.kda, 0);
  assert.equal(player.mainPosition, "TOP");
  assert.equal(player.teams[0].slot, "A1");
});

test("ordena equipes por winrate e usa o menor TMV como desempate", { skip: !fs.existsSync(replayPath) }, () => {
  const first = parseReplay(fs.readFileSync(replayPath), { fileName: path.basename(replayPath) });
  first.durationSeconds = 1200;
  first.participants = first.participants.map((participant, index) => ({ ...participant, playerId: `first-${index}` }));
  const second = structuredClone(first);
  second.durationSeconds = 900;
  second.participants = second.participants.map((participant, index) => ({ ...participant, playerId: `second-${index}` }));
  const content = {
    divisions: {
      elite: {
        teams: {
          A1: { name: "Vencedor A", tag: "AWIN", players: first.participants.slice(0, 5).map(playerRecord) },
          A2: { name: "Derrotado A", tag: "ALOS", players: first.participants.slice(5).map(playerRecord) },
          B1: { name: "Vencedor B", tag: "BWIN", players: second.participants.slice(0, 5).map(playerRecord) },
          B2: { name: "Derrotado B", tag: "BLOS", players: second.participants.slice(5).map(playerRecord) }
        }
      },
      ascension: { teams: {} }
    }
  };
  const database = {
    version: 2,
    divisions: {
      elite: { games: [
        { id: "game-a", division: "elite", seriesId: "serie-a", gameNumber: 1, blueTeamSlot: "A1", redTeamSlot: "A2", parserStatus: "parsed_rofl2", match: first },
        { id: "game-b", division: "elite", seriesId: "serie-b", gameNumber: 1, blueTeamSlot: "B1", redTeamSlot: "B2", parserStatus: "parsed_rofl2", match: second }
      ] },
      ascension: { games: [] }
    }
  };

  const winners = aggregateDatabase(database, content, {}).divisions.elite.teams.filter((team) => team.wins > 0);
  assert.deepEqual(winners.map((team) => team.tag), ["BWIN", "AWIN"]);
  assert.deepEqual(winners.map((team) => team.winRate), [100, 100]);
  assert.deepEqual(winners.map((team) => team.avgWinTime), ["15:00", "20:00"]);
});

function playerRecord(participant) {
  return {
    playerId: participant.playerId,
    player: participant.gameName,
    riotId: participant.riotId,
    lane: participant.position,
    opgg: ""
  };
}
