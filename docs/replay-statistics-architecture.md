# Arquitetura de replays e estatisticas

## Fontes de verdade

- Times, jogadores, escalacoes, nomes, siglas, logos, OP.GGs, slots e resultados editaveis: conteudo retornado por `GET /api/content` no Worker da Liga RK.
- Fallback local do mesmo cadastro: `assets/content.js`. Este arquivo pode estar atrasado em relacao ao Worker e nao deve sobrescrever o conteudo online.
- Estrutura fixa de calendario, grupos e playoffs: `assets/data.js`.
- Banco administrativo de partidas: `data/stats-db.json`.
- Replays administrativos: `data/replays/`.
- Payload publico gerado: `assets/stats-content.js`.

O editor `editor.html` carrega `assets/data.js`, `assets/content.js` e `assets/editor.js`. Depois da abertura, `assets/editor.js` consulta `/api/content` e passa a trabalhar com o cadastro online. O botao de publicacao envia o documento completo para `PUT /api/admin/content` com o token administrativo armazenado apenas no `localStorage` do navegador.

## Modelo atual de jogador

Cada equipe possui oito entradas ordenadas por lane. Antes desta integracao, cada entrada tinha principalmente `lane`, `player`, `opgg` e `captain`. A migracao v2 acrescenta `playerId`, `riotId`, `gameName`, `tagLine` e `riotIdAliases`, preservando todas as propriedades existentes e desconhecidas.

## Inscricoes

`inscricao.html` envia inscricoes ao Worker, que as armazena no D1. O painel `inscricoes-admin.html` consulta essas inscricoes mediante token. A inscricao nao altera automaticamente o cadastro oficial de times: o administrador continua validando e cadastrando o time no editor.

## Fluxo de replay anterior

`stats-admin.html` usava `assets/stats-admin.js` para enviar `.rofl` ao `stats-server.js`. O servidor salvava o arquivo em `data/replays`, tentava encontrar um Match ID e consultava Match-V5. Partidas personalizadas ausentes na Match-V5 permaneciam sem estatisticas.

## Fluxo de replay v2

1. O painel atualiza o cadastro oficial pelo Worker.
2. O administrador escolhe divisao, serie, numero do jogo e os dois times.
3. O `.rofl` e enviado para pre-visualizacao.
4. O parser local valida ROFL2 e extrai metadata e `statsJson`.
5. O painel confirma TEAM 100 e TEAM 200 e relaciona Riot IDs aos jogadores inscritos.
6. A confirmacao grava a partida no banco v2 por escrita atomica.
7. As agregacoes sao reconstruidas a partir das partidas normalizadas.
8. `assets/stats-content.js` recebe apenas o payload publico sanitizado.

O arquivo legado `assets/replay-db.js` foi removido porque nao era mais consumido e poderia sugerir, incorretamente, que o banco administrativo deveria ser publicado.

## Build publica

`scripts/build-public-site.js` recria `dist/` e copia somente as paginas publicas e assets permitidos. O GitHub Actions publica `dist/` no GitHub Pages apenas em push para `main` ou `master`.

Nunca entram em `dist/`:

- `data/`, `config/`, `backups/`, `samples/` ou `tmp/`;
- arquivos `.rofl`;
- `stats-admin.html`, `editor.html` e paineis privados;
- `assets/player-identity.js` e scripts administrativos;
- banco administrativo;
- metadata bruta, hashes completos, caminhos locais, chaves ou logs.

## Riscos e estrategia de migracao

- O cadastro online e mais atual que `assets/content.js`; por isso o servidor usa o Worker, um cache administrativo e somente depois o fallback local.
- A normalizacao antiga do editor recriava objetos de jogadores e descartava campos desconhecidos. A versao v2 preserva o objeto inteiro antes de acrescentar os novos campos.
- O banco v1 e migrado incrementalmente para v2. Jogos e propriedades desconhecidas sao mantidos.
- Toda escrita do banco passa por arquivo temporario, validacao e substituicao atomica, com backup anterior.
- Agregacoes podem ser reconstruidas; dados brutos normalizados da partida nao sao alterados quando um alias muda.
