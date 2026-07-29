PRAGMA foreign_keys = ON;

-- O mercado é um estado global. As duas divisões consultam sempre esta linha.
CREATE TABLE IF NOT EXISTS fantasy_market_state (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  opened_at TEXT,
  closes_at TEXT,
  closed_at TEXT,
  opened_by TEXT,
  closed_by TEXT,
  close_reason TEXT,
  lock_match_id TEXT,
  lock_division TEXT CHECK (lock_division IS NULL OR lock_division IN ('elite', 'ascension')),
  lock_round_number INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fantasy_market_state (
  id, status, close_reason, version
) VALUES (
  'global', 'closed', 'Migração segura: reabertura somente manual', 1
);

CREATE TABLE IF NOT EXISTS fantasy_official_teams (
  id TEXT PRIMARY KEY,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  logo TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  source_hash TEXT NOT NULL,
  source_payload_json TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (division, slot)
);

CREATE TABLE IF NOT EXISTS fantasy_official_players (
  id TEXT PRIMARY KEY,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  team_id TEXT REFERENCES fantasy_official_teams(id),
  team_slot TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  riot_id TEXT NOT NULL DEFAULT '',
  opgg TEXT NOT NULL DEFAULT '',
  roster_status TEXT NOT NULL DEFAULT 'active'
    CHECK (roster_status IN ('starter', 'reserve', 'active', 'inactive')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  source_hash TEXT NOT NULL,
  source_payload_json TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_official_players_filters
  ON fantasy_official_players(division, team_slot, role, active);

CREATE TABLE IF NOT EXISTS fantasy_matches (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  round_id TEXT REFERENCES fantasy_rounds(id),
  round_number INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  home_team_id TEXT,
  away_team_id TEXT,
  home_team_slot TEXT NOT NULL DEFAULT '',
  away_team_slot TEXT NOT NULL DEFAULT '',
  home_team_name TEXT NOT NULL DEFAULT '',
  away_team_name TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'completed', 'postponed', 'cancelled')),
  home_score INTEGER,
  away_score INTEGER,
  winner_team_id TEXT,
  schedule_issue TEXT NOT NULL DEFAULT '',
  source_hash TEXT NOT NULL,
  source_payload_json TEXT NOT NULL DEFAULT '{}',
  manual_override_json TEXT,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (division, source_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_round_schedule
  ON fantasy_matches(round_number, division, starts_at);

CREATE TABLE IF NOT EXISTS fantasy_sync_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preview', 'apply')),
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'applied', 'failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  changes_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_created
  ON fantasy_sync_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS fantasy_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  csrf_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON fantasy_admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS fantasy_admin_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT,
  last_failed_at TEXT,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fantasy_error_log (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  actor TEXT,
  error_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_error_log_created
  ON fantasy_error_log(created_at DESC);

CREATE TABLE IF NOT EXISTS fantasy_formula_settings (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  version TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fantasy_formula_settings (
  id,
  version,
  settings_json,
  updated_by
) VALUES (
  'global',
  'rk-value-v2',
  '{"roundWeight":0.55,"averageWeight":0.25,"recentWeight":0.20,"expectationBase":3.0,"expectationPerPrice":0.62,"volatility":0.34,"damping":0.85,"minimumPrice":4.0,"minimumGames":3,"decimals":2,"didNotPlay":"hold"}',
  'system'
);

CREATE TABLE IF NOT EXISTS fantasy_price_simulations (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES fantasy_rounds(id),
  source_hash TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'applied', 'cancelled', 'failed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  cancelled_at TEXT,
  UNIQUE (round_id, source_hash, formula_version)
);

CREATE INDEX IF NOT EXISTS idx_price_simulations_created
  ON fantasy_price_simulations(created_at DESC);

CREATE TABLE IF NOT EXISTS fantasy_backups (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fantasy_backups_created
  ON fantasy_backups(created_at DESC);

ALTER TABLE fantasy_users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1));
ALTER TABLE fantasy_users ADD COLUMN blocked_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE fantasy_market ADD COLUMN official_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE fantasy_market ADD COLUMN is_starter INTEGER NOT NULL DEFAULT 1 CHECK (is_starter IN (0, 1));
ALTER TABLE fantasy_market ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE fantasy_market ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1));

ALTER TABLE fantasy_audit_log ADD COLUMN actor_admin_username TEXT;
ALTER TABLE fantasy_audit_log ADD COLUMN before_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE fantasy_audit_log ADD COLUMN after_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE fantasy_audit_log ADD COLUMN result TEXT NOT NULL DEFAULT 'success';
ALTER TABLE fantasy_audit_log ADD COLUMN error_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE fantasy_audit_log ADD COLUMN request_id TEXT;
