PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_admins (
  discord_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fantasy_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES fantasy_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON fantasy_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS fantasy_login_codes (
  code_hash TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
