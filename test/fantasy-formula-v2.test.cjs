"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const formula = require("../src/fantasy/formula-v2.cjs");

const mapa = (nota, venceuMapa = false, foiMvp = false, mortes = 1, mapaId = "") => ({
  mapaId,
  notaDesempenho: nota,
  venceuMapa,
  foiMvp,
  mortes
});

const rodada = (mapas, extras = {}) => formula.calcularPontuacaoRodada({
  mapas,
  totalMapasEquipe: mapas.length,
  venceuSerie: false,
  vitoriasEquipe: mapas.filter((item) => item.venceuMapa).length,
  vitoriasAdversario: mapas.filter((item) => !item.venceuMapa).length,
  formato: "MD3",
  ...extras
});

test("01. Nota 40, derrota e sem MVP", () => {
  assert.equal(formula.calcularPontuacaoMapa(mapa(40)).pontuacaoMapa, 0);
});

test("02. Nota 60, vitória e sem MVP", () => {
  assert.equal(formula.calcularPontuacaoMapa(mapa(60, true)).pontuacaoMapa, 13);
});

test("03. Nota 80, vitória e MVP", () => {
  assert.equal(formula.calcularPontuacaoMapa(mapa(80, true, true)).pontuacaoMapa, 27);
});

test("04. Pontuação negativa", () => {
  assert.ok(formula.calcularPontuacaoMapa(mapa(30)).pontuacaoMapa < 0);
});

test("05. Limite mínimo de -10", () => {
  assert.equal(rodada([mapa(0)]).pontuacaoOficial, -10);
});

test("06. Limite máximo de 50", () => {
  const resultado = rodada([mapa(100, true, true, 0), mapa(100, true, true, 0)], {
    venceuSerie: true,
    vitoriasEquipe: 2,
    vitoriasAdversario: 0
  });
  assert.equal(resultado.pontuacaoOficial, 50);
});

test("07. MD3 com dois mapas usa média", () => {
  const resultado = rodada([mapa(60, true), mapa(40, true)], {
    venceuSerie: true,
    vitoriasEquipe: 2,
    vitoriasAdversario: 0
  });
  assert.equal(resultado.pontuacaoMediaMapas, 7.5);
  assert.equal(resultado.mapasDisputados, 2);
});

test("08. MD3 com três mapas usa média", () => {
  const resultado = rodada([mapa(60, true), mapa(40), mapa(80, true)], {
    venceuSerie: true,
    vitoriasEquipe: 2,
    vitoriasAdversario: 1
  });
  assert.equal(resultado.pontuacaoMediaMapas, 12.33);
});

test("09. MD5 com três mapas", () => {
  const resultado = rodada([mapa(80, true), mapa(80, true), mapa(80, true)], {
    formato: "MD5",
    venceuSerie: true,
    vitoriasEquipe: 3,
    vitoriasAdversario: 0
  });
  assert.equal(resultado.mapasDisputados, 3);
  assert.equal(resultado.bonusSeriePerfeita, 2);
});

test("10. MD5 com quatro mapas", () => {
  const resultado = rodada([mapa(60, true), mapa(60), mapa(60, true), mapa(60, true)], {
    formato: "MD5",
    venceuSerie: true,
    vitoriasEquipe: 3,
    vitoriasAdversario: 1
  });
  assert.equal(resultado.mapasDisputados, 4);
  assert.equal(resultado.bonusSeriePerfeita, 0);
});

test("11. MD5 com cinco mapas", () => {
  const resultado = rodada([
    mapa(50, true), mapa(60), mapa(70, true), mapa(80), mapa(90, true)
  ], {
    formato: "MD5",
    venceuSerie: true,
    vitoriasEquipe: 3,
    vitoriasAdversario: 2
  });
  assert.equal(resultado.mapasDisputados, 5);
  assert.equal(resultado.pontuacaoMediaMapas, 17.7);
});

test("12. Jogador que participou de apenas um mapa", () => {
  const resultado = rodada([mapa(80, true)], {
    totalMapasEquipe: 3,
    venceuSerie: true,
    vitoriasEquipe: 2,
    vitoriasAdversario: 1
  });
  assert.equal(resultado.participacaoSerie, 0.3333);
  assert.equal(resultado.bonusVitoriaSerie, 1);
});

test("13. Jogador que participou de parte da série", () => {
  const resultado = rodada([mapa(80, true), mapa(80)], {
    totalMapasEquipe: 3,
    venceuSerie: true,
    vitoriasEquipe: 2,
    vitoriasAdversario: 1
  });
  assert.equal(resultado.participacaoSerie, 0.6667);
  assert.equal(resultado.bonusVitoriaSerie, 2);
  assert.equal(resultado.bonusConsistencia, 0);
});

test("14. Jogador que não atuou", () => {
  const resultado = formula.calcularPontuacaoRodada({ mapas: [], totalMapasEquipe: 3 });
  const mercado = formula.calcularValorizacao({
    precoAtual: 12,
    pontuacaoRodada: 0,
    historico: [{ points: 10, games: 2 }],
    jogou: false
  });
  assert.equal(resultado.pontuacaoOficial, 0);
  assert.equal(mercado.precoNovo, 12);
  assert.equal(mercado.variacaoMercado, 0);
});

test("15. Vitória por 2 a 0", () => {
  assert.equal(rodada([mapa(60, true), mapa(60, true)], {
    venceuSerie: true, vitoriasEquipe: 2, vitoriasAdversario: 0
  }).bonusSeriePerfeita, 2);
});

test("16. Vitória por 2 a 1", () => {
  assert.equal(rodada([mapa(60, true), mapa(60), mapa(60, true)], {
    venceuSerie: true, vitoriasEquipe: 2, vitoriasAdversario: 1
  }).bonusSeriePerfeita, 0);
});

test("17. Vitória por 3 a 0", () => {
  assert.equal(rodada([mapa(60, true), mapa(60, true), mapa(60, true)], {
    formato: "MD5", venceuSerie: true, vitoriasEquipe: 3, vitoriasAdversario: 0
  }).bonusSeriePerfeita, 2);
});

test("18. Vitória por 3 a 2", () => {
  assert.equal(rodada([
    mapa(60, true), mapa(60), mapa(60, true), mapa(60), mapa(60, true)
  ], {
    formato: "MD5", venceuSerie: true, vitoriasEquipe: 3, vitoriasAdversario: 2
  }).bonusSeriePerfeita, 0);
});

test("19. Todos os mapas com nota acima de 80", () => {
  assert.equal(rodada([mapa(81), mapa(89)]).bonusConsistencia, 1);
});

test("20. Todos os mapas com nota acima de 90 substitui bônus de 80", () => {
  const resultado = rodada([mapa(91), mapa(99)]);
  assert.equal(resultado.bonusConsistencia, 3);
  assert.notEqual(resultado.bonusConsistencia, 4);
});

test("21. Um mapa abaixo de 80", () => {
  assert.equal(rodada([mapa(90), mapa(79)]).bonusConsistencia, 0);
});

test("22. MVP em todos os mapas vencidos", () => {
  assert.equal(rodada([mapa(80, true, true), mapa(80, false, false)]).bonusMvpSerie, 2);
});

test("23. MVP em apenas parte dos mapas vencidos", () => {
  assert.equal(rodada([mapa(80, true, true), mapa(80, true, false)]).bonusMvpSerie, 0);
});

test("24. Série inteira sem mortes", () => {
  assert.equal(rodada([mapa(70, true, false, 0), mapa(70, false, false, 0)]).bonusSemMortes, 2);
});

test("25. Uma ou mais mortes na série", () => {
  assert.equal(rodada([mapa(70, true, false, 0), mapa(70, false, false, 1)]).bonusSemMortes, 0);
});

test("26. Valorização positiva", () => {
  const item = formula.calcularValorizacao({
    precoAtual: 8, pontuacaoRodada: 18, historico: [{ points: 8, games: 2 }], jogou: true
  });
  assert.equal(item.pontuacaoEsperada, 4.8);
  assert.equal(item.desempenhoAjustado, 15.5);
  assert.equal(item.variacaoMercado, 1.24);
  assert.equal(item.precoNovo, 9.24);
});

test("27. Desvalorização", () => {
  const item = formula.calcularValorizacao({
    precoAtual: 20, pontuacaoRodada: 7, historico: [{ points: 18, games: 2 }], jogou: true
  });
  assert.equal(item.variacaoMercado, -1.72);
  assert.equal(item.precoNovo, 18.28);
});

test("28. Variação positiva não possui teto fixo", () => {
  assert.ok(formula.calcularVariacaoMercado(50, 1, true).variacaoMercado > 2);
});

test("29. Variação negativa não possui teto fixo", () => {
  assert.ok(formula.calcularVariacaoMercado(-10, 30, true).variacaoMercado < -2);
});

test("30. Preço mínimo de RK$ 4,00", () => {
  assert.equal(formula.calcularNovoPreco(4.5, -2, true), 4);
});

test("31. Não há preço máximo", () => {
  assert.equal(formula.calcularNovoPreco(29, 2, true), 31);
});

test("32. Jogador sem histórico", () => {
  const item = formula.calcularValorizacao({
    precoAtual: 10, pontuacaoRodada: 9, historico: [], jogou: true
  });
  assert.equal(item.mediaUltimasTres, null);
  assert.equal(item.pontuacaoEsperada, 8);
});

test("33. Jogador com uma rodada de histórico", () => {
  assert.equal(formula.obterMediaUltimasTresRodadas([{ points: 8, games: 2 }]), 8);
});

test("34. Jogador com duas rodadas de histórico", () => {
  assert.equal(formula.obterMediaUltimasTresRodadas([
    { points: 8, games: 2 }, { points: 12, games: 2 }
  ]), 10);
});

test("35. Jogador com três ou mais rodadas usa as três recentes", () => {
  assert.equal(formula.obterMediaUltimasTresRodadas([
    { points: 1, games: 2, roundNumber: 1 },
    { points: 6, games: 2, roundNumber: 2 },
    { points: 9, games: 2, roundNumber: 3 },
    { points: 12, games: 2, roundNumber: 4 }
  ]), 9);
});

test("36. Rodada atual não entra antecipadamente no M3", () => {
  assert.equal(formula.obterMediaUltimasTresRodadas([
    { points: 10, games: 2, roundNumber: 1 },
    { points: 50, games: 2, roundNumber: 2 }
  ], 2), 10);
});

test("37. Multiplicador de capitão positivo", () => {
  assert.equal(formula.aplicarMultiplicadorCapitao(40), 60);
});

test("38. Multiplicador de capitão negativo", () => {
  assert.equal(formula.aplicarMultiplicadorCapitao(-8), -12);
});

test("39. Reserva entra no lugar do primeiro titular ausente", () => {
  const resultado = formula.calcularPontuacaoEscalacao({
    titulares: [
      { assetId: "top", role: "TOP" },
      { assetId: "jg", role: "JG" }
    ],
    capitaoId: "jg",
    reserva: { assetId: "res", role: "TOP" },
    pontuacoes: {
      top: { points: 0, games: 0 },
      jg: { points: 20, games: 2 },
      res: { points: 8, games: 1 }
    }
  });
  assert.equal(resultado.substituidoId, "top");
  assert.equal(resultado.pontuacaoTotal, 38);
});

test("40. Reprocessamento da mesma rodada é determinístico e não duplica mapas", () => {
  const entrada = {
    rodadaId: "elite-r2",
    rodadaNumero: 2,
    divisao: "elite",
    series: [{
      id: "s1",
      concluida: true,
      formato: "MD3",
      equipes: {
        A1: { venceuSerie: true, vitorias: 2, vitoriasAdversario: 0 }
      },
      mapas: [{
        id: "m1",
        mvpAtletaId: "p1",
        participantes: [{
          atletaId: "p1", teamSlot: "A1", position: "TOP",
          score: 90, won: true, deaths: 0
        }]
      }, {
        id: "m2",
        mvpAtletaId: "p1",
        participantes: [{
          atletaId: "p1", teamSlot: "A1", position: "TOP",
          score: 90, won: true, deaths: 0
        }]
      }]
    }],
    precos: { p1: 10 },
    historicos: { p1: [] }
  };
  assert.deepEqual(
    formula.processarRodadaFantasy(entrada),
    formula.processarRodadaFantasy(entrada)
  );
});

test("valores nulos, undefined e strings são normalizados com segurança", () => {
  assert.equal(formula.normalizarNota(null), 0);
  assert.equal(formula.normalizarNota(undefined), 0);
  assert.equal(formula.normalizarNota("80"), 80);
});

test("notas fora do intervalo são limitadas entre 0 e 100", () => {
  assert.equal(formula.normalizarNota(-50), 0);
  assert.equal(formula.normalizarNota(150), 100);
});

test("preço inválido é rejeitado", () => {
  assert.throws(() => formula.calcularNovoPreco("invalido", 1), /preço atual/i);
});

test("atleta sem identificação é rejeitado", () => {
  assert.throws(() => formula.processarRodadaFantasy({
    rodadaId: "r2",
    series: [{
      id: "s", concluida: true, mapas: [{
        id: "m", participantes: [{ score: 80, deaths: 1 }]
      }]
    }]
  }), /sem identificação/i);
});

test("mapa duplicado é rejeitado", () => {
  assert.throws(() => formula.processarRodadaFantasy({
    rodadaId: "r2",
    series: [
      { id: "s1", concluida: true, mapas: [{ id: "m", participantes: [] }] },
      { id: "s2", concluida: true, mapas: [{ id: "m", participantes: [] }] }
    ]
  }), /Mapa duplicado/i);
});

test("série ainda não concluída é rejeitada", () => {
  assert.throws(() => formula.processarRodadaFantasy({
    rodadaId: "r2",
    series: [{ id: "s", concluida: false, mapas: [{ id: "m", participantes: [] }] }]
  }), /ainda não foi concluída/i);
});

test("mudança de equipe e posição usa o contexto do mapa atual", () => {
  const resultado = formula.processarRodadaFantasy({
    rodadaId: "r2",
    series: [{
      id: "s", concluida: true,
      equipes: { B2: { venceuSerie: false, vitorias: 0, vitoriasAdversario: 2 } },
      mapas: [{
        id: "m",
        participantes: [{
          playerId: "p1", teamSlot: "B2", position: "MID", score: 70, won: false, deaths: 2
        }]
      }]
    }]
  });
  assert.equal(resultado.pontuacoes[0].equipeId, "B2");
  assert.equal(resultado.pontuacoes[0].posicao, "MID");
});

test("estatísticas ausentes são rejeitadas", () => {
  assert.throws(() => formula.processarRodadaFantasy({
    rodadaId: "r2",
    series: [{
      id: "s", concluida: true, mapas: [{
        id: "m", participantes: [{ playerId: "p1", score: 80 }]
      }]
    }]
  }), /mortes ausente/i);
});

test("quantidade de mapas igual a zero não divide por zero", () => {
  const resultado = formula.calcularPontuacaoRodada({ mapas: [], totalMapasEquipe: 0 });
  assert.equal(resultado.pontuacaoOficial, 0);
  assert.equal(resultado.participacaoSerie, 0);
});
