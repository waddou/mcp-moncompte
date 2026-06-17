# Publier mcp-moncompte dans les annuaires

URL du serveur : `https://mcp-moncompte.wadie.workers.dev/mcp` (+ `/sse`).
Repo : https://github.com/waddou/mcp-moncompte

## a) Topics GitHub (fait)

`mcp`, `model-context-protocol`, `cloudflare-workers`, `llms-txt`, `france`
→ favorise l'auto-découverte par Glama, mcp.so, PulseMCP.

## b) Registre officiel MCP (mcp-publisher)

Le `server.json` (à la racine) décrit le serveur. Le namespace `io.github.waddou/...`
exige une auth GitHub prouvant que tu possèdes le compte `waddou`.

```bash
# 1. Installer la CLI (au choix)
brew install mcp-publisher
#   ou : télécharger le binaire depuis https://github.com/modelcontextprotocol/registry/releases

# 2. Depuis la racine du repo (là où se trouve server.json)
cd mcp-moncompte

# 3. S'authentifier (ouvre le navigateur, une seule fois)
mcp-publisher login github

# 4. Publier
mcp-publisher publish
```

> Vérifier ensuite la présence sur le registre. Pour republier après une montée de version,
> incrémenter `version` dans `server.json` puis relancer `mcp-publisher publish`.
> **CI automatique** : le workflow `.github/workflows/publish-registry.yml` republie au registre
> (OIDC, sans secret) à chaque push sur `main` modifiant `server.json` — donc **bump `version`
> puis push** suffit. Déclenchable aussi à la main (onglet Actions → *Publish to MCP Registry*).
> ⚠️ Le tout premier `publish` doit être fait **manuellement** une fois (`mcp-publisher login github`)
> pour valider la propriété du namespace ; ensuite la CI prend le relais.

## c) Smithery

- Fichier `smithery.yaml` fourni (HTTP, sans configuration requise).
- Comme le serveur est **déjà hébergé** (Cloudflare), le plus simple est de l'ajouter sur
  **smithery.ai** en tant que **serveur distant**, en pointant l'URL `…/mcp`.
  (Le déploiement Smithery depuis le repo n'est pas nécessaire ici.)

## Autres annuaires (auto-découverte ou formulaire)

- **Glama** (`glama.ai/mcp`), **mcp.so**, **PulseMCP** : souvent indexés depuis GitHub via les
  topics ; sinon, soumettre l'URL du repo.
- Voir `FICHE-SOUMISSION.md` pour les descriptions et métadonnées prêtes à coller.
