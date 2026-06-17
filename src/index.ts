/**
 * mcp-moncompte — Serveur MCP (Model Context Protocol) EN LECTURE SEULE
 * exposant le catalogue de notices de moncompte.org aux agents IA (Claude, etc.).
 *
 * Stack   : Cloudflare Workers + Durable Objects + SDK MCP officiel + Zod.
 * Source  : moncompte.org est un site STATIQUE (Astro / Cloudflare Pages) — il n'expose
 *           PAS d'API WP REST. On lit donc :
 *             • /search-index.json → index plein-texte (titre, slug, description, CORPS),
 *               généré au build. Exclut déjà les articles futurs et les brouillons.
 *             • /llms.txt          → catalogue lisible (ressource « about »)
 *           (aucun secret requis).
 * Endpoints : /sse (SSE) et /mcp (Streamable HTTP).
 * Rate-limit : 100 req / 60 s par IP (binding natif Workers).
 *
 * Outils   : search_articles (recherche mots-clés), get_article (contenu complet).
 * Ressource : moncompte://about (proxy du llms.txt).
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SITE = "https://moncompte.org";
const CACHE_TTL = 3600; // 1 h de cache edge Cloudflare

interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  // Binding natif de rate-limiting (optionnel : le Worker fonctionne même sans).
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

interface Article {
  slug: string;
  title: string;
  brand: string | null;
  category: string;
  url: string;
  description: string;
  publishedAt: string;
  text: string;
}

/** Récupère une ressource du site avec cache edge (1 h). */
async function siteFetch(path: string): Promise<Response> {
  return fetch(`${SITE}${path}`, { cf: { cacheTtl: CACHE_TTL, cacheEverything: true } });
}

/** Charge l'index de recherche (déjà filtré : ni futur, ni brouillon). */
async function loadIndex(): Promise<Article[]> {
  const res = await siteFetch("/search-index.json");
  if (!res.ok) throw new Error(`/search-index.json → HTTP ${res.status}`);
  return (await res.json()) as Article[];
}

/**
 * Durable Object MCP. La classe McpAgent (SDK Cloudflare « agents ») gère le
 * cycle de vie de la session MCP ; on déclare ici les outils et la ressource.
 */
export class NoticielMCP extends McpAgent<Env> {
  server = new McpServer({ name: "mcp-moncompte", version: "1.0.0" });

  async init() {
    // --- Outil 1 : recherche par mots-clés (sur tout le catalogue via llms.txt) ---
    this.server.tool(
      "search_articles",
      "Recherche des notices/guides « mon compte » de moncompte.org par mots-clés. " +
        "Retourne une liste (titre, slug, URL, description). Utiliser le slug avec get_article.",
      {
        query: z.string().min(2).describe("Mots-clés de recherche (ex. « se connecter Revolut »)."),
        limit: z.number().int().min(1).max(20).optional().describe("Nombre de résultats (1-20, défaut 10)."),
      },
      async ({ query, limit }) => {
        const n = limit ?? 10;
        const index = await loadIndex();
        const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
        if (terms.length === 0) {
          return { content: [{ type: "text", text: "Requête trop courte." }] };
        }
        const scored = index
          .map((a) => {
            const title = a.title.toLowerCase();
            const meta = `${title} ${(a.brand ?? "").toLowerCase()} ${a.description.toLowerCase()}`;
            const body = a.text.toLowerCase();
            // Un terme « présent » s'il est dans les métadonnées OU le corps.
            const present = terms.filter((t) => meta.includes(t) || body.includes(t)).length;
            // Score pondéré : titre/marque > description > corps.
            let score = 0;
            for (const t of terms) {
              if (title.includes(t)) score += 5;
              if ((a.brand ?? "").toLowerCase().includes(t)) score += 4;
              if (a.description.toLowerCase().includes(t)) score += 2;
              if (body.includes(t)) score += 1;
            }
            return { a, present, score };
          })
          .filter((s) => s.present === terms.length) // tous les termes présents quelque part
          .sort((x, y) => y.score - x.score)
          .slice(0, n)
          .map((s) => s.a);

        if (scored.length === 0) {
          return { content: [{ type: "text", text: `Aucun article trouvé pour « ${query} ».` }] };
        }
        const lines = scored.map(
          (a) => `• ${a.title}\n  slug : ${a.slug}\n  url  : ${a.url}\n  ${a.description}`,
        );
        return {
          content: [{ type: "text", text: `${scored.length} résultat(s) pour « ${query} » :\n\n${lines.join("\n\n")}` }],
        };
      },
    );

    // --- Outil 2 : contenu complet d'un article (HTML de la page) ---
    this.server.tool(
      "get_article",
      "Retourne le contenu complet d'une notice de moncompte.org à partir de son slug " +
        "(obtenu via search_articles).",
      {
        slug: z.string().min(1).describe("Slug de l'article (ex. « mon-compte-revolut »)."),
      },
      async ({ slug }) => {
        const clean = slug.replace(/^\/|\/$/g, "");
        const index = await loadIndex();
        const a = index.find((x) => x.slug === clean);
        if (!a) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Aucun article publié avec le slug « ${clean} ». ` +
                  `Il peut ne pas exister, être un brouillon, ou être daté dans le futur (non encore publié).`,
              },
            ],
            isError: true,
          };
        }
        const head = `# ${a.title}\n${a.url}\nPublié : ${a.publishedAt}\nCatégorie : ${a.category}\n\n`;
        return { content: [{ type: "text", text: head + a.text }] };
      },
    );

    // --- Ressource : proxy du llms.txt ---
    this.server.resource(
      "about",
      "moncompte://about",
      { mimeType: "text/plain", description: "À propos de moncompte.org (proxy du llms.txt)." },
      async (uri) => {
        const res = await siteFetch("/llms.txt");
        const text = res.ok ? await res.text() : "llms.txt momentanément indisponible.";
        return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
      },
    );
  }
}

/** IP cliente, pour la clé de rate-limit. */
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "anonymous"
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Rate-limit natif : 100 req / 60 s par IP (dégradé proprement si binding absent).
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: clientIp(request) });
      if (!success) {
        return new Response("Trop de requêtes. Réessayez dans une minute.", {
          status: 429,
          headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "60" },
        });
      }
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return NoticielMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (url.pathname === "/mcp") {
      return NoticielMCP.serve("/mcp").fetch(request, env, ctx);
    }
    if (url.pathname === "/") {
      return new Response(
        "mcp-moncompte — serveur MCP (lecture seule) du catalogue moncompte.org.\n\n" +
          "Endpoints :\n  /sse  — Server-Sent Events\n  /mcp  — Streamable HTTP\n\n" +
          "Outils : search_articles, get_article.\nRessource : moncompte://about.\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return new Response("Not found", { status: 404 });
  },
};
