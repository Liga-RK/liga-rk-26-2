const fs = require("node:fs");
const path = require("node:path");

function atomicWriteFile(filePath, content, encoding = "utf8") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, encoding);
    if (!fs.statSync(temporaryPath).size && String(content).length) {
      throw new Error(`Falha ao validar a escrita temporaria de ${filePath}.`);
    }
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    } catch (_) {
      // The original write error is more useful.
    }
    throw error;
  }
}

function atomicWriteJson(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  JSON.parse(serialized);
  atomicWriteFile(filePath, serialized, "utf8");
}

module.exports = { atomicWriteFile, atomicWriteJson };
