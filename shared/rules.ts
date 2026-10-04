import type { PublicRules, RuleCheck, Rules, Status } from "./types.ts";

export const DEFAULT_RULES: Rules = {
  roundMin: 10,
  roundMax: 15,
  minBuy: 0.1,
  minTotal: 1,
  streakExp: 1,
  amountExp: 0.5,
  topN: 0,
  equalShare: 0.5,
  maxShare: 0.25,
  minPayout: 0.001,
  graceWindows: 0,
  minHolders: 15,
  feeBps: 300,
  vaultBps: 100,
};

export const weight = (streak: number, buy: number, r: PublicRules) =>
  streak <= 0 || buy <= 0 ? 0 : Math.pow(streak, r.streakExp) * Math.pow(buy, r.amountExp);

/**
 * Split `pool` by weight with a per-wallet cap. Capped wallets are fixed at the cap and the
 * rest is re-split among the others (water-filling). Whatever the cap leaves unassigned rolls over.
 */
export function splitPool(weights: number[], pool: number, maxShare: number): number[] {
  const cap = pool * maxShare;
  const out = new Array<number>(weights.length).fill(0);
  let open = weights.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
  let left = pool;
  while (open.length) {
    const W = open.reduce((s, i) => s + weights[i], 0);
    if (W <= 0) break;
    const over = open.filter((i) => (weights[i] / W) * left > cap);
    if (!over.length) {
      for (const i of open) out[i] = (weights[i] / W) * left;
      break;
    }
    for (const i of over) {
      out[i] = cap;
      left -= cap;
    }
    open = open.filter((i) => !over.includes(i));
  }
  return out;
}

export type WalletFacts = { total: number; windowBuy: number; sold: boolean; moved: boolean; streak: number };

export function statusOf(w: WalletFacts, r: PublicRules): Status {
  if (w.sold || w.moved) return "out";
  if (w.total < r.minTotal) return "notyet";
  if (w.windowBuy >= r.minBuy) return "dcaing";
  if (w.streak > 0) return "waiting";
  return "idle";
}

/** How many qualifiers are paid: everyone, unless the operator set a top N. */
export const paidCount = (r: PublicRules) => (r.topN > 0 ? r.topN : Infinity);

/**
 * Who gets paid and how much. Every qualifier is paid (or the top N, if set):
 *   - `equalShare` of the pool is split equally between them, so every DCAer gets a real slice;
 *   - the rest is split by weight, so consistency still earns more;
 *   - no wallet takes more than `maxShare` of the pool (relaxed to 1/n when there are few
 *     qualifiers, so the whole pool is still paid). What a cap trims goes to the others.
 * Returns allocations aligned with `weights`.
 */
export function allocate(weights: number[], pool: number, r: PublicRules): number[] {
  const order = weights.map((w, i) => [w, i] as const).filter(([w]) => w > 0).sort((a, b) => b[0] - a[0]);
  const paid = order.slice(0, paidCount(r)).map(([, i]) => i);
  const out = new Array<number>(weights.length).fill(0);
  if (!paid.length) return out;
  const n = paid.length;
  const W = paid.reduce((s, i) => s + weights[i], 0);
  for (const i of paid) out[i] = r.equalShare / n + (1 - r.equalShare) * (weights[i] / W);
  const alloc = splitPool(out, pool, Math.max(r.maxShare, 1 / n));
  return alloc.map((a) => (a < r.minPayout ? 0 : a));
}

/** NEAR that one trade adds to the vault. */
export const vaultCut = (q: number, r: Rules) => (q * r.vaultBps) / 10_000;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The four checks the engine runs at every close, phrased for people. */
export function checksFor(r: PublicRules, w: WalletFacts, secondsLeft: number): RuleCheck[] {
  const mins = Math.max(1, Math.ceil(secondsLeft / 60));
  const out = w.sold || w.moved;
  return [
    {
      key: "window",
      ok: w.windowBuy >= r.minBuy,
      pending: w.windowBuy < r.minBuy && !out,
      label: `${r.minBuy} NEAR this window`,
      detail: w.windowBuy >= r.minBuy ? `${r3(w.windowBuy)} NEAR in` : w.windowBuy > 0 ? `+${r3(r.minBuy - w.windowBuy)} NEAR · ~${mins} min left` : `~${mins} min left`,
    },
    {
      key: "total",
      ok: w.total >= r.minTotal,
      pending: w.total < r.minTotal && !out,
      label: `${r.minTotal} NEAR in total`,
      detail: `${r3(w.total)} / ${r.minTotal} NEAR`,
    },
    { key: "sold", ok: !w.sold, label: "Never sold", detail: w.sold ? "Sold once · out" : "Clean" },
    { key: "moved", ok: !w.moved, label: "Still holding", detail: w.moved ? "Tokens moved · out" : "All tokens here" },
  ];
}
