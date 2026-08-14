const assert = require("node:assert/strict");
const test = require("node:test");

const { CHAMPION_CATALOG } = require("../src/fantasy/champion-catalog.cjs");
const {
  DRAFT_PREDICTION_CONFIG,
  buildDraftPickRateSnapshot,
  calculateFinalPlayerFantasyScore,
  calculateDraftPredictionResult,
  getDraftPickMultiplier,
  lockDraftPrediction,
  rewardForPrediction
} = require("../src/fantasy/draft-prediction.cjs");

function officialSource() {
  const matches = [];
  for (let round = 1; round <= 4; round += 1) {
    for (let game = 1; game <= 10; game += 1) {
      matches.push({
        id: `r${round}-g${game}`,
        roundNumber: round,
        participants: [
          { position: "TOP", champion: game <= 3 ? "Gragas" : "Ornn" },
          { position: "JUNGLE", champion: game <= 2 ? "Gragas" : "XinZhao" },
          { position: "MID", champion: game === 1 ? "Ahri" : "Orianna" },
          { position: "ADC", champion: "Kaisa" },
          { position: "SUP", champion: "Rell" }
        ]
      });
    }
  }
  return { divisions: { elite: { stats: { matches } } } };
}

test("Palpite de Draft fica desativado antes da Rodada 4", () => {
  assert.equal(DRAFT_PREDICTION_CONFIG.enabledFromRound, 4);
  assert.throws(() => buildDraftPickRateSnapshot({
    source: officialSource(), division: "elite", roundNumber: 3, catalog: CHAMPION_CATALOG
  }), /Rodada 4/);
});

test("snapshot da Rodada 4 usa somente R1, R2 e R3 e calcula por posição", () => {
  const snapshot = buildDraftPickRateSnapshot({
    source: officialSource(), division: "elite", roundNumber: 4,
    catalog: CHAMPION_CATALOG, generatedAt: "2026-08-12T00:00:00.000Z"
  });
  assert.deepEqual(snapshot.generatedFromRounds, [1, 2, 3]);
  assert.equal(snapshot.totals.TOP, 30);
  assert.equal(snapshot.totals.JG, 30);
  assert.equal(snapshot.positionPickRates.TOP.Gragas, 0.3);
  assert.equal(snapshot.positionPickRates.JG.Gragas, 0.2);
  assert.equal(snapshot.positionPickRates.MID.Ahri, 0.1);
  assert.equal(snapshot.positionPickRates.TOP.Ahri, 0);
});

test("multiplicadores seguem todas as faixas e campeão sem histórico recebe 1,50x", () => {
  assert.equal(getDraftPickMultiplier(.28), .7);
  assert.equal(getDraftPickMultiplier(.20), .8);
  assert.equal(getDraftPickMultiplier(.15), .9);
  assert.equal(getDraftPickMultiplier(.10), 1);
  assert.equal(getDraftPickMultiplier(.06), 1.15);
  assert.equal(getDraftPickMultiplier(.03), 1.35);
  assert.equal(getDraftPickMultiplier(0), 1.5);
});

test("Palpite Simples MD3 e MD5 aplica multiplicador apenas no acerto", () => {
  assert.deepEqual(rewardForPrediction("SIMPLE", "MD3", .7), {
    baseReward: 2, possibleReward: 1.4, missPenalty: -1
  });
  assert.deepEqual(rewardForPrediction("SIMPLE", "MD5", 1.35), {
    baseReward: 1.5, possibleReward: 2.03, missPenalty: -1
  });
});

test("Palpite Preciso raro recompensa 7,50 e mantém erro em -2", () => {
  assert.deepEqual(rewardForPrediction("PRECISE", "MD3", 1.5), {
    baseReward: 5, possibleReward: 7.5, missPenalty: -2
  });
});

test("lock congela Pick Rate, multiplicador e recompensa por posição", () => {
  const snapshot = buildDraftPickRateSnapshot({
    source: officialSource(), division: "elite", roundNumber: 4, catalog: CHAMPION_CATALOG
  });
  const prediction = lockDraftPrediction({
    input: { mode: "PRECISE", championId: "Ahri", mapNumber: 2 },
    role: "MID", seriesFormat: "MD3", snapshot, catalog: CHAMPION_CATALOG
  });
  assert.equal(prediction.pickRateAtLock, .1);
  assert.equal(prediction.multiplierAtLock, 1);
  assert.equal(prediction.possibleReward, 5);
  assert.equal(prediction.missPenalty, -2);
  assert.equal(prediction.status, "PENDING");
});

test("MD3 bloqueia mapas 4 e 5, enquanto MD5 aceita mapa 5", () => {
  const snapshot = buildDraftPickRateSnapshot({ source: officialSource(), division: "elite", roundNumber: 4, catalog: CHAMPION_CATALOG });
  assert.throws(() => lockDraftPrediction({
    input: { mode: "PRECISE", championId: "Ahri", mapNumber: 4 }, role: "MID",
    seriesFormat: "MD3", snapshot, catalog: CHAMPION_CATALOG
  }), /mapa válido/);
  assert.equal(lockDraftPrediction({
    input: { mode: "PRECISE", championId: "Ahri", mapNumber: 5 }, role: "MID",
    seriesFormat: "MD5", snapshot, catalog: CHAMPION_CATALOG
  }).mapNumber, 5);
});

test("Simples acerta em qualquer mapa e Fearless não depende de repetição", () => {
  const prediction = { mode: "SIMPLE", championId: "XinZhao", possibleReward: 1.4, missPenalty: -1 };
  assert.deepEqual(calculateDraftPredictionResult({
    prediction,
    playerSeriesGames: [{ championId: "Vi", mapNumber: 1 }, { championId: "XinZhao", mapNumber: 2 }],
    seriesFormat: "MD3"
  }), { status: "HIT", resultScore: 1.4 });
});

test("Preciso exige campeão e mapa corretos; mapa não disputado é MISS", () => {
  const prediction = { mode: "PRECISE", championId: "Ahri", mapNumber: 3, possibleReward: 6.75, missPenalty: -2 };
  assert.deepEqual(calculateDraftPredictionResult({ prediction, playerSeriesGames: [
    { championId: "Ahri", mapNumber: 1 }, { championId: "Orianna", mapNumber: 2 }
  ] }), { status: "MISS", resultScore: -2 });
  assert.deepEqual(calculateDraftPredictionResult({ ...{
    prediction: { ...prediction, mapNumber: 2 },
    playerSeriesGames: [{ championId: "Ahri", mapNumber: 2 }]
  } }), { status: "HIT", resultScore: 6.75 });
});

test("titular ausente gera VOID sem penalidade; NONE sempre vale zero", () => {
  assert.deepEqual(calculateDraftPredictionResult({
    prediction: { mode: "SIMPLE", championId: "Ahri", possibleReward: 2, missPenalty: -1 },
    playerSeriesGames: []
  }), { status: "VOID", resultScore: 0 });
  assert.deepEqual(calculateDraftPredictionResult({ prediction: { mode: "NONE" }, playerSeriesGames: [] }), {
    status: "NONE", resultScore: 0
  });
});

test("capitão multiplica apenas o desempenho e nunca o Palpite de Draft", () => {
  assert.deepEqual(calculateFinalPlayerFantasyScore({
    playerPerformanceScore: 20,
    isCaptain: true,
    draftPredictionScore: 6.75
  }), {
    playerPerformanceScore: 20,
    performanceWithCaptain: 30,
    captainBonus: 10,
    draftPredictionScore: 6.75,
    finalPlayerFantasyScore: 36.75
  });
});

test("catálogo possui 173 IDs e nomes únicos com imagens locais", () => {
  assert.equal(CHAMPION_CATALOG.length, 173);
  assert.equal(new Set(CHAMPION_CATALOG.map((item) => item.id)).size, 173);
  assert.equal(new Set(CHAMPION_CATALOG.map((item) => item.name.toLowerCase())).size, 173);
  assert.ok(CHAMPION_CATALOG.every((item) => item.image === `assets/champions/${item.id}.png`));
});
