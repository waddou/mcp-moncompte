# mcp-moncompte

Serveur **MCP (Model Context Protocol)** en **lecture seule** qui expose le catalogue de
notices de **moncompte.org** aux agents IA (Claude, etc.), déployé sur **Cloudflare Workers**.

- **Stack** : TypeScript + Cloudflare Workers + Durable Objects + SDK MCP officiel + Zod
- **Source de données** : endpoints publics du site **statique** moncompte.org (Astro / Cloudflare
  Pages) — pas de WP REST. La recherche **et** `get_article` lisent **`/search-index.json`**
  (index plein-texte généré au build : titre, slug, description, **corps complet**). La ressource
  `about` proxifie **`/llms.txt`**. Aucun secret requis.
- **Cache** : edge Cloudflare 1 h sur chaque appel

> **Dépendance** : `search_articles` et `get_article` reposent sur `https://moncompte.org/search-index.json`,
> produit par le site Astro (endpoint `src/pages/search-index.json.js`). Cet index **exclut déjà**
> les articles datés dans le futur (`isPublished`) et les brouillons (`draft`) — le MCP ne voit donc
> que le contenu réellement en ligne. L'index est régénéré à chaque build/déploiement du site.

## Outils & ressource exposés

| Type | Nom | Rôle |
|------|-----|------|
| Outil | `search_articles` | Recherche par mots-clés (titre, slug, URL, extrait) |
| Outil | `get_article` | Contenu complet d'un article (par slug) |
| Ressource | `moncompte://about` | Proxy du `llms.txt` de moncompte.org |

## Endpoints

- `/sse` — Server-Sent Events (clients historiques)
- `/mcp` — Streamable HTTP (transport recommandé)
- Rate-limit : **100 req / 60 s par IP** (binding natif Workers)
- Durable Object : `NoticielMCP` (classe `McpAgent`)

## Développement

```bash
npm install
npm run dev          # wrangler dev (local)
npm run typecheck    # tsc --noEmit
```

## Déploiement

```bash
npx wrangler login   # une fois (compte Cloudflare)
npm run deploy       # wrangler deploy
```

> Le binding de rate-limit (`[[unsafe.bindings]]` type `ratelimit`) requiert **Wrangler ≥ 4.36**.
> Le Durable Object McpAgent utilise le stockage SQLite (migration `new_sqlite_classes`).

## Connecter un client MCP

- **URL** : `https://mcp-moncompte.<ton-sous-domaine>.workers.dev/mcp` (ou `/sse`)
- **Claude Desktop / autres** : via `mcp-remote` :

```json
{
  "mcpServers": {
    "moncompte": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp-moncompte.<sous-domaine>.workers.dev/sse"]
    }
  }
}
```

## Notes

- Aucune écriture : le serveur ne fait que lire l'API publique de moncompte.org.
- Les versions de `agents` et `@modelcontextprotocol/sdk` évoluent vite : en cas d'erreur de
  build, faire `npm install agents@latest @modelcontextprotocol/sdk@latest`.
