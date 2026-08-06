PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_user_notices (
  user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  notice_key TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notice_key)
);
