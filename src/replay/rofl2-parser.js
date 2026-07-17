const crypto = require("node:crypto");
const path = require("node:path");
const { ERROR_CODES, replayError } = require("./replay-errors");
const { buildTeam, formatDuration, normalizeParticipant } = require("./replay-normalizer");

const PARSER_VERSION = "rofl2-1.0.0";
const MAX_METADATA_BYTES = 16 * 1024 * 1024;

function parseRofl2(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
    throw replayError(ERROR_CODES.INVALID_FILE, "O replay esta vazio ou incompleto.");
  }
  if (buffer.subarray(0, 4).toString("ascii") !== "RIOT") {
    throw replayError(ERROR_CODES.INVALID_HEADER, "O arquivo nao possui a assinatura RIOT.");
  }

  const format = buffer.readUInt8(4);
  if (format !== 2) {
    throw replayError(ERROR_CODES.UNSUPPORTED_FORMAT, `Formato ROFL ${format} ainda nao suportado.`, { format });
  }

  const metadataSize = buffer.readUInt32LE(buffer.length - 4);
  if (!metadataSize || metadataSize > MAX_METADATA_BYTES || metadataSize > buffer.length - 8) {
    throw replayError(ERROR_CODES.INVALID_METADATA_SIZE, "O tamanho do bloco de metadata e invalido.", { metadataSize });
  }

  const metadataStart = buffer.length - 4 - metadataSize;
  if (metadataStart < 8) {
    throw replayError(ERROR_CODES.METADATA_NOT_FOUND, "O bloco final de metadata nao foi localizado.");
  }

  let metadata;
  try {
    metadata = JSON.parse(buffer.subarray(metadataStart, buffer.length - 4).toString("utf8"));
  } catch (error) {
    throw replayError(ERROR_CODES.INVALID_METADATA_JSON, "O JSON de metadata do replay esta corrompido.", { cause: error.message });
  }

  let stats;
  try {
    stats = Array.isArray(metadata.statsJson) ? metadata.statsJson : JSON.parse(metadata.statsJson);
  } catch (error) {
    throw replayError(ERROR_CODES.INVALID_STATS_JSON, "O statsJson do replay esta corrompido.", { cause: error.message });
  }
  if (!Array.isArray(stats) || stats.length !== 10) {
    throw replayError(ERROR_CODES.INVALID_PARTICIPANTS, "O replay precisa possuir exatamente 10 participantes.", {
      participantCount: Array.isArray(stats) ? stats.length : 0
    });
  }

  const participants = stats.map(normalizeParticipant);
  const invalidTeams = participants.filter((participant) => participant.team !== 100 && participant.team !== 200);
  if (invalidTeams.length) {
    throw replayError(ERROR_CODES.INVALID_PARTICIPANTS, "Um ou mais participantes nao pertencem ao TEAM 100 ou TEAM 200.");
  }

  const warnings = [];
  participants.forEach((participant) => {
    if (!participant.riotId || !participant.tagLine) warnings.push(`Participante ${participant.participantIndex + 1} sem Riot ID completo.`);
    if (!participant.champion) warnings.push(`Participante ${participant.participantIndex + 1} sem campeao.`);
    if (!participant.position) warnings.push(`Participante ${participant.participantIndex + 1} sem posicao reconhecida.`);
  });

  const version = extractClientVersion(buffer);
  if (!version) {
    warnings.push("Versao do cliente nao localizada no cabecalho.");
  }

  const durationMilliseconds = Number(metadata.gameLength || 0);
  const teams = {
    "100": buildTeam(100, participants),
    "200": buildTeam(200, participants)
  };
  const winnerTeam = teams["100"].won ? 100 : teams["200"].won ? 200 : null;
  if (!winnerTeam) warnings.push("O lado vencedor nao foi identificado.");

  return {
    format: "ROFL2",
    formatVersion: format,
    parserVersion: PARSER_VERSION,
    clientVersion: version,
    originalName: path.basename(String(options.fileName || "replay.rofl")),
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    gameId: extractGameId(options.fileName),
    durationMilliseconds,
    durationSeconds: durationMilliseconds / 1000,
    durationFormatted: formatDuration(durationMilliseconds),
    participantCount: participants.length,
    winnerTeam,
    participants,
    teams,
    warnings,
    importedAt: options.importedAt || new Date().toISOString(),
    admin: {
      metadataSize,
      metadataStart,
      lastGameChunkId: Number(metadata.lastGameChunkId || 0),
      lastKeyFrameId: Number(metadata.lastKeyFrameId || 0),
      rawMetadata: metadata
    }
  };
}

function extractClientVersion(buffer) {
  const header = buffer.subarray(0, Math.min(buffer.length, 512)).toString("latin1");
  const match = header.match(/\d+\.\d+\.\d+\.\d+/);
  return match ? match[0] : "";
}

function extractGameId(fileName) {
  const match = String(fileName || "").match(/(?:^|[^A-Za-z0-9])([A-Za-z]{2,4}\d?)[-_](\d{8,})(?=$|[^0-9])/);
  return match ? `${match[1].toUpperCase()}_${match[2]}` : "";
}

module.exports = { PARSER_VERSION, extractClientVersion, extractGameId, parseRofl2 };
