PRAGMA foreign_keys = ON;

-- Registra a correção antes de remover qualquer item. A Rodada 3 passa a
-- exigir que titulares e reserva caibam, juntos, no patrimônio da divisão.
CREATE TABLE IF NOT EXISTS fantasy_lineup_budget_repairs (
  id TEXT PRIMARY KEY,
  lineup_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  division TEXT NOT NULL CHECK (division IN ('elite', 'ascension')),
  round_number INTEGER NOT NULL,
  repair_type TEXT NOT NULL CHECK (repair_type IN ('reserve_removed', 'lineup_removed')),
  patrimony_cents INTEGER NOT NULL,
  starters_cents INTEGER NOT NULL,
  reserve_cents INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  repaired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_lineup_budget_repair_once
  ON fantasy_lineup_budget_repairs(lineup_id, round_number, repair_type);

INSERT OR IGNORE INTO fantasy_lineup_budget_repairs (
  id, lineup_id, user_id, division, round_number, repair_type,
  patrimony_cents, starters_cents, reserve_cents, reason
)
SELECT
  'round3-budget-' || l.id || '-' ||
    CASE WHEN SUM(COALESCE((
      SELECT m.price_cents FROM fantasy_market m
      WHERE m.division = ft.division AND m.asset_id = p.asset_id
    ), ROUND(p.price_paid * 100))) > w.current_cents
      THEN 'lineup' ELSE 'reserve' END,
  l.id,
  ft.user_id,
  ft.division,
  r.round_number,
  CASE WHEN SUM(COALESCE((
      SELECT m.price_cents FROM fantasy_market m
      WHERE m.division = ft.division AND m.asset_id = p.asset_id
    ), ROUND(p.price_paid * 100))) > w.current_cents
    THEN 'lineup_removed' ELSE 'reserve_removed' END,
  w.current_cents,
  SUM(COALESCE((
    SELECT m.price_cents FROM fantasy_market m
    WHERE m.division = ft.division AND m.asset_id = p.asset_id
  ), ROUND(p.price_paid * 100))),
  COALESCE((
    SELECT m.price_cents FROM fantasy_market m
    WHERE m.division = ft.division AND m.asset_id = x.asset_id
  ), ROUND(x.price_paid * 100), 0),
  'Migração 0013: aplicação da regra de saldo restante para o reserva na Rodada 3.'
FROM fantasy_lineups l
JOIN fantasy_teams ft ON ft.id = l.fantasy_team_id
JOIN fantasy_rounds r ON r.id = l.round_id
JOIN fantasy_participant_patrimony w
  ON w.user_id = ft.user_id AND w.division = ft.division
JOIN fantasy_lineup_picks p ON p.lineup_id = l.id
LEFT JOIN fantasy_lineup_reserves x ON x.lineup_id = l.id
WHERE r.round_number = 3
GROUP BY l.id, ft.user_id, ft.division, r.round_number,
         w.current_cents, x.price_paid
HAVING SUM(COALESCE((
         SELECT m.price_cents FROM fantasy_market m
         WHERE m.division = ft.division AND m.asset_id = p.asset_id
       ), ROUND(p.price_paid * 100))) > w.current_cents
   OR (
     x.lineup_id IS NOT NULL
     AND SUM(COALESCE((
           SELECT m.price_cents FROM fantasy_market m
           WHERE m.division = ft.division AND m.asset_id = p.asset_id
         ), ROUND(p.price_paid * 100)))
       + COALESCE((
           SELECT m.price_cents FROM fantasy_market m
           WHERE m.division = ft.division AND m.asset_id = x.asset_id
         ), ROUND(x.price_paid * 100), 0) > w.current_cents
   );

DELETE FROM fantasy_lineup_reserves
WHERE lineup_id IN (
  SELECT lineup_id
  FROM fantasy_lineup_budget_repairs
  WHERE round_number = 3 AND repair_type = 'reserve_removed'
);

DELETE FROM fantasy_lineups
WHERE id IN (
  SELECT lineup_id
  FROM fantasy_lineup_budget_repairs
  WHERE round_number = 3 AND repair_type = 'lineup_removed'
);

PRAGMA optimize;
