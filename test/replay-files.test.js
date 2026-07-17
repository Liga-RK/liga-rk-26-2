const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { deleteStoredReplay, resolveStoredReplay } = require("../src/storage/replay-files");

test("exclui somente replays dentro do diretorio autorizado", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "liga-rk-replay-"));
  const replayDirectory = path.join(root, "data", "replays");
  const replayPath = path.join(replayDirectory, "elite", "game.rofl");
  fs.mkdirSync(path.dirname(replayPath), { recursive: true });
  fs.writeFileSync(replayPath, "replay");

  const result = deleteStoredReplay({ rootDirectory: root, replayDirectory, storagePath: path.relative(root, replayPath) });
  assert.equal(result.deleted, true);
  assert.equal(fs.existsSync(replayPath), false);
});

test("recusa caminhos fora da pasta de replays", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "liga-rk-replay-safe-"));
  const replayDirectory = path.join(root, "data", "replays");
  const protectedPath = path.join(root, "protected.rofl");
  fs.mkdirSync(replayDirectory, { recursive: true });
  fs.writeFileSync(protectedPath, "keep");

  assert.equal(resolveStoredReplay(root, replayDirectory, path.relative(root, protectedPath)), "");
  const result = deleteStoredReplay({ rootDirectory: root, replayDirectory, storagePath: path.relative(root, protectedPath) });
  assert.equal(result.deleted, false);
  assert.equal(result.reason, "invalid-path");
  assert.equal(fs.existsSync(protectedPath), true);
});
