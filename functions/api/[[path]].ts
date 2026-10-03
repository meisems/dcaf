// Cloudflare Pages Function: forwards /api/* to the engine Worker, so the site and its API share
// one origin (no CORS, browser caching just works).
//
// Dashboard setup (Pages project → Settings → Bindings), either:
//   • Service binding   ENGINE     → dcaf-engine        (recommended)
//   • or a variable     ENGINE_URL = https://dcaf-engine.<your-subdomain>.workers.dev

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
type Env = { ENGINE?: Fetcher; ENGINE_URL?: string };

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (env.ENGINE) return env.ENGINE.fetch(request);
  if (env.ENGINE_URL) {
    const url = new URL(request.url);
    const target = env.ENGINE_URL.replace(/\/$/, "") + url.pathname + url.search;
    return fetch(new Request(target, request));
  }
  return new Response(JSON.stringify({ error: "engine not connected", detail: "Add a service binding ENGINE (or variable ENGINE_URL) to this Pages project." }), {
    status: 502,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
