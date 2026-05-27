# Liga RK 26.2 - Tournament API e Hospedagem

## O Que Pedir Para a Riot

Solicite acesso a Tournament API para uma liga amadora/inhouse de League of Legends. Explique que voce precisa gerar Tournament Codes por partida para automatizar estatisticas de mais de 150 jogos, separados por divisao.

Links uteis:

- Riot LoL API docs: https://developer.riotgames.com/docs/lol
- Tournament-V5 API reference: https://developer.riotgames.com/apis#tournament-v5

Modelo de ticket:

Portugues:

```
Olá, equipe Riot Developer Relations.

Meu nome é Henrique e eu organizo a Liga RK 26.2, uma liga amadora/inhouse de League of Legends no servidor brasileiro.

Gostaria de solicitar acesso à Tournament API para gerar Tournament Codes para as partidas da liga. O objetivo é automatizar o registro dos resultados e das estatísticas competitivas no site da liga, sem depender de replays enviados manualmente pelos jogadores.

Informações do projeto:
- Nome do projeto: Liga RK 26.2
- Jogo: League of Legends
- Região/plataforma: BR1
- Tipo de evento: liga amadora/inhouse
- Quantidade estimada de partidas: mais de 150 jogos
- Formato: duas divisões, fase de grupos e playoffs
- Uso da API: gerar um Tournament Code por partida, receber callback ao fim do jogo, salvar o Match ID e consultar os dados completos da partida via Match-V5
- Site público: [colocar o link quando estiver hospedado]
- Callback URL: [colocar o link quando estiver hospedado]

Compromissos:
- Não vamos expor a API Key publicamente.
- Vamos gerar códigos apenas para partidas reais da Liga RK 26.2.
- Vamos respeitar rate limits e boas práticas da Riot API.
- Cada partida usará seu próprio Tournament Code.

Como as partidas custom comuns não estão retornando dados de forma confiável no Match-V5, queremos usar o fluxo correto com Tournament Codes para garantir callbacks e estatísticas automáticas.

Vocês poderiam revisar nossa aplicação e habilitar acesso à Tournament API para este projeto?

Obrigado.
```

Ingles:

```
Hello Riot Developer Relations team,

My name is Henrique and I organize Liga RK 26.2, an amateur League of Legends inhouse tournament in Brazil.

We need access to the Tournament API to generate one tournament code per match, receive match callbacks, and automatically process competitive statistics for our league website.

Tournament details:
- Name: Liga RK 26.2
- Region/platform: BR1
- Estimated matches: 150+
- Format: two divisions, group stage and playoffs
- Use case: generate tournament codes, assign each code to a scheduled match, receive callbacks, and fetch match data through Match-V5
- Public website: [insert website URL when available]
- Callback URL: [insert callback URL when deployed]

We will use the API only for organized Liga RK 26.2 matches and will not expose API keys publicly.

Could you please review our application and enable Tournament API access for this project?

Thank you.
```

## Como Usar Na Liga

1. Gerar codigos por rodada, nao todos de uma vez.
2. Usar um codigo diferente para cada jogo da serie.
3. Mandar o codigo certo para os capitaes antes da partida.
4. Depois do jogo, o callback da Riot deve salvar o Match ID no banco.
5. O servidor usa esse Match ID para atualizar estatisticas da divisao.

## Preparacao Do Projeto

O projeto ja tem:

- `package.json` com `npm start`.
- endpoint `/health` para checagem de servidor.
- protecao opcional de admin via `ADMIN_PASSWORD`.
- `RIOT_API_KEY` via variavel de ambiente ou `config/riot-api-key.txt` no uso local.

Variaveis para hospedagem:

```
PORT=4177
RIOT_API_KEY=RGAPI-...
ADMIN_USER=admin
ADMIN_PASSWORD=uma-senha-forte
```

## Hospedagem Recomendada

Para colocar o site publico no ar agora:

- GitHub Pages e gratuito e bom para o site estatico.
- O deploy publica apenas `index.html`, `elite.html`, `ascensao.html` e assets publicos.
- Editor, painel de replays, servidor, API key, banco e replays ficam fora do site publico.

O projeto ja tem:

- `scripts/build-public-site.js`
- `.github/workflows/pages.yml`
- script `npm run build:public`

Para o callback da Riot depois, a melhor direcao gratuita e estavel e:

- Cloudflare Pages para os arquivos publicos.
- Cloudflare Workers para endpoints de API/callback.
- Cloudflare D1 para salvar codigos, jogos e estatisticas.

Motivo: callback da Riot precisa de uma URL publica sempre disponivel. Hosts gratuitos de Node podem "dormir" e podem perder arquivos locais em reinicios/redeploys.

Links uteis:

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Render free instance docs: https://render.com/docs/free

Opcao pratica apenas para prototipo do servidor atual:

- Render Web Service com Node.
- Build command vazio ou `npm install`.
- Start command `npm start`.
- Definir `RIOT_API_KEY`, `ADMIN_USER` e `ADMIN_PASSWORD` no painel.
- Usar apenas para testes ou com banco externo, porque arquivo local nao e armazenamento permanente em plano gratuito.

Quando a Tournament API estiver aprovada, adicionar:

- endpoint publico de callback da Riot;
- tabela/banco para Tournament Codes;
- botao no painel para gerar codigos por rodada/serie.
