"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "fantasy-source.json"), "utf8"));
const worker = fs.readFileSync(path.join(ROOT, "worker", "fantasy-worker.js"), "utf8");
const admin = fs.readFileSync(path.join(ROOT, "worker", "fantasy-admin.js"), "utf8");
const maintenance = fs.readFileSync(path.join(ROOT, "scripts", "update-fantasy-round-remote.mjs"), "utf8");

const expected = {
  elite: ["A2:D4", "B3:D3", "C4:A3", "D1:A1"],
  ascension: ["A1:D2", "B1:D4", "C4:B4", "D3:B3"]
};

const expectedSemifinals = {
  elite: ["A2:B3", "C4:A1"],
  ascension: ["A1:D4", "C4:D3"]
};

const expectedFinals = {
  elite: ["A2:A1"],
  ascension: ["A1:D3"]
};

test("Rodada 5 contém as quartas corretas e oito equipes elegíveis por divisão", () => {
  for (const division of ["elite", "ascension"]) {
    const round = source.divisions[division].rounds.find((item) => item.roundNumber === 5);
    assert.ok(round, `Rodada 5 ausente em ${division}`);
    assert.equal(round.name, "RODADA 5 · QUARTAS DE FINAL");
    assert.deepEqual(round.matches.map((match) => `${match.homeTeamSlot}:${match.awayTeamSlot}`), expected[division]);
    assert.ok(round.matches.every((match) => match.format === "MD5" && match.stage === "playoffs-quarterfinals"));
    const statuses = Object.values(round.eligibility.teamStatuses);
    assert.equal(statuses.filter((status) => status === "playing").length, 8);
    assert.equal(statuses.filter((status) => status === "eliminated").length, 8);
  }
});

test("Rodada 6 contém as semifinais corretas e quatro equipes elegíveis por divisão", () => {
  for (const division of ["elite", "ascension"]) {
    const round = source.divisions[division].rounds.find((item) => item.roundNumber === 6);
    assert.ok(round, `Rodada 6 ausente em ${division}`);
    assert.equal(round.name, "RODADA 6 · SEMIFINAIS");
    assert.deepEqual(round.matches.map((match) => `${match.homeTeamSlot}:${match.awayTeamSlot}`), expectedSemifinals[division]);
    assert.ok(round.matches.every((match) => match.format === "MD5" && match.stage === "playoffs-semifinals"));
    const statuses = Object.values(round.eligibility.teamStatuses);
    assert.equal(statuses.filter((status) => status === "playing").length, 4);
    assert.equal(statuses.filter((status) => status === "eliminated").length, 12);
  }
});

test("Rodada 7 contém as finais corretas e duas equipes elegíveis por divisão", () => {
  for (const division of ["elite", "ascension"]) {
    const round = source.divisions[division].rounds.find((item) => item.roundNumber === 7);
    assert.ok(round, `Rodada 7 ausente em ${division}`);
    assert.equal(round.name, "RODADA 7 · GRANDE FINAL");
    assert.deepEqual(round.matches.map((match) => `${match.homeTeamSlot}:${match.awayTeamSlot}`), expectedFinals[division]);
    assert.ok(round.matches.every((match) => match.format === "MD5" && match.stage === "playoffs-final"));
    const statuses = Object.values(round.eligibility.teamStatuses);
    assert.equal(statuses.filter((status) => status === "playing").length, 2);
    assert.equal(statuses.filter((status) => status === "eliminated").length, 14);
  }
});

test("mercado expõe o status do elenco sem limitar a reserva do Fantasy ao banco real", () => {
  assert.match(worker, /is_starter AS isStarter/);
  assert.match(worker, /rosterStatus: row\.type === "team" \? "team"/);
  assert.match(worker, /é reserva do elenco real e só pode ocupar a vaga de reserva do Fantasy/);
  assert.doesNotMatch(worker, /reserveRow\.is_starter/);
  assert.doesNotMatch(worker, /a vaga de reserva aceita somente atletas sinalizados como RESERVA/);
  assert.match(worker, /reserveBudgetForPatrimony\(marketRows, budget\)/);
  assert.match(worker, /`Joga a rodada \$\{roundNumber\}`/);
});

test("abertura usa os dois horários por divisão e fechamento independente", () => {
  assert.match(admin, /const divisionClosesAt = Object\.fromEntries/);
  assert.match(admin, /`manual-schedule:r\$\{roundNumber\}`/);
  assert.match(admin, /SET status = CASE WHEN \? <= \? THEN 'locked' ELSE 'open' END/);
  assert.match(admin, /preserveRoundLocks: true/);
});

test("preparação remota cadastra os 29 reservas confirmados, incluindo TUTU e YUTA", () => {
  const entries = maintenance.match(/division: "(?:elite|ascension)", teamSlot:/g) || [];
  assert.equal(entries.length, 29);
  assert.match(maintenance, /name: "TUTU", priceCents: 1600/);
  assert.match(maintenance, /name: "YUTA", priceCents: 1331/);
  assert.doesNotMatch(maintenance, /name: "GUOLHERME", priceCents: 1300/);
  assert.match(maintenance, /byDivision: \{ elite: 13, ascension: 16 \}/);
  assert.match(maintenance, /official_status = 'active', is_starter = 0/);
  assert.match(maintenance, /market\.round5\.reserves\.upsert/);
});

test("manutenção oferece fechamento auditado e abertura pública", () => {
  assert.match(maintenance, /mode === "close"/);
  assert.match(maintenance, /mode === "open-admin" \|\| mode === "open-public"/);
  assert.match(maintenance, /const accessMode = mode === "open-admin" \? "admin" : "public"/);
  assert.match(maintenance, /mode === "schedule-close"/);
  assert.match(maintenance, /ascension: timestamp/);
  assert.match(maintenance, /elite: timestamp/);
  assert.match(maintenance, /mode === "preview-inazuma-mid" \|\| mode === "apply-inazuma-mid"/);
  assert.match(maintenance, /GUOLHERME substitui YUTA como MID titular/);
  assert.match(maintenance, /pricesPreserved: true/);
});

test("preparação remota reconhece duas semifinais e quatro equipes elegíveis", () => {
  assert.match(maintenance, /6: \{ matchesPerDivision: 2, statuses: \{ playing: 4, eliminated: 12 \} \}/);
  assert.match(maintenance, /7: \{ matchesPerDivision: 1, statuses: \{ playing: 2, eliminated: 14 \} \}/);
  assert.match(maintenance, /expectation\.matchesPerDivision/);
  assert.match(maintenance, /expectation\.statuses/);
});
