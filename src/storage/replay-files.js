const fs = require("node:fs");
const path = require("node:path");

function resolveStoredReplay(rootDirectory, replayDirectory, storagePath) {
  const root = path.resolve(rootDirectory);
  const allowedRoot = path.resolve(replayDirectory);
  const candidate = path.resolve(root, String(storagePath || ""));
  const relative = path.relative(allowedRoot, candidate);
  const insideReplayDirectory = Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);

  if (!insideReplayDirectory || path.extname(candidate).toLowerCase() !== ".rofl") {
    return "";
  }

  return candidate;
}

function deleteStoredReplay(options = {}) {
  const target = resolveStoredReplay(options.rootDirectory, options.replayDirectory, options.storagePath);
  if (!target) return { deleted: false, reason: "invalid-path" };
  if (!fs.existsSync(target)) return { deleted: false, reason: "missing", path: target };

  fs.rmSync(target, { force: true });
  return { deleted: true, reason: "deleted", path: target };
}

module.exports = { deleteStoredReplay, resolveStoredReplay };
