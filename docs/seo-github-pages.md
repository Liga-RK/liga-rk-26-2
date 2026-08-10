# SEO institucional no GitHub Pages

## Configuração central

As URLs públicas, metadata, páginas do sitemap e entidades institucionais ficam em `config/public-site.js`. Em uma futura migração de domínio, altere `ORIGIN` e `BASE_PATH` nesse arquivo e gere novamente o site com `npm run build:public`.

O build adiciona ao HTML publicado:

- title e meta description;
- canonical;
- Open Graph e Twitter Cards;
- JSON-LD institucional na home e na página Sobre;
- `sitemap.xml` com as páginas públicas indexáveis.

O comando `npm run smoke:public` valida esses artefatos e também impede que o build publique um `robots.txt` enganoso no subdiretório do projeto.

## Limitação do robots.txt

Este projeto é publicado em `https://liga-rk.github.io/liga-rk-26-2/`, mas um arquivo `robots.txt` só controla o host quando está disponível em `https://liga-rk.github.io/robots.txt`.

Por isso, este repositório não publica `liga-rk-26-2/robots.txt`. Para configurar regras de rastreamento enquanto o site estiver no GitHub Pages, é necessário alterar o repositório responsável pela raiz `liga-rk.github.io`, mediante autorização. Após a migração para um domínio próprio, publique o arquivo na raiz do novo domínio e aponte nele para o sitemap oficial.

## Ações após o deploy

1. Testar as URLs publicadas na ferramenta de inspeção do mecanismo de busca.
2. Enviar `https://liga-rk.github.io/liga-rk-26-2/sitemap.xml` no Google Search Console e no Bing Webmaster Tools.
3. Validar a home e `/sobre/` no Rich Results Test e no Schema Markup Validator usando as URLs já publicadas.
4. Solicitar nova indexação da home e da página Sobre depois que o deploy estiver no ar.
