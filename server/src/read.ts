import { allocate, checksFor, statusOf, weight } from "../../shared/rules.ts";
import type { BoardRow, Info, Payout, Round, Snapshot, Trade, WalletReport } from "../../shared/types.ts";
import { CFG } from "./config.ts";
import type { Db } from "./db.ts";
import type { Engine } from "./engine.ts";

type WRow = {
  id: string; first_at: number | null; last_buy_at: number | null; total: number; tokens: number;
  sold: number; moved: number; streak: number; best: number; earned: number; wb: number | null;
};

const DAY = 86400;
// the fee split is operator configuration, not part of the public API
const publicRules = () => {
  const { feeBps: _f, vaultBps: _v, ...rest } = CFG.rules;
  return rest;
};

/** Read models for the API. Everything here is a query; nothing writes. */
export class Reader {
  private q;
  private db: Db;
  private engine: Engine;
  private cache: { at: number; snap: Snapshot } | null = null;

  constructor(db: Db, engine: Engine) {
    this.db = db;
    this.engine = engine;
    const d = db;
    const cols = "w.id, w.first_at, w.last_buy_at, w.total, w.tokens, w.sold, w.moved, w.streak, w.best, w.earned";
    this.q = {
      inWindow: d.prepare(`SELECT ${cols}, b.q AS wb FROM window_buys b JOIN wallets w ON w.id = b.w WHERE b.no = ?`),
      streaks: d.prepare(`SELECT ${cols}, b.q AS wb FROM wallets w LEFT JOIN window_buys b ON b.w = w.id AND b.no = ?
        WHERE w.sold = 0 AND w.moved = 0 AND (w.streak > 0 OR b.q IS NOT NULL) ORDER BY w.streak DESC, w.total DESC LIMIT 200`),
      earners: d.prepare(`SELECT ${cols}, b.q AS wb FROM wallets w LEFT JOIN window_buys b ON b.w = w.id AND b.no = ?
        WHERE w.earned > 0 ORDER BY w.earned DESC LIMIT 100`),
      one: d.prepare(`SELECT ${cols}, b.q AS wb FROM wallets w LEFT JOIN window_buys b ON b.w = w.id AND b.no = ? WHERE w.id = ?`),
      atRisk: d.prepare(`SELECT COUNT(*) AS n FROM wallets w LEFT JOIN window_buys b ON b.w = w.id AND b.no = ?
        WHERE w.streak > 0 AND w.sold = 0 AND w.moved = 0 AND COALESCE(b.q, 0) < ?`),
      buyers: d.prepare("SELECT COUNT(*) AS n FROM wallets WHERE first_at IS NOT NULL"),
      trades: d.prepare("SELECT t, w, side, q, p, tx FROM trades WHERE t >= ? ORDER BY id DESC LIMIT 4000"),
      tradesFor: d.prepare("SELECT t, w, side, q, p, tx FROM trades WHERE w = ? ORDER BY id DESC LIMIT 50"),
      first24: d.prepare("SELECT p FROM trades WHERE t >= ? AND q > 0 ORDER BY id ASC LIMIT 1"),
      lastP: d.prepare("SELECT p FROM trades WHERE q > 0 ORDER BY id DESC LIMIT 1"),
      vol: d.prepare("SELECT COALESCE(SUM(q), 0) AS v FROM trades WHERE t >= ?"),
      rounds: d.prepare("SELECT * FROM windows WHERE closed_at IS NOT NULL ORDER BY no DESC LIMIT ?"),
      round: d.prepare("SELECT * FROM windows WHERE no = ? AND closed_at IS NOT NULL"),
      payoutsOf: d.prepare("SELECT w, amount, streak, buy, tx, status FROM payouts WHERE no = ? ORDER BY amount DESC"),
      history: d.prepare(`SELECT p.no AS round, w.closed_at AS at, p.amount, p.streak, p.tx FROM payouts p
        JOIN windows w ON w.no = p.no WHERE p.w = ? ORDER BY p.no DESC LIMIT 100`),
      roundCount: d.prepare("SELECT COUNT(*) AS n FROM windows WHERE closed_at IS NOT NULL"),
    };
  }

  private info(now: number): Info {
    const e = this.engine;
    const m = this.db.meta;
    const w = e.current();
    const no = w?.no ?? 0;
    const R = CFG.rules;
    const inWin = w ? (this.q.inWindow.all(no) as WRow[]) : [];
    const live = inWin.filter((r) => statusOf(facts(r), R) === "dcaing");
    const streaks = w ? (this.q.streaks.all(no) as WRow[]) : [];
    const p24 = (this.q.first24.get(now - DAY) as { p: number } | undefined)?.p ?? null;
    const price = e.price ?? (this.q.lastP.get() as { p: number } | undefined)?.p ?? null;
    return {
      symbol: CFG.symbol,
      token: CFG.token,
      vaultAccount: CFG.vaultAccount,
      vaultBalance: e.vaultBalance,
      started: e.started,
      holders: e.holders(),
      syncing: !e.lastBlockT || now - e.lastBlockT > CFG.liveLagSec,
      lagSec: e.lastBlockT ? Math.max(0, now - e.lastBlockT) : 0,
      dryRun: CFG.dryRun,
      updatedAt: now,
      windowNo: no,
      windowStart: w?.start ?? 0,
      nextRoundAt: w?.close_at ?? 0,
      pool: e.pool(),
      accrued: m.num("accrued"),
      goldenStack: m.num("goldenStack"),
      dcaingNow: live.length,
      atRisk: w ? (this.q.atRisk.get(no, R.minBuy) as { n: number }).n : 0,
      topStreak: streaks.reduce((mx, r) => Math.max(mx, liveStreak(r)), 0),
      roundsRun: (this.q.roundCount.get() as { n: number }).n,
      totalPaid: m.num("totalPaid"),
      wallets: (this.q.buyers.get() as { n: number }).n,
      price,
      usdPerNear: e.usdPerNear,
      supply: e.supply,
      change24h: p24 && price ? price / p24 - 1 : null,
      volume24h: (this.q.vol.get(now - DAY) as { v: number }).v,
      rules: publicRules(),
    };
  }

  /** What each wallet in the window would get if it closed right now. */
  private estimates(rows: WRow[], pool: number) {
    const R = CFG.rules;
    const quals = rows.filter((r) => statusOf(facts(r), R) === "dcaing");
    const alloc = allocate(quals.map((r) => weight(r.streak + 1, r.wb ?? 0, R)), pool, R);
    const m = new Map<string, { est: number; share: number; rank: number }>();
    const order = quals.map((r, i) => ({ id: r.id, est: alloc[i], w: weight(r.streak + 1, r.wb ?? 0, R) })).sort((a, b) => b.w - a.w);
    order.forEach((x, i) => m.set(x.id, { est: x.est, share: pool ? x.est / pool : 0, rank: i + 1 }));
    return m;
  }

  snapshot(): Snapshot {
    const now = Math.floor(Date.now() / 1000);
    if (this.cache && now - this.cache.at < 1) return this.cache.snap;
    const info = this.info(now);
    const no = info.windowNo;
    const inWin = no ? (this.q.inWindow.all(no) as WRow[]) : [];
    const est = this.estimates(inWin, info.pool);
    const row = (r: WRow): BoardRow => {
      const e = est.get(r.id);
      return {
        id: r.id, status: statusOf(facts(r), CFG.rules), streak: r.streak, liveStreak: liveStreak(r),
        windowBuy: r.wb ?? 0, total: r.total, share: e?.share ?? 0, est: e?.est ?? 0, earned: r.earned,
      };
    };
    const next = inWin.map(row).filter((r) => r.status === "dcaing").sort((a, b) => b.est - a.est || b.liveStreak - a.liveStreak);
    const streaks = no ? (this.q.streaks.all(no) as WRow[]).map(row).slice(0, 100) : [];
    const allTime = (this.q.earners.all(no) as WRow[]).map(row);
    const trades = (this.q.trades.all(now - DAY) as Trade[]).reverse();
    const snap: Snapshot = { info, trades, board: { next, streaks, allTime }, rounds: this.rounds(60) };
    this.cache = { at: now, snap };
    return snap;
  }

  rounds(limit: number): Round[] {
    return (this.q.rounds.all(limit) as Record<string, number>[]).map((w) => this.toRound(w));
  }

  round(no: number): Round | null {
    const w = this.q.round.get(no) as Record<string, number> | undefined;
    return w ? this.toRound(w) : null;
  }

  private toRound(w: Record<string, number>): Round {
    return {
      no: w.no, at: w.closed_at, pool: w.pool, paid: w.paid, rolled: w.rolled, qualifiers: w.qualifiers, golden: w.golden,
      payouts: this.q.payoutsOf.all(w.no) as Payout[],
    };
  }

  wallet(id: string): WalletReport & { trades: Trade[] } {
    const now = Math.floor(Date.now() / 1000);
    const R = CFG.rules;
    const w = this.engine.current();
    const left = w ? Math.max(0, w.close_at - now) : 0;
    const r = this.q.one.get(w?.no ?? 0, id) as WRow | undefined;
    if (!r || r.first_at === null) {
      const f = { total: 0, windowBuy: 0, sold: !!r?.sold, moved: !!r?.moved, streak: 0 };
      return {
        id, known: false, status: statusOf(f, R) === "out" ? "out" : "idle", outReason: r?.sold ? "sold" : r?.moved ? "moved" : null,
        streak: 0, liveStreak: 0, bestStreak: 0, windowBuy: 0, total: 0, holding: r?.tokens ?? 0, earned: 0, rank: null, est: 0, share: 0,
        firstAt: null, lastBuyAt: null, checks: checksFor(R, f, left), history: [], trades: [],
      };
    }
    const pool = this.engine.pool();
    const est = w ? this.estimates(this.q.inWindow.all(w.no) as WRow[], pool).get(id) : undefined;
    const f = facts(r);
    return {
      id, known: true, status: statusOf(f, R), outReason: r.sold ? "sold" : r.moved ? "moved" : null,
      streak: r.streak, liveStreak: liveStreak(r), bestStreak: Math.max(r.best, r.streak),
      windowBuy: r.wb ?? 0, total: r.total, holding: r.tokens, earned: r.earned,
      rank: est?.rank ?? null, est: est?.est ?? 0, share: est?.share ?? 0,
      firstAt: r.first_at, lastBuyAt: r.last_buy_at,
      checks: checksFor(R, f, left),
      history: this.q.history.all(id) as WalletReport["history"],
      trades: this.q.tradesFor.all(id) as Trade[],
    };
  }
}

const facts = (r: WRow) => ({ total: r.total, windowBuy: r.wb ?? 0, sold: !!r.sold, moved: !!r.moved, streak: r.streak });
const liveStreak = (r: WRow) =>
  !r.sold && !r.moved && (r.wb ?? 0) >= CFG.rules.minBuy && r.total >= CFG.rules.minTotal ? r.streak + 1 : r.streak;
