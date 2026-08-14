# Operação do Fantasy Liga RK

## Configuração administrativa

O painel usa a mesma autenticação Discord do Fantasy. Defina no Worker:

- `ADMIN_PANEL_DISCORD_IDS`: IDs que podem acessar o painel (em produção,
  somente o Discord de Cress Albane);
- `DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET`: credenciais do login público;
- `SITE_URL`, `ALLOWED_ORIGINS` e `FANTASY_SOURCE_URL`: definidos no
  `wrangler.toml`.

`DISCORD_CLIENT_SECRET` deve permanecer como secret do Worker. O login antigo
por usuário e senha fica desativado por padrão e só existe para compatibilidade
controlada quando `ADMIN_PASSWORD_LOGIN_ENABLED=true` for definido
explicitamente.

## Fluxo de uma nova rodada

1. mantenha o mercado fechado;
2. gere e publique a fonte oficial do site;
3. em **Sincronização**, gere a prévia;
4. corrija qualquer alerta de vínculo, titular ou horário;
5. aplique a sincronização;
6. confira partidas nas duas divisões;
7. importe ou corrija estatísticas;
8. confira pontuações;
9. simule a valorização;
10. revise preço atual, esperado, necessário, delta e novo preço;
11. aplique cada simulação desejada;
12. cadastre/confira a nova rodada e confrontos;
13. clique em **Abrir Elite + Ascensão**.

Nenhuma dessas etapas abre o mercado automaticamente.

## Painel

- **Visão geral:** contagens, estado global, rodada, fechamento e alertas.
- **Mercado global:** abertura, fechamento e histórico.
- **Sincronização:** prévia, aplicação e execuções anteriores.
- **Rodadas e partidas:** cadastro, filtros, correção manual e restauração da
  fonte oficial.
- **Estatísticas e pontos:** prévia/importação da rodada 1 e correção auditada.
- **Valorização:** fórmula, restauração dos padrões, simulação, cancelamento,
  aplicação e histórico.
- **Jogadores/equipes:** filtros, status, posição, vínculo, divisão, preço e
  overrides.
- **Usuários:** busca, bloqueio e desbloqueio.
- **Escalações:** filtros, validação e correção administrativa.
- **Auditoria e backups:** logs, erros, criação, download e restauração.

## Backup e restauração pelo painel

O backup JSON inclui os dados funcionais do Fantasy e um SHA-256. Operações
críticas geram ponto de restauração automaticamente.

Para restaurar:

1. feche o mercado;
2. baixe o backup escolhido para uma cópia externa;
3. clique em **Restaurar**;
4. confira a prévia de contagens;
5. digite o ID completo do backup;
6. confirme.

O backend verifica hash e versão do esquema, cria outro backup antes da
restauração, aplica as tabelas em batch e força o mercado a continuar fechado.
Backups de esquema antigo devem ser restaurados pelo procedimento D1 de
`fantasy-rollback.md`.

## Regras importantes

- O site oficial da Liga RK é a fonte de verdade dos elencos; confira a prévia e
  aplique ao Fantasy as alterações publicadas nele.
- Não edite IDs estáveis para “corrigir” apenas um nome visível.
- Uma correção manual permanece protegida contra sincronização até a restauração
  da fonte oficial.
- Jogador ausente não valoriza nem desvaloriza com `didNotPlay = hold`.
- A importação de estatísticas não aplica preço.
- A aplicação de preços exige o mercado fechado.
- Após qualquer restauração, valide `/health`, mercado, usuários, escalações e
  fingerprints de preço antes de reabrir.
