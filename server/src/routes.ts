import { reads, txs } from "./near.ts";
import { CFG } from "./config.ts";
import type { Engine } from "./engine.ts";
import type { Reader } from "./read.ts";

/** Cache-Control per kind of response: short and revalidated for live data. */
export const CC = {
  live: "public, max-age=1, s-maxage=1, stale-while-revalidate=10",
  wallet: "public, max-age=2, s-maxage=2, stale-while-revalidate=10",
  rounds: "public, max-age=5, s-maxage=5, stale-while-revalidate=30",
  round: "public, max-age=30, s-maxage=30, stale-while-revalidate=300",
  none: "no-store",
};

export type Routed = { status: number; body: unknown; cache: string };

const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** The API, as plain data. Both the Worker and the local Node server render it. */
export function route(reader: Reader, engine: Engine, path: string, params: URLSearchParams): Routed | null {
  if (path === "/api/snapshot") return { status: 200, body: reader.snapshot(), cache: CC.live };
  if (path === "/api/health")
    return {
      status: 200,
      cache: CC.none,
      body: {
        ok: true, height: engine.lastHeight, lagSec: Math.max(0, Math.floor(Date.now() / 1000) - engine.lastBlockT), started: engine.started, holders: engine.holders(), dryRun: CFG.dryRun,
        rpc: { reads: reads().stats(), transactions: txs().stats() },
      },
    };
  if (path.startsWith("/api/wallet/")) {
    const id = decodeURIComponent(path.slice(12)).toLowerCase();
    if (!ACCOUNT.test(id) || id.length > 64) return { status: 400, body: { error: "not a NEAR account id" }, cache: CC.round };
    return { status: 200, body: reader.wallet(id), cache: CC.wallet };
  }
  if (path.startsWith("/api/rounds/")) {
    const no = Number(path.slice(12));
    const r = Number.isInteger(no) ? reader.round(no) : null;
    if (!r) return { status: 404, body: { error: "no such round" }, cache: CC.rounds };
    // a round is final once every payout has settled
    return { status: 200, body: r, cache: r.payouts.every((x) => x.status !== "pending") ? CC.round : CC.wallet };
  }
  if (path === "/api/rounds") return { status: 200, body: reader.rounds(Math.min(500, Number(params.get("limit")) || 100)), cache: CC.rounds };
  if (path.startsWith("/api/")) return { status: 404, body: { error: "not found" }, cache: CC.none };
  return null;
}
