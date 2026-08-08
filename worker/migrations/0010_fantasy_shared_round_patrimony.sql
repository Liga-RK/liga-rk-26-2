PRAGMA foreign_keys = ON;

-- A Rodada 2 foi a primeira rodada com patrimônio dinâmico. Elite e Ascensão
-- compartilham uma única carteira e, por isso, ambas devem partir dos mesmos
-- RK$ 100,00, sem encadear uma divisão dentro da outra.
UPDATE fantasy_patrimony_history
SET previous_cents = 10000,
    available_balance_cents = CASE
      WHEN status = 'NO_VALID_LINEUP' THEN 10000
      ELSE 10000 - purchases_cents
    END,
    new_cents = 10000 + variation_cents,
    consistency_difference_cents = CASE
      WHEN status = 'NO_VALID_LINEUP' THEN 0
      ELSE (10000 - purchases_cents + updated_assets_cents)
           - (10000 + variation_cents)
    END
WHERE round_id IN (
  SELECT id FROM fantasy_rounds WHERE round_number = 2
)
  AND status IN ('PUBLISHED','INCONSISTENT','NO_VALID_LINEUP');

-- Recompõe a carteira global a partir dos RK$ 100,00 iniciais, somando uma
-- única vez a contribuição válida de cada divisão e rodada já publicada.
UPDATE fantasy_participant_patrimony
SET current_cents = 10000 + COALESCE((
      SELECT SUM(CASE
        WHEN h.status IN ('PUBLISHED','INCONSISTENT') THEN h.variation_cents
        ELSE 0
      END)
      FROM fantasy_patrimony_history h
      WHERE h.user_id = fantasy_participant_patrimony.user_id
    ), 0),
    formula_version = 'v2-dynamic-assets',
    updated_at = CURRENT_TIMESTAMP;
