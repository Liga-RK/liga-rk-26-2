"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const valuation = require("../src/fantasy/valuation-v3.cjs");

function close(actual, expected, tolerance = 0.02) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `esperado ${expected}, recebido ${actual}`);
}

function calculate(overrides = {}) {
  return valuation.calculateFantasyValuation({
    currentPrice: 12,
    currentPoints: 30,
    history: [],
    playerMaps: 2,
    teamMaps: 2,
    ...overrides
  });
}

test("v3 identifica e expõe os parâmetros oficiais", () => {
  assert.equal(valuation.VALUATION_FORMULA_ID, "fantasy-v3-dynamic");
  assert.equal(valuation.DEFAULT_VALUATION_SETTINGS.minimumPrice, 4);
  assert.equal(valuation.DEFAULT_VALUATION_SETTINGS.reviewThreshold, 7);
});

test("pontuação esperada é 1,6 vezes o preço menos 8", () => {
  assert.equal(valuation.calculateExpectedScore(12), 11.2);
  assert.equal(valuation.calculateExpectedScore(25), 32);
});

test("sem histórico usa somente a rodada atual", () => {
  const item = calculate({ currentPoints: 31 });
  assert.equal(item.adjustedPerformance, 31);
  assert.equal(item.historyModel, "current-only");
});

test("com uma rodada anterior usa pesos 75% e 25%", () => {
  const item = calculate({ currentPoints: 30, history: [{ points: 10, games: 2, roundNumber: 1 }], currentRound: 2 });
  assert.equal(item.adjustedPerformance, 25);
  assert.equal(item.historyModel, "one-prior-round");
});

test("com duas ou mais rodadas usa atual, média recente e média da temporada", () => {
  const item = calculate({
    currentPoints: 30,
    currentRound: 5,
    history: [
      { points: 10, games: 2, roundNumber: 1 },
      { points: 20, games: 2, roundNumber: 2 },
      { points: 40, games: 2, roundNumber: 3 },
      { points: 50, games: 2, roundNumber: 4 }
    ]
  });
  close(item.recentAverage, 36.6667, 0.001);
  assert.equal(item.seasonAverage, 30);
  close(item.adjustedPerformance, 31.6667, 0.001);
});

test("ausências e rodadas canceladas não viram zero no histórico", () => {
  const item = calculate({
    currentPoints: 20,
    currentRound: 4,
    history: [
      { points: 0, games: 0, roundNumber: 3 },
      { points: 99, games: 2, roundNumber: 2, cancelled: true },
      { points: 12, games: 2, roundNumber: 1 }
    ]
  });
  assert.equal(item.validHistoryRounds, 1);
  assert.equal(item.adjustedPerformance, 18);
});

test("exemplos oficiais de alta e queda", () => {
  close(calculate({ currentPrice: 6, currentPoints: 31 }).newPrice, 9.70);
  close(calculate({ currentPrice: 12, currentPoints: 30 }).newPrice, 13.54);
  close(calculate({ currentPrice: 25, currentPoints: 50 }).newPrice, 25.82);
  close(calculate({ currentPrice: 25, currentPoints: 10 }).newPrice, 22.21);
});

test("participação aplica fatores 0,70, 0,90 e 1", () => {
  assert.equal(calculate({ playerMaps: 1, teamMaps: 3 }).participationFactor, 0.7);
  assert.equal(calculate({ playerMaps: 2, teamMaps: 3 }).participationFactor, 0.9);
  assert.equal(calculate({ playerMaps: 2, teamMaps: 5 }).participationFactor, 0.9);
  assert.equal(calculate({ playerMaps: 4, teamMaps: 5 }).participationFactor, 0.9);
  assert.equal(calculate({ playerMaps: 5, teamMaps: 5 }).participationFactor, 1);
  assert.throws(() => calculate({ playerMaps: 1, teamMaps: 0 }), /mapas da equipe/);
});

test("zero mapas mantém preço e não injeta a rodada nas médias", () => {
  const item = calculate({ currentPrice: 18.42, currentPoints: 50, playerMaps: 0, teamMaps: 3 });
  assert.equal(item.newPrice, 18.42);
  assert.equal(item.finalVariation, 0);
  assert.equal(item.adjustedPerformance, null);
  assert.equal(item.status, "did-not-play");
});

test("pontuação negativa desvaloriza normalmente", () => {
  const item = calculate({ currentPrice: 12, currentPoints: -10 });
  assert.ok(item.finalVariation < 0);
  assert.ok(item.newPrice >= 4);
});

test("não existe teto fixo e variações absolutas acima de 7 exigem revisão", () => {
  const item = calculate({ currentPrice: 4, currentPoints: 50 });
  assert.ok(item.finalVariation > 7);
  assert.equal(item.needsReview, true);
});

test("o único piso é RK$ 4,00", () => {
  const item = calculate({ currentPrice: 4.5, currentPoints: -100 });
  assert.equal(item.newPrice, 4);
  assert.equal(item.finalVariation, -0.5);
});

test("cálculo é determinístico", () => {
  const input = { currentPrice: 17.31, currentPoints: 28.7, history: [{ points: 19, games: 2 }], playerMaps: 2, teamMaps: 3 };
  assert.deepEqual(valuation.calculateFantasyValuation(input), valuation.calculateFantasyValuation(input));
});
