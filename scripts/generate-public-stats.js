const path = require("node:path");
const { loadOfficialContent, loadWindowScript } = require("../src/content/official-content");
const { aggregateDatabase } = require("../src/statistics/aggregators");
const { hydrateRosterIdentities } = require("../src/statistics/roster-identities");
const { assertPublicPayloadSafe, createPublicPayload } = require("../src/statistics/public-payload");
const { StatsDatabase } = require("../src/storage/stats-database");
const { atomicWriteFile } = require("../src/storage/atomic-write");

async function main() {
  const root = path.resolve(__dirname, "..");
  const store = new StatsDatabase({
    filePath: path.join(root, "data", "stats-db.json"),
    backupDirectory: path.join(root, "backups", "stats-db")
  });
  const database = store.ensure();
  const fixedData = loadWindowScript(path.join(root, "assets", "data.js"), "LIGA_RK_DATA");
  const official = await loadOfficialContent({ root });
  const hydrated = hydrateRosterIdentities(official.content, database);
  if (hydrated.changed) store.write(database, { reason: "roster-identities" });
  const computed = aggregateDatabase(database, hydrated.content, fixedData);
  const payload = createPublicPayload(computed);
  assertPublicPayloadSafe(payload);
  atomicWriteFile(path.join(root, "assets", "stats-content.js"), `window.LIGA_RK_STATS = ${JSON.stringify(payload, null, 2)};\n`);
  console.log(`Estatisticas publicas geradas com conteudo ${official.source}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
