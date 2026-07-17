# Schema publico de estatisticas

`assets/stats-content.js` define `window.LIGA_RK_STATS` com schema v2:

```js
window.LIGA_RK_STATS = {
  version: 2,
  generatedAt: "ISO-8601",
  season: "Liga RK 26.2",
  divisions: {
    elite: {
      hasData: false,
      overview: {},
      statistics: null,
      teams: [],
      teamSummaries: {},
      players: [],
      champions: [],
      matches: []
    },
    ascension: {}
  }
};
```

O payload publico possui somente dados competitivos necessarios para as paginas. Nao contem replay, caminho local, metadata bruta, hash completo, banco administrativo, conflitos, logs ou credenciais.

## Colecoes

- `overview`: totais de partidas, equipes, jogadores e campeoes processados.
- `statistics`: destaques exibidos nas paginas das divisoes.
- `teams`: resultados e medias agregadas por slot, incluindo TMV.
- `players`: identidade publica, posicoes, campeoes, KDA, KP, GPM, DPM, visao e MVPs. Cada campeao do jogador inclui partidas, vitorias, derrotas, winrate e splash publica.
- `champions`: escolhas, vitorias, taxa de vitoria, KDA, dano e posicoes.
- `matches`: resumo publico da serie, times, resultado, objetivos e participantes.

As paginas `estatisticas.html`, `partida.html`, `jogador.html` e `time.html` leem apenas esse arquivo. O banco v2 completo e os arquivos ROFL nunca sao carregados pelo navegador publico.

As agregacoes completas podem ser regeneradas a qualquer momento a partir de `data/stats-db.json` pelo comando `npm run stats:generate`.
