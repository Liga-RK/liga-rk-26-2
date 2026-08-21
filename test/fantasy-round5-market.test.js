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

test("mercado expõe o status do elenco e aplica a regra de reserva real no servidor", () => {
  assert.match(worker, /is_starter AS isStarter/);
  assert.match(worker, /rosterStatus: row\.type === "team" \? "team"/);
  assert.match(worker, /é reserva do elenco real e só pode ocupar a vaga de reserva do Fantasy/);
  assert.match(worker, /A partir da Rodada 5, a vaga de reserva aceita somente atletas sinalizados como RESERVA/);
  assert.match(worker, /`Joga a rodada \$\{roundNumber\}`/);
});

test("abertura usa os dois horários por divisão e fechamento independente", () => {
  assert.match(admin, /const divisionClosesAt = Object\.fromEntries/);
  assert.match(admin, /`manual-schedule:r\$\{roundNumber\}`/);
  assert.match(admin, /SET status = CASE WHEN \? <= \? THEN 'locked' ELSE 'open' END/);
  assert.match(admin, /preserveRoundLocks: true/);
});

test("preparação remota cadastra os 29 reservas confirmados, incluindo TUTU", () => {
  const entries = maintenance.match(/division: "(?:elite|ascension)", teamSlot:/g) || [];
  assert.equal(entries.length, 29);
  assert.match(maintenance, /name: "TUTU", priceCents: 1600/);
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
});
