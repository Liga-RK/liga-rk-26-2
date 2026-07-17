const crypto = require("node:crypto");
const { migratePlayer } = require("./player-identity");

function hydrateRosterIdentities(content, database) {
  const hydrated = structuredClone(content || {});
  const originalRegistry = Array.isArray(database.rosterIdentities) ? database.rosterIdentities : [];
  const registry = originalRegistry.filter(isMeaningfulRegistryEntry);
  let changed = !Array.isArray(database.rosterIdentities) || registry.length !== originalRegistry.length;

  for (const division of ["elite", "ascension"]) {
    const divisionData = hydrated.divisions && hydrated.divisions[division];
    if (!divisionData || !divisionData.teams) continue;

    for (const [slot, team] of Object.entries(divisionData.teams)) {
      (team.players || []).forEach((player, playerIndex) => {
        if (!isRegistered(player)) return;
        Object.assign(player, migratePlayer(player));
        const identity = findIdentity(registry, { division, slot, playerIndex, player });
        const entry = identity || {
          playerId: String(player.playerId || "").trim() || crypto.randomUUID(),
          createdAt: new Date().toISOString()
        };
        const snapshot = identitySnapshot(entry, { division, slot, playerIndex, player });

        if (!identity) {
          registry.push(snapshot);
          changed = true;
        } else if (JSON.stringify(entry) !== JSON.stringify(snapshot)) {
          Object.assign(entry, snapshot);
          changed = true;
        }
        player.playerId = entry.playerId;
      });
    }
  }

  database.rosterIdentities = registry;
  return { content: hydrated, database, changed };
}

function findIdentity(registry, context) {
  const officialId = String(context.player.playerId || "").trim();
  if (officialId) {
    const exact = registry.find((entry) => entry.playerId === officialId);
    if (exact) return exact;
  }

  const opgg = normalize(context.player.opgg);
  if (opgg) {
    const matches = registry.filter((entry) => entry.opgg === opgg);
    if (matches.length === 1) return matches[0];
  }

  const displayName = normalize(context.player.player || context.player.name);
  const samePosition = registry.find((entry) => (
    entry.division === context.division &&
    entry.slot === context.slot &&
    Number(entry.playerIndex) === context.playerIndex &&
    entry.displayName === displayName
  ));
  if (samePosition) return samePosition;

  if (displayName) {
    const sameName = registry.filter((entry) => entry.division === context.division && entry.displayName === displayName);
    if (sameName.length === 1) return sameName[0];
  }
  return null;
}

function identitySnapshot(entry, context) {
  return {
    ...entry,
    playerId: entry.playerId,
    division: context.division,
    slot: context.slot,
    playerIndex: context.playerIndex,
    displayName: normalize(context.player.player || context.player.name),
    opgg: normalize(context.player.opgg),
    lane: String(context.player.lane || "").trim().toUpperCase()
  };
}

function isRegistered(player) {
  const name = String(player && (player.player || player.name) || "").trim().toUpperCase();
  return Boolean((name && !["JOGADOR", "PLAYER", "--", "-", "SUB", "VAGA DISPONIVEL", "VAGA DISPONÍVEL"].includes(name)) || String(player && player.opgg || "").trim());
}

function isMeaningfulRegistryEntry(entry) {
  return Boolean(entry && (entry.opgg || !["", "jogador", "player", "--", "-", "sub", "vaga disponivel", "vaga disponível"].includes(entry.displayName)));
}

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\/+$/, "").toLocaleLowerCase("pt-BR");
}

module.exports = { hydrateRosterIdentities, isRegistered };
