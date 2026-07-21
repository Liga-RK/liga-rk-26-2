const fs = require("node:fs");
const path = require("node:path");

const argumentsMap = parseArguments(process.argv.slice(2));
const required = ["content", "elite", "ascension", "output"];

for (const key of required) {
  if (!argumentsMap[key]) {
    throw new Error(`Informe --${key} <arquivo>.`);
  }
}

const contentPayload = readJson(argumentsMap.content);
const content = contentPayload.content && contentPayload.content.divisions
  ? contentPayload.content
  : contentPayload;

if (!content.divisions || !content.divisions.elite || !content.divisions.ascension) {
  throw new Error("O conteudo informado nao possui as duas divisoes.");
}

const draws = {
  elite: readJson(argumentsMap.elite),
  ascension: readJson(argumentsMap.ascension)
};

for (const division of ["elite", "ascension"]) {
  content.divisions[division].teams = remapTeams(
    content.divisions[division].teams || {},
    draws[division],
    division
  );
}

const outputPath = path.resolve(argumentsMap.output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `window.LIGA_RK_CONTENT = ${JSON.stringify(content, null, 2)};\n`,
  "utf8"
);

console.log(`Sorteio oficial aplicado em ${outputPath}`);
printSummary(content);

function remapTeams(currentTeams, draw, division) {
  const drawnTeams = draw && draw.teamsBySlot;
  if (!drawnTeams || Object.keys(drawnTeams).length !== 16) {
    throw new Error(`O sorteio da divisao ${division} nao possui 16 slots.`);
  }

  const available = Object.entries(currentTeams).map(([slot, team]) => ({ slot, team }));
  const used = new Set();
  const remapped = {};

  for (const slot of slotOrder()) {
    const expected = drawnTeams[slot];
    const match = available.find((candidate) => {
      if (used.has(candidate.slot)) return false;
      const sameTag = normalize(candidate.team.tag) === normalize(expected.tag);
      const sameName = normalize(candidate.team.name) === normalize(expected.name);
      return sameTag || sameName;
    });

    if (!match) {
      throw new Error(
        `Nao encontrei ${expected.name} (${expected.tag}) no cadastro online de ${division}.`
      );
    }

    used.add(match.slot);
    remapped[slot] = match.team;
  }

  if (used.size !== 16) {
    throw new Error(`A divisao ${division} nao utilizou exatamente 16 equipes.`);
  }

  return remapped;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function slotOrder() {
  return ["A", "B", "C", "D"].flatMap((group) =>
    [1, 2, 3, 4].map((position) => `${group}${position}`)
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8").replace(/^\uFEFF/, ""));
}

function parseArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = String(values[index] || "").replace(/^--/, "");
    result[key] = values[index + 1];
  }
  return result;
}

function printSummary(value) {
  for (const division of ["elite", "ascension"]) {
    console.log(`\n${division.toUpperCase()}`);
    for (const slot of slotOrder()) {
      const team = value.divisions[division].teams[slot];
      console.log(`${slot}: ${team.tag} - ${team.name}`);
    }
  }
}
