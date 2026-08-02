# Publicação do Fantasy Liga RK

## Pré-requisitos

- backup externo validado;
- Node.js 18 ou superior;
- Wrangler autenticado com o account correto;
- acesso de gravação ao repositório GitHub Pages;
- mercado global fechado;
- secrets administrativos definidos.

## Validação local

```powershell
npm test
npm run check
npm run build:public
npm run smoke:public
```

O build regenera `assets/fantasy-source.json` antes de copiar o site para
`dist`.

## GitHub Pages

Publique o repositório no branch `main` ou `master`. O workflow
`.github/workflows/pages.yml` executa testes, build e smoke test antes do
deploy. Espere a fonte responder em:

`https://liga-rk.github.io/liga-rk-26-2/assets/fantasy-source.json`

Não aplique a sincronização no D1 antes de esse arquivo estar publicado.

## D1 e Worker

Dentro de `worker`:

```powershell
npx wrangler d1 migrations list liga-rk-fantasy --remote
npx wrangler d1 migrations apply liga-rk-fantasy --remote
npx wrangler deploy
```

Defina os secrets sem registrá-los no histórico:

```powershell
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_RATE_LIMIT_SALT
npx wrangler secret put DISCORD_CLIENT_SECRET
```

Defina `ADMIN_USERNAME` como variável ou secret no dashboard. A configuração de
assets executa primeiro o Worker para `/api/*`, `/admin`, `/admin/*` e
`/health`.

## Cloudflare Access

O site público e `/api/fantasy/*` precisam permanecer acessíveis aos usuários.
Não use uma política Access que intercepte todo o domínio do Worker. Se Access
for mantido como defesa adicional, limite-o a `/admin*`; a autenticação e todas
as autorizações continuam sendo realizadas pelo Worker.

## Ordem pós-deploy

1. confira `/health`;
2. confirme que a API pública não retorna tela de Cloudflare Access;
3. entre em `/admin`;
4. confirme mercado fechado;
5. gere backup manual;
6. gere prévia de sincronização;
7. resolva alertas;
8. aplique sincronização;
9. importe a rodada 1 e confirme `pricesPreserved: true`;
10. compare contagens e preços com o manifesto anterior;
11. mantenha o mercado fechado até a abertura manual.

## Variáveis

| Nome | Tipo | Finalidade |
|---|---|---|
| `ADMIN_USERNAME` | secret/var | usuário administrativo |
| `ADMIN_PASSWORD_HASH` | secret | PBKDF2-SHA256 |
| `ADMIN_RATE_LIMIT_SALT` | secret | anonimização do limitador |
| `DISCORD_CLIENT_ID` | var | OAuth público |
| `DISCORD_CLIENT_SECRET` | secret | OAuth público |
| `SITE_URL` | var | retorno para o Fantasy |
| `ALLOWED_ORIGINS` | var | origem GitHub Pages permitida |
| `FANTASY_SOURCE_URL` | var | fonte oficial consolidada |
