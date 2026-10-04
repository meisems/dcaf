// Cloudflare Pages Function: forwards /api/* to the engine Worker, so the site and its API share
// one origin (no CORS, browser caching just works).
//
// Dashboard setup (Pages project → Settings → Bindings), either:
//   • Service binding   ENGINE     → dcaf               (recommended)
//   • or a variable     ENGINE_URL = https://dcaf.<your-subdomain>.workers.dev
// With neither, requests go to the engine at DEFAULT_ENGINE_URL.

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
type Env = { ENGINE?: Fetcher; ENGINE_URL?: string };

const DEFAULT_ENGINE_URL = "https://dcaf.laidev.workers.dev";

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (env.ENGINE) return env.ENGINE.fetch(request);
  const url = new URL(request.url);
  const set = env.ENGINE_URL && !/^<[^>]*>$/.test(env.ENGINE_URL.trim()) ? env.ENGINE_URL : DEFAULT_ENGINE_URL; // <…> is a placeholder
  const target = set.replace(/\/$/, "") + url.pathname + url.search;
  return fetch(new Request(target, request));
};
