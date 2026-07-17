const fs = require("node:fs");
const path = require("node:path");
const { parseReplay } = require("../src/replay/parser-factory");

const input = process.argv[2];
if (!input) {
  console.error('Uso: npm run replay:inspect -- "samples\\BR1-3262336523.rofl"');
  process.exitCode = 1;
} else {
  const filePath = path.resolve(process.cwd(), input);
  const parsed = parseReplay(fs.readFileSync(filePath), { fileName: path.basename(filePath) });
  console.log(`Arquivo: ${parsed.originalName}`);
  console.log(`Formato: ${parsed.format}`);
  console.log(`Versao: ${parsed.clientVersion}`);
  console.log(`Duracao: ${parsed.durationFormatted} (${parsed.durationMilliseconds} ms)`);
  console.log(`Game ID: ${parsed.gameId || "nao encontrado no nome"}`);
  console.log(`SHA-256: ${parsed.sha256}`);
  console.log("");
  for (const teamNumber of [100, 200]) {
    const team = parsed.teams[String(teamNumber)];
    console.log(`TEAM ${teamNumber}: ${team.won ? "VITORIA" : "DERROTA"} | ${team.kills}/${team.deaths}/${team.assists} | ouro ${team.gold}`);
    parsed.participants.filter((participant) => participant.team === teamNumber).forEach((participant) => {
      console.log(`  ${participant.riotId} | ${participant.champion} | ${participant.position} | ${participant.kills}/${participant.deaths}/${participant.assists} | ouro ${participant.gold} | dano ${participant.damageToChampions}`);
    });
  }
  if (parsed.warnings.length) {
    console.log("\nWarnings:");
    parsed.warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}
