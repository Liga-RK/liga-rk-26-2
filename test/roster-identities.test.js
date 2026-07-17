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
