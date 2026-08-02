# Rollback e recuperação do Fantasy Liga RK

## Backups externos de 29/07/2026

O pacote de segurança anterior às mudanças está em:

`work/audit/pre-change-cloudflare-backup-2026-07-29.zip`

SHA-256:

`E06B419F11ED8B5E62A8BDCCC944449A8266CB0C02A4AF38059A0368AEAEC0C8`

O inventário e os hashes individuais estão em
`work/audit/BACKUP-MANIFEST-2026-07-29.md`.

O dump completo do D1 está em:

`work/audit/cloudflare-live-2026-07-29/liga-rk-fantasy-d1-full.sql`

O Worker ativo anterior tinha a versão `cab2ed37`. A referência funcional do
site identificada foi `4eb01100017c625b1a287c82099d9756becaacac`.

## Rollback rápido somente do Worker

No dashboard Cloudflare, selecione a versão anterior validada do Worker e faça
rollback. Isso não altera o D1. Depois:

1. confirme que o mercado continua fechado;
2. teste `/health`;
3. teste a API pública;
4. teste login e leitura de escalação;
5. não reabra até conferir preços.

## Rollback do site

Republique o snapshot/commit funcional no GitHub Pages. Não restaure arquivos
antigos de preços sobre o D1. O banco continua sendo a fonte de valores atuais.

## Restauração pelo painel

Use para backups com a mesma migração do D1. O fluxo verifica hash, cria backup
de segurança e mantém o mercado fechado. Consulte `fantasy-operations.md`.

## Restauração integral do D1

Use somente se a restauração pelo painel não for possível.

1. feche/indisponibilize temporariamente as mutações;
2. exporte novamente o estado atual;
3. crie um banco D1 de recuperação, sem sobrescrever primeiro o banco ativo;
4. importe `liga-rk-fantasy-d1-full.sql` no banco de recuperação;
5. compare usuários, escalações, preços, estatísticas e rodadas;
6. aponte um Worker de homologação para o banco recuperado;
7. faça smoke test;
8. somente então troque o binding de produção.

Essa estratégia torna a recuperação reversível. Não apague o banco ativo.

## Consultas de verificação

```sql
SELECT COUNT(*) FROM fantasy_users;
SELECT COUNT(*) FROM fantasy_lineups;
SELECT COUNT(*) FROM fantasy_asset_round_scores;
SELECT division, COUNT(*), SUM(price_cents)
FROM fantasy_market GROUP BY division;
SELECT status, lock_round_number, closes_at
FROM fantasy_market_state WHERE id = 'global';
```

Compare também o fingerprint ordenado de
`division, asset_id, price_cents, previous_price_cents`.
