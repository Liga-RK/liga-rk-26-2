function createPublicPayload(computed) {
  return {
    version: 2,
    generatedAt: computed.generatedAt,
    season: computed.season,
    divisions: Object.fromEntries(Object.entries(computed.divisions || {}).map(([division, value]) => [division, {
      hasData: Boolean(value.hasData),
      overview: value.overview || {},
      statistics: value.statistics || null,
      teams: value.teams || [],
      teamSummaries: value.teamSummaries || {},
      players: value.players || [],
      champions: value.champions || [],
      matches: value.matches || []
    }]))
  };
}

function assertPublicPayloadSafe(payload) {
  const serialized = JSON.stringify(payload);
  const forbidden = [
    /[A-Za-z]:\\/,
    /storagePath/i,
    /rawMetadata/i,
    /fileBase64/i,
    /riot-api-key/i,
    /apiKey/i,
    /stackTrace/i
  ];
  const violation = forbidden.find((pattern) => pattern.test(serialized));
  if (violation) throw new Error(`Payload publico contem dado proibido: ${violation}`);
  return true;
}

module.exports = { assertPublicPayloadSafe, createPublicPayload };
