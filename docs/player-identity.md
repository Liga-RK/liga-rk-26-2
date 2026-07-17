# Identidade de jogadores

## playerId

`playerId` e o identificador interno estavel. Ele e criado uma vez para cada jogador real e nao muda quando nome, Riot ID, lane, time ou OP.GG forem alterados.

## Riot ID principal

O Riot ID usa `gameName#tagLine`. O valor original e preservado para exibicao. Para comparacao interna, o sistema aplica Unicode NFKC, remove espacos externos, reduz espacos internos e ignora diferencas entre maiusculas e minusculas.

Tags diferentes nunca sao mescladas automaticamente.

## Aliases

`riotIdAliases` guarda Riot IDs antigos ou alternativos. Um alias pode ser salvo depois de uma associacao manual, mas a opcao vem desmarcada e exige confirmacao. O mesmo Riot ID nao pode pertencer a dois `playerId`.

O painel permite desativar um alias sem apagar o registro. A acao fica em `identityAudit`, preserva todas as partidas ligadas ao `playerId` e impede que o alias desativado seja usado em novas associacoes automaticas. Uma confirmacao posterior pode reativa-lo para o mesmo jogador.

## Associacao de replay

A ordem e: Riot ID principal exato/normalizado, alias exato/normalizado e associacao manual. Correspondencia aproximada nao confirma automaticamente. Participantes convidados, substitutos ou ainda nao identificados podem ser salvos mediante confirmacao explicita.

Cada participacao preserva o Riot ID encontrado no replay, o `playerId` associado, o metodo de identificacao, o time, a lane, o campeao e os numeros da partida.

## Reconstrucao

As agregacoes usam `playerId`. Alterar um alias nao modifica partidas brutas: o sistema reconstroi os totais a partir dos registros historicos.
