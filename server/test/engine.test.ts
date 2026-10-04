import assert from "node:assert/strict";
import { test } from "node:test";

// configure before the engine modules read their config
Object.assign(process.env, {
  TOKEN_CONTRACT: "dcainnear.tkn.near",
  VAULT_ACCOUNT: "vault.dcainnear.near",
  DEX_ACCOUNTS: "v2.ref-finance.near",
  VAULT_PRIVATE_KEY: "",
  ROUND_MIN: "10",
  ROUND_MAX: "10",
  TOP_N: "2",
  MIN_BUY: "0.1",
  MIN_TOTAL: "1",
  MIN_HOLDERS: "3",
  VAULT_BPS: "250",
});

const { initConfig } = await import("../src/config.ts");
initConfig(process.env);
const { openNodeDb: openDb } = await import("../src/db-node.ts");
const { Engine } = await import("../src/engine.ts");
const { Reader } = await import("../src/read.ts");
type Swap = import("../src/indexer.ts").Swap;
type Move = import("../src/indexer.ts").Move;

const DEX = "v2.ref-finance.near";
const RATE = 0.025; // VAULT_BPS above, as a fraction of volume
const E18 = 10n ** 18n;
const Y24 = 10n ** 24n;

function rig() {
  const db = openDb(":memory:");
  const engine = new Engine(db);
  const reader = new Reader(db, engine);
  let height = 1000;
  let n = 0;
  const t0 = Math.floor(Date.now() / 1000) - 3600; // an hour ago, replayed fast
  let t = t0;
  // buy: `near` NEAR in, 100 tokens out per NEAR (price 0.01)
  const block = (moves: { kind: Move["kind"]; w: string; near?: number; tokens?: number }[]) => {
    const swaps = new Map<string, Swap>();
    const ms: Move[] = moves.map((m) => {
      const tx = `tx${n++}`;
      const tokens = BigInt(Math.round((m.tokens ?? (m.near ?? 0) * 100) * 1000)) * (E18 / 1000n);
      if (m.kind === "buy") swaps.set(tx, { nearIn: BigInt(Math.round((m.near ?? 0) * 1e6)) * (Y24 / 1_000_000n), nearOut: 0n, tokIn: 0n, tokOut: tokens });
      if (m.kind === "sell") swaps.set(tx, { nearIn: 0n, nearOut: BigInt(Math.round((m.near ?? 0) * 1e6)) * (Y24 / 1_000_000n), tokIn: tokens, tokOut: 0n });
      return { kind: m.kind, w: m.w, raw: tokens.toString(), tx, receipt: `r${n}`, idx: 0 };
    });
    engine.onBlock({ height: ++height, t, moves: ms }, swaps);
  };
  const tick = (sec: number) => {
    t += sec;
    engine.onClock(t, ++height);
  };
  return { db, engine, reader, block, tick, start: () => {
    // the engine only opens window #1 once it is "live": pretend this block is now
    const real = t;
    t = Math.floor(Date.now() / 1000) - 5;
    engine.onClock(t, ++height);
    void real;
  }, now: () => t, DEX };
}

test("the timer waits for enough holders", () => {
  const r = rig();
  r.block([{ kind: "buy", w: "alice.near", near: 2 }, { kind: "buy", w: "bob.near", near: 2 }]);
  r.start();
  assert.equal(r.engine.holders(), 2);
  assert.equal(r.engine.started, false, "2 holders: no window yet");
  assert.equal(r.engine.current(), null);
  assert.equal(r.reader.snapshot().info.holders, 2);

  // a wallet that sold everything is not a holder
  r.block([{ kind: "buy", w: "carl.near", near: 1 }, { kind: "sell", w: "carl.near", near: 1, tokens: 100 }]);
  r.tick(1);
  assert.equal(r.engine.holders(), 2);
  assert.equal(r.engine.started, false);

  r.block([{ kind: "buy", w: "dan.near", near: 1 }]);
  r.tick(1);
  assert.equal(r.engine.started, true, "3rd holder starts the timer");
  assert.equal(r.engine.current()?.no, 1);
});

test("streaks, top-N split, dropouts and golden rounds", () => {
  const r = rig();
  // history before rounds start: counts toward totals, never pays
  r.block([{ kind: "buy", w: "alice.near", near: 2 }, { kind: "buy", w: "bob.near", near: 2 }, { kind: "buy", w: "carl.near", near: 2 }, { kind: "buy", w: "dan.near", near: 0.5 }]);
  r.start();
  assert.equal(r.engine.started, true);
  assert.equal(r.engine.current()?.no, 1);
  assert.equal(r.engine.pool(), 0, "history accrues nothing");

  // window 1: alice, bob, carl buy. RATE of 3 NEAR → vault
  r.tick(5);
  r.block([{ kind: "buy", w: "alice.near", near: 1 }, { kind: "buy", w: "bob.near", near: 1 }, { kind: "buy", w: "carl.near", near: 1 }]);
  assert.ok(Math.abs(r.engine.pool() - 3 * RATE) < 1e-9);
  r.tick(600); // close #1
  let round = r.reader.round(1)!;
  assert.equal(round.qualifiers, 3);
  assert.equal(round.payouts.length, 2, "only the top 2 are paid");
  assert.ok(Math.abs(round.paid - 3 * RATE) < 1e-6, "top N split 100% between them");

  // window 2: only alice buys, carl sells (out), dan buys but total < 1
  r.block([{ kind: "buy", w: "alice.near", near: 0.2 }, { kind: "sell", w: "carl.near", near: 0.5, tokens: 50 }, { kind: "buy", w: "dan.near", near: 0.2 }]);
  r.tick(600);
  round = r.reader.round(2)!;
  assert.equal(round.qualifiers, 1, "dan is warming up, carl is out");
  assert.equal(round.payouts[0].w, "alice.near");
  assert.equal(round.payouts[0].streak, 2);
  assert.equal(r.reader.wallet("carl.near").status, "out");
  assert.equal(r.reader.wallet("bob.near").streak, 0, "bob missed a window");

  // window 3: nobody → golden
  r.tick(600);
  assert.equal(r.reader.round(3)!.qualifiers, 0);
  assert.equal(r.db.meta.num("goldenStack"), 1);

  // window 4: bob moves tokens away (out), alice buys again → golden ×2 paid to alice
  r.block([{ kind: "move", w: "bob.near", tokens: 10 }, { kind: "buy", w: "alice.near", near: 0.5 }, { kind: "recv", w: "friend.near", tokens: 10 }]);
  r.tick(600);
  round = r.reader.round(4)!;
  assert.equal(round.golden, 2);
  assert.equal(round.payouts.length, 1);
  assert.equal(r.reader.wallet("bob.near").outReason, "moved");
  assert.equal(r.reader.wallet("alice.near").streak, 1, "streak reset after the empty window");
  assert.equal(r.reader.wallet("friend.near").known, false, "receiving tokens is not a buy");

  // accounting: everything accrued was either paid or is still in the pool
  const m = r.db.meta;
  assert.ok(Math.abs(m.num("accrued") - m.num("committed") - r.engine.pool()) < 1e-9);
  assert.ok(Math.abs(m.num("accrued") - (3 + 0.2 + 0.5 + 0.2 + 0.5) * RATE) < 1e-9);
});

test("snapshot shape", () => {
  const r = rig();
  r.block([{ kind: "recv", w: "a.near", tokens: 1 }, { kind: "recv", w: "b.near", tokens: 1 }, { kind: "recv", w: "c.near", tokens: 1 }]);
  r.start();
  r.block([{ kind: "buy", w: "alice.near", near: 1.5 }]);
  const s = r.reader.snapshot();
  assert.equal(s.info.windowNo, 1);
  assert.equal(s.board.next.length, 1);
  assert.equal(s.board.next[0].liveStreak, 1);
  assert.ok(s.board.next[0].est > 0);
  assert.equal(s.trades.length, 1);
  assert.equal(s.info.holders, 4);
  assert.equal(s.info.rules.topN, 2);
  assert.equal(s.info.rules.minHolders, 3);
});

test("switching the token wipes the old token's state", async () => {
  const { bindToken } = await import("../src/db.ts");
  const r = rig();
  bindToken(r.db, "test.near");
  r.block([{ kind: "buy", w: "alice.near", near: 2 }]);
  bindToken(r.db, "test.near");
  assert.equal(r.reader.wallet("alice.near").known, true, "same token keeps state");
  bindToken(r.db, "real.near");
  assert.equal(r.reader.wallet("alice.near").known, false);
  assert.equal(r.db.meta.get("done"), undefined);
  assert.equal(r.db.meta.get("token"), "real.near");
});
