const fs = require("node:fs");
const path = require("node:path");
const { loadOfficialContent } = require("../src/content/official-content");

const minimumBaseline = {
  elite: { teamSlots: 16, occupiedTeams: 12, playerRecords: 128, namedPlayers: 95, opggs: 67 },
  ascension: { teamSlots: 16, occupiedTeams: 16, playerRecords: 128, namedPlayers: 108, opggs: 106 }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  const root = path.resolve(__dirname, "..");
  const official = await loadOfficialContent({ root });
  const content = official.content;
  const summary = summarize(content);
  console.log(`Fonte oficial validada: ${official.source}.`);
  console.log(JSON.stringify(summary, null, 2));
  enforceMinimumBaseline(summary);

  const baselinePath = process.argv[2];
  if (!baselinePath) {
    console.log("Cadastros protegidos atendem ou superam o baseline registrado.");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(path.resolve(baselinePath), "utf8"));
  const baseline = raw.content && raw.content.divisions ? raw.content : raw;
  const differences = compareProtectedFields(baseline, content);
  if (differences.length) throw new Error(differences.join("\n"));
  console.log("Nenhum nome, OP.GG, logo, slot ou jogador protegido foi alterado.");
}

function summarize(value) {
  return Object.fromEntries(Object.entries(value.divisions || {}).map(([division, data]) => {
    const teams = Object.entries(data.teams || {});
    const players = teams.flatMap(([, team]) => team.players || []);
    return [division, {
      teamSlots: teams.length,
      occupiedTeams: teams.filter(([, team]) => String(team.name || "").trim()).length,
      playerRecords: players.length,
      namedPlayers: players.filter((player) => String(player.player || "").trim() && String(player.player).toUpperCase() !== "JOGADOR").length,
      opggs: players.filter((player) => String(player.opgg || "").trim()).length
    }];
  }));
}

function enforceMinimumBaseline(summary) {
  const differences = [];
  for (const [division, expected] of Object.entries(minimumBaseline)) {
    const current = summary[division] || {};
    for (const [field, minimum] of Object.entries(expected)) {
      if (Number(current[field] || 0) < minimum) differences.push(`${division}.${field}: ${current[field] || 0}, esperado no minimo ${minimum}.`);
    }
  }
  if (differences.length) throw new Error(`Integridade dos cadastros falhou:\n${differences.join("\n")}`);
}

function compareProtectedFields(before, after) {
  const differences = [];
  for (const division of ["elite", "ascension"]) {
    const beforeTeams = before.divisions && before.divisions[division] && before.divisions[division].teams || {};
    const afterTeams = after.divisions && after.divisions[division] && after.divisions[division].teams || {};
    for (const [slot, team] of Object.entries(beforeTeams)) {
      const current = afterTeams[slot];
      if (!current) {
        differences.push(`${division}.${slot}: time removido.`);
        continue;
      }
      for (const field of ["name", "tag", "logo"]) {
        if (current[field] !== team[field]) differences.push(`${division}.${slot}.${field}: alterado.`);
      }
      const oldPlayers = team.players || [];
      const newPlayers = current.players || [];
      if (oldPlayers.length !== newPlayers.length) differences.push(`${division}.${slot}.players: quantidade alterada.`);
      oldPlayers.forEach((player, index) => {
        for (const field of ["player", "opgg", "lane", "captain"]) {
          if (!newPlayers[index] || newPlayers[index][field] !== player[field]) differences.push(`${division}.${slot}.players.${index}.${field}: alterado.`);
        }
      });
    }
  }
  return differences;
}

module.exports = { compareProtectedFields, enforceMinimumBaseline, summarize };
