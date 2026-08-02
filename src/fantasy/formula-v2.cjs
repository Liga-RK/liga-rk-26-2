"use strict";

const FORMULA_VERSION = 2;
const FORMULA_ID = "fantasy-v2";
const PLAYER_SCORE_MIN = -10;
const PLAYER_SCORE_MAX = 50;
const PRICE_MIN = 4;
const PRICE_MAX = 30;

function clamp(valor, minimo, maximo) {
  const numero = Number(valor);
  return Math.max(Number(minimo), Math.min(Number(maximo), numero));
}

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas;
  return Math.round((Number(valor) + Number.EPSILON) * fator) / fator;
}

function normalizarNota(notaDesempenho) {
  return clamp(Number(notaDesempenho) || 0, 0, 100);
}

function calcularPontuacaoMapa({ notaDesempenho, venceuMapa = false, foiMvp = false } = {}) {
  const notaNormalizada = normalizarNota(notaDesempenho);
  const pontuacaoBase = clamp(0.55 * (notaNormalizada - 40), -10, 33);
  const bonusVitoria = venceuMapa ? 2 : 0;
  const bonusMvp = foiMvp ? 3 : 0;
  return {
    notaDesempenho: notaNormalizada,
    pontuacaoBase: arredondar(pontuacaoBase),
    bonusVitoria,
    bonusMvp,
    pontuacaoMapa: arredondar(pontuacaoBase + bonusVitoria + bonusMvp)
  };
}

function calcularFatorParticipacao(mapasDisputadosPeloAtleta, totalMapasDisputadosPelaEquipe) {
  const mapasAtleta = Math.max(0, Math.trunc(Number(mapasDisputadosPeloAtleta) || 0));
  const mapasEquipe = Math.max(0, Math.trunc(Number(totalMapasDisputadosPelaEquipe) || 0));
  if (!mapasEquipe) return 0;
  return clamp(mapasAtleta / mapasEquipe, 0, 1);
}

function calcularBonusSerie({
  mapas = [],
  totalMapasEquipe = 0,
  venceuSerie = false,
  vitoriasEquipe = 0,
  vitoriasAdversario = 0,
  formato = "MD3"
} = {}) {
  const participacaoSerie = calcularFatorParticipacao(mapas.length, totalMapasEquipe);
  const participacaoIntegral = totalMapasEquipe > 0 && mapas.length === totalMapasEquipe;
  const alvoVitorias = String(formato).toUpperCase() === "MD5" ? 3 : 2;
  const placarPerfeito = venceuSerie &&
    Number(vitoriasEquipe) === alvoVitorias &&
    Number(vitoriasAdversario) === 0;
  const bonusVitoriaSerie = venceuSerie ? arredondar(3 * participacaoSerie) : 0;
  const bonusSeriePerfeita = placarPerfeito ? arredondar(2 * participacaoSerie) : 0;
  const todasNotas90 = participacaoIntegral &&
    mapas.every((mapa) => normalizarNota(mapa.notaDesempenho) >= 90);
  const todasNotas80 = participacaoIntegral &&
    mapas.every((mapa) => normalizarNota(mapa.notaDesempenho) >= 80);
  const bonusConsistencia = todasNotas90 ? 3 : todasNotas80 ? 1 : 0;
  const mapasVencidos = mapas.filter((mapa) => Boolean(mapa.venceuMapa));
  const bonusMvpSerie = participacaoIntegral &&
    mapasVencidos.length > 0 &&
    mapasVencidos.every((mapa) => Boolean(mapa.foiMvp))
    ? 2
    : 0;
  const bonusSemMortes = participacaoIntegral &&
    mapas.reduce((total, mapa) => total + Math.max(0, Number(mapa.mortes) || 0), 0) === 0
    ? 2
    : 0;
  const bonusTotal = arredondar(
    bonusVitoriaSerie +
    bonusSeriePerfeita +
    bonusConsistencia +
    bonusMvpSerie +
    bonusSemMortes
  );
  return {
    participacaoSerie: arredondar(participacaoSerie, 4),
    participacaoIntegral,
    bonusVitoriaSerie,
    bonusSeriePerfeita,
    bonusConsistencia,
    bonusMvpSerie,
    bonusSemMortes,
    bonusTotal
  };
}

function calcularPontuacaoRodada({
  mapas = [],
  totalMapasEquipe = 0,
  venceuSerie = false,
  vitoriasEquipe = 0,
  vitoriasAdversario = 0,
  formato = "MD3"
} = {}) {
  if (!Array.isArray(mapas) || mapas.length === 0) {
    return {
      formulaVersion: FORMULA_VERSION,
      jogou: false,
      mapasDisputados: 0,
      totalMapasEquipe: Math.max(0, Math.trunc(Number(totalMapasEquipe) || 0)),
      pontuacaoMapas: [],
      pontuacaoMediaMapas: 0,
      participacaoSerie: 0,
      participacaoIntegral: false,
      bonusVitoriaSerie: 0,
      bonusSeriePerfeita: 0,
      bonusConsistencia: 0,
      bonusMvpSerie: 0,
      bonusSemMortes: 0,
      bonusTotal: 0,
      pontuacaoOficial: 0
    };
  }
  const pontuacaoMapas = mapas.map((mapa) => ({
    mapaId: String(mapa.mapaId || ""),
    mortes: Math.max(0, Number(mapa.mortes) || 0),
    ...calcularPontuacaoMapa(mapa)
  }));
  const pontuacaoMediaMapas = pontuacaoMapas.reduce(
    (total, mapa) => total + mapa.pontuacaoMapa,
    0
  ) / pontuacaoMapas.length;
  const bonus = calcularBonusSerie({
    mapas,
    totalMapasEquipe,
    venceuSerie,
    vitoriasEquipe,
    vitoriasAdversario,
    formato
  });
  const pontuacaoOficial = arredondar(clamp(
    pontuacaoMediaMapas + bonus.bonusTotal,
    PLAYER_SCORE_MIN,
    PLAYER_SCORE_MAX
  ));
  return {
    formulaVersion: FORMULA_VERSION,
    jogou: true,
    mapasDisputados: mapas.length,
    totalMapasEquipe: Math.max(0, Math.trunc(Number(totalMapasEquipe) || 0)),
    pontuacaoMapas,
    pontuacaoMediaMapas: arredondar(pontuacaoMediaMapas),
    ...bonus,
    pontuacaoOficial
  };
}

function obterMediaUltimasTresRodadas(historico = [], rodadaAtual = null) {
  const possuiRodadaAtual = rodadaAtual !== null &&
    rodadaAtual !== undefined &&
    Number.isFinite(Number(rodadaAtual));
  const validas = (Array.isArray(historico) ? historico : [])
    .filter((item) => {
      const pontos = Number(item?.pontos ?? item?.points);
      const jogos = Number(item?.jogos ?? item?.games);
      const rodada = Number(item?.rodada ?? item?.roundNumber);
      const finalizada = item?.finalizada ?? item?.finalized ?? true;
      const cancelada = item?.cancelada ?? item?.cancelled ?? false;
      return Number.isFinite(pontos) &&
        jogos > 0 &&
        finalizada !== false &&
        cancelada !== true &&
        (!possuiRodadaAtual || !Number.isFinite(rodada) || rodada < Number(rodadaAtual));
    })
    .map((item, indice) => ({
      pontos: Number(item.pontos ?? item.points),
      rodada: Number(item.rodada ?? item.roundNumber),
      indice
    }))
    .sort((a, b) => {
      if (Number.isFinite(a.rodada) && Number.isFinite(b.rodada)) return b.rodada - a.rodada;
      return a.indice - b.indice;
    })
    .slice(0, 3);
  if (!validas.length) return null;
  return arredondar(validas.reduce((total, item) => total + item.pontos, 0) / validas.length);
}

function calcularPontuacaoEsperada(precoAtual, mediaUltimasTres = null) {
  const preco = Number(precoAtual);
  if (!Number.isFinite(preco) || preco <= 0) {
    throw new TypeError("O preço atual deve ser um número positivo.");
  }
  const pontuacaoEsperadaPreco = arredondar(0.9 * preco);
  const possuiHistorico = mediaUltimasTres !== null &&
    mediaUltimasTres !== undefined &&
    Number.isFinite(Number(mediaUltimasTres));
  const pontuacaoEsperada = possuiHistorico
    ? arredondar(0.7 * pontuacaoEsperadaPreco + 0.3 * Number(mediaUltimasTres))
    : pontuacaoEsperadaPreco;
  return { pontuacaoEsperadaPreco, pontuacaoEsperada, possuiHistorico };
}

function arredondarParaDezCentavos(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 10) / 10;
}

function calcularVariacaoMercado(pontuacaoRodada, pontuacaoEsperada, jogou = true) {
  if (!jogou) {
    return { diferenca: 0, variacaoBruta: 0, variacaoMercado: 0 };
  }
  const diferenca = Number(pontuacaoRodada) - Number(pontuacaoEsperada);
  const variacaoBruta = diferenca / 7;
  const variacaoMercado = arredondarParaDezCentavos(clamp(variacaoBruta, -2, 2));
  return {
    diferenca: arredondar(diferenca),
    variacaoBruta: arredondar(variacaoBruta, 4),
    variacaoMercado
  };
}

function calcularNovoPreco(precoAtual, variacaoMercado, jogou = true) {
  const preco = Number(precoAtual);
  if (!Number.isFinite(preco) || preco <= 0) {
    throw new TypeError("O preço atual deve ser um número positivo.");
  }
  if (!jogou) return arredondar(preco);
  return arredondar(clamp(preco + Number(variacaoMercado || 0), PRICE_MIN, PRICE_MAX));
}

function calcularValorizacao({
  precoAtual,
  pontuacaoRodada,
  historico = [],
  rodadaAtual = null,
  jogou = true
} = {}) {
  const precoAnterior = calcularNovoPreco(precoAtual, 0, false);
  if (!jogou) {
    return {
      formulaVersion: FORMULA_VERSION,
      jogou: false,
      precoAnterior,
      pontuacaoRealizada: 0,
      pontuacaoEsperadaPreco: arredondar(0.9 * precoAnterior),
      mediaUltimasTres: null,
      pontuacaoEsperada: arredondar(0.9 * precoAnterior),
      diferenca: 0,
      variacaoBruta: 0,
      variacaoMercado: 0,
      precoNovo: precoAnterior
    };
  }
  const mediaUltimasTres = obterMediaUltimasTresRodadas(historico, rodadaAtual);
  const expectativa = calcularPontuacaoEsperada(precoAnterior, mediaUltimasTres);
  const variacao = calcularVariacaoMercado(
    Number(pontuacaoRodada) || 0,
    expectativa.pontuacaoEsperada,
    true
  );
  return {
    formulaVersion: FORMULA_VERSION,
    jogou: true,
    precoAnterior,
    pontuacaoRealizada: arredondar(Number(pontuacaoRodada) || 0),
    pontuacaoEsperadaPreco: expectativa.pontuacaoEsperadaPreco,
    mediaUltimasTres,
    pontuacaoEsperada: expectativa.pontuacaoEsperada,
    ...variacao,
    precoNovo: calcularNovoPreco(precoAnterior, variacao.variacaoMercado, true)
  };
}

function aplicarMultiplicadorCapitao(pontuacaoOficial, multiplicador = 1.5) {
  return arredondar(Number(pontuacaoOficial || 0) * Number(multiplicador || 1));
}

function calcularPontuacaoEscalacao({
  titulares = [],
  capitaoId = "",
  reserva = null,
  pontuacoes = {}
} = {}) {
  const obter = (atletaId) => pontuacoes instanceof Map
    ? pontuacoes.get(String(atletaId))
    : pontuacoes[String(atletaId)];
  const ausente = titulares.find((titular) => {
    const nota = obter(titular.atletaId || titular.assetId);
    return String(titular.posicao || titular.role).toUpperCase() !== "TEAM" &&
      !(Number(nota?.jogos ?? nota?.games) > 0);
  });
  const notaReserva = reserva ? obter(reserva.atletaId || reserva.assetId) : null;
  const substituidoId = ausente && Number(notaReserva?.jogos ?? notaReserva?.games) > 0
    ? String(ausente.atletaId || ausente.assetId)
    : "";
  let total = 0;
  const detalhes = titulares.map((titular) => {
    const atletaId = String(titular.atletaId || titular.assetId);
    const nota = obter(atletaId);
    if (atletaId === substituidoId) {
      const pontosReserva = arredondar(Number(notaReserva?.pontos ?? notaReserva?.points) || 0);
      total += pontosReserva;
      return {
        atletaId,
        pontuacaoBase: 0,
        multiplicador: 1,
        pontuacao: 0,
        naoAtuou: true,
        reservaUtilizado: {
          atletaId: String(reserva.atletaId || reserva.assetId),
          pontuacaoBase: pontosReserva,
          multiplicador: 1,
          pontuacao: pontosReserva
        }
      };
    }
    const jogou = String(titular.posicao || titular.role).toUpperCase() === "TEAM" ||
      Number(nota?.jogos ?? nota?.games) > 0;
    const pontuacaoBase = jogou ? Number(nota?.pontos ?? nota?.points) || 0 : 0;
    const multiplicador = atletaId === String(capitaoId) ? 1.5 : 1;
    const pontuacao = multiplicador === 1.5
      ? aplicarMultiplicadorCapitao(pontuacaoBase)
      : arredondar(pontuacaoBase);
    total += pontuacao;
    return {
      atletaId,
      pontuacaoBase: arredondar(pontuacaoBase),
      multiplicador,
      pontuacao,
      naoAtuou: !jogou
    };
  });
  return {
    pontuacaoTotal: arredondar(total),
    substituidoId: substituidoId || null,
    detalhes
  };
}

function processarRodadaFantasy({
  rodadaId,
  rodadaNumero,
  divisao,
  series = [],
  precos = {},
  historicos = {}
} = {}) {
  if (!String(rodadaId || "").trim()) throw new TypeError("A rodada precisa de identificação.");
  if (!Array.isArray(series) || !series.length) throw new TypeError("A rodada não possui séries.");
  const mapasConhecidos = new Set();
  const pontuacoes = [];
  const valorizacoes = [];
  for (const serie of series) {
    if (!serie?.concluida) throw new Error(`A série ${serie?.id || "sem identificação"} ainda não foi concluída.`);
    if (!Array.isArray(serie.mapas) || !serie.mapas.length) {
      throw new Error(`A série ${serie?.id || "sem identificação"} não possui mapas.`);
    }
    for (const mapa of serie.mapas) {
      const mapaId = String(mapa?.id || "").trim();
      if (!mapaId) throw new TypeError("Todo mapa precisa de identificação.");
      if (mapasConhecidos.has(mapaId)) throw new Error(`Mapa duplicado: ${mapaId}.`);
      mapasConhecidos.add(mapaId);
      if (!Array.isArray(mapa.participantes)) throw new Error(`O mapa ${mapaId} não possui estatísticas.`);
    }
    const atletas = new Map();
    for (const mapa of serie.mapas) {
      for (const participante of mapa.participantes) {
        const atletaId = String(participante?.atletaId || participante?.playerId || "").trim();
        if (!atletaId) throw new TypeError(`Há atleta sem identificação no mapa ${mapa.id}.`);
        if (!Number.isFinite(Number(participante.notaDesempenho ?? participante.score))) {
          throw new TypeError(`Nota de desempenho ausente para ${atletaId} no mapa ${mapa.id}.`);
        }
        if (!Number.isFinite(Number(participante.mortes ?? participante.deaths))) {
          throw new TypeError(`Número de mortes ausente para ${atletaId} no mapa ${mapa.id}.`);
        }
        const atleta = atletas.get(atletaId) || {
          atletaId,
          equipeId: String(participante.equipeId || participante.teamSlot || ""),
          posicao: String(participante.posicao || participante.position || ""),
          mapas: []
        };
        atleta.mapas.push({
          mapaId: mapa.id,
          notaDesempenho: participante.notaDesempenho ?? participante.score,
          venceuMapa: Boolean(participante.venceuMapa ?? participante.won),
          foiMvp: String(mapa.mvpAtletaId || mapa.mvp?.playerId || "") === atletaId,
          mortes: participante.mortes ?? participante.deaths
        });
        atletas.set(atletaId, atleta);
      }
    }
    for (const atleta of atletas.values()) {
      const equipe = serie.equipes?.[atleta.equipeId] || {};
      const vitoriasEquipe = Number(equipe.vitorias ?? equipe.wins) || 0;
      const vitoriasAdversario = Number(equipe.vitoriasAdversario ?? equipe.opponentWins) || 0;
      const pontuacao = calcularPontuacaoRodada({
        mapas: atleta.mapas,
        totalMapasEquipe: serie.mapas.length,
        venceuSerie: Boolean(equipe.venceuSerie ?? equipe.seriesWon),
        vitoriasEquipe,
        vitoriasAdversario,
        formato: serie.formato || "MD3"
      });
      const registro = {
        rodadaId,
        rodadaNumero: Number(rodadaNumero) || null,
        divisao: String(divisao || ""),
        serieId: String(serie.id || ""),
        atletaId: atleta.atletaId,
        equipeId: atleta.equipeId,
        posicao: atleta.posicao,
        ...pontuacao
      };
      pontuacoes.push(registro);
      if (Object.prototype.hasOwnProperty.call(precos, atleta.atletaId)) {
        valorizacoes.push({
          atletaId: atleta.atletaId,
          ...calcularValorizacao({
            precoAtual: precos[atleta.atletaId],
            pontuacaoRodada: pontuacao.pontuacaoOficial,
            historico: historicos[atleta.atletaId] || [],
            rodadaAtual: rodadaNumero,
            jogou: pontuacao.jogou
          })
        });
      }
    }
  }
  return {
    formulaVersion: FORMULA_VERSION,
    formulaId: FORMULA_ID,
    rodadaId,
    rodadaNumero: Number(rodadaNumero) || null,
    divisao: String(divisao || ""),
    mapasProcessados: mapasConhecidos.size,
    pontuacoes,
    valorizacoes
  };
}

module.exports = {
  FORMULA_VERSION,
  FORMULA_ID,
  PLAYER_SCORE_MIN,
  PLAYER_SCORE_MAX,
  PRICE_MIN,
  PRICE_MAX,
  clamp,
  normalizarNota,
  calcularPontuacaoMapa,
  calcularFatorParticipacao,
  calcularBonusSerie,
  calcularPontuacaoRodada,
  obterMediaUltimasTresRodadas,
  calcularPontuacaoEsperada,
  arredondarParaDezCentavos,
  calcularVariacaoMercado,
  calcularNovoPreco,
  calcularValorizacao,
  aplicarMultiplicadorCapitao,
  calcularPontuacaoEscalacao,
  processarRodadaFantasy
};
