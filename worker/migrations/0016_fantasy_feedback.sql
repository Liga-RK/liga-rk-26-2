PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('suggestion', 'question', 'complaint', 'bug')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  division TEXT CHECK (division IS NULL OR division IN ('elite', 'ascension')),
  round_number INTEGER,
  page_view TEXT NOT NULL DEFAULT 'market',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_fantasy_feedback_status_created
  ON fantasy_feedback(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fantasy_feedback_user_created
  ON fantasy_feedback(user_id, created_at DESC);
