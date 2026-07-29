PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_users (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fantasy_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fantasy_sessions_user ON fantasy_sessions(user_id);

CREATE TABLE IF NOT EXISTS fantasy_rounds (
  id TEXT PRIMARY KEY,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  round_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  locks_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'open', 'locked', 'scored')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (division, round_number)
);

CREATE TABLE IF NOT EXISTS fantasy_market (
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('player', 'team')),
  role TEXT NOT NULL CHECK (role IN ('TOP', 'JG', 'MID', 'ADC', 'SUP', 'TEAM')),
  display_name TEXT NOT NULL,
  team_slot TEXT NOT NULL,
  team_name TEXT NOT NULL,
  team_tag TEXT NOT NULL,
  logo TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  previous_price REAL NOT NULL,
  average_points REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (division, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_market_division_role
  ON fantasy_market(division, role, active);

CREATE TABLE IF NOT EXISTS fantasy_teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, division)
);

CREATE TABLE IF NOT EXISTS fantasy_lineups (
  id TEXT PRIMARY KEY,
  fantasy_team_id TEXT NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  captain_asset_id TEXT NOT NULL,
  total_cost REAL NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fantasy_team_id, round_id)
);

CREATE TABLE IF NOT EXISTS fantasy_lineup_picks (
  lineup_id TEXT NOT NULL REFERENCES fantasy_lineups(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('TOP', 'JG', 'MID', 'ADC', 'SUP', 'TEAM')),
  asset_id TEXT NOT NULL,
  price_paid REAL NOT NULL,
  team_slot TEXT NOT NULL,
  PRIMARY KEY (lineup_id, role)
);
