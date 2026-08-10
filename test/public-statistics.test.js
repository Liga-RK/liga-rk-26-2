const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parseReplay } = require("../src/replay/parser-factory");
const { aggregateDatabase, buildTeamOfWeek, scoreMatchParticipants, selectMvp } = require("../src/statistics/aggregators");
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
      elite: { games: [{ id: "game-1", division: "elite", seriesId: "groups-r1g1", gameNumber: 1, blueTeamSlot: "A1", redTeamSlot: "A2", parserStatus: "parsed_rofl2", stage: "GRUPOS", round: "RODADA 1", sha256: parsed.sha256, storagePath: "C:\\private\\game.rofl", match: parsed }] },
      ascension: { games: [] }
    }
  };

  const publicPayload = createPublicPayload(aggregateDatabase(database, content, {}));
  assertPublicPayloadSafe(publicPayload);
  assert.equal(publicPayload.version, 2);
  assert.equal(publicPayload.divisions.elite.overview.games, 1);
  assert.equal(publicPayload.divisions.elite.players.length, 10);
  assert.deepEqual(
    publicPayload.divisions.elite.players.map((player) => player.averageScore),
    publicPayload.divisions.elite.players.map((player) => player.averageScore).slice().sort((left, right) => right - left)
  );
  assert.ok(publicPayload.divisions.elite.players.every((player) => player.averageScore >= 0 && player.averageScore <= 100));
  assert.ok(publicPayload.divisions.elite.players.every((player) => player.ratings.length === 1));
  assert.ok(publicPayload.divisions.elite.players.some((player) => player.visionScoreAvg > 0));
  assert.ok(publicPayload.divisions.elite.teams.some((team) => team.dpmAvg > 0));
  assert.ok(publicPayload.divisions.elite.teams.some((team) => team.averageScore > 0));
  assert.ok(publicPayload.divisions.elite.teams.every((team) => team.averageScore >= 0 && team.averageScore <= 100));
  const playerChampion = publicPayload.divisions.elite.players[0].champions[0];
  assert.equal(playerChampion.count, 1);
  assert.equal(playerChampion.wins + playerChampion.losses, playerChampion.count);
  assert.ok([0, 100].includes(playerChampion.winRate));
  assert.match(playerChampion.image, /^assets\/champions\/.+\.jpg$/);
  assert.equal(publicPayload.divisions.elite.matches[0].participants.length, 10);
  assert.ok(publicPayload.divisions.elite.matches[0].participants.some((participant) => participant.visionScore > 0));
  assert.ok(publicPayload.divisions.elite.matches[0].participants.every((participant) => participant.score >= 0 && participant.score <= 100));
  assert.equal(publicPayload.divisions.elite.teamOfWeek.minimumGames, 2);
  assert.deepEqual(publicPayload.divisions.elite.teamOfWeek.selection, []);
  assert.equal(publicPayload.divisions.elite.teamOfWeek.highlightScore, 0);
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

test("seleciona para a semana somente jogadores com dois jogos e uma serie vencida na rodada", () => {
  const teams = {
    A1: { slot: "A1", name: "Elegiveis", tag: "EGL", logo: "" },
    A2: { slot: "A2", name: "Um Jogo", tag: "UM", logo: "" }
  };
  const player = (id, role, averageScore, games, wins, seriesWins, teamSlot) => ({
    id,
    displayName: id,
    riotId: `${id}#BR1`,
    kda: averageScore / 10,
    roundRatings: [{
      round: 1,
      position: role,
      teamSlot,
      averageScore,
      games,
      wins,
      losses: games - wins,
      seriesWins,
      series: ["groups-r1g1"],
      matches: Array.from({ length: games }, (_, index) => `${id}-game-${index + 1}`)
    }]
  });
  const players = [
    player("top-um-jogo", "TOP", 99, 1, 1, 1, "A2"),
    player("top-venceu-mapa-mas-perdeu-serie", "TOP", 98, 3, 1, 0, "A2"),
    player("top-elegivel", "TOP", 88, 2, 2, 1, "A1"),
    player("jg-sem-serie-vencida", "JG", 100, 3, 1, 0, "A2")
  ];

  const teamOfWeek = buildTeamOfWeek(players, teams, 1);

  assert.equal(teamOfWeek.minimumGames, 2);
  assert.deepEqual(teamOfWeek.selection.map((entry) => entry.playerId), ["top-elegivel"]);
  assert.equal(teamOfWeek.selection[0].wins, 2);
  assert.equal(teamOfWeek.selection[0].seriesWins, 1);
  assert.equal(teamOfWeek.highlightPlayerId, "top-elegivel");
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
  assert.equal(player.averageScore, 0);
  assert.equal(player.mainPosition, "TOP");
  assert.equal(player.teams[0].slot, "A1");
});

test("mantem o historico do jogador transferido mesmo quando o slot traz um ID antigo", () => {
  const burraxaId = "player-burraxa";
  const salameId = "player-salame";
  const match = mvpTestMatch();
  match.teams = { "100": {}, "200": {} };
  match.participants = match.participants.map((participant, index) => ({
    ...participant,
    champion: index === 4 ? "Bard" : "Annie",
    playerId: index === 4 ? salameId : `other-player-${index}`,
    riotId: index === 4 ? "FEMBuurraxa#FLU" : participant.riotId
  }));
  const content = {
    divisions: {
      elite: { teams: {} },
      ascension: {
        teams: {
          C2: {
            name: "Favelinha Reformed",
            tag: "FVLR",
            players: [{
              playerId: salameId,
              player: "BURRAXA",
              riotId: "",
              lane: "SUB",
              opgg: "https://op.gg/pt/lol/summoners/br/FEMBuurraxa-FLU"
            }]
          },
          C3: { name: "Adversario", tag: "ADV", players: [] }
        }
      }
    }
  };
  const database = {
    version: 2,
    rosterIdentities: [
      { playerId: burraxaId, division: "ascension", displayName: "BURRAXA", slot: "D2", lane: "SUP", opgg: "https://op.gg/pt/lol/summoners/br/FEMBuurraxa-FLU" },
      { playerId: salameId, division: "ascension", displayName: "SALAME", slot: "C2", lane: "SUB", opgg: "https://op.gg/pt/lol/summoners/br/benihime-sasa" }
    ],
    divisions: {
      elite: { games: [] },
      ascension: { games: [{
        id: "transfer-game",
        division: "ascension",
        seriesId: "groups-r2-transfer",
        gameNumber: 1,
        blueTeamSlot: "C2",
        redTeamSlot: "C3",
        parserStatus: "parsed_rofl2",
        stage: "GRUPOS",
        round: "RODADA 2",
        match
      }] }
    }
  };

  const players = aggregateDatabase(database, content, {}).divisions.ascension.players;
  const burraxa = players.find((player) => player.id === burraxaId);
  const salame = players.find((player) => player.id === salameId);

  assert.equal(burraxa.games, 1);
  assert.equal(burraxa.displayName, "BURRAXA");
  assert.equal(burraxa.mainPosition, "SUP");
  assert.equal(burraxa.teams[0].slot, "C2");
  assert.equal(salame.games, 0);
  assert.equal(salame.displayName, "SALAME");
});

test("une DAVID e DAVI da M7 em uma unica identidade", () => {
  const oldId = "8de67801-d9d0-45c6-ab35-5efaacdacf51";
  const currentId = "87b0b01b-0c1d-44ca-8154-ec59da7b80a3";
  const match = mvpTestMatch();
  match.participants = match.participants.map((participant, index) => ({
    ...participant,
    playerId: index === 0 ? oldId : `m7-opponent-${index}`,
    riotId: index === 0 ? "Little David#RBRN" : participant.riotId
  }));
  const content = {
    divisions: {
      elite: { teams: {
        D4: { name: "M7 Esports", tag: "M7", players: [{
          playerId: currentId,
          player: "DAVI",
          riotId: "DeyraF#LDavi",
          lane: "TOP",
          opgg: "https://op.gg/pt/lol/summoners/br/DeyraF-LDavi"
        }] },
        A1: { name: "Adversario", tag: "ADV", players: [] }
      } },
      ascension: { teams: {} }
    }
  };
  const database = {
    version: 2,
    rosterIdentities: [
      { playerId: oldId, division: "elite", displayName: "DAVID", slot: "D4", lane: "SUB", opgg: "https://op.gg/pt/lol/summoners/br/Little%20David-RBRN" },
      { playerId: currentId, division: "elite", displayName: "DAVI", slot: "D4", lane: "TOP", opgg: "https://op.gg/pt/lol/summoners/br/DeyraF-LDavi" }
    ],
    divisions: {
      elite: { games: [{
        id: "m7-identity-merge",
        division: "elite",
        seriesId: "groups-r3-m7",
        gameNumber: 1,
        blueTeamSlot: "D4",
        redTeamSlot: "A1",
        parserStatus: "parsed_rofl2",
        stage: "GRUPOS",
        round: "RODADA 3",
        match
      }] },
      ascension: { games: [] }
    }
  };

  const m7Players = aggregateDatabase(database, content, {}).divisions.elite.players
    .filter((player) => player.id === oldId || player.id === currentId);

  assert.equal(m7Players.length, 1);
  assert.equal(m7Players[0].id, currentId);
  assert.equal(m7Players[0].displayName, "DAVI");
  assert.equal(m7Players[0].riotId, "DeyraF#LDavi");
  assert.equal(m7Players[0].games, 1);
  assert.deepEqual(m7Players[0].alsoPlayedAs, ["Little David#RBRN"]);
});

test("nao associa jogador a equipe historica sem partidas disputadas", () => {
  const littleNoctusId = "player-little-noctus";
  const match = mvpTestMatch();
  match.participants = match.participants.map((participant, index) => ({
    ...participant,
    playerId: index === 1 ? littleNoctusId : `historical-team-player-${index}`,
    riotId: index === 1 ? "little noctus#gabi" : participant.riotId
  }));
  const content = {
    divisions: {
      elite: {
        teams: {
          A4: { name: "Quantum Rabbits", tag: "QR", players: [] },
          A3: { name: "Adversario", tag: "ADV", players: [] },
          D1: { name: "Favelao do Techy", tag: "FVL", players: [] }
        }
      },
      ascension: { teams: {} }
    }
  };
  const database = {
    version: 2,
    rosterIdentities: [{
      playerId: littleNoctusId,
      division: "elite",
      displayName: "LITTLE NOCTUS",
      slot: "D1",
      lane: "MID",
      opgg: "https://op.gg/pt/lol/summoners/br/little%20noctus-gabi"
    }],
    divisions: {
      elite: { games: [{
        id: "little-noctus-game",
        division: "elite",
        seriesId: "groups-r1g1",
        gameNumber: 1,
        blueTeamSlot: "A4",
        redTeamSlot: "A3",
        parserStatus: "parsed_rofl2",
        stage: "GRUPOS",
        round: "RODADA 1",
        match
      }] },
      ascension: { games: [] }
    }
  };

  const player = aggregateDatabase(database, content, {}).divisions.elite.players.find((entry) => entry.id === littleNoctusId);

  assert.equal(player.mainPosition, "JG");
  assert.deepEqual(player.teams, [{ slot: "A4", count: 1 }]);
});

test("ordena equipes por nota media e preserva o TMV", { skip: !fs.existsSync(replayPath) }, () => {
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
  assert.ok(winners[0].averageScore >= winners[1].averageScore);
  assert.deepEqual(winners.map((team) => team.winRate), [100, 100]);
  assert.deepEqual(winners.map((team) => team.avgWinTime), ["15:00", "20:00"]);
});

test("MVP e escolhido somente entre jogadores do time vencedor", () => {
  const match = mvpTestMatch();
  const losingAdc = match.participants.find((participant) => participant.team === 200 && participant.position === "ADC");
  losingAdc.kills = 40;
  losingAdc.assists = 20;
  losingAdc.damageToChampions = 100000;
  losingAdc.gold = 30000;

  const mvp = selectMvp(match, match.durationSeconds);

  assert.equal(mvp.team, 100);
  assert.equal(mvp.won, true);
  assert.equal(mvp.mvpModel, "role-impact-v4");
  assert.ok(mvp.mvpScore > 0 && mvp.mvpScore <= 100);
});

test("suporte pode ser MVP por participacao, assistencias e visao", () => {
  const match = mvpTestMatch();
  const mvp = selectMvp(match, match.durationSeconds);

  assert.equal(mvp.position, "SUP");
  assert.equal(mvp.riotId, "Winner SUP#BR1");
  assert.ok(mvp.performanceScore >= 90);
  assert.ok(mvp.mvpBreakdown.kp > 60);
  assert.ok(mvp.mvpBreakdown.vision > 50);
  assert.ok(mvp.mvpBreakdown.wards > 50);
});

test("atribui nota de desempenho para todos os jogadores da partida", () => {
  const match = mvpTestMatch();
  const scores = scoreMatchParticipants(match, match.durationSeconds);

  assert.equal(scores.length, 10);
  assert.ok(scores.every((player) => player.performanceScore >= 0 && player.performanceScore <= 100));
  assert.ok(scores.every((player) => player.performanceModel === "role-impact-v4"));
  assert.ok(scores.some((player) => player.team === 200 && player.performanceScore > 0));
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

function mvpTestMatch() {
  const roles = ["TOP", "JG", "MID", "ADC", "SUP"];
  const winners = [
    mvpParticipant(0, 100, roles[0], { kills: 1, deaths: 3, assists: 5, gold: 10000, damageToChampions: 12000, visionScore: 20, wardsPlaced: 8, wardsKilled: 2, towers: 2 }),
    mvpParticipant(1, 100, roles[1], { kills: 2, deaths: 2, assists: 8, gold: 9000, damageToChampions: 9000, visionScore: 35, wardsPlaced: 15, wardsKilled: 5, dragons: 2, barons: 1 }),
    mvpParticipant(2, 100, roles[2], { kills: 4, deaths: 4, assists: 4, gold: 11000, damageToChampions: 15000, visionScore: 15, wardsPlaced: 7, wardsKilled: 1, towers: 1 }),
    mvpParticipant(3, 100, roles[3], { kills: 5, deaths: 3, assists: 5, gold: 12000, damageToChampions: 18000, visionScore: 15, wardsPlaced: 6, wardsKilled: 1, towers: 2 }),
    mvpParticipant(4, 100, roles[4], { kills: 1, deaths: 1, assists: 20, gold: 7000, damageToChampions: 5000, visionScore: 100, wardsPlaced: 50, wardsKilled: 15 })
  ];
  const losers = [
    mvpParticipant(5, 200, roles[0], { kills: 2, deaths: 5, assists: 2, gold: 8500, damageToChampions: 8000, visionScore: 15, wardsPlaced: 6, wardsKilled: 1 }),
    mvpParticipant(6, 200, roles[1], { kills: 1, deaths: 6, assists: 3, gold: 7500, damageToChampions: 6000, visionScore: 20, wardsPlaced: 9, wardsKilled: 2, dragons: 1 }),
    mvpParticipant(7, 200, roles[2], { kills: 3, deaths: 5, assists: 2, gold: 9000, damageToChampions: 10000, visionScore: 12, wardsPlaced: 5, wardsKilled: 1 }),
    mvpParticipant(8, 200, roles[3], { kills: 4, deaths: 4, assists: 1, gold: 9500, damageToChampions: 12000, visionScore: 10, wardsPlaced: 4, wardsKilled: 1 }),
    mvpParticipant(9, 200, roles[4], { kills: 0, deaths: 5, assists: 4, gold: 6000, damageToChampions: 3000, visionScore: 40, wardsPlaced: 20, wardsKilled: 5 })
  ];
  return {
    durationSeconds: 1800,
    winnerTeam: 100,
    participants: [...winners, ...losers]
  };
}

function mvpParticipant(participantIndex, team, position, overrides) {
  return {
    participantIndex,
    playerId: `mvp-player-${participantIndex}`,
    riotId: `${team === 100 ? "Winner" : "Loser"} ${position}#BR1`,
    team,
    position,
    won: team === 100,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 0,
    damageToChampions: 0,
    visionScore: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    towers: 0,
    voidGrubs: 0,
    heralds: 0,
    dragons: 0,
    elderDragons: 0,
    barons: 0,
    ...overrides
  };
}
