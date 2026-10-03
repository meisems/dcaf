import { useSyncExternalStore } from "react";
import { API_URL } from "../config";
import type { Round, Snapshot, WalletReport } from "../../shared/types.ts";

export type { BoardRow, Info, Payout, Round, Snapshot, Status, Trade, WalletReport } from "../../shared/types.ts";

type State = { snap: Snapshot | null; online: boolean; loaded: boolean; stale: boolean };

const SNAP_KEY = "dcaf-snap-v1";
const SNAP_MAX_AGE = 15 * 60_000;

/** Last good snapshot from this browser, so a revisit paints instantly. */
function restore(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    const { at, snap } = JSON.parse(raw) as { at: number; snap: Snapshot };
    return Date.now() - at < SNAP_MAX_AGE ? snap : null;
  } catch {
    return null;
  }
}

function persist(snap: Snapshot) {
  try {
    // keep it small: the recent tape is enough for a first paint
    const slim = { ...snap, trades: snap.trades.slice(-300), rounds: snap.rounds.slice(0, 20) };
    localStorage.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), snap: slim }));
  } catch {
    /* storage full or blocked: caching is a bonus */
  }
}

const idle = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 200));

/** One poller for the whole app: every page reads the same live snapshot. */
class Live {
  state: State;
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fails = 0;
  private savedAt = 0;
  private body = "";

  constructor() {
    const cached = typeof window === "undefined" ? null : restore();
    this.state = { snap: cached, online: true, loaded: !!cached, stale: !!cached };
  }

  start() {
    if (!this.timer) void this.poll();
  }

  private async poll() {
    try {
      // "no-cache" = revalidate with the ETag: unchanged data comes back as a tiny 304
      const r = await fetch(`${API_URL}/api/snapshot`, { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      this.fails = 0;
      if (text === this.body && this.state.online && !this.state.stale) return this.next(false);
      this.body = text;
      const snap = JSON.parse(text) as Snapshot;
      this.state = { snap, online: true, loaded: true, stale: false };
      if (Date.now() - this.savedAt > 10_000) (this.savedAt = Date.now()), idle(() => persist(snap));
    } catch {
      this.fails += 1;
      const online = this.fails < 3;
      if (online === this.state.online && this.state.loaded) return this.next(false);
      this.state = { ...this.state, online, loaded: true };
    }
    this.next(true);
  }

  /** Tell subscribers (only when something changed) and schedule the next poll. */
  private next(changed: boolean) {
    if (changed) this.subs.forEach((f) => f());
    const hidden = typeof document !== "undefined" && document.hidden;
    this.timer = setTimeout(() => void this.poll(), hidden ? 15_000 : Math.min(2000 * 2 ** Math.max(0, this.fails - 1), 20_000));
  }

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    this.start();
    return () => void this.subs.delete(fn);
  };

  get = () => this.state;
}

export const live = new Live();

export function useLive() {
  return useSyncExternalStore(live.subscribe, live.get);
}

// ---------------------------------------------------------------- per-item caches

const wallets = new Map<string, { at: number; rep: WalletReport; text: string }>();
const rounds = new Map<number, Round>();

/** Whatever we last saw for this wallet (for an instant first paint). */
export const peekWallet = (id: string) => wallets.get(id)?.rep ?? null;

export async function getWallet(id: string): Promise<WalletReport> {
  const r = await fetch(`${API_URL}/api/wallet/${encodeURIComponent(id)}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status === 400 ? "Not a NEAR account" : "Engine unreachable");
  const text = await r.text();
  const hit = wallets.get(id);
  // same bytes as last time: hand back the same object, so nothing downstream re-renders
  const rep = hit && hit.text === text ? hit.rep : (JSON.parse(text) as WalletReport);
  wallets.set(id, { at: Date.now(), rep, text });
  if (wallets.size > 50) wallets.delete(wallets.keys().next().value!);
  return rep;
}

const inflight = new Map<string, Promise<WalletReport>>();
/** Warm a wallet report (on hover) so its page opens with data already there. */
export function prefetchWallet(id: string) {
  const hit = wallets.get(id);
  if ((hit && Date.now() - hit.at < 5000) || inflight.has(id)) return;
  const p = getWallet(id).catch(() => null as unknown as WalletReport).finally(() => inflight.delete(id));
  inflight.set(id, p);
}

export const peekRound = (no: number) => rounds.get(no) ?? null;

export async function getRound(no: number): Promise<Round | null> {
  const hit = rounds.get(no);
  if (hit && hit.payouts.every((p) => p.status !== "pending")) return hit; // settled rounds never change
  const r = await fetch(`${API_URL}/api/rounds/${no}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Engine unreachable");
  const round = (await r.json()) as Round;
  rounds.set(no, round);
  return round;
}
