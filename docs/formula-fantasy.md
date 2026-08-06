# Fórmulas oficiais do Fantasy RK

Pontuação: `fantasy-v2`

Valorização: `fantasy-v3-dynamic`
Fontes de verdade: `src/fantasy/formula-v2.cjs` e `src/fantasy/valuation-v3.cjs`

A fórmula de pontuação não mudou. A valorização dinâmica preserva os preços existentes, não recalcula rodadas anteriores e só é aplicada depois de prévia e confirmação administrativas. Desde o fechamento da Rodada 2, a mesma curva também é aplicada aos ativos de equipe.

## Pontuação individual

Por mapa:

```text
base = clamp(0,55 × (nota − 40), −10, 33)
mapa = base + (venceu ? 2 : 0) + (MVP oficial ? 3 : 0)
```

A pontuação da série é a média dos mapas efetivamente disputados pelo atleta, acrescida dos bônus oficiais. O resultado da rodada fica entre −10 e 50. Capitão recebe multiplicador de 1,5 depois desse limite. O reserva pode cobrir uma ausência e entra sem multiplicador.

Quem não disputa mapa recebe zero ponto, não entra nas médias históricas e mantém o preço.

## Valorização individual dinâmica

### Expectativa pelo preço

```text
esperado = 1,6 × preço atual − 8
```

### Desempenho ajustado

Somente rodadas anteriores válidas em que o atleta atuou entram no histórico. Ausências, rodadas canceladas, não finalizadas e a própria rodada atual são ignoradas.

```text
sem histórico: ajustado = pontos atuais
1 rodada anterior: ajustado = 0,75 × atual + 0,25 × anterior
2+ rodadas anteriores: ajustado = 0,65 × atual + 0,25 × média recente + 0,10 × média da temporada
```

A média recente usa até as três rodadas válidas mais recentes. A média da temporada usa todo o histórico anterior válido.

### Curva da variação

```text
diferença = desempenho ajustado − esperado
base = sinal(diferença) × (|diferença| ÷ 10)^0,90
```

Para altas:

```text
fator de preço = 14 ÷ (preço atual + 4)
```

Para quedas:

```text
fator de preço = 0,75 + preço atual ÷ 40
```

Participação:

| Participação nos mapas da equipe | Fator |
|---|---:|
| nenhum mapa | 0,00 |
| até 34% | 0,70 |
| acima de 34% e abaixo de 100% | 0,90 |
| 100% | 1,00 |

```text
variação = base × fator de preço × fator de participação
novo preço = máximo(4, preço atual + variação)
```

O resultado monetário é arredondado para duas casas. Não há teto fixo de variação nem preço máximo. Variações absolutas acima de RK$ 7,00 entram em revisão obrigatória no painel.

### Exemplos sem histórico e com participação integral

| Preço | Pontos | Novo preço aproximado |
|---:|---:|---:|
| RK$ 6,00 | 31 | RK$ 9,70 |
| RK$ 12,00 | 30 | RK$ 13,54 |
| RK$ 25,00 | 50 | RK$ 25,82 |
| RK$ 25,00 | 10 | RK$ 22,21 |

## Ativos de equipe

O ativo de equipe pontua pela média das pontuações oficiais dos atletas que atuaram. Como essa média permanece na mesma escala oficial de −10 a 50, a equipe usa a mesma curva dinâmica de expectativa, desempenho ajustado e variação aplicada aos atletas. Se a equipe não disputar mapa válido, mantém o preço e não alimenta as médias históricas.

## Regra do reserva a partir da Rodada 3

O reserva precisa caber integralmente no saldo que restar depois da compra dos cinco jogadores titulares e do ativo de equipe. O preço do titular mais barato não amplia mais esse limite.

## Fluxo administrativo e segurança

1. O mercado global precisa estar fechado.
2. A pontuação é processada e salva sem alterar preços.
3. O administrador gera a prévia de valorização.
4. A prévia exibe preço anterior, pontos, esperado, ajustado, diferença, variação, novo preço e status.
5. Alertas acima de RK$ 7,00 precisam ser aprovados, editados ou ignorados conscientemente.
6. A aplicação exige confirmação pelo ID exato e cria backup.
7. Preços, histórico e patrimônios são atualizados de forma idempotente.

Cada aplicação grava histórico por atleta com preço anterior, novo preço, delta, rodada, versão, responsável e horário.

## Rollback

O rollback exige mercado fechado, confirmação do ID e motivo. Ele:

- verifica se nenhum preço mudou depois da aplicação;
- cria backup;
- restaura todos os preços da aplicação;
- recalcula patrimônios;
- marca o processamento como pendente de valorização;
- preserva o histórico antigo com estado `rolled_back`;
- permite gerar nova prévia e reprocessar a rodada.

A migração `worker/migrations/0007_fantasy_dynamic_valuation.sql` adiciona o histórico durável e o registro de rollbacks sem modificar os preços atuais.
