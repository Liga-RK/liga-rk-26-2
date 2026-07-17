# Formato ROFL utilizado

## ROFL2

O replay de regressao usa o formato ROFL2:

- os quatro primeiros bytes contem a assinatura ASCII `RIOT`;
- o byte no offset 4 identifica a versao do formato;
- a versao do cliente aparece no cabecalho;
- os quatro ultimos bytes armazenam, em little-endian, o tamanho do JSON final de metadata;
- o bloco de metadata termina imediatamente antes desses quatro bytes;
- `metadata.statsJson` contem uma string JSON com os dez participantes.

O parser valida assinatura, formato, limites do tamanho, JSON de metadata, `statsJson`, quantidade de participantes e TEAM 100/200. O conteudo nunca e executado.

## Campos utilizados

- Riot ID: `RIOT_ID_GAME_NAME` e `RIOT_ID_TAG_LINE`;
- lado: `TEAM`;
- lane: `TEAM_POSITION` ou `INDIVIDUAL_POSITION`;
- campeao: `SKIN`;
- K/D/A: `CHAMPIONS_KILLED`, `NUM_DEATHS`, `ASSISTS`;
- ouro: `GOLD_EARNED`;
- dano: `TOTAL_DAMAGE_DEALT_TO_CHAMPIONS`;
- visao: `VISION_SCORE`, `WARD_PLACED` e `WARD_KILLED`;
- objetivos: `TURRETS_KILLED`, `HORDE_KILLS`, `RIFT_HERALD_KILLS`, `DRAGON_KILLS`, `ELDER_DRAGON_KILLS`, `BARON_KILLS`;
- itens: `ITEM0` ate `ITEM6`;
- resultado: `WIN`.

## Campos nao inferidos

O parser nao inventa bans, ordem de draft, curva de ouro, elemento de dragoes ou nomes dos times. Os nomes dos times sao confirmados pelo administrador usando o cadastro oficial.

## Fixture

O replay local `samples/BR1-3262336523.rofl` e usado como fixture de regressao, mas esta ignorado pelo Git e nunca entra na build publica.

## Limitacoes

Patches futuros podem alterar o formato. Versoes desconhecidas devem falhar com `UNSUPPORTED_FORMAT` ate o parser ser validado com um replay real novo.
