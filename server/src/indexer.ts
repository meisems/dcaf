import { CFG } from "./config.ts";
import type { Db } from "./db.ts";
import { sleep, txApi } from "./near.ts";

/**
 * Account-scoped indexer. Instead of streaming every block on NEAR, it asks FastNEAR's
 * transaction API for transactions that touch the token contract, fetches their full
 * receipt trees, and replays the token events in block order.
 *
 *   DEX → wallet      buy
 *   wallet → DEX      sell
 *   wallet → wallet   move (sender is out) + receive
 *   burn              move
 *
 * Ref swap logs inside the same transaction give the exact NEAR side of each trade.
 *
 * It also watches the fee wallet: NEAR (or wNEAR) that arrives there is fees received,
 * and a private share of it funds the rewards pool.
 */

export type Move = { kind: "buy" | "sell" | "move" | "recv"; w: string; raw: string; tx: string; receipt: string; idx: number };
export type Swap = { nearIn: bigint; nearOut: bigint; tokIn: bigint; tokOut: bigint };
export type ParsedBlock = { height: number; t: number; moves: Move[]; fees?: bigint }; // fees: yoctoNEAR received by the fee wallet

type Outcome = {
  block_height: number;
  block_timestamp: number | string;
  index: number;
  id: string;
  outcome: { executor_id: string; logs: string[]; status: Record<string, unknown> };
};
type Action = { Transfer?: { deposit: string }; FunctionCall?: { deposit: string } };
type Receipt = { predecessor_id: string; receiver_id: string; receipt: { Action?: { actions: (Action | string)[] } } };
type RawTx = { transaction: { hash: string }; execution_outcome: Outcome; receipts: { execution_outcome: Outcome; receipt?: Receipt }[] };
type AccountTx = { transaction_hash: string; tx_block_height: number };

const CHUNK = 2500; // blocks per pass while catching up (~25 min of chain)
const SWAP_RE = /^Swapped (\d+) (\S+) for (\d+) (\S+)/;
const isDex = (a: string) => CFG.dexes.has(a);
const counts = (a: string) => !CFG.excluded.has(a);

/** NEAR and token amounts swapped on the DEX across a whole transaction. */
function swapsOf(tx: RawTx): Swap {
  const s: Swap = { nearIn: 0n, nearOut: 0n, tokIn: 0n, tokOut: 0n };
  for (const r of tx.receipts) {
    const o = r.execution_outcome.outcome;
    if (!isDex(o.executor_id) || "Failure" in o.status) continue;
    for (const log of o.logs) {
      const m = SWAP_RE.exec(log);
      if (!m) continue;
      const [, aIn, tIn, aOut, tOut] = m;
      if (tIn === CFG.wrap) s.nearIn += BigInt(aIn);
      if (tOut === CFG.wrap) s.nearOut += BigInt(aOut);
      if (tIn === CFG.token) s.tokIn += BigInt(aIn);
      if (tOut === CFG.token) s.tokOut += BigInt(aOut);
    }
  }
  return s;
}

/** Token events in one receipt, classified. */
function movesOf(o: Outcome, tx: string): Move[] {
  const out = o.outcome;
  if (out.executor_id !== CFG.token || "Failure" in out.status) return [];
  const moves: Move[] = [];
  let idx = 0;
  for (const log of out.logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    let ev: { standard?: string; event?: string; data?: Record<string, string>[] };
    try {
      ev = JSON.parse(log.slice(11));
    } catch {
      continue;
    }
    if (ev.standard !== "nep141" || !Array.isArray(ev.data)) continue;
    for (const d of ev.data) {
      const push = (kind: Move["kind"], w: string) => moves.push({ kind, w, raw: d.amount, tx, receipt: o.id, idx: idx++ });
      if (ev.event === "ft_transfer") {
        const from = d.old_owner_id;
        const to = d.new_owner_id;
        if (isDex(from) && isDex(to)) continue;
        if (isDex(from)) counts(to) && push("buy", to);
        else if (isDex(to)) counts(from) && push("sell", from);
        else {
          if (counts(from)) push("move", from);
          if (counts(to)) push("recv", to);
        }
      } else if (ev.event === "ft_burn") {
        if (counts(d.owner_id)) push("move", d.owner_id);
      } else if (ev.event === "ft_mint") {
        if (counts(d.owner_id)) push("recv", d.owner_id);
      }
    }
  }
  return moves;
}

/**
 * yoctoNEAR that one receipt delivers to the fee wallet: NEAR attached by anyone else, or wNEAR
 * transferred to it. Gas refunds (from "system") and unwrapping its own wNEAR (from the wrap
 * contract) are not new money, so they don't count. Failed receipts deliver nothing.
 */
export function feeIn(o: Outcome, r: Receipt | undefined, fee: string): bigint {
  if ("Failure" in o.outcome.status) return 0n;
  let y = 0n;
  if (r && r.receiver_id === fee && r.predecessor_id !== fee && r.predecessor_id !== "system" && r.predecessor_id !== CFG.wrap) {
    for (const a of r.receipt.Action?.actions ?? []) {
      if (typeof a === "string") continue;
      const d = a.Transfer?.deposit ?? a.FunctionCall?.deposit;
      if (d) y += BigInt(d);
    }
  }
  if (o.outcome.executor_id === CFG.wrap) {
    for (const log of o.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const ev = JSON.parse(log.slice(11)) as { standard?: string; event?: string; data?: Record<string, string>[] };
        if (ev.standard !== "nep141" || ev.event !== "ft_transfer" || !Array.isArray(ev.data)) continue;
        for (const d of ev.data) if (d.new_owner_id === fee && d.old_owner_id !== fee) y += BigInt(d.amount);
      } catch {
        /* not an event */
      }
    }
  }
  return y;
}

export type Sink = {
  onBlock(b: ParsedBlock, swaps: Map<string, Swap>): void;
  /** the indexed chain clock moved forward (also when nothing happened) */
  onClock(t: number, height: number): void;
};

/**
 * Cursor logic: `done` is the highest receipt block already applied. Each pass re-reads
 * transactions from `txFrom` (the oldest tx that may still have receipts in flight) up to the
 * API's indexed head, applies receipts in (done, head], and moves both cursors.
 */
export type Seen = Map<string, RawTx>; // tx hash → full tx, kept while receipts may still land

/**
 * One indexing pass. Returns "behind" when there is more history to catch up on,
 * "live" when it reached the API's head, "idle" when nothing new was indexed yet.
 */
export async function indexPass(db: Db, sink: Sink, start: number, seen: Seen): Promise<"behind" | "live" | "idle"> {
  let done = db.meta.num("done", start - 1);
  let txFrom = db.meta.num("txFrom", start);

  const head = await txApi<{ blocks: { block_height: number; block_timestamp: string }[] }>("/v0/blocks", { limit: 1, desc: true });
  let top = head.blocks[0];
  if (!top || top.block_height <= done) return "idle";
  // catch up in bounded steps so a long backfill streams instead of loading everything at once
  const behind = top.block_height - done > CHUNK;
  if (behind) {
    const at = await txApi<{ block?: { block_height: number; block_timestamp: string } }>("/v0/block", { block_id: done + CHUNK });
    if (at.block) top = at.block;
  }

  // 1. which transactions touched the token or the fee wallet since txFrom
  const byHash = new Map<string, AccountTx>();
  for (const account of [CFG.token, CFG.feeAccount]) {
    let resume: string | undefined;
    do {
      const page = await txApi<{ account_txs: AccountTx[]; resume_token?: string }>("/v0/account", {
        account_id: account, desc: false, limit: 200,
        from_tx_block_height: txFrom, to_tx_block_height: top.block_height,
        ...(resume ? { resume_token: resume } : {}),
      });
      for (const a of page.account_txs) byHash.set(a.transaction_hash, a);
      resume = page.account_txs.length === 200 ? page.resume_token : undefined;
    } while (resume);
  }
  const hashes = [...byHash.values()];

  // 2. fetch full receipt trees (re-fetch in-flight ones: they may have grown)
  const need = hashes.filter((h) => !seen.has(h.transaction_hash) || inFlight(seen.get(h.transaction_hash)!, done)).map((h) => h.transaction_hash);
  for (let i = 0; i < need.length; i += 20) {
    const res = await txApi<{ transactions: RawTx[] }>("/v0/transactions", { tx_hashes: need.slice(i, i + 20) });
    for (const t of res.transactions) if (t) seen.set(t.transaction.hash, t);
  }

  // 3. collect receipts in (done, head], in chain order
  const items: { o: Outcome; r?: Receipt; tx: string }[] = [];
  const swaps = new Map<string, Swap>();
  for (const h of hashes) {
    const t = seen.get(h.transaction_hash);
    if (!t) continue;
    swaps.set(h.transaction_hash, swapsOf(t));
    for (const r of t.receipts) {
      const bh = r.execution_outcome.block_height;
      if (bh > done && bh <= top.block_height) items.push({ o: r.execution_outcome, r: r.receipt, tx: h.transaction_hash });
    }
  }
  items.sort((a, b) => a.o.block_height - b.o.block_height || a.o.index - b.o.index);

  let cur: ParsedBlock | null = null;
  const flush = () => cur && (cur.moves.length || cur.fees) && sink.onBlock(cur, swaps);
  for (const { o, r, tx } of items) {
    if (!cur || cur.height !== o.block_height) {
      flush();
      cur = { height: o.block_height, t: nsToS(o.block_timestamp), moves: [], fees: 0n };
    }
    cur.moves.push(...movesOf(o, tx));
    cur.fees = (cur.fees ?? 0n) + feeIn(o, r, CFG.feeAccount);
  }
  flush();

  // 4. advance cursors; keep the oldest tx that could still produce receipts
  done = top.block_height;
  sink.onClock(nsToS(top.block_timestamp), done);
  const pending = hashes.filter((h) => inFlight(seen.get(h.transaction_hash), done));
  txFrom = pending.length ? Math.min(...pending.map((h) => h.tx_block_height)) : done + 1;
  for (const [k, t] of seen) if (!inFlight(t, done) && t.execution_outcome.block_height < txFrom) seen.delete(k);
  db.meta.set("done", done);
  db.meta.set("txFrom", txFrom);
  return behind ? "behind" : "live";
}

/** Local runner: passes back to back while behind, gently polling once live. */
export async function run(db: Db, sink: Sink, stop: () => boolean, start: number) {
  const seen: Seen = new Map();
  while (!stop()) {
    const r = await indexPass(db, sink, start, seen).catch((e) => (console.warn("index:", (e as Error).message), "idle" as const));
    if (r !== "behind") await sleep(r === "idle" ? 600 : 800);
  }
}

const nsToS = (ns: number | string) => Math.floor(Number(BigInt(String(ns)) / 1_000_000_000n));

/** A tx is in flight if it was included recently enough that more receipts may still execute. */
function inFlight(t: RawTx | undefined, done: number) {
  if (!t) return true;
  return done - t.execution_outcome.block_height < 30;
}
