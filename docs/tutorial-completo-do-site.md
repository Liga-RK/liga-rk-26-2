# Tutorial completo do site - Liga RK 26.2

Este documento explica as áreas públicas e administrativas do site da Liga RK 26.2, o caminho percorrido pelos dados e, principalmente, como as estatísticas são calculadas.

## 1. Visão geral

O projeto possui duas divisões independentes:

- **Divisão Elite**: conteúdo, equipes, partidas e estatísticas da Elite.
- **Divisão Ascensão**: conteúdo, equipes, partidas e estatísticas da Ascensão.

Os dados nunca são misturados. Um replay enviado para a Elite só altera a Elite, e o mesmo vale para a Ascensão.

O sistema é dividido em três partes:

1. **Site público**: páginas que jogadores e espectadores acessam.
2. **Editor administrativo**: cadastro de equipes, jogadores e conteúdo visual.
3. **Painel local de replays**: processamento dos arquivos `.rofl` e geração das estatísticas.

## 2. Páginas públicas

### Página inicial

A página inicial apresenta a Liga RK 26.2 e oferece acesso às inscrições e às duas divisões. Os links das redes sociais levam aos canais oficiais da comunidade.

### Página de inscrição

O responsável pela equipe escolhe a divisão, informa nome, tag, logo, jogadores, Riot IDs, Discord, OP.GG e capitão. Depois de concordar com o regulamento, é direcionado à página de pagamento da divisão selecionada.

As inscrições ficam disponíveis apenas no painel privado da organização. O envio do formulário não coloca automaticamente a equipe entre as 16 vagas: a organização ainda precisa validar inscrição e pagamento.

### Páginas Elite e Ascensão

Cada divisão possui as seguintes seções:

- **Equipes**: lista as equipes e seus elencos. Nome, tag e jogadores levam aos perfis estatísticos correspondentes.
- **Seleção da Semana**: apresenta os cinco jogadores escolhidos para TOP, JG, MID, ADC e SUP.
- **Calendário**: mostra rodadas, confrontos, logos, tags e placares das séries.
- **Grupos**: mostra a classificação dos grupos A, B, C e D.
- **Playoffs**: apresenta oitavas, quartas, semifinais e final.
- **VODs**: reúne as transmissões e gravações publicadas.
- **Estatísticas**: mostra os principais destaques calculados a partir dos replays.
- **Regras**: incorpora o regulamento oficial em PDF.

### Central de estatísticas

A central possui quatro tipos de consulta:

- visão geral da divisão;
- perfil da equipe;
- perfil do jogador;
- página individual de cada partida.

Jogadores e equipes cadastrados podem abrir seus perfis antes da primeira partida. Nesse caso, os valores aparecem como zero até que um replay válido seja processado.

## 3. Seleção da Semana

**A Seleção da Semana não é calculada automaticamente pelas estatísticas. Ela é escolhida por votação popular.**

A votação deve ser realizada nos canais oficiais definidos pela organização. Depois do encerramento da votação, a administração registra no editor:

- jogador escolhido para cada uma das cinco posições;
- equipe de cada jogador;
- foto do jogador;
- logo da equipe;
- destaque principal da semana.

Portanto, desempenho estatístico pode ajudar o público a votar, mas não substitui a votação. O resultado exibido no site representa a decisão popular publicada pela organização.

## 4. Como um replay vira estatística

O fluxo de uma partida é:

1. A organização abre `stats-admin.html` pelo servidor local.
2. Escolhe divisão, série, número do jogo, lado azul e lado vermelho.
3. Envia o arquivo `.rofl`.
4. O sistema lê duração, resultado, participantes, campeões, ouro, dano, visão e objetivos.
5. Cada participante é associado a um jogador cadastrado.
6. A organização revisa os dados e confirma a partida.
7. O jogo é salvo no banco local.
8. Todas as médias, rankings e destaques são recalculados.
9. Um payload público sanitizado é gerado para o site.

Somente replays processados com sucesso entram nos cálculos. Arquivos pendentes, inválidos ou ainda não confirmados não alteram as estatísticas.

## 5. Diferença entre mapa e série

Essa distinção é fundamental:

- **Mapa/jogo**: uma partida individual representada por um arquivo `.rofl`.
- **Série**: confronto MD3 ou MD5 composto por vários mapas.

As estatísticas de jogadores, equipes e campeões são calculadas por **mapa processado**. Já a classificação da fase de grupos considera o resultado final da **série MD3**.

Exemplo: uma equipe vence duas séries por `2 x 1` e `2 x 0`.

- Séries: 2 vitórias e 0 derrotas.
- Mapas: 4 vitórias e 1 derrota.
- Saldo de jogos: `+3`.

## 6. Classificação da fase de grupos

Cada confronto da fase de grupos é MD3. A série só é concluída quando uma equipe alcança duas vitórias de mapa.

As colunas são:

- **V**: séries vencidas.
- **D**: séries perdidas.
- **SJ**: saldo de jogos, calculado como mapas vencidos menos mapas perdidos.
- **J**: séries concluídas.
- **TMV**: tempo médio dos mapas vencidos pela equipe.

A ordem da classificação usa estes critérios, nessa sequência:

1. maior número de vitórias em séries;
2. menor número de derrotas em séries;
3. maior saldo de jogos;
4. menor tempo médio de vitória;
5. posição original da equipe no grupo, somente se todos os critérios anteriores continuarem empatados.

Uma série incompleta, como `1 x 1`, ainda não soma vitória, derrota, jogo ou saldo à tabela.

## 7. Estatísticas das equipes

As estatísticas da equipe agregam todos os mapas processados em que ela participou.

### Partidas, vitórias e aproveitamento

- **Partidas**: quantidade de mapas processados.
- **Vitórias**: mapas vencidos.
- **Derrotas**: mapas perdidos.
- **Winrate**: `vitórias / partidas x 100`.

O winrate exibido no painel estatístico é por mapa. Ele não deve ser confundido com a coluna V da fase de grupos, que conta séries.

### KDA da equipe

```text
KDA = (abates totais + assistências totais) / mortes totais
```

Se a equipe não tiver mortes, o sistema usa `abates + assistências`, evitando divisão por zero.

### Médias por mapa

```text
Média de abates = abates totais / mapas
Média de mortes = mortes totais / mapas
Média de assistências = assistências totais / mapas
Média de ouro = ouro total / mapas
Média de dano = dano total / mapas
```

O mesmo princípio é aplicado às médias de torres, larvas, arautos, dragões e barões.

### GPM e DPM

```text
GPM = ouro total / minutos totais jogados
DPM = dano a campeões total / minutos totais jogados
```

- **GPM** significa ouro por minuto.
- **DPM** significa dano a campeões por minuto.

### Duração e TMV

- **Duração média**: tempo total de todos os mapas dividido pela quantidade de mapas.
- **TMV**: soma da duração apenas dos mapas vencidos, dividida pela quantidade de mapas vencidos.

Derrotas não entram no cálculo do TMV.

### Ranking estatístico de equipes

Na central de estatísticas, as equipes são ordenadas por:

1. maior winrate por mapa;
2. menor TMV;
3. maior quantidade de mapas;
4. nome da equipe em ordem alfabética.

Essa ordenação é informativa e não substitui a classificação oficial dos grupos.

## 8. Estatísticas dos jogadores

Todos os números são agregados somente dos mapas em que o jogador foi identificado corretamente.

### Partidas e winrate

```text
Winrate = mapas vencidos pelo jogador / mapas disputados pelo jogador x 100
```

### KDA

```text
KDA = (abates totais + assistências totais) / mortes totais
```

Se o jogador não tiver mortes, o sistema usa `abates + assistências`.

### KP - participação em abates

Em cada mapa:

```text
KP do mapa = (abates do jogador + assistências do jogador) / abates da equipe
```

O KP exibido no perfil é a média dos KPs obtidos pelo jogador em todos os mapas, convertida para porcentagem. Se a equipe não tiver abates, o KP daquele mapa é zero.

### GPM e DPM

Em cada mapa:

```text
GPM do mapa = ouro do jogador / minutos do mapa
DPM do mapa = dano a campeões do jogador / minutos do mapa
```

O perfil mostra a média dos valores por mapa.

### Visão

- **VIS/VS total**: soma do Vision Score.
- **Vision Score médio**: Vision Score total dividido pelos mapas.
- **VPM**: visão por minuto, calculada em cada mapa e depois promediada.

### Campeões do jogador

Para cada campeão são armazenados:

- partidas jogadas;
- vitórias e derrotas;
- winrate com o campeão;
- imagem oficial do campeão.

Os campeões são ordenados primeiro pelo número de escolhas, depois por vitórias e, por fim, pelo nome.

### Ranking de jogadores

O ranking geral é ordenado por:

1. maior KDA;
2. maior quantidade de mapas;
3. maior winrate;
4. nome do jogador.

Os filtros permitem pesquisar por jogador, posição e equipe.

## 9. Estatísticas dos campeões

Cada escolha de campeão em um replay conta como um pick. Para cada campeão são calculados:

- escolhas;
- vitórias e derrotas;
- winrate;
- KDA agregado;
- ouro médio;
- dano médio;
- DPM médio;
- posições, jogadores, equipes e partidas relacionadas.

Os destaques automáticos da seção Estatísticas são:

- campeão com mais escolhas;
- campeão com mais vitórias;
- jogador com melhor KDA;
- jogador com maior KP;
- jogador com maior DPM;
- jogador com maior GPM;
- jogador com maior Vision Score médio.

Em empate exato, permanece o primeiro registro encontrado pelo agregador.

## 10. Como o MVP da partida é escolhido

O **MVP da partida é calculado automaticamente** entre os dez participantes do mapa. Ele não é escolhido por votação.

Para cada jogador, o sistema calcula:

```text
Impacto em objetivos =
  torres x 2
  + dragões x 2,5
  + arautos x 2
  + barões x 3
```

Depois aplica um peso específico para a posição:

```text
TOP = DPM x 0,01 + abates x 0,7
JG  = KP x 9 + impacto em objetivos x 1,5
MID = DPM x 0,014 + abates x 0,8
ADC = DPM x 0,017 + abates
SUP = KP x 12 + assistências x 0,6
```

Nesse cálculo, KP é usado no formato decimal: 50% corresponde a `0,50`.

A pontuação final é:

```text
Pontuação MVP =
  abates x 3
  + assistências x 1,4
  - mortes x 2,2
  + KP x 17
  + GPM x 0,016
  + DPM x 0,02
  + impacto em objetivos
  + peso da posição
  + 6 pontos em caso de vitória
```

O jogador com a maior pontuação recebe um MVP. O bônus de vitória favorece a equipe vencedora, mas o cálculo avalia os dez jogadores e considera impacto individual, função e objetivos.

Os MVPs acumulados no perfil representam quantas partidas o jogador venceu nesse cálculo automático.

## 11. Playoffs

Os classificados são definidos pela posição final dos grupos. O chaveamento resolve automaticamente referências como `A1`, `B2` e vencedores de fases anteriores.

- Oitavas e quartas são encerradas quando uma equipe chega ao número de vitórias definido para MD3.
- Semifinais e final seguem o limite configurado para MD5.
- O vencedor avança automaticamente para o próximo campo do chaveamento.
- O eliminado recebe tratamento visual mais escuro.

Os placares podem ser preenchidos automaticamente a partir dos replays e continuam editáveis pela administração para correções excepcionais.

## 12. Áreas administrativas

### Editor oficial

O editor permite alterar:

- equipes, tags, logos e jogadores;
- capitães, Riot IDs, aliases e links do OP.GG;
- Seleção da Semana e destaque popular;
- calendário e placares;
- playoffs;
- VODs;
- textos e conteúdos públicos configuráveis.

O editor não deve ser divulgado ao público. As alterações são enviadas ao Worker usando o token administrativo.

### Painel de inscrições

O painel privado separa Elite e Ascensão e mostra os dados enviados pelas equipes. A organização usa essas informações para validar vagas, pagamento e elenco antes de cadastrar a equipe no editor.

### Painel de replays e estatísticas

O painel local permite:

- enviar e revisar replays;
- associar os dez participantes;
- detectar duplicidades;
- substituir, reprocessar ou remover jogos;
- administrar Riot IDs alternativos;
- consultar prévias de equipes, jogadores e partidas.

Ao remover um jogo, o registro e o arquivo `.rofl` correspondente são apagados com segurança. O banco cria backups automáticos antes das alterações.

## 13. Rotina recomendada durante a competição

Para cada mapa disputado:

1. receba o replay oficial;
2. abra o painel local;
3. escolha a série e o número correto do jogo;
4. confira os lados azul e vermelho;
5. processe a prévia;
6. revise os dez jogadores;
7. confirme e salve;
8. verifique resultado, MVP e página da partida;
9. confira placar da série e classificação;
10. publique o payload atualizado depois da revisão.

Ao final da rodada:

1. confira se todas as séries foram concluídas;
2. revise a classificação dos grupos;
3. publique os destaques estatísticos;
4. realize a votação popular da Seleção da Semana;
5. registre no editor os cinco vencedores da votação;
6. publique a atualização do site.

## 14. Resumo das decisões automáticas e humanas

| Item | Como é definido |
| --- | --- |
| Resultado do mapa | Replay `.rofl` confirmado |
| Resultado da série | Soma dos mapas da série |
| Classificação dos grupos | V, D, SJ, TMV e posição inicial |
| Estatísticas | Cálculo automático dos replays |
| MVP da partida | Fórmula automática de impacto |
| Destaques estatísticos | Maiores valores calculados |
| Seleção da Semana | **Votação popular** |
| Destaque da Semana | Resultado popular registrado pela organização |
| Correções excepcionais | Administração da Liga RK |

