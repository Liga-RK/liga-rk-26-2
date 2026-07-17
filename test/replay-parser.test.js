const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { ERROR_CODES, ReplayError } = require("../src/replay/replay-errors");
const { parseReplay } = require("../src/replay/parser-factory");
const { extractGameId } = require("../src/replay/rofl2-parser");

const replayPath = path.resolve(__dirname, "..", "samples", "BR1-3262336523.rofl");

test("processa o replay real da Liga RK", { skip: !fs.existsSync(replayPath) }, () => {
  const parsed = parseReplay(fs.readFileSync(replayPath), { fileName: path.basename(replayPath), importedAt: "2026-07-16T00:00:00.000Z" });
  assert.equal(parsed.clientVersion, "16.14.794.5912");
  assert.equal(parsed.gameId, "BR1_3262336523");
  assert.equal(parsed.durationMilliseconds, 980552);
  assert.equal(parsed.durationFormatted, "16:20.552");
  assert.equal(parsed.participantCount, 10);
  assert.equal(parsed.sha256, "20e8dbbbdcf9ee271b861a510c7cb4388d8634203874abf7f26a19bfb38deedc");
  assert.deepEqual(compactTeam(parsed.teams["100"]), { won: true, kills: 25, deaths: 8, assists: 25, gold: 35803, towers: 2, voidGrubs: 0, heralds: 1, dragons: 1, elderDragons: 0, barons: 0 });
  assert.deepEqual(compactTeam(parsed.teams["200"]), { won: false, kills: 8, deaths: 25, assists: 2, gold: 26157, towers: 0, voidGrubs: 0, heralds: 0, dragons: 0, elderDragons: 0, barons: 0 });
  assert.equal(parsed.teams["100"].visionScore, 76);
  assert.equal(parsed.teams["200"].visionScore, 71);
  assert.deepEqual(pickParticipant(parsed, "PNG gengi#br1"), { champion: "Jayce", position: "TOP", kills: 4, deaths: 5, assists: 3, gold: 7104, damageToChampions: 12004, visionScore: 12, wardsPlaced: 5, wardsKilled: 0 });
  assert.deepEqual(pickParticipant(parsed, "Zähir#keria"), { champion: "Milio", position: "SUP", kills: 2, deaths: 1, assists: 12, gold: 5630, damageToChampions: 3002, visionScore: 35, wardsPlaced: 13, wardsKilled: 3 });
});

test("rejeita arquivo vazio e cabecalho invalido", () => {
  assert.throws(() => parseReplay(Buffer.alloc(0)), (error) => error instanceof ReplayError && error.code === ERROR_CODES.INVALID_FILE);
  assert.throws(() => parseReplay(Buffer.from("not-a-replay")), (error) => error instanceof ReplayError && error.code === ERROR_CODES.INVALID_HEADER);
});

test("rejeita tamanho de metadata invalido", () => {
  const buffer = Buffer.alloc(32);
  buffer.write("RIOT", 0, "ascii");
  buffer.writeUInt8(2, 4);
  buffer.writeUInt32LE(999999, buffer.length - 4);
  assert.throws(() => parseReplay(buffer), (error) => error.code === ERROR_CODES.INVALID_METADATA_SIZE);
});

test("rejeita JSON de metadata e statsJson corrompidos", () => {
  assert.throws(
    () => parseReplay(makeRofl2("{json-invalido")),
    (error) => error.code === ERROR_CODES.INVALID_METADATA_JSON
  );
  assert.throws(
    () => parseReplay(makeRofl2(JSON.stringify({ statsJson: "[stats-invalido" }))),
    (error) => error.code === ERROR_CODES.INVALID_STATS_JSON
  );
});

test("extrai Game ID de nomes oficiais sem confiar no restante do caminho", () => {
  assert.equal(extractGameId("BR1-3262336523.rofl"), "BR1_3262336523");
  assert.equal(extractGameId("upload_EUW1_1234567890_backup.rofl"), "EUW1_1234567890");
  assert.equal(extractGameId("replay-sem-id.rofl"), "");
});

function makeRofl2(metadataText) {
  const header = Buffer.alloc(64);
  header.write("RIOT", 0, "ascii");
  header.writeUInt8(2, 4);
  header.write("16.14.794.5912", 8, "ascii");
  const metadata = Buffer.from(metadataText, "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(metadata.length, 0);
  return Buffer.concat([header, metadata, size]);
}

function compactTeam(team) {
  const { won, kills, deaths, assists, gold, towers, voidGrubs, heralds, dragons, elderDragons, barons } = team;
  return { won, kills, deaths, assists, gold, towers, voidGrubs, heralds, dragons, elderDragons, barons };
}

function pickParticipant(parsed, riotId) {
  const participant = parsed.participants.find((item) => item.riotId === riotId);
  const { champion, position, kills, deaths, assists, gold, damageToChampions, visionScore, wardsPlaced, wardsKilled } = participant;
  return { champion, position, kills, deaths, assists, gold, damageToChampions, visionScore, wardsPlaced, wardsKilled };
}
