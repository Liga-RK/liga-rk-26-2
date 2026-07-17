const crypto = require("node:crypto");

function parseRiotId(value) {
  const original = String(value || "").trim();
  const separator = original.lastIndexOf("#");
  if (separator <= 0 || separator === original.length - 1) {
    return { valid: false, riotId: original, gameName: "", tagLine: "", normalizedRiotId: "" };
  }
  const gameName = original.slice(0, separator).trim();
  const tagLine = original.slice(separator + 1).trim();
  if (!gameName || !tagLine) {
    return { valid: false, riotId: original, gameName: "", tagLine: "", normalizedRiotId: "" };
  }
  return {
    valid: true,
    riotId: `${gameName}#${tagLine}`,
    gameName,
    tagLine,
    normalizedRiotId: normalizeRiotId(`${gameName}#${tagLine}`)
  };
}

function parseOpggRiotId(value) {
  const original = String(value || "").trim();
  const invalid = { valid: false, riotId: "", gameName: "", tagLine: "", normalizedRiotId: "", opgg: original };
  if (!original) return invalid;

  try {
    const url = new URL(original);
    if (!/(^|\.)op\.gg$/i.test(url.hostname)) return invalid;
    const segments = url.pathname.split("/").filter(Boolean);
    const summonersIndex = segments.findIndex((segment) => segment.toLowerCase() === "summoners");
    const slug = summonersIndex >= 0 ? segments[summonersIndex + 2] : "";
    const decoded = decodeURIComponent(String(slug || "")).replace(/\+/g, " ").trim();
    const separator = decoded.lastIndexOf("-");
    if (separator <= 0 || separator === decoded.length - 1) return invalid;
    return { ...parseRiotId(`${decoded.slice(0, separator)}#${decoded.slice(separator + 1)}`), opgg: url.href };
  } catch (error) {
    return invalid;
  }
}

function normalizeRiotId(value) {
  const parsed = String(value || "").normalize("NFKC").trim();
  const separator = parsed.lastIndexOf("#");
  if (separator <= 0 || separator === parsed.length - 1) return "";
  const gameName = parsed.slice(0, separator).trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  const tagLine = parsed.slice(separator + 1).trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return gameName && tagLine ? `${gameName}#${tagLine}` : "";
}

function isRegisteredPlayer(player) {
  const name = String((player && (player.player || player.name)) || "").trim().toLocaleUpperCase("pt-BR");
  return Boolean(name && !["JOGADOR", "PLAYER", "-", "--", "SUB", "VAGA DISPONIVEL", "VAGA DISPONÍVEL"].includes(name));
}

function migratePlayer(player, options = {}) {
  const source = player && typeof player === "object" ? player : {};
  const opggIdentity = parseOpggRiotId(source.opgg);
  const primary = opggIdentity.valid ? opggIdentity : parseRiotId(source.riotId || joinRiotId(source.gameName, source.tagLine));
  const shouldHaveId = isRegisteredPlayer(source);
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  return {
    ...source,
    playerId: shouldHaveId ? String(source.playerId || idFactory()) : "",
    riotId: shouldHaveId && primary.valid ? primary.riotId : shouldHaveId ? String(source.riotId || "") : "",
    gameName: shouldHaveId && primary.valid ? primary.gameName : shouldHaveId ? String(source.gameName || "") : "",
    tagLine: shouldHaveId && primary.valid ? primary.tagLine : shouldHaveId ? String(source.tagLine || "") : "",
    riotIdAliases: shouldHaveId ? normalizeAliases(source.riotIdAliases) : []
  };
}

function normalizeAliases(aliases) {
  if (!Array.isArray(aliases)) return [];
  return aliases.map((alias) => {
    const source = typeof alias === "string" ? { riotId: alias } : { ...(alias || {}) };
    const parsed = parseRiotId(source.riotId || joinRiotId(source.gameName, source.tagLine));
    return {
      ...source,
      riotId: parsed.valid ? parsed.riotId : String(source.riotId || ""),
      normalizedRiotId: parsed.valid ? parsed.normalizedRiotId : ""
    };
  }).filter((alias) => alias.riotId);
}

function joinRiotId(gameName, tagLine) {
  const name = String(gameName || "").trim();
  const tag = String(tagLine || "").trim();
  return name && tag ? `${name}#${tag}` : "";
}

function buildIdentityIndex(teams = {}) {
  const index = new Map();
  const conflicts = [];
  for (const [slot, team] of Object.entries(teams || {})) {
    for (const player of team.players || []) {
      if (!player || !player.playerId) continue;
      const identities = [
        { value: player.riotId, method: "primary-riot-id" },
        ...normalizeAliases(player.riotIdAliases).map((alias) => ({ value: alias.riotId, method: "riot-id-alias" }))
      ];
      for (const identity of identities) {
        const normalized = normalizeRiotId(identity.value);
        if (!normalized) continue;
        const entry = { playerId: player.playerId, player, slot, team, method: identity.method, riotId: identity.value };
        if (index.has(normalized) && index.get(normalized).playerId !== player.playerId) {
          conflicts.push({ normalizedRiotId: normalized, entries: [index.get(normalized), entry] });
        } else {
          index.set(normalized, entry);
        }
      }
    }
  }
  return { index, conflicts };
}

function suggestParticipant(participant, team) {
  const teams = { selected: team || { players: [] } };
  const identity = buildIdentityIndex(teams);
  const match = identity.index.get(normalizeRiotId(participant.riotId));
  return match ? { ...match, status: match.method } : null;
}

function assertUniqueMappings(mappings) {
  const seen = new Map();
  for (const mapping of mappings || []) {
    if (!mapping.playerId) continue;
    if (seen.has(mapping.playerId)) {
      throw new Error(`O jogador ${mapping.playerId} foi associado a dois participantes.`);
    }
    seen.set(mapping.playerId, mapping.participantIndex);
  }
}

module.exports = {
  assertUniqueMappings,
  buildIdentityIndex,
  isRegisteredPlayer,
  migratePlayer,
  normalizeAliases,
  normalizeRiotId,
  parseOpggRiotId,
  parseRiotId,
  suggestParticipant
};
