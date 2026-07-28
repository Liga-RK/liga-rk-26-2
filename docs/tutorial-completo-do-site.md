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

**A Seleção da Semana é calculada automaticamente pelas notas dos replays confirmados da rodada ativa.**

O sistema separa os jogadores por posição e considera somente as partidas pertencentes à rodada ativa. Em seguida:

1. calcula a nota de `0` a `100` de cada jogador em cada mapa;
2. calcula a média das notas que o jogador recebeu na rodada;
3. elimina da disputa quem jogou menos de dois mapas ou não venceu nenhum mapa na rodada;
4. escolhe a maior média entre os TOPs, JGs, MIDs, ADCs e SUPs elegíveis;
5. compara os cinco selecionados e define como Destaque da Semana aquele que tiver a maior nota média.

Enquanto a Rodada 1 estiver ativa, resultados de outras rodadas não interferem nessa seleção. Na mudança de rodada, a organização atualiza o número da rodada ativa no agregador e gera novamente as estatísticas públicas.

Se uma posição ainda não tiver jogador com pelo menos dois replays confirmados e uma vitória de mapa na rodada, ela fica sem representante até existirem dados suficientes. O conteúdo manual do editor não substitui esse critério.

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

O **MVP da partida é calculado automaticamente**, mas apenas os cinco jogadores da equipe vencedora são elegíveis. Essa regra acompanha a prática competitiva do LoL Esports para prêmios de MVP de final, nos quais os jogadores da equipe campeã formam o grupo elegível.

O LoL Esports não publica uma fórmula matemática única para seus MVPs: a escolha oficial é feita por votação ou por um painel. Por isso, a Liga RK utiliza um modelo próprio, transparente e reproduzível, inspirado nos mesmos eixos de avaliação: desempenho individual, trabalho em equipe, impacto no mapa e execução da função.

### Nota de desempenho

Todos os dez participantes recebem uma nota de `0` a `100` em cada mapa. Para impedir que uma função seja favorecida apenas pela escala bruta de seus números, o sistema trabalha principalmente com:

- participação nos números da própria equipe;
- comparação direta com o adversário da mesma posição;
- eficiência de dano em relação ao ouro recebido;
- KDA, participação em abates e sobrevivência;
- dano, ouro, visão, sentinelas e torres;
- participação em larvas, arautos, dragões, Dragão Ancião e Barão.

Depois da combinação ponderada, o impacto bruto é calibrado para uma escala esportiva de leitura simples:

```text
nota = limitar(25 + impacto bruto × 1,05, entre 0 e 100)
```

A calibração não altera a ordem dos desempenhos; ela apenas distribui melhor as notas na faixa visual de `0` a `100`.

As cores usadas no site são:

| Nota | Cor |
| --- | --- |
| 90 a 100 | azul-claro |
| 80 a 89,99 | verde-claro |
| 70 a 79,99 | amarelo |
| 60 a 69,99 | laranja |
| abaixo de 60 | vermelho |

### Pesos por função

Os mesmos dados não têm o mesmo significado para todas as posições:

| Função | Impactos mais valorizados |
| --- | --- |
| TOP | pressão individual, dano, torres, sobrevivência e vantagem sobre o TOP adversário |
| JG | participação em abates, objetivos neutros, visão, assistências e controle de mapa |
| MID | dano, participação em abates, eficiência de ouro e vantagem sobre o MID adversário |
| ADC | dano sustentado, KDA, abates, eficiência de ouro, sobrevivência e torres |
| SUP | participação em abates, assistências, visão, sentinelas e vantagem sobre o SUP adversário |

Os pesos da nota principal somam `100%` em cada função:

```text
TOP: KDA 13%, KP 10%, dano 17%, eficiência 8%, visão 3%,
     sentinelas 2%, torres 15%, objetivos 5%, abates 5%,
     assistências 2%, sobrevivência 8% e comparação de rota 12%.

JG:  KDA 11%, KP 18%, dano 7%, eficiência 4%, visão 8%,
     sentinelas 6%, torres 3%, objetivos 20%, abates 4%,
     assistências 8%, sobrevivência 4% e comparação de rota 7%.

MID: KDA 14%, KP 15%, dano 20%, eficiência 10%, visão 4%,
     sentinelas 2%, torres 8%, objetivos 4%, abates 7%,
     assistências 2%, sobrevivência 7% e comparação de rota 7%.

ADC: KDA 15%, KP 13%, dano 24%, eficiência 11%, visão 2%,
     sentinelas 1%, torres 12%, objetivos 2%, abates 10%,
     assistências 1%, sobrevivência 6% e comparação de rota 3%.

SUP: KDA 10%, KP 22%, dano 3%, eficiência 2%, visão 17%,
     sentinelas 12%, torres 1%, objetivos 5%, abates 1%,
     assistências 18%, sobrevivência 4% e comparação de rota 5%.
```

Antes da aplicação desses pesos, participações de equipe são normalizadas pela expectativa da função. Assim, por exemplo, uma parcela de visão comum para um suporte não recebe a mesma avaliação que essa mesma parcela excepcional para um ADC. Isso permite comparar funções diferentes sem criar uma cota obrigatória de MVP por posição.

O **impacto em objetivos** usa pesos diferentes conforme o valor estratégico:

```text
larva = 1
arauto = 2
dragão = 2,5
Dragão Ancião = 4
Barão = 4
```

### Comparação de rota

Além da contribuição dentro da própria equipe, cada jogador é comparado com o adversário da mesma função. Essa comparação considera um conjunto específico por posição. Para um caçador, por exemplo, objetivos e controle de mapa têm mais peso; para um ADC, dano, ouro, abates e torres são mais relevantes; para um suporte, visão, sentinelas, assistências e KP ganham prioridade.

O jogador com a maior nota entre os cinco integrantes da equipe vencedora recebe o MVP. Os jogadores derrotados continuam recebendo suas notas normalmente, mas não são elegíveis ao MVP daquela partida. Em caso de empate na pontuação, o sistema desempata por maior KP, menos mortes, maior dano a campeões e, por último, pela ordem estável dos participantes no replay.

O resultado também armazena a versão do modelo, a pontuação final e o detalhamento das métricas usadas. Assim, uma alteração futura de pesos pode ser auditada sem confundir modelos diferentes. Os MVPs acumulados no perfil representam quantas partidas o jogador venceu nesse cálculo automático.

### Nota média e ranking

A nota média do jogador é a média aritmética das notas recebidas em todos os mapas confirmados:

```text
nota média = soma das notas dos mapas / quantidade de mapas
```

Ela aparece antes do KDA no perfil individual e é o critério padrão de ordenação do Ranking de Jogadores. O usuário ainda pode ordenar a tabela por outras colunas quando quiser analisar KDA, jogos, KP, DPM, GPM, visão ou MVPs.

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
4. confira os cinco jogadores escolhidos automaticamente para a Seleção da Semana;
5. confira o Destaque da Semana, definido pela maior nota entre os cinco selecionados;
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
| Nota por mapa | Fórmula automática de impacto por função |
| Ranking de jogadores | Maior nota média |
| Seleção da Semana | Maior nota média por posição na rodada ativa |
| Destaque da Semana | Maior nota entre os cinco selecionados |
| Correções excepcionais | Administração da Liga RK |
