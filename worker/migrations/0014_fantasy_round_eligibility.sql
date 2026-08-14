ALTER TABLE fantasy_rounds
ADD COLUMN eligibility_json TEXT NOT NULL DEFAULT '{}';
