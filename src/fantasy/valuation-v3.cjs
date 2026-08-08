"use strict";

const VALUATION_FORMULA_VERSION = 3;
const VALUATION_FORMULA_ID = "fantasy-v3-dynamic";

const DEFAULT_VALUATION_SETTINGS = Object.freeze({
  expectedPriceMultiplier: 1.6,
  expectedPriceOffset: -8,
  oneHistoryCurrentWeight: 0.75,
  oneHistoryPreviousWeight: 0.25,
  experiencedCurrentWeight: 0.65,
  experiencedRecentWeight: 0.25,
  experiencedSeasonWeight: 0.10,
  recentRounds: 3,
  variationDivisor: 10,
  variationExponent: 0.90,
  positiveFactorNumerator: 14,
  positiveFactorOffset: 4,
  negativeFactorBase: 0.75,
  negativeFactorPriceDivisor: 40,
  lowParticipationThreshold: 0.34,
  lowParticipationFactor: 0.70,
  partialParticipationFactor: 0.90,
  fullParticipationFactor: 1,
  minimumPrice: 4,
  reviewThreshold: 7,
  currencyDecimals: 2,
  didNotPlay: "hold"
});

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function resolveSettings(settings) {
  return { ...DEFAULT_VALUATION_SETTINGS, ...(settings || {}) };
}

function validHistory(history = [], currentRound = null) {
  const current = Number(currentRound);
  const hasCurrent = Number.isFinite(current);
  return (Array.isArray(history) ? history : [])
    .filter((entry) => {
      const points = Number(entry?.points ?? entry?.pontos);
      const games = Number(entry?.games ?? entry?.jogos);
      const roundNumber = Number(entry?.roundNumber ?? entry?.rodada);
      const finalized = entry?.finalized ?? entry?.finalizada ?? true;
      const cancelled = entry?.cancelled ?? entry?.cancelada ?? false;
      return Number.isFinite(points) && games > 0 && finalized !== false && cancelled !== true &&
        (!hasCurrent || !Number.isFinite(roundNumber) || roundNumber < current);
    })
    .map((entry, index) => ({
      points: Number(entry.points ?? entry.pontos),
      roundNumber: Number(entry.roundNumber ?? entry.rodada),
      index
    }))
    .sort((left, right) => {
      if (Number.isFinite(left.roundNumber) && Number.isFinite(right.roundNumber)) {
        return right.roundNumber - left.roundNumber;
      }
      return left.index - right.index;
    });
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function calculateExpectedScore(currentPrice, settings = DEFAULT_VALUATION_SETTINGS) {
  settings = resolveSettings(settings);
  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new TypeError("O preço atual deve ser um número positivo.");
  }
  return round(
    Number(settings.expectedPriceMultiplier) * price + Number(settings.expectedPriceOffset),
    4
  );
}

function calculateAdjustedPerformance(currentPoints, history = [], currentRound = null, settings = DEFAULT_VALUATION_SETTINGS) {
  settings = resolveSettings(settings);
  const points = Number(currentPoints);
  if (!Number.isFinite(points)) throw new TypeError("A pontuação atual deve ser numérica.");
  const prior = validHistory(history, currentRound);
  const recent = prior.slice(0, Number(settings.recentRounds) || 3);
  const recentAverage = average(recent.map((entry) => entry.points));
  const seasonAverage = average(prior.map((entry) => entry.points));
  let adjustedPerformance = points;
  let historyModel = "current-only";
  if (prior.length === 1) {
    adjustedPerformance =
      Number(settings.oneHistoryCurrentWeight) * points +
      Number(settings.oneHistoryPreviousWeight) * prior[0].points;
    historyModel = "one-prior-round";
  } else if (prior.length >= 2) {
    adjustedPerformance =
      Number(settings.experiencedCurrentWeight) * points +
      Number(settings.experiencedRecentWeight) * recentAverage +
      Number(settings.experiencedSeasonWeight) * seasonAverage;
    historyModel = "experienced";
  }
  return {
    adjustedPerformance: round(adjustedPerformance, 4),
    recentAverage: recentAverage == null ? null : round(recentAverage, 4),
    seasonAverage: seasonAverage == null ? null : round(seasonAverage, 4),
    validHistoryRounds: prior.length,
    recentScores: recent.map((entry) => round(entry.points, 2)),
    historyModel
  };
}

function calculateParticipation(playerMaps, teamMaps, settings = DEFAULT_VALUATION_SETTINGS) {
  settings = resolveSettings(settings);
  const mapsPlayed = Math.max(0, Math.trunc(Number(playerMaps) || 0));
  const mapsByTeam = Math.max(0, Math.trunc(Number(teamMaps) || 0));
  if (mapsPlayed === 0) return { participationRate: 0, participationFactor: 0 };
  if (mapsByTeam === 0) {
    throw new TypeError("A quantidade de mapas da equipe deve ser maior que zero quando o atleta atuou.");
  }
  const participationRate = Math.min(1, mapsPlayed / mapsByTeam);
  let participationFactor = Number(settings.fullParticipationFactor);
  if (participationRate <= Number(settings.lowParticipationThreshold)) {
    participationFactor = Number(settings.lowParticipationFactor);
  } else if (participationRate < 1) {
    participationFactor = Number(settings.partialParticipationFactor);
  }
  return {
    participationRate: round(participationRate, 4),
    participationFactor: round(participationFactor, 4)
  };
}

function calculateFantasyValuation({
  currentPrice,
  currentPoints,
  history = [],
  currentRound = null,
  playerMaps = 0,
  teamMaps = 0,
  settings = DEFAULT_VALUATION_SETTINGS
} = {}) {
  settings = resolveSettings(settings);
  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new TypeError("O preço atual deve ser um número positivo.");
  }
  const expectedScore = calculateExpectedScore(price, settings);
  const participation = calculateParticipation(playerMaps, teamMaps, settings);
  if (participation.participationFactor === 0) {
    return {
      formulaVersion: VALUATION_FORMULA_VERSION,
      formulaId: VALUATION_FORMULA_ID,
      played: false,
      currentPrice: round(price, 2),
      currentPoints: 0,
      expectedScore,
      adjustedPerformance: null,
      recentAverage: null,
      seasonAverage: null,
      validHistoryRounds: validHistory(history, currentRound).length,
      recentScores: [],
      historyModel: "did-not-play",
      difference: null,
      baseVariation: 0,
      priceFactor: 0,
      ...participation,
      variationBeforeFloor: 0,
      finalVariation: 0,
      newPrice: round(price, 2),
      needsReview: false,
      status: "did-not-play"
    };
  }

  const performance = calculateAdjustedPerformance(currentPoints, history, currentRound, settings);
  const difference = performance.adjustedPerformance - expectedScore;
  const baseVariation = difference === 0
    ? 0
    : Math.sign(difference) * ((Math.abs(difference) / Number(settings.variationDivisor)) ** Number(settings.variationExponent));
  const priceFactor = difference > 0
    ? Number(settings.positiveFactorNumerator) / (price + Number(settings.positiveFactorOffset))
    : difference < 0
      ? Number(settings.negativeFactorBase) + price / Number(settings.negativeFactorPriceDivisor)
      : 0;
  const variationBeforeFloor = baseVariation * priceFactor * participation.participationFactor;
  const minimumPrice = Number(settings.minimumPrice);
  const newPrice = round(Math.max(minimumPrice, price + variationBeforeFloor), Number(settings.currencyDecimals));
  const finalVariation = round(newPrice - price, Number(settings.currencyDecimals));

  return {
    formulaVersion: VALUATION_FORMULA_VERSION,
    formulaId: VALUATION_FORMULA_ID,
    played: true,
    currentPrice: round(price, 2),
    currentPoints: round(Number(currentPoints), 2),
    expectedScore,
    ...performance,
    difference: round(difference, 4),
    baseVariation: round(baseVariation, 6),
    priceFactor: round(priceFactor, 6),
    ...participation,
    variationBeforeFloor: round(variationBeforeFloor, 6),
    finalVariation,
    newPrice,
    needsReview: Math.abs(finalVariation) > Number(settings.reviewThreshold),
    status: finalVariation > 0 ? "increased" : finalVariation < 0 ? "decreased" : "unchanged"
  };
}

module.exports = {
  VALUATION_FORMULA_VERSION,
  VALUATION_FORMULA_ID,
  DEFAULT_VALUATION_SETTINGS,
  round,
  validHistory,
  calculateExpectedScore,
  calculateAdjustedPerformance,
  calculateParticipation,
  calculateFantasyValuation
};
