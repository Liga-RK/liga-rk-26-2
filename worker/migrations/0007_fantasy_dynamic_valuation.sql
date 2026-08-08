PRAGMA foreign_keys = ON;

UPDATE fantasy_formula_settings
SET version = 'fantasy-v3-dynamic',
    settings_json = '{"expectedPriceMultiplier":1.6,"expectedPriceOffset":-8,"oneHistoryCurrentWeight":0.75,"oneHistoryPreviousWeight":0.25,"experiencedCurrentWeight":0.65,"experiencedRecentWeight":0.25,"experiencedSeasonWeight":0.10,"recentRounds":3,"variationDivisor":10,"variationExponent":0.90,"positiveFactorNumerator":14,"positiveFactorOffset":4,"negativeFactorBase":0.75,"negativeFactorPriceDivisor":40,"lowParticipationThreshold":0.34,"lowParticipationFactor":0.70,"partialParticipationFactor":0.90,"fullParticipationFactor":1,"minimumPrice":4,"reviewThreshold":7,"currencyDecimals":2,"didNotPlay":"hold"}',
    updated_by = 'migration-0007',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'global';

CREATE TABLE IF NOT EXISTS fantasy_price_history (
  id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES fantasy_price_simulations(id),
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id),
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('player', 'team')),
  formula_version TEXT NOT NULL,
  price_before_cents INTEGER NOT NULL CHECK (price_before_cents >= 400),
  price_after_cents INTEGER NOT NULL CHECK (price_after_cents >= 400),
  delta_cents INTEGER NOT NULL,
  points REAL NOT NULL DEFAULT 0,
  expected_points REAL,
  adjusted_performance REAL,
  difference REAL,
  participation_factor REAL NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
  review_status TEXT NOT NULL CHECK (review_status IN ('ok', 'approved', 'ignored', 'edited', 'rolled_back')),
  details_json TEXT NOT NULL DEFAULT '{}',
  processed_by TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rolled_back_by TEXT,
  rolled_back_at TEXT,
  rollback_reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_fantasy_price_history_asset
  ON fantasy_price_history(division, asset_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fantasy_price_history_round
  ON fantasy_price_history(round_id, simulation_id, processed_at DESC);

CREATE TABLE IF NOT EXISTS fantasy_valuation_rollbacks (
  id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES fantasy_price_simulations(id),
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id),
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  formula_version TEXT NOT NULL,
  restored_prices_json TEXT NOT NULL,
  restored_wealth_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fantasy_valuation_rollbacks_round
  ON fantasy_valuation_rollbacks(round_id, created_at DESC);
