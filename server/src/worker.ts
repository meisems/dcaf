// Cloudflare entry. One Durable Object ("main") owns the engine: its SQLite storage holds
// all state, and an alarm loop indexes the chain, closes rounds and sends payouts.
import { DurableObject } from "cloudflare:workers";
import { CFG, initConfig, type EnvLike } from "./config.ts";
import { bindToken, makeDb, type Db, type Driver, type Row } from "./db.ts";
import { Engine } from "./engine.ts";
import { indexPass, type Seen, type Sink } from "./indexer.ts";
import { loadToken, refreshMarket } from "./market.ts";
import { finalHeight } from "./near.ts";
import { sendPayouts } from "./payouts.ts";
import { Reader } from "./read.ts";
import { CC, route } from "./routes.ts";

interface Env {
  ENGINE: DurableObjectNamespace<EngineDO>;
  [key: string]: unknown;
}

const TICK_MS = 2000; // live cadence
const CATCHUP_MS = 200; // while backfilling

/** Variables & Secrets from the dashboard, as plain strings. */
const strings = (env: Env): EnvLike =>
  Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === "string")) as EnvLike;

export class EngineDO extends DurableObject<Env> {
  private db!: Db;
  private engine!: Engine;
  private reader!: Reader;
  private sink!: Sink;
  private seen: Seen = new Map();
  private start = 0;
  private error: string | null = "booting";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => this.boot());
  }

  private async boot() {
    try {
      initConfig(strings(this.env));
      const sql = this.ctx.storage.sql;
      const driver: Driver = {
        exec: (q) => void sql.exec(q),
        run: (q, a) => void sql.exec(q, ...a),
        all: (q, a) => sql.exec(q, ...a).toArray() as Row[],
        tx: (fn) => this.ctx.storage.transactionSync(fn),
      };
      this.db = makeDb(driver);
      bindToken(this.db, CFG.token, CFG.resetId);
      this.engine = new Engine(this.db);
      this.reader = new Reader(this.db, this.engine);
      this.sink = {
        onBlock: (b, swaps) => this.engine.onBlock(b, swaps),
        onClock: (t, height) => {
          this.engine.headHeight = height;
          this.engine.onClock(t, height);
        },
      };
      await loadToken(this.engine, this.db);
      // the first block is fixed on first boot so later config edits can't rewind history
      this.start = this.db.meta.num("startBlock") || CFG.startBlock || (await finalHeight());
      this.db.meta.set("startBlock", this.start);
      if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 500);
      this.error = null;
    } catch (e) {
      this.error = (e as Error).message;
      console.error("boot:", this.error);
    }
  }

  async fetch(req: Request): Promise<Response> {
    if (this.error) await this.boot();
    if (this.error) return json(req, 503, { error: "engine not ready", detail: this.error }, CC.none);
    const url = new URL(req.url);
    try {
      const r = route(this.reader, this.engine, url.pathname, url.searchParams);
      return r ? json(req, r.status, r.body, r.cache) : json(req, 404, { error: "not found" }, CC.none);
    } catch (e) {
      console.error(e);
      return json(req, 500, { error: "internal error" }, CC.none);
    }
  }

  async alarm() {
    if (this.error) await this.boot();
    if (this.error) return void (await this.ctx.storage.setAlarm(Date.now() + 60_000));
    const t0 = Date.now();
    let state: "behind" | "live" | "idle" = "idle";
    try {
      await refreshMarket(this.engine);
      do state = await indexPass(this.db, this.sink, this.start, this.seen);
      while (state === "behind" && Date.now() - t0 < 20_000);
      await sendPayouts(this.db, 8000);
    } catch (e) {
      console.warn("tick:", (e as Error).message);
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + (state === "behind" ? CATCHUP_MS : TICK_MS));
    }
  }
}

async function json(req: Request, status: number, body: unknown, cache: string): Promise<Response> {
  const text = JSON.stringify(body);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)));
  const etag = `"${[...digest.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": cache,
    etag,
    "access-control-allow-origin": CFG?.cors ?? "*",
    "access-control-expose-headers": "etag",
  });
  if (status === 200 && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(text, { status, headers });
}

const engineStub = (env: Env) => env.ENGINE.get(env.ENGINE.idFromName("main"));

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, if-none-match" } });
    if (!url.pathname.startsWith("/api/")) return new Response("dcainnear engine · see /api/health", { headers: { "content-type": "text/plain" } });
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });

    // edge cache in front of the Durable Object: at most one engine hit per URL per second
    const key = new Request(url.toString(), { method: "GET" });
    const cache = (caches as unknown as { default: Cache }).default;
    let res = url.pathname === "/api/health" ? undefined : await cache.match(key);
    if (!res) {
      res = await engineStub(env).fetch(key);
      if (res.status === 200 && url.pathname !== "/api/health") ctx.waitUntil(cache.put(key, res.clone()));
    }
    const inm = req.headers.get("if-none-match");
    if (inm && inm === res.headers.get("etag")) return new Response(null, { status: 304, headers: res.headers });
    return res;
  },

  // once a minute: make sure the engine is awake and its alarm loop is running
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await engineStub(env).fetch("https://engine/api/health");
  },
};
