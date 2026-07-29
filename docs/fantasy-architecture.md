# Arquitetura do Fantasy Liga RK

## Estado restaurado

A referência funcional identificada no histórico do projeto foi o commit
`4eb01100017c625b1a287c82099d9756becaacac`. A restauração foi seletiva:
o frontend voltou ao fluxo funcional, mas usuários, escalações, estatísticas e
preços atuais permaneceram no D1. O antigo arquivo público de preços e as
substituições por nome foram removidos; o mercado publicado pelo backend é a
única fonte de preços.

## Componentes

- GitHub Pages publica o site e `assets/fantasy-source.json`.
- O gerador `scripts/generate-fantasy-source.mjs` consolida equipes, jogadores,
  rodadas, confrontos e estatísticas do site principal usando IDs estáveis.
- O Cloudflare Worker `worker/fantasy-worker.js` expõe a API pública, autenticação
  Discord e gravação de escalações.
- `worker/fantasy-admin.js` contém autenticação administrativa, mercado global,
  sincronização, estatísticas, valorização, auditoria, backups e restauração.
- Cloudflare D1 `liga-rk-fantasy` é a fonte de verdade de usuários, escalações,
  preços, rodadas, pontos e histórico.
- Os arquivos de `/admin` são servidos como Worker Assets. A interface pode ser
  baixada sem sessão, mas nenhum dado ou comando administrativo é acessível sem
  autenticação válida no backend.

## Mercado global

Existe uma única linha `fantasy_market_state.id = 'global'`. Abrir e fechar
sempre atualiza Elite e Ascensão no mesmo batch. Somente `POST
/api/fantasy/admin/market/open` abre o mercado.

Ao abrir uma rodada, o backend exige:

1. rodada existente nas duas divisões;
2. ao menos um confronto válido em cada divisão;
3. data/hora ISO válida, interpretada para a operação em
   `America/Sao_Paulo`;
4. janela de bloqueio ainda não atingida.

O encerramento é calculado como:

`fechamento = menor início válido entre as duas divisões - 25 minutos`

O cron executa a verificação a cada minuto, e toda tentativa de gravar uma
escalação também verifica o prazo. Alterações de agenda recalculam a janela
enquanto o mercado está aberto. Depois de fechado, nenhuma rotina o reabre.

## Segurança administrativa

- usuário em `ADMIN_USERNAME`;
- senha somente como PBKDF2-SHA256 em `ADMIN_PASSWORD_HASH`;
- sal de proteção do limitador em `ADMIN_RATE_LIMIT_SALT`;
- sessão aleatória armazenada apenas como hash no D1;
- cookie `HttpOnly`, `Secure`, `SameSite=Strict`;
- CSRF por sessão e validação de origem em toda mutação;
- expiração de oito horas e logout que apaga a sessão;
- cinco falhas em 15 minutos bloqueiam o identificador de rede por 30 minutos;
- cabeçalhos CSP, `nosniff`, `DENY` e `no-referrer`;
- todas as rotas administrativas passam por um único guard.

Credenciais administrativas não fazem parte do site, do Worker nem do banco
exportado.

## Sincronização

O sincronizador tem duas etapas obrigatórias: prévia e aplicação. A aplicação
refaz o download e confere o hash da prévia, impedindo mudanças entre revisão e
confirmação.

IDs usados:

- equipe: ID oficial, com estratégia determinística por divisão/slot;
- jogador: `playerId` estável da Liga;
- rodada: divisão + número, preservando o ID legado já existente no D1;
- confronto: `sourceId` estável por divisão;
- ativo de equipe: `team:<divisão>:<slot>`.

A rotina faz upsert, registra diferenças, não duplica registros, preserva
histórico e nunca altera o preço de ativos já existentes. Edições manuais
marcadas como override permanecem até serem restauradas explicitamente.

## Estatísticas e pontuação

A importação da rodada 1:

- processa Elite e Ascensão;
- inclui jogadores que atuaram, jogadores ausentes com `games = 0` e equipes;
- usa chave única de rodada, hash da fonte e versão;
- cria backup;
- confere fingerprint dos preços antes e depois;
- calcula escalações com capitão 1,5x;
- aplica o reserva ao primeiro titular ausente, se o reserva tiver atuado;
- não executa valorização.

Correções manuais de pontuação e escalação criam backup, recalculam as
pontuações afetadas e são registradas na auditoria.

## Valorização

Para preço `P`, pontos da rodada `R`, média histórica `H`, média recente `M` e
expectativa `E = expectationBase + expectationPerPrice × P`:

1. os pesos de rodada, média e recentes são normalizados;
2. `S = wr(R-E) + wh(H-E) + wm(M-E)`;
3. `confiança = 1 - exp(-jogosTotais/minimumGames)`;
4. `regularidade = 1 / (1 + desvio/(|M|+10))`;
5. `N = S / (|E|+8)`;
6. `amortecido = sinal(N) × (1 - exp(-|N|/damping))`;
7. `delta = P × volatility × amortecido × confiança ×
   (0,65 + 0,35 × regularidade)`;
8. `novo = max(minimumPrice, arredondar(P + delta, decimals))`.

Não existe teto fixo de valorização ou desvalorização. A curva exponencial
reduz naturalmente extremos. Quem não atuou mantém o preço por padrão.

Parâmetros padrão:

| Parâmetro | Valor |
|---|---:|
| roundWeight | 0,55 |
| averageWeight | 0,25 |
| recentWeight | 0,20 |
| expectationBase | 3,00 |
| expectationPerPrice | 0,62 |
| volatility | 0,34 |
| damping | 0,85 |
| minimumPrice | 4,00 |
| minimumGames | 3 |
| decimals | 2 |
| didNotPlay | hold |

Os preços só mudam depois de simulação e confirmação manual do ID exato da
simulação, com mercado fechado e backup automático.
