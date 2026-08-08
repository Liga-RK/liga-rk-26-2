PRAGMA foreign_keys = ON;

ALTER TABLE fantasy_market_state
  ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'public'
  CHECK (access_mode IN ('public', 'admin'));

PRAGMA optimize;
