const test = require("node:test");
const assert = require("node:assert/strict");
const { hydrateRosterIdentities } = require("../src/statistics/roster-identities");

test("cria e reutiliza IDs locais para jogadores inscritos sem Riot ID", () => {
  const content = { divisions: { elite: { teams: { A1: { players: [
    { player: "TOP TESTE", lane: "TOP", opgg: "https://op.gg/lol/summoners/br/teste" },
    { player: "--", lane: "JG", opgg: "" }
  ] } } }, ascension: { teams: {} } } };
  const database = { rosterIdentities: [] };
  const first = hydrateRosterIdentities(content, database);
  const playerId = first.content.divisions.elite.teams.A1.players[0].playerId;
  assert.match(playerId, /^[0-9a-f-]{36}$/i);
  assert.equal(first.content.divisions.elite.teams.A1.players[1].playerId, undefined);

  const second = hydrateRosterIdentities(content, database);
  assert.equal(second.content.divisions.elite.teams.A1.players[0].playerId, playerId);
  assert.equal(second.changed, false);
});

test("transferencia reutiliza a identidade do jogador em vez do ID antigo do slot", () => {
  const burraxaId = "745a0ee6-ebda-4170-a095-68565c5f425b";
  const salameId = "97404de5-5a36-4b7b-aba1-e92dbb09ce5c";
  const content = { divisions: {
    elite: { teams: {} },
    ascension: { teams: { C2: { players: [{
      player: "BURRAXA",
      lane: "SUB",
      opgg: "https://op.gg/pt/lol/summoners/br/FEMBuurraxa-FLU",
      playerId: salameId
    }] } } }
  } };
  const database = { rosterIdentities: [
    {
      playerId: burraxaId,
      createdAt: "2026-07-16T14:36:38.373Z",
      division: "ascension",
      slot: "D2",
      playerIndex: 4,
      displayName: "burraxa",
      opgg: "https://op.gg/pt/lol/summoners/br/fembuurraxa-flu",
      lane: "SUP"
    },
    {
      playerId: salameId,
      createdAt: "2026-08-02T05:36:25.077Z",
      division: "ascension",
      slot: "C2",
      playerIndex: 6,
      displayName: "salame",
      opgg: "https://op.gg/pt/lol/summoners/br/benihime-sasa",
      lane: "SUB"
    }
  ] };

  const hydrated = hydrateRosterIdentities(content, database);
  assert.equal(hydrated.content.divisions.ascension.teams.C2.players[0].playerId, burraxaId);
  assert.equal(database.rosterIdentities.find((entry) => entry.playerId === salameId).displayName, "salame");
  assert.equal(database.rosterIdentities.find((entry) => entry.playerId === burraxaId).slot, "C2");
});
