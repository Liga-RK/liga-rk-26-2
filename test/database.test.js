const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { migrateDatabase } = require("../src/storage/database-migrations");
const { StatsDatabase } = require("../src/storage/stats-database");

test("migra banco v1 preservando jogos e propriedades desconhecidas", () => {
  const old = { version: 1, custom: "keep", divisions: { elite: { games: [{ id: "g1", legacy: true }], note: "keep" }, ascension: { games: [] } } };
  const migrated = migrateDatabase(old);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.custom, "keep");
  assert.equal(migrated.divisions.elite.note, "keep");
  assert.deepEqual(migrated.divisions.elite.games, old.divisions.elite.games);
});

test("escreve banco atomicamente e cria backup", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "liga-rk-db-"));
  const filePath = path.join(directory, "data", "stats-db.json");
  const database = new StatsDatabase({ filePath, backupDirectory: path.join(directory, "backups") });
  database.ensure();
  const value = database.read();
  value.divisions.elite.games.push({ id: "g1" });
  database.write(value, { reason: "test" });
  assert.equal(database.read().divisions.elite.games.length, 1);
  assert.ok(fs.readdirSync(path.join(directory, "backups")).length >= 1);
});

test("mantem somente a quantidade configurada de backups", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "liga-rk-db-retention-"));
  const filePath = path.join(directory, "data", "stats-db.json");
  const backupDirectory = path.join(directory, "backups");
  const database = new StatsDatabase({ filePath, backupDirectory, maxBackups: 3 });
  database.ensure();
  const value = database.read();
  for (let index = 0; index < 7; index += 1) {
    value.sequence = index;
    database.write(value, { reason: `retention-${index}` });
  }
  assert.equal(fs.readdirSync(backupDirectory).filter((name) => name.endsWith(".json")).length, 3);
});
