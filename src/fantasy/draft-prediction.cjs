"use strict";

const PLAYER_ROLES = Object.freeze(["TOP", "JG", "MID", "ADC", "SUP"]);
const VALID_MODES = Object.freeze(["NONE", "SIMPLE", "PRECISE"]);
const VALID_STATUSES = Object.freeze(["NONE", "PENDING", "HIT", "MISS", "VOID"]);

const DRAFT_PREDICTION_CONFIG = Object.freeze({
  enabledFromRound: 4,
  startersOnly: true,
  reserveEnabled: false,
  teamEnabled: false,
  simple: Object.freeze({
    BO3: Object.freeze({ reward: 2, penalty: -1 }),
    BO5: Object.freeze({ reward: 1.5, penalty: -1 })
  }),
  precise: Object.freeze({ reward: 5, penalty: -2 }),
  pickRateMultipliers: Object.freeze([
    Object.freeze({ min: 0.25, multiplier: 0.70, label: "Meta absoluto" }),
    Object.freeze({ min: 0.18, multiplier: 0.80, label: "Muito popular" }),
    Object.freeze({ min: 0.12, multiplier: 0.90, label: "Popular" }),
    Object.freeze({ min: 0.08, multiplier: 1.00, label: "Normal" }),
    Object.freeze({ min: 0.05, multiplier: 1.15, label: "Diferencial" }),
    Object.freeze({ min: 0.02, multiplier: 1.35, label: "Raro" }),
    Object.freeze({ min: 0, multiplier: 1.50, label: "Muito raro" })
  ]),
  captainMultiplierApplies: false
});

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return ({ JUNGLE: "JG", JUNGLER: "JG", SUPPORT: "SUP", SUPORTE: "SUP", BOT: "ADC", BOTTOM: "ADC" })[role] || role;
}

function normalizeChampionKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function championLookup(catalog) {
  const lookup = new Map();
  for (const champion of catalog || []) {
    lookup.set(normalizeChampionKey(champion.id), champion.id);
    lookup.set(normalizeChampionKey(champion.name), champion.id);
  }
  lookup.set("fiddlesticks", "Fiddlesticks");
  lookup.set("wukong", "MonkeyKing");
  lookup.set("nunuewillump", "Nunu");
  lookup.set("renataglasc", "Renata");
  return lookup;
}

function getDraftPickMultiplier(pickRate) {
  const rate = Math.max(0, Number(pickRate) || 0);
  return DRAFT_PREDICTION_CONFIG.pickRateMultipliers.find((item) => rate >= item.min).multiplier;
}

function getDraftPickRarity(pickRate) {
  const rate = Math.max(0, Number(pickRate) || 0);
  return DRAFT_PREDICTION_CONFIG.pickRateMultipliers.find((item) => rate >= item.min).label;
}

function normalizeSeriesFormat(value) {
  const format = String(value || "").trim().toUpperCase();
  return format === "MD5" || format === "BO5" ? "BO5" : "BO3";
}

function rewardForPrediction(mode, seriesFormat, multiplier) {
  const normalizedMode = String(mode || "NONE").toUpperCase();
  if (normalizedMode === "NONE") return { baseReward: 0, possibleReward: 0, missPenalty: 0 };
  if (normalizedMode === "PRECISE") {
    return {
      baseReward: DRAFT_PREDICTION_CONFIG.precise.reward,
      possibleReward: round2(DRAFT_PREDICTION_CONFIG.precise.reward * multiplier),
      missPenalty: DRAFT_PREDICTION_CONFIG.precise.penalty
    };
  }
  const rule = DRAFT_PREDICTION_CONFIG.simple[normalizeSeriesFormat(seriesFormat)];
  return {
    baseReward: rule.reward,
    possibleReward: round2(rule.reward * multiplier),
    missPenalty: rule.penalty
  };
}

function extractRoundNumber(match) {
  const direct = Math.trunc(Number(match?.roundNumber));
  if (direct > 0) return direct;
  const label = `${match?.stage || ""} ${match?.round || ""}`;
  const numbered = Math.trunc(Number(label.match(/RODADA\s*(\d+)/i)?.[1]));
  if (numbered > 0) return numbered;
  if (/oitavas|round[\s-]*of[\s-]*16/i.test(label)) return 4;
  if (/quartas|quarter[\s-]*final/i.test(label)) return 5;
  if (/semi[\s-]*final/i.test(label)) return 6;
  if (/final/i.test(label)) return 7;
  return 0;
}

function buildDraftPickRateSnapshot({ source, division, roundNumber, catalog, generatedAt = new Date().toISOString() }) {
  const targetRound = Math.trunc(Number(roundNumber));
  if (targetRound < DRAFT_PREDICTION_CONFIG.enabledFromRound) {
    throw new RangeError("O Palpite de Draft só pode ser ativado a partir da Rodada 4.");
  }
  const matches = Array.isArray(source?.divisions?.[division]?.stats?.matches)
    ? source.divisions[division].stats.matches
    : [];
  const lookup = championLookup(catalog);
  const totals = Object.fromEntries(PLAYER_ROLES.map((role) => [role, 0]));
  const counts = Object.fromEntries(PLAYER_ROLES.map((role) => [role, {}]));
  const rounds = new Set();
  const unknownChampions = new Set();
  for (const match of matches) {
    const sourceRound = extractRoundNumber(match);
    if (sourceRound < 1 || sourceRound >= targetRound) continue;
    rounds.add(sourceRound);
    for (const participant of Array.isArray(match.participants) ? match.participants : []) {
      const role = normalizeRole(participant.position);
      if (!PLAYER_ROLES.includes(role)) continue;
      const championId = lookup.get(normalizeChampionKey(participant.champion));
      if (!championId) {
        if (participant.champion) unknownChampions.add(String(participant.champion));
        continue;
      }
      totals[role] += 1;
      counts[role][championId] = (counts[role][championId] || 0) + 1;
    }
  }
  const positionPickRates = {};
  for (const role of PLAYER_ROLES) {
    positionPickRates[role] = {};
    for (const champion of catalog || []) {
      positionPickRates[role][champion.id] = totals[role]
        ? (counts[role][champion.id] || 0) / totals[role]
        : 0;
    }
  }
  return {
    roundId: targetRound,
    division,
    generatedFromRounds: [...rounds].sort((a, b) => a - b),
    generatedAt,
    totals,
    counts,
    positionPickRates,
    unknownChampions: [...unknownChampions].sort()
  };
}

function lockDraftPrediction({ input, role, seriesFormat, snapshot, catalog }) {
  const position = normalizeRole(role);
  if (!PLAYER_ROLES.includes(position)) throw new TypeError("Palpite de Draft permitido apenas para titulares.");
  const mode = String(input?.mode || "NONE").trim().toUpperCase();
  if (!VALID_MODES.includes(mode)) throw new TypeError("Modo de Palpite de Draft inválido.");
  if (mode === "NONE") {
    return {
      mode: "NONE", championId: null, mapNumber: null, pickRatePosition: position,
      pickRateAtLock: null, multiplierAtLock: null, baseReward: 0,
      possibleReward: 0, missPenalty: 0, status: "NONE", resultScore: 0
    };
  }
  const championId = String(input?.championId || "").trim();
  if (!(catalog || []).some((champion) => champion.id === championId)) throw new TypeError("Campeão inválido.");
  const format = normalizeSeriesFormat(seriesFormat);
  const mapNumber = mode === "PRECISE" ? Math.trunc(Number(input?.mapNumber)) : null;
  const maximumMap = format === "BO5" ? 5 : 3;
  if (mode === "PRECISE" && (!Number.isInteger(mapNumber) || mapNumber < 1 || mapNumber > maximumMap)) {
    throw new TypeError(`Escolha um mapa válido para ${format === "BO5" ? "MD5" : "MD3"}.`);
  }
  const pickRateAtLock = Math.max(0, Number(snapshot?.positionPickRates?.[position]?.[championId]) || 0);
  const multiplierAtLock = getDraftPickMultiplier(pickRateAtLock);
  const reward = rewardForPrediction(mode, format, multiplierAtLock);
  return {
    mode, championId, mapNumber, pickRatePosition: position,
    pickRateAtLock, multiplierAtLock, ...reward,
    status: "PENDING", resultScore: null
  };
}

function calculateDraftPredictionResult({ prediction, playerSeriesGames, seriesFormat }) {
  const mode = String(prediction?.mode || "NONE").toUpperCase();
  if (mode === "NONE") return { status: "NONE", resultScore: 0 };
  if (!VALID_MODES.includes(mode)) throw new TypeError("Modo de palpite inválido.");
  const games = (Array.isArray(playerSeriesGames) ? playerSeriesGames : [])
    .filter((game) => game && game.played !== false);
  if (!games.length) return { status: "VOID", resultScore: 0 };
  const lookup = championLookup([{ id: prediction.championId, name: prediction.championId }]);
  const expectedChampion = normalizeChampionKey(prediction.championId);
  const hit = mode === "SIMPLE"
    ? games.some((game) => normalizeChampionKey(lookup.get(normalizeChampionKey(game.championId || game.champion)) || game.championId || game.champion) === expectedChampion)
    : games.some((game) =>
      normalizeChampionKey(lookup.get(normalizeChampionKey(game.championId || game.champion)) || game.championId || game.champion) === expectedChampion &&
      Math.trunc(Number(game.mapNumber || game.gameNumber)) === Math.trunc(Number(prediction.mapNumber))
    );
  return hit
    ? { status: "HIT", resultScore: round2(prediction.possibleReward) }
    : { status: "MISS", resultScore: round2(prediction.missPenalty) };
}

function calculateFinalPlayerFantasyScore({ playerPerformanceScore, isCaptain = false, draftPredictionScore = 0 }) {
  const performance = round2(playerPerformanceScore);
  const performanceWithCaptain = round2(performance * (isCaptain ? 1.5 : 1));
  const captainBonus = round2(performanceWithCaptain - performance);
  const draftScore = round2(draftPredictionScore);
  return {
    playerPerformanceScore: performance,
    performanceWithCaptain,
    captainBonus,
    draftPredictionScore: draftScore,
    finalPlayerFantasyScore: round2(performanceWithCaptain + draftScore)
  };
}

module.exports = {
  DRAFT_PREDICTION_CONFIG,
  PLAYER_ROLES,
  VALID_MODES,
  VALID_STATUSES,
  buildDraftPickRateSnapshot,
  calculateFinalPlayerFantasyScore,
  calculateDraftPredictionResult,
  championLookup,
  extractRoundNumber,
  getDraftPickMultiplier,
  getDraftPickRarity,
  lockDraftPrediction,
  normalizeChampionKey,
  normalizeRole,
  normalizeSeriesFormat,
  rewardForPrediction,
  round2
};
