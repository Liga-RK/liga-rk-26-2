PRAGMA foreign_keys = ON;

ALTER TABLE fantasy_asset_round_scores
  ADD COLUMN formula_version TEXT NOT NULL DEFAULT 'stats-only-v1';
ALTER TABLE fantasy_asset_round_scores
  ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE fantasy_asset_round_scores
  ADD COLUMN processed_at TEXT;

ALTER TABLE fantasy_market
  ADD COLUMN last_score_breakdown_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE fantasy_market
  ADD COLUMN last_valuation_breakdown_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE fantasy_market_snapshots
  ADD COLUMN breakdown_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS fantasy_round_processing (
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  formula_version TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scores_saved', 'completed', 'failed')),
  score_items INTEGER NOT NULL DEFAULT 0,
  price_items INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, formula_version)
);

CREATE INDEX IF NOT EXISTS idx_asset_scores_history_v2
  ON fantasy_asset_round_scores(division, asset_id, games, round_id);

UPDATE fantasy_formula_settings
SET version = 'fantasy-v2',
    settings_json = '{
      "scoreMinimum":-10,
      "scoreMaximum":50,
      "captainMultiplier":1.5,
      "expectedPointsPerPrice":0.9,
      "priceDeltaDivisor":7,
      "priceDeltaMinimum":-2,
      "priceDeltaMaximum":2,
      "priceMinimum":4,
      "priceMaximum":30,
      "historyRounds":3,
      "didNotPlay":"hold"
    }',
    updated_by = 'migration-0006',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'global';
