const assert = require("node:assert/strict");
const test = require("node:test");
const { assertUniqueMappings, buildIdentityIndex, migratePlayer, normalizeRiotId, parseOpggRiotId, parseRiotId, suggestParticipant } = require("../src/statistics/player-identity");

test("migra jogador sem perder propriedades antigas", () => {
  const old = { player: "Henrique", opgg: "https://op.gg/example", lane: "JG", custom: { keep: true } };
  const migrated = migratePlayer(old, { idFactory: () => "player-fixed" });
  assert.equal(migrated.playerId, "player-fixed");
  assert.equal(migrated.player, old.player);
  assert.equal(migrated.opgg, old.opgg);
  assert.deepEqual(migrated.custom, old.custom);
  assert.deepEqual(migrated.riotIdAliases, []);
});

test("preserva Riot ID e normaliza apenas para comparacao", () => {
  const parsed = parseRiotId("  Zähir  #KeRiA ");
  assert.equal(parsed.riotId, "Zähir#KeRiA");
  assert.equal(normalizeRiotId("  ZÄHIR  #keria "), "zähir#keria");
  assert.equal(normalizeRiotId("Player#BR1"), "player#br1");
  assert.notEqual(normalizeRiotId("Player#BR1"), normalizeRiotId("Player#NA1"));
  assert.equal(normalizeRiotId("Z\u0061\u0308hir#KERIA"), normalizeRiotId("Z\u00e4hir#keria"));
});

test("deriva Riot ID do link OP.GG e o usa como identidade principal", () => {
  const parsed = parseOpggRiotId("https://op.gg/pt/lol/summoners/br/FFLT%20KitteN-gay");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.riotId, "FFLT KitteN#gay");

  const migrated = migratePlayer({
    player: "KITTEN",
    riotId: "Antigo#BR1",
    opgg: "https://op.gg/pt/lol/summoners/br/FFLT%20KitteN-gay"
  }, { idFactory: () => "player-kitten" });
  assert.equal(migrated.riotId, "FFLT KitteN#gay");
  assert.equal(migrated.gameName, "FFLT KitteN");
  assert.equal(migrated.tagLine, "gay");
});

test("rejeita endereco que nao pertence ao OP.GG", () => {
  assert.equal(parseOpggRiotId("https://example.com/summoners/br/Rick-BR1").valid, false);
});

test("encontra Riot ID principal e alias sem fuzzy match", () => {
  const team = { players: [
    { playerId: "p1", player: "Rick", riotId: "Rick#BR1", riotIdAliases: [{ riotId: "RICK JG#RK" }] },
    { playerId: "p2", player: "Outro", riotId: "Rick#NA1", riotIdAliases: [] }
  ] };
  assert.equal(suggestParticipant({ riotId: "rick#br1" }, team).playerId, "p1");
  assert.equal(suggestParticipant({ riotId: "RICK JG#rk" }, team).method, "riot-id-alias");
  assert.equal(suggestParticipant({ riotId: "Rlck#BR1" }, team), null);
});

test("detecta conflito de Riot ID entre jogadores", () => {
  const result = buildIdentityIndex({ A1: { players: [{ playerId: "p1", riotId: "Same#BR1" }] }, A2: { players: [{ playerId: "p2", riotIdAliases: [{ riotId: "same#br1" }] }] } });
  assert.equal(result.conflicts.length, 1);
});

test("mantem playerId ao trocar nome, lane e equipe", () => {
  const first = migratePlayer({ player: "Rick", lane: "JG", riotId: "Rick#BR1" }, { idFactory: () => "stable-player" });
  const changed = migratePlayer({ ...first, player: "Rick Novo", lane: "MID", teamSlot: "B2" }, { idFactory: () => { throw new Error("nao deve criar outro id"); } });
  assert.equal(changed.playerId, "stable-player");
  assert.equal(changed.player, "Rick Novo");
  assert.equal(changed.lane, "MID");
});

test("impede associar o mesmo jogador a dois participantes", () => {
  assert.throws(() => assertUniqueMappings([
    { participantIndex: 0, playerId: "p1" },
    { participantIndex: 1, playerId: "p1" }
  ]), /dois participantes/);
});
