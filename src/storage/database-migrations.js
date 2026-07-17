const CURRENT_DATABASE_VERSION = 2;

function createDatabase() {
  return {
    version: CURRENT_DATABASE_VERSION,
    divisions: {
      elite: { games: [] },
      ascension: { games: [] }
    },
    rosterIdentities: [],
    playerAliases: [],
    identityAudit: [],
    updatedAt: ""
  };
}

function migrateDatabase(input) {
  const source = input && typeof input === "object" ? structuredClone(input) : {};
  const migrated = {
    ...createDatabase(),
    ...source,
    version: CURRENT_DATABASE_VERSION,
    divisions: {
      ...(source.divisions || {})
    }
  };

  for (const division of ["elite", "ascension"]) {
    const existing = source.divisions && source.divisions[division];
    migrated.divisions[division] = {
      ...(existing && typeof existing === "object" ? existing : {}),
      games: Array.isArray(existing && existing.games) ? existing.games : []
    };
  }
  migrated.playerAliases = Array.isArray(source.playerAliases) ? source.playerAliases : [];
  migrated.rosterIdentities = Array.isArray(source.rosterIdentities) ? source.rosterIdentities : [];
  migrated.identityAudit = Array.isArray(source.identityAudit) ? source.identityAudit : [];
  return migrated;
}

module.exports = { CURRENT_DATABASE_VERSION, createDatabase, migrateDatabase };
