const fs = require("node:fs");
const path = require("node:path");
const { atomicWriteJson } = require("./atomic-write");
const { createDatabase, migrateDatabase } = require("./database-migrations");

class StatsDatabase {
  constructor(options = {}) {
    this.filePath = options.filePath;
    this.backupDirectory = options.backupDirectory;
    const configuredLimit = Number(options.maxBackups);
    this.maxBackups = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 100;
    if (!this.filePath) throw new Error("StatsDatabase requer filePath.");
  }

  ensure() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) atomicWriteJson(this.filePath, createDatabase());
    const current = this.readRaw();
    const migrated = migrateDatabase(current);
    if (Number(current.version || 0) !== migrated.version) {
      this.backup("pre-migration");
      atomicWriteJson(this.filePath, migrated);
    }
    return migrated;
  }

  read() {
    return migrateDatabase(this.readRaw());
  }

  write(database, options = {}) {
    const migrated = migrateDatabase(database);
    migrated.updatedAt = options.preserveUpdatedAt ? migrated.updatedAt : new Date().toISOString();
    JSON.parse(JSON.stringify(migrated));
    this.backup(options.reason || "pre-write");
    atomicWriteJson(this.filePath, migrated);
    return migrated;
  }

  backup(reason = "backup") {
    if (!this.backupDirectory || !fs.existsSync(this.filePath)) return "";
    fs.mkdirSync(this.backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeReason = String(reason).replace(/[^a-z0-9_-]+/gi, "-");
    const target = path.join(this.backupDirectory, `stats-db-${stamp}-${safeReason}.json`);
    fs.copyFileSync(this.filePath, target);
    this.pruneBackups();
    return target;
  }

  pruneBackups() {
    if (!this.backupDirectory || !fs.existsSync(this.backupDirectory)) return [];
    const backups = fs.readdirSync(this.backupDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^stats-db-.*\.json$/i.test(entry.name))
      .map((entry) => {
        const filePath = path.join(this.backupDirectory, entry.name);
        return { filePath, name: entry.name, modifiedAt: fs.statSync(filePath).mtimeMs };
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name));
    const removed = backups.slice(this.maxBackups);
    removed.forEach((backup) => fs.rmSync(backup.filePath, { force: true }));
    return removed.map((backup) => backup.filePath);
  }

  readRaw() {
    if (!fs.existsSync(this.filePath)) return createDatabase();
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : createDatabase();
  }
}

module.exports = { StatsDatabase };
