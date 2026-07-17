const assert = require("node:assert/strict");
const test = require("node:test");
const { damageShare, kda, participation, perMinute, winRate } = require("../src/statistics/calculations");

test("calcula as metricas competitivas", () => {
  assert.equal(kda(4, 2, 6), 5);
  assert.equal(kda(4, 0, 6), 10);
  assert.equal(participation(4, 6, 20), 0.5);
  assert.equal(participation(4, 6, 0), 0);
  assert.equal(damageShare(1000, 4000), 0.25);
  assert.equal(perMinute(1600, 960), 100);
  assert.equal(winRate(3, 4), 0.75);
});
