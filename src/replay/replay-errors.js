class ReplayError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReplayError";
    this.code = code;
    this.details = details;
  }
}

const ERROR_CODES = Object.freeze({
  INVALID_FILE: "INVALID_FILE",
  INVALID_HEADER: "INVALID_HEADER",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  INVALID_METADATA_SIZE: "INVALID_METADATA_SIZE",
  METADATA_NOT_FOUND: "METADATA_NOT_FOUND",
  INVALID_METADATA_JSON: "INVALID_METADATA_JSON",
  INVALID_STATS_JSON: "INVALID_STATS_JSON",
  INVALID_PARTICIPANTS: "INVALID_PARTICIPANTS",
  UNSUPPORTED_REPLAY_VERSION: "UNSUPPORTED_REPLAY_VERSION"
});

function replayError(code, message, details) {
  return new ReplayError(code, message, details);
}

module.exports = { ERROR_CODES, ReplayError, replayError };
