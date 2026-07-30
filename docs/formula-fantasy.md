# Fórmula oficial do Fantasy RK

Versão: `formulaVersion: 2` (`fantasy-v2`)  
Aplicação: rodada 2 em diante  
Fonte única de verdade: `src/fantasy/formula-v2.cjs`

O histórico da rodada 1 permanece armazenado como `stats-only-v1`. A fórmula v2 não recalcula temporadas ou rodadas anteriores automaticamente.

## Nota de Desempenho

O Fantasy consome a Nota de Desempenho de 0 a 100 já calculada pelo módulo de estatísticas em `src/statistics/aggregators.js`. Antes do uso, a nota é normalizada entre 0 e 100.

O MVP só entra no cálculo quando o mapa oficial contém explicitamente o `playerId` do MVP. A fórmula do Fantasy não escolhe nem duplica MVP.

## Pontuação por mapa

```text
base = clamp(0,55 × (nota − 40), −10, 33)
mapa = base + (venceu ? 2 : 0) + (MVP oficial ? 3 : 0)
```

O limite de 50 não é aplicado por mapa.

## Média da série

MD3 e MD5 usam a mesma regra:

```text
média = soma dos pontos dos mapas disputados pelo atleta ÷ mapas disputados pelo atleta
```

Os mapas não são somados diretamente. Assim, jogar uma MD5 não gera vantagem automática sobre jogar uma MD3.

## Bônus da série

| Condição | Bônus |
|---|---:|
| Vitória da série | +3 |
| Vitória por 2×0 em MD3 ou 3×0 em MD5 | +2 |
| Nota ≥ 80 em todos os mapas da equipe | +1 |
| Nota ≥ 90 em todos os mapas da equipe | +3, substitui o +1 |
| MVP em todos os mapas vencidos pela equipe | +2 |
| Série inteira com zero mortes | +2 |

Consistência, domínio de MVP e série sem mortes exigem participação em todos os mapas da equipe.

Vitória e série perfeita são proporcionais para quem jogou somente parte da série:

```text
participação = mapas do atleta ÷ mapas da equipe
bônus aplicado = bônus integral × participação
```

## Pontuação oficial da rodada

```text
oficial = clamp(média dos mapas + bônus da série, −10, 50)
```

O resultado é arredondado para duas casas decimais. Atingir 50 exige desempenho próximo de uma série perfeita.

## Ausência, reserva e capitão

- Atleta sem mapa disputado recebe 0 ponto.
- Ausência não entra no M3 e não altera preço.
- O primeiro titular ausente pode ser coberto pelo reserva, desde que o reserva tenha atuado.
- O reserva entra sem multiplicador e cobre apenas uma ausência.
- O capitão recebe `pontuação oficial × 1,5` depois do limite oficial.
- Pontos negativos também são multiplicados. Por isso, o capitão pode entregar de −15 a 75 pontos à escalação.

## Ativo de equipe

O ativo de equipe continua pontuando. Na v2, sua pontuação da rodada é a média das pontuações oficiais dos atletas que atuaram pela equipe. Como a nova valorização solicitada é individual, o preço do ativo de equipe é mantido.

## Valorização individual

### Histórico M3

O M3 é a média das três rodadas anteriores mais recentes em que o atleta atuou. São ignoradas:

- ausências;
- partidas ou rodadas canceladas;
- rodadas ainda não finalizadas;
- a própria rodada que está sendo processada.

Com uma ou duas rodadas válidas, usa-se somente o histórico disponível.

### Expectativa

```text
expectativa pelo preço = 0,90 × preço atual
```

Sem histórico:

```text
E = expectativa pelo preço
```

Com histórico:

```text
E = 0,70 × expectativa pelo preço + 0,30 × M3
```

### Variação e novo preço

```text
diferença = pontuação da rodada − E
variação bruta = diferença ÷ 7
variação = clamp(variação bruta, −2, 2)
```

A variação é arredondada para múltiplos de RK$ 0,10.

```text
novo preço = clamp(preço atual + variação, RK$ 4,00, RK$ 30,00)
```

O novo preço é armazenado em centavos e exibido com duas casas decimais.

### Exemplos

Atleta de RK$ 8,00, M3 de 8 e 18 pontos:

```text
expectativa pelo preço = 7,20
E = 0,70 × 7,20 + 0,30 × 8 = 7,44
variação = (18 − 7,44) ÷ 7 = 1,5085… → +RK$ 1,50
novo preço = RK$ 9,50
```

Atleta de RK$ 20,00, M3 de 18 e 7 pontos:

```text
E = 18
variação = (7 − 18) ÷ 7 = −1,5714… → −RK$ 1,60
novo preço = RK$ 18,40
```

## Processamento e idempotência

O processamento administrativo:

1. exige mercado fechado;
2. confirma que todas as séries oficiais da rodada terminaram;
3. carrega mapas, participantes, Nota de Desempenho e MVP explicitamente publicado;
4. calcula e salva mapa e rodada com `formulaVersion: 2`;
5. recalcula escalações, capitão e reserva;
6. usa somente o histórico anterior no M3;
7. registra preço anterior, expectativa, variação e novo preço;
8. atualiza patrimônio e médias;
9. grava a origem e o estado em `fantasy_round_processing`.

Pontuações usam chaves únicas por rodada/atleta e por rodada/mapa/atleta. Preços usam um snapshot único por rodada/ativo. Se o mesmo hash oficial já foi concluído, o endpoint devolve sucesso idempotente sem pontuar nem valorizar novamente. Se a fonte mudar depois da valorização, o sistema recusa reaplicar automaticamente.

## Auditoria e migração

A migração `worker/migrations/0006_fantasy_formula_v2.sql` adiciona:

- versão, hash e data de processamento às pontuações;
- detalhamento JSON de pontuação e valorização;
- detalhamento nos snapshots de mercado;
- controle único de processamento por rodada e versão.

Nenhuma pontuação histórica é apagada.
