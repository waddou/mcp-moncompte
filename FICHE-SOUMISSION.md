# Fiche de soumission — mcp-moncompte

À coller dans les annuaires MCP (registre officiel, Glama, mcp.so, Smithery, PulseMCP, Cline…).

## Identité

| Champ | Valeur |
|-------|--------|
| **Nom** | mcp-moncompte |
| **Nom qualifié (registre)** | `io.github.waddou/mcp-moncompte` |
| **Version** | 1.0.0 |
| **Repo** | https://github.com/waddou/mcp-moncompte |
| **Licence** | MIT |
| **Auteur** | waddou |
| **Catégories / tags** | france, banque, assurance, administration, espace-client, connexion, support, web, read-only |

## Descriptions

**Courte (≤ 100 car.)**
> Recherche et lecture des guides de connexion de moncompte.org (MCP, lecture seule).

**Longue**
> Serveur MCP en lecture seule qui expose le catalogue de moncompte.org — des guides pas-à-pas
> pour se connecter aux espaces clients et comptes en ligne de marques et administrations
> françaises (banques, assurances, mutuelles, énergie, télécom, services publics). Les agents IA
> peuvent rechercher un guide par mots-clés et récupérer son contenu complet. Aucune authentification,
> aucune donnée personnelle : la source est le site public (index `/search-index.json` + `/llms.txt`).

## Endpoints (serveur distant, sans authentification)

| Transport | URL |
|-----------|-----|
| Streamable HTTP | `https://mcp-moncompte.wadie.workers.dev/mcp` |
| SSE | `https://mcp-moncompte.wadie.workers.dev/sse` |

## Outils exposés

### `search_articles`
Recherche les guides par mots-clés (titre, description **et contenu**). Renvoie titre, slug, URL, description.
- `query` (string, requis) — mots-clés, ex. « se connecter Revolut »
- `limit` (number, optionnel, 1-20, défaut 10) — nombre de résultats

### `get_article`
Renvoie le contenu complet d'un guide à partir de son slug (obtenu via `search_articles`).
- `slug` (string, requis) — ex. « mon-compte-revolut »

## Ressource exposée

- `moncompte://about` — le fichier `llms.txt` de moncompte.org (présentation + catalogue).

## Exemples d'utilisation (prompts)

- « Comment se connecter à mon compte Revolut ? » → `search_articles("Revolut")` puis `get_article("mon-compte-revolut")`
- « Trouve un guide pour récupérer un mot de passe oublié chez une mutuelle. »
- « Quelles banques en ligne sont couvertes par moncompte.org ? »

## Notes techniques

- Stack : Cloudflare Workers + Durable Objects + SDK MCP officiel + Zod.
- Lecture seule ; cache edge 1 h ; rate-limit 100 req/60 s par IP.
- N'expose que des articles **publiés** (les contenus programmés/brouillons sont exclus).

## Snippet de connexion (clients via mcp-remote)

```json
{
  "mcpServers": {
    "moncompte": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp-moncompte.wadie.workers.dev/mcp"]
    }
  }
}
```
