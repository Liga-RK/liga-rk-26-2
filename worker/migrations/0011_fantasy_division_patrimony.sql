PRAGMA foreign_keys = ON;

-- Recalcula as escalações completas da Rodada 2 que receberam pontuação, mas
-- foram marcadas incorretamente como sem escalação válida por causa do formato
-- do timestamp salvo pelo SQLite.
CREATE TABLE fantasy_patrimony_recalc_0011 (
  user_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  division TEXT NOT NULL,
  lineup_id TEXT NOT NULL,
  purchases_cents INTEGER NOT NULL,
  updated_assets_cents INTEGER NOT NULL,
  variation_cents INTEGER NOT NULL,
  PRIMARY KEY (user_id, round_id)
);

INSERT INTO fantasy_patrimony_recalc_0011
  (user_id, round_id, division, lineup_id, purchases_cents,
   updated_assets_cents, variation_cents)
WITH valid_lineups AS (
  SELECT h.user_id, h.round_id, h.division, l.id AS lineup_id
  FROM fantasy_patrimony_history h
  JOIN fantasy_rounds r ON r.id = h.round_id
  JOIN fantasy_teams ft ON ft.user_id = h.user_id AND ft.division = h.division
  JOIN fantasy_lineups l ON l.fantasy_team_id = ft.id AND l.round_id = h.round_id
  JOIN fantasy_team_round_scores s
    ON s.fantasy_team_id = ft.id AND s.round_id = h.round_id
  WHERE r.round_number = 2
    AND h.status = 'NO_VALID_LINEUP'
    AND datetime(l.updated_at) <= datetime(r.locks_at)
    AND (SELECT COUNT(*) FROM fantasy_lineup_picks p WHERE p.lineup_id = l.id) = 6
    AND (SELECT COUNT(DISTINCT p.role) FROM fantasy_lineup_picks p WHERE p.lineup_id = l.id) = 6
),
owned_assets AS (
  SELECT v.user_id, v.round_id, v.division, v.lineup_id,
         p.asset_id, ROUND(p.price_paid * 100) AS paid_cents
  FROM valid_lineups v
  JOIN fantasy_lineup_picks p ON p.lineup_id = v.lineup_id
  UNION ALL
  SELECT v.user_id, v.round_id, v.division, v.lineup_id,
         x.asset_id, ROUND(x.price_paid * 100) AS paid_cents
  FROM valid_lineups v
  JOIN fantasy_lineup_reserves x ON x.lineup_id = v.lineup_id
),
valued_assets AS (
  SELECT o.*,
         COALESCE((
           SELECT ph.price_after_cents
           FROM fantasy_price_history ph
           WHERE ph.round_id = o.round_id
             AND ph.asset_id = o.asset_id
             AND ph.review_status <> 'rolled_back'
           ORDER BY ph.processed_at DESC, ph.id DESC
           LIMIT 1
         ), o.paid_cents) AS updated_cents
  FROM owned_assets o
)
SELECT user_id, round_id, division, lineup_id,
       SUM(paid_cents), SUM(updated_cents), SUM(updated_cents - paid_cents)
FROM valued_assets
GROUP BY user_id, round_id, division, lineup_id;

UPDATE fantasy_patrimony_history
SET lineup_id = (
      SELECT x.lineup_id FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    previous_cents = 10000,
    purchases_cents = (
      SELECT x.purchases_cents FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    available_balance_cents = 10000 - (
      SELECT x.purchases_cents FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    previous_assets_cents = (
      SELECT x.purchases_cents FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    updated_assets_cents = (
      SELECT x.updated_assets_cents FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    variation_cents = (
      SELECT x.variation_cents FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    new_cents = 10000 + (
      SELECT x.variation_cents FROM fantasy_patrimony_recalc_0011 x
      WHERE x.user_id = fantasy_patrimony_history.user_id
        AND x.round_id = fantasy_patrimony_history.round_id
    ),
    consistency_difference_cents = 0,
    status = 'PUBLISHED',
    processed_by = 'migration-0011-division-patrimony'
WHERE status = 'NO_VALID_LINEUP'
  AND EXISTS (
    SELECT 1 FROM fantasy_patrimony_recalc_0011 x
    WHERE x.user_id = fantasy_patrimony_history.user_id
      AND x.round_id = fantasy_patrimony_history.round_id
  );

-- Cada divisão passa a ter sua própria carteira e sua própria chave.
CREATE TABLE fantasy_participant_patrimony_by_division (
  user_id TEXT NOT NULL REFERENCES fantasy_users(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  current_cents INTEGER NOT NULL,
  formula_version TEXT NOT NULL DEFAULT 'v2-dynamic-assets',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, division)
);

INSERT INTO fantasy_participant_patrimony_by_division
  (user_id, division, current_cents, formula_version, created_at, updated_at)
SELECT u.id, d.division,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM fantasy_patrimony_history h
           WHERE h.user_id = u.id AND h.division = d.division
             AND h.status IN ('PUBLISHED','INCONSISTENT','NO_VALID_LINEUP')
         ) THEN 10000 + COALESCE((
           SELECT SUM(CASE
             WHEN h.status IN ('PUBLISHED','INCONSISTENT') THEN h.variation_cents
             ELSE 0
           END)
           FROM fantasy_patrimony_history h
           WHERE h.user_id = u.id AND h.division = d.division
         ), 0)
         ELSE COALESCE((
           SELECT w.final_cents
           FROM fantasy_wealth_snapshots w
           JOIN fantasy_teams ft ON ft.id = w.fantasy_team_id
           JOIN fantasy_rounds r ON r.id = w.round_id
           WHERE ft.user_id = u.id AND ft.division = d.division
             AND w.final_cents IS NOT NULL
           ORDER BY r.round_number DESC, w.created_at DESC
           LIMIT 1
         ), 10000)
       END,
       'v2-dynamic-assets',
       COALESCE((SELECT MIN(created_at) FROM fantasy_participant_patrimony p WHERE p.user_id = u.id), CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
FROM fantasy_users u
CROSS JOIN (
  SELECT 'elite' AS division
  UNION ALL SELECT 'ascension'
) d;

DROP TABLE fantasy_participant_patrimony;
ALTER TABLE fantasy_participant_patrimony_by_division
  RENAME TO fantasy_participant_patrimony;
CREATE INDEX idx_fantasy_participant_patrimony_division
  ON fantasy_participant_patrimony(division, current_cents DESC);

DROP TABLE fantasy_patrimony_recalc_0011;
PRAGMA optimize;
