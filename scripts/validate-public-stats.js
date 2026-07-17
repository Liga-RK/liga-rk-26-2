const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { assertPublicPayloadSafe } = require("../src/statistics/public-payload");

const root = path.resolve(__dirname, "..");
const filePath = path.join(root, "assets", "stats-content.js");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: filePath });
const payload = sandbox.window.LIGA_RK_STATS;
if (!payload || payload.version !== 2 || !payload.divisions) {
  throw new Error("stats-content.js nao possui o schema publico v2.");
}
assertPublicPayloadSafe(payload);
console.log("Payload publico v2 valido e sanitizado.");
