/**
 * NEAR JSON-RPC over a pool of endpoints.
 *
 * Reads go to the public endpoints (fastest healthy one first) and fail over on network
 * errors, timeouts, rate limits and 5xx. Private endpoints (Lava, dRPC, …) are the last resort
 * for reads and the first choice for transactions. Keys live inside private URLs, so URLs are
 * never logged or exposed: only hostnames are.
 */

export type Endpoint = { url: string; host: string; priv: boolean; ms: number; fails: number; until: number; calls: number; errs: number };

/** Verified public endpoints (block + view + send_tx), fastest-first as measured. */
export const PUBLIC_RPC = {
  mainnet: [
    "https://free.rpc.fastnear.com",
    "https://rpc.mainnet.fastnear.com",
    "https://near.drpc.org",
    "https://rpc.shitzuapes.xyz",
    "https://rpc.intea.rs",
    "https://near-mainnet.gateway.tatum.io",
    "https://archival-rpc.mainnet.fastnear.com",
    "https://rpc.mainnet.near.org",
  ],
  testnet: [
    "https://test.rpc.fastnear.com",
    "https://rpc.testnet.fastnear.com",
    "https://near-testnet.drpc.org",
    "https://testnet-rpc.intea.rs",
    "https://near-testnet.gateway.tatum.io",
    "https://rpc.testnet.near.org",
  ],
};

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "invalid-url";
  }
};

export function endpoint(url: string, priv: boolean, order: number): Endpoint {
  // seed latency by position so the configured order wins until real timings come in
  return { url, host: hostOf(url), priv, ms: 300 + order * 60, fails: 0, until: 0, calls: 0, errs: 0 };
}

/** A JSON-RPC error that is about the request, not the node: retrying elsewhere won't help. */
export class RpcError extends Error {
  readonly data: unknown;
  readonly kind: string | undefined;
  constructor(msg: string, data: unknown, kind: string | undefined) {
    super(msg);
    this.data = data;
    this.kind = kind;
  }
}

const RETRYABLE = /rate|limit|too many|timeout|timed out|unavailable|overload|busy|internal|not synced|syncing|-429|429|502|503|504/i;

export class RpcPool {
  readonly label: string;
  readonly eps: Endpoint[];
  private headersFor: (host: string) => Record<string, string>;
  private timeoutMs: number;
  private byLatency: boolean;
  constructor(label: string, eps: Endpoint[], headersFor: (host: string) => Record<string, string> = () => ({}), timeoutMs = 8000, byLatency = true) {
    if (!eps.length) throw new Error(`No RPC endpoints for ${label}`);
    this.label = label;
    this.eps = eps;
    this.headersFor = headersFor;
    this.timeoutMs = timeoutMs;
    this.byLatency = byLatency;
  }

  /** Healthy endpoints first, by observed latency; private ones after public ones for reads. */
  order(now = Date.now()): Endpoint[] {
    const idx = new Map(this.eps.map((e, i) => [e, i]));
    return [...this.eps].sort(
      (a, b) =>
        Number(a.until > now) - Number(b.until > now) ||
        (this.byLatency ? Number(a.priv) - Number(b.priv) || a.ms - b.ms : idx.get(a)! - idx.get(b)!),
    );
  }

  async call<T>(method: string, params: unknown, opts: { timeoutMs?: number; rounds?: number } = {}): Promise<T> {
    const rounds = opts.rounds ?? 2;
    let last: unknown = null;
    for (let round = 0; round < rounds; round++) {
      for (const ep of this.order()) {
        try {
          return await this.once<T>(ep, method, params, opts.timeoutMs ?? this.timeoutMs);
        } catch (err) {
          if (err instanceof RpcError) throw err; // the request itself is wrong: same answer everywhere
          last = err;
        }
      }
      if (round < rounds - 1) await new Promise((r) => setTimeout(r, 600 * (round + 1)));
    }
    throw new Error(`${this.label}: all ${this.eps.length} RPC endpoints failed for ${method}: ${(last as Error)?.message ?? last}`);
  }

  private async once<T>(ep: Endpoint, method: string, params: unknown, timeoutMs: number): Promise<T> {
    const t0 = Date.now();
    ep.calls++;
    try {
      const r = await fetch(ep.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.headersFor(ep.host) },
        body: JSON.stringify({ jsonrpc: "2.0", id: "dcaf", method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await r.text();
      let j: { result?: T; error?: { message?: string; name?: string; cause?: { name?: string }; data?: unknown } } | null = null;
      try {
        j = JSON.parse(text);
      } catch {
        /* not JSON: a gateway page */
      }
      if (!r.ok && !j?.error) throw new Error(`${ep.host}: http ${r.status}`);
      if (j?.error) {
        const e = j.error;
        const msg = `${method}: ${e.cause?.name ?? e.name ?? ""} ${e.message ?? ""} ${typeof e.data === "string" ? e.data : JSON.stringify(e.data ?? "")}`.trim();
        // node trouble → try the next endpoint; anything else is a real answer
        if (!r.ok || RETRYABLE.test(msg) || e.name === "INTERNAL_ERROR") throw new Error(`${ep.host}: ${msg}`);
        this.ok(ep, Date.now() - t0);
        throw new RpcError(msg, e.data, e.cause?.name ?? e.name);
      }
      if (!j || !("result" in j)) throw new Error(`${ep.host}: bad response`);
      this.ok(ep, Date.now() - t0);
      return j.result as T;
    } catch (err) {
      if (!(err instanceof RpcError)) this.bad(ep);
      throw err;
    }
  }

  private ok(ep: Endpoint, ms: number) {
    ep.ms = ep.ms * 0.7 + ms * 0.3;
    ep.fails = 0;
    ep.until = 0;
  }

  private bad(ep: Endpoint) {
    ep.errs++;
    ep.fails++;
    ep.ms += 400;
    // cool off: 5s, 10s, 20s … up to 5 min
    ep.until = Date.now() + Math.min(300_000, 5000 * 2 ** (ep.fails - 1));
  }

  /** For /api/health: hostnames only, never full URLs (they may carry keys). */
  stats() {
    const now = Date.now();
    return this.order(now).map((e) => ({ host: e.host, private: e.priv, ok: e.until <= now, ms: Math.round(e.ms), calls: e.calls, errors: e.errs }));
  }
}
