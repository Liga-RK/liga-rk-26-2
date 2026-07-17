const { parseRofl2 } = require("./rofl2-parser");
const { ERROR_CODES, replayError } = require("./replay-errors");

function parseReplay(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    throw replayError(ERROR_CODES.INVALID_FILE, "O replay esta vazio ou incompleto.");
  }
  if (buffer.subarray(0, 4).toString("ascii") !== "RIOT") {
    throw replayError(ERROR_CODES.INVALID_HEADER, "O arquivo nao possui a assinatura RIOT.");
  }
  if (buffer.readUInt8(4) === 2) {
    return parseRofl2(buffer, options);
  }
  throw replayError(ERROR_CODES.UNSUPPORTED_FORMAT, "Formato de replay ainda nao suportado.");
}

module.exports = { parseReplay };
