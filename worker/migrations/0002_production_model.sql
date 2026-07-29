PRAGMA foreign_keys = ON;

ALTER TABLE fantasy_rounds ADD COLUMN formula_version TEXT NOT NULL DEFAULT 'fantasy-score-v1';
ALTER TABLE fantasy_rounds ADD COLUMN source_hash TEXT;
ALTER TABLE fantasy_rounds ADD COLUMN processed_at TEXT;

ALTER TABLE fantasy_market ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 1000 CHECK (price_cents >= 400);
ALTER TABLE fantasy_market ADD COLUMN previous_price_cents INTEGER NOT NULL DEFAULT 1000 CHECK (previous_price_cents >= 400);

CREATE TABLE IF NOT EXISTS fantasy_asset_round_scores (
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  asset_id TEXT NOT NULL,
  role TEXT NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  points REAL NOT NULL DEFAULT 0,
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, asset_id)
);

CREATE TABLE IF NOT EXISTS fantasy_team_round_scores (
  fantasy_team_id TEXT NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  points REAL NOT NULL,
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fantasy_team_id, round_id)
);

CREATE TABLE IF NOT EXISTS fantasy_private_leagues (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fantasy_private_league_members (
  league_id TEXT NOT NULL REFERENCES fantasy_private_leagues(id) ON DELETE CASCADE,
  fantasy_team_id TEXT NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, fantasy_team_id)
);

CREATE TABLE IF NOT EXISTS fantasy_round_matches (
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  match_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (division, match_id),
  UNIQUE (round_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_round_matches_round ON fantasy_round_matches(round_id);

CREATE TABLE IF NOT EXISTS fantasy_market_snapshots (
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  asset_id TEXT NOT NULL,
  price_before_cents INTEGER NOT NULL CHECK (price_before_cents >= 400),
  price_after_cents INTEGER CHECK (price_after_cents >= 400),
  formula_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, asset_id)
);

CREATE TABLE IF NOT EXISTS fantasy_wealth_snapshots (
  fantasy_team_id TEXT NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  initial_cents INTEGER NOT NULL,
  purchases_cents INTEGER NOT NULL,
  cash_cents INTEGER NOT NULL,
  final_cents INTEGER,
  formula_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fantasy_team_id, round_id)
);

CREATE TABLE IF NOT EXISTS fantasy_asset_map_scores (
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  match_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('player', 'team')),
  points_milli INTEGER NOT NULL,
  breakdown_json TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  PRIMARY KEY (round_id, match_id, asset_id)
);

CREATE TABLE IF NOT EXISTS fantasy_imports (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id),
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  source_hash TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  match_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'confirmed', 'failed')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, source_hash, formula_version)
);
