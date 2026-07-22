const test = require("node:test");
const assert = require("node:assert/strict");
const standings = require("../assets/group-standings");

test("fase de grupos MD3 conta series e saldo de jogos", () => {
  const results = [
    { homeScore: 2, awayScore: 1 },
    { homeScore: 2, awayScore: 0 }
  ];
  const computed = standings.compute({
    rounds: [{ games: [
      { home: "A1", away: "A2" },
      { home: "A1", away: "A3" }
    ] }],
    resolveResult: (_round, game) => results[game],
    resolveTeam: (slot) => ({ slot, avgWinTime: slot === "A1" ? "18:00" : "20:00" })
  });

  const a1 = computed.A.find((entry) => entry.slot === "A1");
  assert.deepEqual(
    { wins: a1.wins, losses: a1.losses, gameDiff: a1.gameDiff, games: a1.games },
    { wins: 2, losses: 0, gameDiff: 3, games: 2 }
  );
});

test("serie incompleta atualiza apenas o saldo de mapas e desempates seguem a ordem oficial", () => {
  const entries = [
    { wins: 2, losses: 1, gameDiff: 1, seed: 0, team: { avgWinTime: "20:00" } },
    { wins: 2, losses: 1, gameDiff: 2, seed: 1, team: { avgWinTime: "22:00" } },
    { wins: 2, losses: 0, gameDiff: 0, seed: 2, team: { avgWinTime: "30:00" } }
  ].sort(standings.compareEntries);
  assert.equal(entries[0].seed, 2);
  assert.equal(entries[1].seed, 1);

  const home = { wins: 0, losses: 0, gameDiff: 0, games: 0 };
  const away = { wins: 0, losses: 0, gameDiff: 0, games: 0 };
  assert.equal(standings.applySeries(home, away, 1, 1), false);
  assert.equal(home.games, 0);

  assert.equal(standings.applySeries(home, away, 0, 1), false);
  assert.deepEqual(
    { wins: home.wins, losses: home.losses, gameDiff: home.gameDiff, games: home.games },
    { wins: 0, losses: 0, gameDiff: -1, games: 0 }
  );
  assert.equal(away.gameDiff, 1);
});
