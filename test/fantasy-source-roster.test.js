"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "assets", "fantasy-source.json"),
  "utf8"
));

test("escala NIHIL como TOP do Favelão e mantém TUTU como reserva", () => {
  const team = source.divisions.elite.teams.find((item) => item.slot === "D1");
  assert.ok(team, "Favelão precisa existir na fonte do Fantasy");

  const starter = team.players.find((player) => player.role === "TOP");
  assert.deepEqual(
    { id: starter?.id, name: starter?.name },
    { id: "ee09cf39-13a1-4268-a363-dbd28955437b", name: "NIHIL" }
  );

  const reserve = team.players.find((player) => player.name === "TUTU");
  assert.deepEqual(
    { id: reserve?.id, role: reserve?.role, mainRole: reserve?.mainRole },
    { id: "d9d9c418-c16a-4a24-b475-40de2f2873fe", role: "SUB", mainRole: "TOP" }
  );
  assert.equal(new Set(team.players.map((player) => player.id)).size, team.players.length);
});

test("escala KAISER e BURRAXA na rota inferior da Favelinha", () => {
  const team = source.divisions.ascension.teams.find((item) => item.slot === "C2");
  assert.ok(team, "Favelinha precisa existir na fonte do Fantasy");

  const adc = team.players.find((player) => player.role === "ADC");
  assert.deepEqual(
    { id: adc?.id, name: adc?.name },
    { id: "2594034c-9394-4b79-8b59-dedbf66482e5", name: "KAISER" }
  );

  const support = team.players.find((player) => player.role === "SUP");
  assert.deepEqual(
    { id: support?.id, name: support?.name },
    { id: "745a0ee6-ebda-4170-a095-68565c5f425b", name: "BURRAXA" }
  );

  assert.equal(team.players.some((player) => player.name === "TAKOPI"), false);
  assert.equal(team.players.some((player) => player.name === "PEN DRIVE"), false);
  assert.equal(new Set(team.players.map((player) => player.id)).size, team.players.length);
});
