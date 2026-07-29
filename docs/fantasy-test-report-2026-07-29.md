# Relatório de testes — Fantasy Liga RK — 29/07/2026

## Resultado

- suíte Node: 74 aprovados, 0 falhas, 3 skips antigos dependentes de replay;
- cenários obrigatórios: 40/40 aprovados;
- integração administrativa SQLite/D1: 2/2 aprovadas;
- sintaxe: 23 arquivos verificados;
- build público: concluído;
- smoke público: 469 arquivos e nenhum arquivo administrativo vazado;
- migração nova: validada tanto em banco vazio quanto sobre o dump de produção;
- visual: login, dashboard desktop, layout responsivo e estados público
  aberto/fechado inspecionados no navegador.

## Cobertura de integração

A integração exercitou:

- login correto, sessão, cookie e CSRF;
- bloqueio de rota sem autenticação;
- sincronização prévia/aplicação com ID de rodada legado;
- preservação de preço customizado;
- abertura única e fechamento simultâneo;
- rejeição de segunda abertura;
- importação idempotente da rodada 1;
- correção administrativa de pontuação com backup;
- simulação/aplicação de preço;
- restauração dos padrões da fórmula;
- criação de backup, alteração de preço e restauração do valor original;
- limitação de tentativas de senha.
- avaliação completa do módulo do Worker antes do deploy.
- configuração de assets sem redirecionamento canônico no painel.

## Dados gerados pela fonte

- 32 equipes;
- 204 jogadores de elenco;
- 159 titulares;
- 45 reservas;
- 6 rodadas;
- 48 confrontos;
- rodada 1: 209 registros de jogadores, incluindo 65 ausentes, mais 32
  registros de equipe; total 241.

## Decisão de sincronização confirmada

A fonte oficial atual contém uma inconsistência de elenco:

`Ascensão / B1 sem titular SUP`.

O responsável da Liga confirmou que o site oficial, que é continuamente
atualizado, é a fonte de verdade também para o Fantasy. Portanto, a sincronização
de produção deve aplicar essas alterações: `FREEZY` será desativado como item não
oficial e as mudanças de identidade da Elite entre `RATINHO`, `LITTLE NOCTUS` e
`SKYKAIDO` serão refletidas no Fantasy.

Preços, históricos e correções manuais permanecem preservados por ID estável. A
prévia e a auditoria devem registrar todas as alterações antes da aplicação.

## Três skips

Os três casos ignorados já existiam e exigem artefatos externos de replay que
não fazem parte deste pacote. Eles não cobrem o Worker do Fantasy, o painel, o
mercado, a sincronização ou os preços.
