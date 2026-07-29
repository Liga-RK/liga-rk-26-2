PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fantasy_lineup_reserves (
  lineup_id TEXT PRIMARY KEY REFERENCES fantasy_lineups(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('TOP', 'JG', 'MID', 'ADC', 'SUP')),
  asset_id TEXT NOT NULL,
  price_paid REAL NOT NULL,
  team_slot TEXT NOT NULL
);
