"use strict";

const PATRIMONY_FORMULA_VERSION = 2;
const PATRIMONY_FORMULA_ID = "v2-dynamic-assets";
const PATRIMONY_CONFIG = Object.freeze({
  initialPatrimony: 100,
  includeStartingPlayers: true,
  includeReserve: true,
  includeTeam: true,
  minimumPatrimony: null,
  maximumPatrimony: null
});

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function initialParticipantPatrimony(value) {
  return value === null || value === undefined
    ? PATRIMONY_CONFIG.initialPatrimony
    : roundCurrency(value);
}

function priceFrom(updatedAssetPrices, assetId, fallback) {
  let value;
  if (updatedAssetPrices instanceof Map) value = updatedAssetPrices.get(String(assetId));
  else if (updatedAssetPrices && typeof updatedAssetPrices === "object") value = updatedAssetPrices[String(assetId)];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundCurrency(numeric) : roundCurrency(fallback);
}

function includedAsset(asset, config) {
  const type = String(asset?.assetType || "player").toLowerCase();
  const position = String(asset?.position || asset?.role || "").toUpperCase();
  if (position === "RESERVE" || asset?.isReserve) return config.includeReserve;
  if (type === "team" || position === "TEAM") return config.includeTeam;
  return config.includeStartingPlayers;
}

function noValidLineup(previousPatrimony, roundId, calculatedAt, reason = "NO_VALID_LINEUP") {
  return {
    previousPatrimony,
    availableBalance: previousPatrimony,
    previousAssetsValue: 0,
    updatedAssetsValue: 0,
    assetsVariation: 0,
    patrimonyByAssets: previousPatrimony,
    patrimonyByVariation: previousPatrimony,
    consistencyDifference: 0,
    inconsistent: false,
    newPatrimony: previousPatrimony,
    assets: [],
    roundId: roundId || null,
    calculatedAt,
    status: reason
  };
}

function calculateParticipantPatrimony({
  previousPatrimony,
  availableBalance,
  officialLineup,
  updatedAssetPrices,
  config = PATRIMONY_CONFIG,
  calculatedAt = new Date().toISOString()
} = {}) {
  const previous = initialParticipantPatrimony(previousPatrimony);
  const roundId = officialLineup?.roundId || null;
  if (!officialLineup || officialLineup.isValid !== true) {
    return noValidLineup(previous, roundId, calculatedAt);
  }

  const sourceAssets = Array.isArray(officialLineup.assets) ? officialLineup.assets : [];
  const assets = [];
  const seen = new Set();
  for (const asset of sourceAssets) {
    if (!includedAsset(asset, config)) continue;
    const assetId = String(asset?.assetId || "").trim();
    if (!assetId) throw new TypeError("Todo ativo patrimonial precisa de assetId.");
    if (seen.has(assetId)) throw new TypeError(`O ativo ${assetId} foi informado mais de uma vez.`);
    seen.add(assetId);
    const purchasePrice = roundCurrency(asset?.purchasePrice);
    if (!Number.isFinite(purchasePrice)) throw new TypeError(`Preço de compra inválido para ${assetId}.`);
    const currentPrice = priceFrom(updatedAssetPrices, assetId, purchasePrice);
    assets.push({
      assetId,
      assetType: String(asset?.assetType || "player"),
      position: String(asset?.position || asset?.role || ""),
      purchasePrice,
      currentPrice,
      variation: roundCurrency(currentPrice - purchasePrice)
    });
  }

  if (!assets.length) return noValidLineup(previous, roundId, calculatedAt);
  const cash = roundCurrency(availableBalance);
  if (!Number.isFinite(cash)) throw new TypeError("O saldo disponível deve ser numérico.");
  const previousAssetsValue = roundCurrency(assets.reduce((sum, asset) => sum + asset.purchasePrice, 0));
  const updatedAssetsValue = roundCurrency(assets.reduce((sum, asset) => sum + asset.currentPrice, 0));
  const assetsVariation = roundCurrency(updatedAssetsValue - previousAssetsValue);
  const patrimonyByAssets = roundCurrency(cash + updatedAssetsValue);
  const patrimonyByVariation = roundCurrency(previous + assetsVariation);
  const consistencyDifference = roundCurrency(patrimonyByAssets - patrimonyByVariation);
  const inconsistent = Math.abs(consistencyDifference) > 0.01;

  return {
    previousPatrimony: previous,
    availableBalance: cash,
    previousAssetsValue,
    updatedAssetsValue,
    assetsVariation,
    patrimonyByAssets,
    patrimonyByVariation,
    consistencyDifference,
    inconsistent,
    newPatrimony: patrimonyByAssets,
    assets,
    roundId,
    calculatedAt,
    status: inconsistent ? "INCONSISTENT" : "CALCULATED"
  };
}

module.exports = {
  PATRIMONY_FORMULA_VERSION,
  PATRIMONY_FORMULA_ID,
  PATRIMONY_CONFIG,
  roundCurrency,
  initialParticipantPatrimony,
  calculateParticipantPatrimony
};
