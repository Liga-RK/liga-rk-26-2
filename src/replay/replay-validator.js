function findReplayDuplicates(database, candidate) {
  const duplicates = [];
  for (const [division, divisionData] of Object.entries(database.divisions || {})) {
    for (const game of divisionData.games || []) {
      if (!game) continue;
      const reasons = [];
      if (candidate.sha256 && candidate.sha256 === game.sha256) reasons.push("sha256");
      if (candidate.gameId && candidate.gameId === game.gameId) reasons.push("gameId");
      if (
        division === candidate.division &&
        game.seriesId === candidate.seriesId &&
        Number(game.gameNumber) === Number(candidate.gameNumber)
      ) reasons.push("seriesGame");
      if (reasons.length) {
        duplicates.push({ division, gameId: game.id, seriesId: game.seriesId, gameNumber: game.gameNumber, reasons });
      }
    }
  }
  return duplicates;
}

function validateReplaySelection(selection) {
  const errors = [];
  if (!selection.division) errors.push("Escolha a divisao.");
  if (!selection.seriesId) errors.push("Escolha a serie.");
  if (!Number.isInteger(Number(selection.gameNumber)) || Number(selection.gameNumber) < 1) errors.push("Escolha o numero do jogo.");
  if (!selection.blueTeamSlot || !selection.redTeamSlot) errors.push("Escolha os dois times.");
  if (selection.blueTeamSlot && selection.blueTeamSlot === selection.redTeamSlot) errors.push("O mesmo time nao pode ocupar os dois lados.");
  return errors;
}

module.exports = { findReplayDuplicates, validateReplaySelection };
