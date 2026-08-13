PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_draft_pick_rate_snapshots (
  round_id TEXT PRIMARY KEY REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  generated_from_rounds_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  totals_json TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  position_pick_rates_json TEXT NOT NULL,
  unknown_champions_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_fantasy_draft_snapshot_division
  ON fantasy_draft_pick_rate_snapshots(division, generated_at DESC);

CREATE TABLE IF NOT EXISTS fantasy_lineup_draft_predictions (
  lineup_id TEXT NOT NULL REFERENCES fantasy_lineups(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('TOP', 'JG', 'MID', 'ADC', 'SUP')),
  player_asset_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('NONE', 'SIMPLE', 'PRECISE')),
  champion_id TEXT,
  map_number INTEGER CHECK (map_number IS NULL OR map_number BETWEEN 1 AND 5),
  pick_rate_position TEXT NOT NULL CHECK (pick_rate_position IN ('TOP', 'JG', 'MID', 'ADC', 'SUP')),
  pick_rate_at_lock REAL,
  multiplier_at_lock REAL,
  base_reward REAL NOT NULL DEFAULT 0,
  possible_reward REAL NOT NULL DEFAULT 0,
  miss_penalty REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('NONE', 'PENDING', 'HIT', 'MISS', 'VOID')),
  result_score REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lineup_id, role)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_draft_predictions_player
  ON fantasy_lineup_draft_predictions(player_asset_id, status);

PRAGMA optimize;
