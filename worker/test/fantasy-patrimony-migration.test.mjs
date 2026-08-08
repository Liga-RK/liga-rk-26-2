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

sqliteTest("migração preserva patrimônios válidos e cria uma carteira por divisão", () => {
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
      ('below','d1','Abaixo'),('above','d2','Acima'),('new','d3','Novo'),
      ('dual','d4','Duas divisões'),('skipped','d5','Ignorado incorretamente');
    INSERT INTO fantasy_rounds(id,division,round_number,name,opens_at,locks_at,status) VALUES
      ('elite-r1','elite',1,'R1','2026-01-01','2026-01-02','scored'),
      ('asc-r1','ascension',1,'R1','2026-01-01','2026-01-02','scored'),
      ('elite-r2','elite',2,'R2','2026-02-01','2026-02-02','scored');
    INSERT INTO fantasy_teams(id,user_id,division,name) VALUES
      ('below-team','below','elite','Abaixo'),
      ('above-team','above','elite','Acima'),
      ('dual-elite','dual','elite','Dual Elite'),
      ('dual-asc','dual','ascension','Dual Asc'),
      ('skipped-team','skipped','elite','Ignorado');
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
  database.exec(fs.readFileSync(path.join(ROOT, "migrations", "0009_fantasy_user_notices.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(ROOT, "migrations", "0010_fantasy_shared_round_patrimony.sql"), "utf8"));
  database.exec(`
    INSERT INTO fantasy_price_simulations(
      id,round_id,source_hash,formula_version,settings_json,items_json,status,created_by
    ) VALUES('sim-elite-r2','elite-r2','hash-r2','fantasy-v3-dynamic','{}','[]','applied','test');
    INSERT INTO fantasy_lineups(
      id,fantasy_team_id,round_id,captain_asset_id,total_cost,submitted_at,updated_at
    ) VALUES('skipped-lineup','skipped-team','elite-r2','asset-top',60,'2026-02-01 12:00:00','2026-02-01 12:00:00');
    INSERT INTO fantasy_lineup_picks(lineup_id,role,asset_id,price_paid,team_slot) VALUES
      ('skipped-lineup','TOP','asset-top',10,'A1'),
      ('skipped-lineup','JG','asset-jg',10,'A1'),
      ('skipped-lineup','MID','asset-mid',10,'A1'),
      ('skipped-lineup','ADC','asset-adc',10,'A1'),
      ('skipped-lineup','SUP','asset-sup',10,'A1'),
      ('skipped-lineup','TEAM','asset-team',10,'A1');
    INSERT INTO fantasy_team_round_scores(fantasy_team_id,round_id,points,breakdown_json)
      VALUES('skipped-team','elite-r2',199.63,'[]');
    INSERT INTO fantasy_patrimony_history(
      id,simulation_id,user_id,round_id,division,lineup_id,previous_cents,
      purchases_cents,available_balance_cents,previous_assets_cents,
      updated_assets_cents,variation_cents,new_cents,status,
      asset_details_json,formula_version,processed_by
    ) VALUES(
      'history-skipped','sim-elite-r2','skipped','elite-r2','elite','skipped-lineup',
      10000,0,10000,0,0,0,10000,'NO_VALID_LINEUP','[]','v2-dynamic-assets','test'
    );
    INSERT INTO fantasy_price_history(
      id,simulation_id,round_id,division,asset_id,asset_type,formula_version,
      price_before_cents,price_after_cents,delta_cents,review_status,details_json,processed_by
    ) VALUES
      ('ph-top','sim-elite-r2','elite-r2','elite','asset-top','player','fantasy-v3-dynamic',1000,1100,100,'ok','{}','test'),
      ('ph-jg','sim-elite-r2','elite-r2','elite','asset-jg','player','fantasy-v3-dynamic',1000,1100,100,'ok','{}','test'),
      ('ph-mid','sim-elite-r2','elite-r2','elite','asset-mid','player','fantasy-v3-dynamic',1000,1100,100,'ok','{}','test'),
      ('ph-adc','sim-elite-r2','elite-r2','elite','asset-adc','player','fantasy-v3-dynamic',1000,1100,100,'ok','{}','test'),
      ('ph-sup','sim-elite-r2','elite-r2','elite','asset-sup','player','fantasy-v3-dynamic',1000,1100,100,'ok','{}','test'),
      ('ph-team','sim-elite-r2','elite-r2','elite','asset-team','team','fantasy-v3-dynamic',1000,1100,100,'ok','{}','test');
  `);
  database.exec(fs.readFileSync(path.join(ROOT, "migrations", "0011_fantasy_division_patrimony.sql"), "utf8"));

  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='below' AND division='elite'").get().current_cents, 8740);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='above' AND division='elite'").get().current_cents, 12480);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='new' AND division='ascension'").get().current_cents, 10000);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_participant_patrimony WHERE user_id='dual'").get().count, 2);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='dual' AND division='elite'").get().current_cents, 10640);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='dual' AND division='ascension'").get().current_cents, 10640);
  assert.equal(database.prepare("SELECT current_cents FROM fantasy_participant_patrimony WHERE user_id='skipped' AND division='elite'").get().current_cents, 10600);
  assert.deepEqual({ ...database.prepare(`
    SELECT status, purchases_cents AS purchasesCents,
           variation_cents AS variationCents, new_cents AS newCents
    FROM fantasy_patrimony_history WHERE id='history-skipped'
  `).get() }, {
    status: "PUBLISHED",
    purchasesCents: 6000,
    variationCents: 600,
    newCents: 10600
  });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_wealth_snapshots").get().count, 4);
  assert.deepEqual(database.prepare("SELECT COUNT(*) AS assets,SUM(price_cents) AS prices,SUM(previous_price_cents) AS previousPrices FROM fantasy_market").get(), marketBefore);
});

test("migration only recovers lineups saved before market lock", () => {
  const migration = fs.readFileSync(path.join(ROOT, "migrations", "0011_fantasy_division_patrimony.sql"), "utf8");
  assert.match(migration, /datetime\(l\.updated_at\) <= datetime\(r\.locks_at\)/);
});

sqliteTest("regra da Rodada 3 remove só o reserva excedente e reseta titulares inválidos", () => {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_initial.sql",
    "0002_production_model.sql",
    "0003_github_pages_auth.sql",
    "0004_lineup_reserves.sql",
    "0005_admin_global_market.sql",
    "0006_fantasy_formula_v2.sql",
    "0007_fantasy_dynamic_valuation.sql",
    "0008_fantasy_dynamic_patrimony.sql",
    "0009_fantasy_user_notices.sql",
    "0010_fantasy_shared_round_patrimony.sql",
    "0011_fantasy_division_patrimony.sql",
    "0012_fantasy_market_access_mode.sql"
  ]) database.exec(fs.readFileSync(path.join(ROOT, "migrations", file), "utf8"));

  database.exec(`
    INSERT INTO fantasy_users(id,discord_id,username) VALUES
      ('reserve-user','r1','Reserva'),('invalid-user','r2','Inválido');
    INSERT INTO fantasy_rounds(id,division,round_number,name,opens_at,locks_at,status)
      VALUES('elite-r3','elite',3,'R3','2026-08-05','2026-08-08','open');
    INSERT INTO fantasy_teams(id,user_id,division,name) VALUES
      ('reserve-team','reserve-user','elite','Reserva'),
      ('invalid-team','invalid-user','elite','Inválido');
    INSERT INTO fantasy_participant_patrimony(user_id,division,current_cents) VALUES
      ('reserve-user','elite',10473),('invalid-user','elite',10000);
    INSERT INTO fantasy_lineups(id,fantasy_team_id,round_id,captain_asset_id,total_cost) VALUES
      ('reserve-lineup','reserve-team','elite-r3','p1',101.85),
      ('invalid-lineup','invalid-team','elite-r3','q1',105.00);
    INSERT INTO fantasy_lineup_picks(lineup_id,role,asset_id,price_paid,team_slot) VALUES
      ('reserve-lineup','TOP','p1',16.25,'A1'),
      ('reserve-lineup','JG','p2',19.00,'A2'),
      ('reserve-lineup','MID','p3',19.65,'A3'),
      ('reserve-lineup','ADC','p4',16.95,'A4'),
      ('reserve-lineup','SUP','p5',15.00,'B1'),
      ('reserve-lineup','TEAM','pt',15.00,'B2'),
      ('invalid-lineup','TOP','q1',20.00,'A1'),
      ('invalid-lineup','JG','q2',20.00,'A2'),
      ('invalid-lineup','MID','q3',20.00,'A3'),
      ('invalid-lineup','ADC','q4',15.00,'A4'),
      ('invalid-lineup','SUP','q5',15.00,'B1'),
      ('invalid-lineup','TEAM','qt',15.00,'B2');
    INSERT INTO fantasy_lineup_reserves(lineup_id,role,asset_id,price_paid,team_slot)
      VALUES('reserve-lineup','TOP','reserve',15.88,'C1');
  `);

  database.exec(fs.readFileSync(path.join(ROOT, "migrations", "0013_fantasy_round3_reserve_budget.sql"), "utf8"));

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_lineups WHERE id='reserve-lineup'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_lineup_picks WHERE lineup_id='reserve-lineup'").get().count, 6);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_lineup_reserves WHERE lineup_id='reserve-lineup'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fantasy_lineups WHERE id='invalid-lineup'").get().count, 0);
  assert.deepEqual(
    database.prepare("SELECT repair_type FROM fantasy_lineup_budget_repairs ORDER BY repair_type").all().map((row) => row.repair_type),
    ["lineup_removed", "reserve_removed"]
  );
});
