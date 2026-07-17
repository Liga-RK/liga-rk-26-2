# Liga RK 26.2

Site publico, editor oficial e painel local de replays/estatisticas da Liga RK 26.2. O site continua estatico no GitHub Pages. Replays e banco administrativo ficam apenas na maquina da organizacao.

## Partes do projeto

- `elite.html` e `ascensao.html`: paginas publicas das divisoes.
- `estatisticas.html`: central publica de estatisticas.
- `partida.html`, `jogador.html` e `time.html`: consultas publicas por query string.
- `editor.html`: editor oficial de times, jogadores e conteudo. Nao entra em `dist`.
- `stats-admin.html`: painel local de importacao de replay. Nao entra em `dist`.
- `stats-server.js`: servidor local do painel e do banco administrativo.
- `src/replay`: parser ROFL2, normalizacao e validacao.
- `src/statistics`: calculos, identidade, agregacoes e payload publico.
- `data`: banco local e copias de replay. Nunca e publicado.
- `backups`: backups locais automaticos. Nunca e publicado.
- `dist`: resultado isolado da build publica.

## Riot IDs no editor

Abra `editor.html` e informe cada jogador como `gameName#tagLine`, por exemplo `Henrique#BR1`.

- O Riot ID principal e a identidade atual do jogador.
- Um alias representa um Riot ID antigo visto em replays anteriores.
- `playerId` e o identificador interno estavel; ele nao muda quando o nick, time ou posicao muda.
- IDs malformados ou duplicados bloqueiam a publicacao do editor.
- Jogadores ainda sem Riot ID continuam no cadastro, mas precisam ser associados manualmente ao importar um replay.

O editor preserva nome de exibicao, OP.GG, lane, capitao e propriedades antigas. O conteudo online do Worker continua sendo a fonte oficial.

## Iniciar o painel de replays

1. Instale Node.js 18 ou superior.
2. Execute `iniciar_painel_estatisticas.bat`.
3. O navegador abrira `http://localhost:4177/stats-admin.html`.
4. O servidor escuta somente em `127.0.0.1`; ele nao fica publico na rede.

## Importar um replay

1. Escolha Elite ou Ascensao.
2. Escolha a serie, o numero do jogo e os times dos lados azul e vermelho.
3. Arraste o arquivo `.rofl` ou use o seletor.
4. Clique para processar a previa. Nada e salvo nessa etapa.
5. Confira duracao, versao, vencedor, totais e os 10 participantes.
6. Associe cada participante ao jogador cadastrado correto.
7. Use `Convidado/substituto/nao resolvido` apenas quando a associacao oficial ainda nao existir.
8. Marque `Salvar como alias` quando o Riot ID do replay for um nick antigo daquele jogador.
9. Confirme explicitamente os lados e salve.

Duplicidades sao detectadas por SHA-256, Game ID e posicao serie/jogo. Substituir uma partida exige confirmacao explicita.
Aliases salvos podem ser desativados depois em `Riot IDs alternativos`, sem apagar partidas ou estatisticas historicas.

## Fase de grupos MD3

- Cada confronto da fase de grupos possui tres espacos de replay.
- A serie so entra na classificacao quando um dos times alcanca duas vitorias de mapa: `2 x 0` ou `2 x 1`.
- `V` e `D` representam series vencidas e perdidas.
- `SJ` e o saldo de jogos (mapas vencidos menos mapas perdidos).
- `J` representa series concluidas.
- A ordem de desempate e: mais vitorias, menos derrotas, maior saldo de jogos e menor TMV.

## Reprocessar e excluir

- `Reprocessar todas` recalcula as agregacoes a partir dos jogos administrativos salvos.
- `Reprocessar este replay` atualiza somente a partida escolhida e reconstrui as estatisticas.
- `Excluir` remove a partida do banco depois da confirmacao e regenera o payload publico.
- Toda escrita cria backup e usa substituicao atomica para evitar banco parcial.

## Gerar e revisar os arquivos publicos

Execute `publicar_estatisticas.bat`. Ele:

1. executa testes e checks;
2. valida a contagem minima dos cadastros oficiais;
3. gera `assets/stats-content.js` sanitizado;
4. cria `dist`;
5. verifica arquivos privados, segredos e caminhos locais;
6. mostra o `git status`;
7. nao faz commit, push ou deploy.

Para executar separadamente:

```powershell
npm test
npm run check
npm run content:integrity
npm run stats:generate
npm run stats:validate
npm run build:public
npm run smoke:public
```

## Publicar depois da revisao

1. Revise o painel e as paginas em `dist`.
2. Confira o diff no GitHub Desktop.
3. Crie o commit manualmente.
4. Envie para a branch de revisao.
5. Somente depois da aprovacao, faca merge em `main`.
6. O workflow do GitHub Pages testa, gera `dist`, verifica o artefato e publica.

Nenhum script deste fluxo faz commit, push ou merge automaticamente.

## Limites do formato ROFL

O parser atual suporta ROFL formato 2 com metadata final e `statsJson` de 10 participantes. O formato nao e uma API publica e pode mudar em patches futuros. O replay nao e executado nem alterado.

Quando um patch novo quebrar o parser:

1. guarde um replay real novo apenas em `samples`;
2. confirme o cabecalho e a localizacao da metadata;
3. atualize o normalizador sem remover campos antigos;
4. adicione uma fixture de regressao ignorada pelo Git;
5. execute todos os testes antes de reprocessar jogos oficiais.

Mais detalhes estao em `docs/rofl-format.md`, `docs/player-identity.md`, `docs/public-statistics-schema.md` e `docs/replay-statistics-architecture.md`.
