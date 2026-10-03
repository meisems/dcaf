import { allocate, vaultCut, weight } from "../../shared/rules.ts";
import { CFG } from "./config.ts";
import type { Db } from "./db.ts";
import type { Move, ParsedBlock, Swap } from "./indexer.ts";
import { nearToYocto, units, yoctoToNear } from "./near.ts";

type Win = { no: number; start: number; close_at: number };

/**
 * The state machine. Every finalized block goes through `onBlock` in order:
 *   1. close any window whose time has passed (by block time, never wall time)
 *   2. apply the block's buys / sells / moves
 * so the result is the same whether the engine runs live or replays history.
 */
export class Engine {
  decimals = 18;
  price: number | null = null; // NEAR per token
  lastBlockT = 0;
  lastHeight = 0;
  headHeight = 0;
  vaultBalance: number | null = null;
  usdPerNear: number | null = null;
  supply: number | null = null;

  private db: Db;
  private q;

  constructor(db: Db) {
    this.db = db;
    this.lastBlockT = db.meta.num("lastT");
    this.lastHeight = db.meta.num("done");
    const d = db;
    this.q = {
      win: d.prepare("SELECT no, start, close_at FROM windows WHERE closed_at IS NULL ORDER BY no DESC LIMIT 1"),
      lastNo: d.prepare("SELECT COALESCE(MAX(no), 0) AS n FROM windows"),
      openWin: d.prepare("INSERT INTO windows (no, start, close_at) VALUES (?, ?, ?)"),
      closeWin: d.prepare("UPDATE windows SET closed_at = ?, pool = ?, paid = ?, rolled = ?, qualifiers = ?, golden = ? WHERE no = ?"),
      trade: d.prepare(
        "INSERT INTO trades (t, block, w, side, tokens, q, p, tx, receipt, idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
      ),
      ensure: d.prepare("INSERT INTO wallets (id) VALUES (?) ON CONFLICT DO NOTHING"),
      buy: d.prepare(
        "UPDATE wallets SET total = total + ?, tokens = tokens + ?, first_at = COALESCE(first_at, ?), last_buy_at = ? WHERE id = ?",
      ),
      sell: d.prepare(
        "UPDATE wallets SET tokens = MAX(0, tokens - ?), sold = 1, streak = 0, out_at = COALESCE(out_at, ?) WHERE id = ?",
      ),
      move: d.prepare(
        "UPDATE wallets SET tokens = MAX(0, tokens - ?), moved = 1, streak = 0, out_at = COALESCE(out_at, ?) WHERE id = ?",
      ),
      recv: d.prepare("UPDATE wallets SET tokens = tokens + ? WHERE id = ?"),
      winBuy: d.prepare("INSERT INTO window_buys (no, w, q) VALUES (?, ?, ?) ON CONFLICT (no, w) DO UPDATE SET q = q + excluded.q"),
      quals: d.prepare(`
        SELECT b.w AS w, b.q AS q, w.streak AS streak FROM window_buys b JOIN wallets w ON w.id = b.w
        WHERE b.no = ? AND b.q >= ? AND w.total >= ? AND w.sold = 0 AND w.moved = 0`),
      resetStreaks: d.prepare(`
        UPDATE wallets SET streak = 0 WHERE streak > 0 AND id NOT IN (
          SELECT b.w FROM window_buys b JOIN wallets w ON w.id = b.w
          WHERE b.no = ? AND b.q >= ? AND w.total >= ? AND w.sold = 0 AND w.moved = 0)`),
      bump: d.prepare("UPDATE wallets SET streak = streak + 1, best = MAX(best, streak + 1) WHERE id = ?"),
      payout: d.prepare("INSERT INTO payouts (no, w, amount, yocto, streak, buy, status) VALUES (?, ?, ?, ?, ?, ?, ?)"),
      earn: d.prepare("UPDATE wallets SET earned = earned + ? WHERE id = ?"),
      unsent: d.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM payouts WHERE status = 'pending'"),
      holders: d.prepare("SELECT COUNT(*) AS n FROM wallets WHERE tokens > 0"),
    };
  }

  get started() {
    return this.db.meta.num("started") === 1;
  }

  /** Wallets that hold the token right now (the token, DEXes and the vault are never wallets). */
  holders(): number {
    return (this.q.holders.get() as { n: number }).n;
  }

  current(): Win | null {
    return (this.q.win.get() as Win | undefined) ?? null;
  }

  /** NEAR the next close can split: accrued vault fees not yet committed, and never more than the vault holds. */
  pool(): number {
    const m = this.db.meta;
    let p = Math.max(0, m.num("accrued") - m.num("committed"));
    if (!CFG.dryRun && this.vaultBalance !== null) {
      const unsent = (this.q.unsent.get() as { s: number }).s;
      p = Math.min(p, Math.max(0, this.vaultBalance - CFG.reserve - unsent));
    }
    return p;
  }

  /** One block's token events, applied atomically together with the cursor. */
  onBlock(b: ParsedBlock, swaps: Map<string, Swap>) {
    this.db.tx(() => {
      this.lastBlockT = b.t;
      this.lastHeight = b.height;
      this.advanceTo(b.t);
      for (const m of b.moves) this.apply(m, b, swaps.get(m.tx));
      this.db.meta.set("done", b.height);
    });
  }

  /** The indexed chain clock moved: close windows even when nobody trades. */
  onClock(t: number, height: number) {
    this.db.tx(() => {
      this.lastBlockT = Math.max(this.lastBlockT, t);
      this.lastHeight = Math.max(this.lastHeight, height);
      this.db.meta.set("lastT", this.lastBlockT);
      this.advanceTo(t);
    });
  }

  // ---------------------------------------------------------------- windows

  private advanceTo(t: number) {
    if (!this.started) {
      // rounds begin once the indexer is live, so history never pays out retroactively,
      // and only once enough wallets hold the token for a round to mean something
      if (Date.now() / 1000 - t > CFG.liveLagSec) return;
      const holders = this.holders();
      if (holders < CFG.rules.minHolders) return;
      this.db.meta.set("started", 1);
      this.db.meta.set("startedAt", t);
      this.open(t);
      console.log(`▶ live at block ${this.lastHeight} with ${holders} holders: window #1 open`);
      return;
    }
    for (let w = this.current(); w && t >= w.close_at; w = this.current()) {
      this.close(w);
      this.open(w.close_at);
    }
  }

  private open(start: number) {
    const no = (this.q.lastNo.get() as { n: number }).n + 1;
    const len = randomInt(CFG.rules.roundMin * 60, CFG.rules.roundMax * 60 + 1);
    this.q.openWin.run(no, start, start + len);
  }

  private close(w: Win) {
    const R = CFG.rules;
    const m = this.db.meta;
    const quals = this.q.quals.all(w.no, R.minBuy, R.minTotal) as { w: string; q: number; streak: number }[];
    this.q.resetStreaks.run(w.no, R.minBuy, R.minTotal);
    for (const x of quals) this.q.bump.run(x.w);

    const pool = this.pool();
    const stack = m.num("goldenStack");
    let paid = 0;
    let golden = 0;
    if (!quals.length) {
      m.set("goldenStack", stack + 1);
    } else {
      const alloc = allocate(quals.map((x) => weight(x.streak + 1, x.q, R)), pool, R);
      quals.forEach((x, i) => {
        if (alloc[i] <= 0) return;
        const yocto = nearToYocto(alloc[i]);
        const amount = yoctoToNear(yocto);
        this.q.payout.run(w.no, x.w, amount, yocto.toString(), x.streak + 1, x.q, CFG.dryRun ? "dry" : "pending");
        this.q.earn.run(amount, x.w);
        paid += amount;
      });
      golden = stack > 0 ? stack + 1 : 0;
      m.set("goldenStack", 0);
    }
    m.set("committed", m.num("committed") + paid);
    m.set("totalPaid", m.num("totalPaid") + paid);
    this.q.closeWin.run(w.close_at, pool, paid, pool - paid, quals.length, golden, w.no);
    console.log(`■ round #${w.no}: ${quals.length} DCAers, pool ${pool.toFixed(4)}, paid ${paid.toFixed(4)} NEAR${CFG.dryRun ? " (dry)" : ""}`);
  }

  // ---------------------------------------------------------------- trades

  private value(m: Move, tokens: number, s: Swap | undefined): { q: number; exact: boolean } {
    const raw = BigInt(m.raw);
    if (m.kind === "buy" && s && s.nearIn > 0n && s.tokOut > 0n)
      return { q: yoctoToNear(s.nearIn) * Math.min(1, Number(raw) / Number(s.tokOut)), exact: true };
    if (m.kind === "sell" && s && s.nearOut > 0n && s.tokIn > 0n)
      return { q: yoctoToNear(s.nearOut) * Math.min(1, Number(raw) / Number(s.tokIn)), exact: true };
    return { q: this.price ? tokens * this.price : 0, exact: false };
  }

  private accrue(q: number) {
    const m = this.db.meta;
    m.set("accrued", m.num("accrued") + vaultCut(q, CFG.rules));
  }

  private apply(m: Move, b: ParsedBlock, swap: Swap | undefined) {
    const tokens = units(m.raw, this.decimals);
    this.q.ensure.run(m.w);
    if (m.kind === "recv") return void this.q.recv.run(tokens, m.w);
    if (m.kind === "move") return void this.q.move.run(tokens, b.t, m.w);

    let { q, exact } = this.value(m, tokens, swap);
    // a swap log that implies a wildly different price is probably a multi-hop or partial route: use spot
    if (exact && this.price && tokens > 0 && (q / tokens > this.price * 3 || q / tokens < this.price / 3)) {
      q = tokens * this.price;
      exact = false;
    }
    const p = tokens > 0 && q > 0 ? q / tokens : (this.price ?? 0);
    if (exact && q > 0) this.price = p;
    this.q.trade.run(b.t, b.height, m.w, m.kind, tokens, q, p, m.tx, m.receipt, m.idx);

    if (m.kind === "buy") {
      this.q.buy.run(q, tokens, b.t, b.t, m.w);
      const w = this.started ? this.current() : null;
      if (w && q > 0) this.q.winBuy.run(w.no, m.w, q);
    } else {
      this.q.sell.run(tokens, b.t, m.w);
    }
    if (this.started) this.accrue(q);
  }
}

/** Uniform integer in [min, max) from the platform CSPRNG (works in Node and Workers). */
function randomInt(min: number, max: number) {
  const span = max - min;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / span) * span; // reject the biased tail
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return min + (buf[0] % span);
}
