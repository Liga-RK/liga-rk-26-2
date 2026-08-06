import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  // A integração SQLite roda em Node 22+.
}
const sqliteTest = DatabaseSync ? test : test.skip;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

sqliteTest("migração preserva patrimônios válidos e cria uma única carteira por usuário", () => {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_initial.sql",
    "0002_production_model.sql",
    "0003_github_pages_auth.sql",
    "0004_lineup_reserves.sql",
    "0005_admin_global_market.sql",
    "0006_fantasy_formula_v2.sql",
    "0007_fantasy_dynamic_valuation.sql"
  ]) database.exec(fs.readFileSync(path.join(ROOT, "migrations", file), "utf8"));

  database.exec(`
    INSERT INTO fantasy_users(id,discord_id,username) VALUES
      ('below','d1','Abaixo'),('above','d2','Acima'),('new','d3','Novo'),('dual','d4','Duas divisões');
    INSERT INTO fantasy_rounds(id,division,round_number,name,opens_at,locks_at,status) VALUES
      ('elite-r1','elite',1,'R1','2026-01-01','2026-01-02','scored'),
      ('asc-r1','ascension',1,'R1','2026-01-01','2026-01-02','scored');
    INSERT INTO fantasy_teams(id,user_id,division,name) VALUES
      ('below-team','below','elite','Abaixo'),
      ('above-team','above','elite','Acima'),
      ('dual-elite','dual','elite','Dual Elite'),
      ('dual-asc','dual','ascension','Dual Asc');
    INSERT INTO fantasy_market(
      division,asset_id,asset_type,role,display_name,team_slot,team_name,team_tag,
      price,previous_price,price_cents,previous_price_cents
    ) VALUES
      ('elite','market-a','player','TOP','A','A1','A','A',12.34,11.11,1234,1111),
      ('ascension','market-b','team','TEAM','B','B1','B','B',9.87,9.50,987,950);
    INSERT INTO fantasy_wealth_snapshots(fantasy_team_id,round_id,initial_cents,purchases_cents,cash_cents,final_cents,formula_version) VALUES
      ('below-team','elite-r1',10000,9000,1000,8740,'legacy'),
      ('above-team','elite-r1',10000,9000,1000,12480,'legacy'),
      ('dual-elite','elite-r1',10000,9000,1000,10640,'legacy'),
      ('dual-asc','asc-r1',10000,9000,1000,10640,'legacy');
  `);
  const marketBefore = database.prepare("SELECT COUNT(*) AS assets,SUM(price_cents) AS prices,SUM(previous_price_cents) AS previousPrices FROM fantasy_market").get();
  database.exec(fs.readFileSync(path.join(ROOT, "migrations", "0008_fantasy_dynamic_patrimony.sql"), "utf8"));

  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='below'").get().current_cents, 8740);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='above'").get().current_cents, 12480);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='new'").get().current_cents, 10000);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_participant_patrimony WHERE user_id='dual'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_wealth_snapshots").get().count, 4);
  assert.deepEqual(database.prepare("SELECT COUNT(*) AS assets,SUM(price_cents) AS prices,SUM(previous_price_cents) AS previousPrices FROM fantasy_market").get(), marketBefore);
});
