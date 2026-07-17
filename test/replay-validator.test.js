const assert = require("node:assert/strict");
const test = require("node:test");
const { findReplayDuplicates, validateReplaySelection } = require("../src/replay/replay-validator");

test("valida lados e identificacao da serie", () => {
  assert.deepEqual(validateReplaySelection({ division: "elite", seriesId: "r1", gameNumber: 1, blueTeamSlot: "A1", redTeamSlot: "A2" }), []);
  assert.ok(validateReplaySelection({ division: "elite", seriesId: "r1", gameNumber: 1, blueTeamSlot: "A1", redTeamSlot: "A1" }).some((message) => message.includes("mesmo time")));
});

test("detecta duplicidade por hash, Game ID e posicao da serie", () => {
  const database = {
    divisions: {
      elite: { games: [{ id: "saved", sha256: "hash", gameId: "BR1_1", seriesId: "r1", gameNumber: 1 }] },
      ascension: { games: [] }
    }
  };
  const duplicates = findReplayDuplicates(database, { division: "elite", sha256: "hash", gameId: "BR1_1", seriesId: "r1", gameNumber: 1 });
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].reasons.sort(), ["gameId", "seriesGame", "sha256"]);
});
