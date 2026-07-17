(function (global) {
  "use strict";

  const EMPTY_NAMES = new Set(["", "JOGADOR", "PLAYER", "-", "--", "SUB", "VAGA DISPONIVEL", "VAGA DISPONÍVEL"]);

  function normalizePart(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR");
  }

  function parseRiotId(value) {
    const original = String(value || "").trim();
    const separator = original.lastIndexOf("#");
    if (separator <= 0 || separator === original.length - 1) {
      return { valid: false, riotId: original, gameName: "", tagLine: "", normalizedRiotId: "" };
    }

    const gameName = original.slice(0, separator).trim().replace(/\s+/g, " ");
    const tagLine = original.slice(separator + 1).trim().replace(/\s+/g, " ");
    const valid = Boolean(gameName && tagLine && !tagLine.includes("#"));
    return {
      valid,
      riotId: valid ? `${gameName}#${tagLine}` : original,
      gameName: valid ? gameName : "",
      tagLine: valid ? tagLine : "",
      normalizedRiotId: valid ? `${normalizePart(gameName)}#${normalizePart(tagLine)}` : ""
    };
  }

  function parseOpggRiotId(value) {
    const original = String(value || "").trim();
    const invalid = { valid: false, riotId: "", gameName: "", tagLine: "", normalizedRiotId: "", opgg: original };

    if (!original) {
      return invalid;
    }

    try {
      const url = new URL(original);
      if (!/(^|\.)op\.gg$/i.test(url.hostname)) {
        return invalid;
      }

      const segments = url.pathname.split("/").filter(Boolean);
      const summonersIndex = segments.findIndex((segment) => segment.toLowerCase() === "summoners");
      const slug = summonersIndex >= 0 ? segments[summonersIndex + 2] : "";
      const decoded = decodeURIComponent(String(slug || "")).replace(/\+/g, " ").trim();
      const separator = decoded.lastIndexOf("-");
      if (separator <= 0 || separator === decoded.length - 1) {
        return invalid;
      }

      const parsed = parseRiotId(`${decoded.slice(0, separator)}#${decoded.slice(separator + 1)}`);
      return { ...parsed, opgg: url.href };
    } catch (error) {
      return invalid;
    }
  }

  function createPlayerId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  function isRegisteredPlayer(player) {
    const displayName = String(player && (player.player || player.name) || "").trim().toUpperCase();
    return !EMPTY_NAMES.has(displayName);
  }

  function normalizeAlias(alias) {
    const source = typeof alias === "string" ? { riotId: alias } : { ...(alias || {}) };
    const sourceRiotId = source.riotId || (source.gameName && source.tagLine ? `${source.gameName}#${source.tagLine}` : "");
    const parsed = parseRiotId(sourceRiotId);
    return {
      ...source,
      riotId: parsed.riotId,
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      normalizedRiotId: parsed.normalizedRiotId
    };
  }

  function migratePlayer(player, defaults) {
    const migrated = { ...(defaults || {}), ...(player || {}) };
    const parsedFromOpgg = parseOpggRiotId(migrated.opgg);
    const parsed = parsedFromOpgg.valid
      ? parsedFromOpgg
      : parseRiotId(migrated.riotId || (migrated.gameName && migrated.tagLine ? `${migrated.gameName}#${migrated.tagLine}` : ""));
    migrated.riotId = parsed.riotId;
    migrated.gameName = parsed.gameName;
    migrated.tagLine = parsed.tagLine;
    migrated.riotIdAliases = Array.isArray(migrated.riotIdAliases)
      ? migrated.riotIdAliases.map(normalizeAlias)
      : [];
    if (!isRegisteredPlayer(migrated)) {
      migrated.playerId = "";
      migrated.riotId = "";
      migrated.gameName = "";
      migrated.tagLine = "";
      migrated.riotIdAliases = [];
    } else if (!migrated.playerId) {
      migrated.playerId = createPlayerId();
    }
    return migrated;
  }

  function collectConflicts(content) {
    const owners = new Map();
    const conflicts = [];
    const divisions = content && content.divisions ? content.divisions : {};

    Object.entries(divisions).forEach(([division, divisionData]) => {
      Object.entries(divisionData.teams || {}).forEach(([slot, team]) => {
        (team.players || []).forEach((player, playerIndex) => {
          if (!isRegisteredPlayer(player)) {
            return;
          }
          const owner = { division, slot, playerIndex, playerId: player.playerId || "", name: player.player || player.name || "JOGADOR" };
          const identities = [
            { type: "principal", riotId: player.riotId },
            ...(player.riotIdAliases || []).map((alias) => ({ type: "alias", riotId: alias.riotId || alias }))
          ];

          identities.forEach((identity) => {
            const parsed = parseRiotId(identity.riotId);
            if (!parsed.valid) {
              return;
            }
            const previous = owners.get(parsed.normalizedRiotId);
            if (previous && (previous.playerId !== owner.playerId || !owner.playerId)) {
              conflicts.push({ normalizedRiotId: parsed.normalizedRiotId, riotId: parsed.riotId, first: previous, second: owner });
              return;
            }
            owners.set(parsed.normalizedRiotId, { ...owner, type: identity.type });
          });
        });
      });
    });

    return conflicts;
  }

  global.LIGA_RK_PLAYER_IDENTITY = {
    collectConflicts,
    createPlayerId,
    isRegisteredPlayer,
    migratePlayer,
    normalizeAlias,
    normalizePart,
    parseOpggRiotId,
    parseRiotId
  };
})(window);
