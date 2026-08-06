PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_participant_patrimony (
  user_id TEXT PRIMARY KEY REFERENCES fantasy_users(id) ON DELETE CASCADE,
  current_cents INTEGER NOT NULL,
  formula_version TEXT NOT NULL DEFAULT 'v2-dynamic-assets',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fantasy_participant_patrimony
  (user_id, current_cents, formula_version)
SELECT
  u.id,
  COALESCE((
    SELECT w.final_cents
    FROM fantasy_wealth_snapshots w
    JOIN fantasy_teams ft ON ft.id = w.fantasy_team_id
    JOIN fantasy_rounds r ON r.id = w.round_id
    WHERE ft.user_id = u.id AND w.final_cents IS NOT NULL
    ORDER BY r.round_number DESC, w.created_at DESC
    LIMIT 1
  ), 10000),
  'v2-dynamic-assets'
FROM fantasy_users u;

CREATE TABLE IF NOT EXISTS fantasy_patrimony_history (
  id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES fantasy_price_simulations(id),
  user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id),
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  lineup_id TEXT REFERENCES fantasy_lineups(id) ON DELETE SET NULL,
  previous_cents INTEGER NOT NULL,
  purchases_cents INTEGER NOT NULL,
  available_balance_cents INTEGER NOT NULL,
  previous_assets_cents INTEGER NOT NULL,
  updated_assets_cents INTEGER NOT NULL,
  variation_cents INTEGER NOT NULL,
  new_cents INTEGER NOT NULL,
  consistency_difference_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('PUBLISHED', 'NO_VALID_LINEUP', 'INCONSISTENT', 'ROLLED_BACK')),
  asset_details_json TEXT NOT NULL DEFAULT '[]',
  formula_version TEXT NOT NULL,
  processed_by TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rolled_back_by TEXT,
  rolled_back_at TEXT,
  rollback_reason TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_patrimony_active_round
  ON fantasy_patrimony_history(user_id, round_id)
  WHERE status IN ('PUBLISHED', 'INCONSISTENT', 'NO_VALID_LINEUP');
CREATE INDEX IF NOT EXISTS idx_fantasy_patrimony_history_user
  ON fantasy_patrimony_history(user_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fantasy_patrimony_history_simulation
  ON fantasy_patrimony_history(simulation_id, processed_at DESC);
