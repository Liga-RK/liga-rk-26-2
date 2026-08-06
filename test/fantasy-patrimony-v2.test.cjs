"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PATRIMONY_CONFIG,
  PATRIMONY_FORMULA_ID,
  calculateParticipantPatrimony,
  initialParticipantPatrimony,
  roundCurrency,
  summarizeParticipantPatrimony
} = require("../src/fantasy/patrimony-v2.cjs");

function lineup(assets) {
  return { roundId: "round-2", isValid: true, assets };
}

function asset(assetId, purchasePrice, position = "TOP", assetType = "player") {
  return { assetId, purchasePrice, position, assetType, isReserve: position === "RESERVE" };
}

test("patrimônio inicial é aplicado somente na ausência de registro", () => {
  assert.equal(initialParticipantPatrimony(null), 100);
  assert.equal(initialParticipantPatrimony(undefined), 100);
  assert.equal(initialParticipantPatrimony(87.4), 87.4);
  assert.equal(initialParticipantPatrimony(124.8), 124.8);
  assert.equal(initialParticipantPatrimony(0), 0);
});

test("valorização e saldo preservado geram patrimônio acima de 100", () => {
  const result = calculateParticipantPatrimony({
    previousPatrimony: 100,
    availableBalance: 5,
    officialLineup: lineup([asset("a", 95)]),
    updatedAssetPrices: { a: 101 }
  });
  assert.equal(result.newPatrimony, 106);
  assert.equal(result.assetsVariation, 6);
  assert.equal(result.inconsistent, false);
});

test("desvalorização aceita patrimônio abaixo de 100 sem piso", () => {
  const result = calculateParticipantPatrimony({
    previousPatrimony: 100,
    availableBalance: 5,
    officialLineup: lineup([asset("a", 95)]),
    updatedAssetPrices: { a: 88 }
  });
  assert.equal(result.newPatrimony, 93);
});

test("não existe teto em 150 ou 200", () => {
  for (const previousPatrimony of [150, 200]) {
    const result = calculateParticipantPatrimony({
      previousPatrimony,
      availableBalance: previousPatrimony - 10,
      officialLineup: lineup([asset("a", 10)]),
      updatedAssetPrices: { a: 25 }
    });
    assert.equal(result.newPatrimony, previousPatrimony + 15);
  }
});

test("reserva e equipe contam exatamente uma vez", () => {
  const result = calculateParticipantPatrimony({
    previousPatrimony: 100,
    availableBalance: 70,
    officialLineup: lineup([
      asset("starter", 10),
      asset("reserve", 8, "RESERVE"),
      asset("team", 12, "TEAM", "team")
    ]),
    updatedAssetPrices: { starter: 10, reserve: 9.5, team: 14.2 }
  });
  assert.equal(result.previousAssetsValue, 30);
  assert.equal(result.updatedAssetsValue, 33.7);
  assert.equal(result.newPatrimony, 103.7);
  assert.equal(result.assets.filter((row) => row.assetId === "reserve").length, 1);
});

test("ativo que não jogou mantém preço e impacto zero", () => {
  const result = calculateParticipantPatrimony({
    previousPatrimony: 80,
    availableBalance: 68.5,
    officialLineup: lineup([asset("did-not-play", 11.5)]),
    updatedAssetPrices: {}
  });
  assert.equal(result.assetsVariation, 0);
  assert.equal(result.newPatrimony, 80);
});

test("sem escalação válida preserva patrimônio", () => {
  const result = calculateParticipantPatrimony({ previousPatrimony: 65, officialLineup: null });
  assert.equal(result.status, "NO_VALID_LINEUP");
  assert.equal(result.newPatrimony, 65);
});

test("diferença acima de um centavo é marcada como inconsistência", () => {
  const result = calculateParticipantPatrimony({
    previousPatrimony: 100,
    availableBalance: 9.97,
    officialLineup: lineup([asset("a", 90)]),
    updatedAssetPrices: { a: 90 }
  });
  assert.equal(result.inconsistent, true);
  assert.equal(result.consistencyDifference, -0.03);
});

test("arredondamento monetário é centralizado em dois centavos", () => {
  assert.equal(roundCurrency(10.005), 10.01);
  assert.equal(PATRIMONY_CONFIG.minimumPatrimony, null);
  assert.equal(PATRIMONY_CONFIG.maximumPatrimony, null);
  assert.equal(PATRIMONY_FORMULA_ID, "v2-dynamic-assets");
});

test("duas divisões da mesma rodada usam a mesma base e somam na carteira única", () => {
  const summary = summarizeParticipantPatrimony({
    currentCents: 11268,
    historyRows: [
      { roundNumber: 2, roundId: "asc-r2", status: "PUBLISHED", variationCents: 795 },
      { roundNumber: 2, roundId: "elite-r2", status: "PUBLISHED", variationCents: 473 }
    ]
  });
  assert.equal(summary.roundVariationCents, 1268);
  assert.equal(summary.totalVariationCents, 1268);
  assert.equal(summary.rounds[0].openingCents, 10000);
  assert.equal(summary.rounds[0].closingCents, 11268);
  assert.equal(summary.maximumCents, 11268);
  assert.equal(summary.minimumCents, 10000);
});

test("rodada seguinte parte do saldo global fechado da rodada anterior", () => {
  const summary = summarizeParticipantPatrimony({
    currentCents: 11000,
    historyRows: [
      { roundNumber: 2, roundId: "asc-r2", status: "PUBLISHED", variationCents: 500 },
      { roundNumber: 2, roundId: "elite-r2", status: "PUBLISHED", variationCents: 300 },
      { roundNumber: 3, roundId: "asc-r3", status: "PUBLISHED", variationCents: -200 },
      { roundNumber: 3, roundId: "elite-r3", status: "PUBLISHED", variationCents: 400 }
    ]
  });
  assert.deepEqual(summary.rounds.map((round) => [round.openingCents, round.closingCents]), [
    [10000, 10800],
    [10800, 11000]
  ]);
  assert.equal(summary.roundVariationCents, 200);
});
