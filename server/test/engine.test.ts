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
  REWARD_SHARE: "0.25",
});

const { initConfig } = await import("../src/config.ts");
initConfig(process.env);
const { openNodeDb: openDb } = await import("../src/db-node.ts");
const { Engine } = await import("../src/engine.ts");
const { Reader } = await import("../src/read.ts");
type Swap = import("../src/indexer.ts").Swap;
type Move = import("../src/indexer.ts").Move;

const DEX = "v2.ref-finance.near";
const SHARE = 0.25; // REWARD_SHARE above
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
  // fees: NEAR the fee wallet received in this block
  const block = (moves: { kind: Move["kind"]; w: string; near?: number; tokens?: number }[], fees = 0) => {
    const swaps = new Map<string, Swap>();
    const ms: Move[] = moves.map((m) => {
      const tx = `tx${n++}`;
      const tokens = BigInt(Math.round((m.tokens ?? (m.near ?? 0) * 100) * 1000)) * (E18 / 1000n);
      if (m.kind === "buy") swaps.set(tx, { nearIn: BigInt(Math.round((m.near ?? 0) * 1e6)) * (Y24 / 1_000_000n), nearOut: 0n, tokIn: 0n, tokOut: tokens });
      if (m.kind === "sell") swaps.set(tx, { nearIn: 0n, nearOut: BigInt(Math.round((m.near ?? 0) * 1e6)) * (Y24 / 1_000_000n), tokIn: tokens, tokOut: 0n });
      return { kind: m.kind, w: m.w, raw: tokens.toString(), tx, receipt: `r${n}`, idx: 0 };
    });
    engine.onBlock({ height: ++height, t, moves: ms, fees: BigInt(Math.round(fees * 1e6)) * (Y24 / 1_000_000n) }, swaps);
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
  r.block([{ kind: "buy", w: "alice.near", near: 2 }, { kind: "buy", w: "bob.near", near: 2 }, { kind: "buy", w: "carl.near", near: 2 }, { kind: "buy", w: "dan.near", near: 0.5 }], 5);
  r.start();
  assert.equal(r.engine.started, true);
  assert.equal(r.engine.current()?.no, 1);
  assert.equal(r.engine.pool(), 0, "history accrues nothing");

  // window 1: alice, bob, carl buy, and the platform claims 2 NEAR of fees: SHARE of it → pool
  r.tick(5);
  r.block([{ kind: "buy", w: "alice.near", near: 1 }, { kind: "buy", w: "bob.near", near: 1 }, { kind: "buy", w: "carl.near", near: 1 }]);
  assert.equal(r.engine.pool(), 0, "trading alone funds nothing");
  r.block([], 2);
  assert.ok(Math.abs(r.engine.pool() - 2 * SHARE) < 1e-9);
  r.tick(600); // close #1
  let round = r.reader.round(1)!;
  assert.equal(round.qualifiers, 3);
  assert.equal(round.payouts.length, 2, "only the top 2 are paid");
  assert.ok(Math.abs(round.paid - 2 * SHARE) < 1e-6, "top N split 100% between them");

  // window 2: only alice buys, carl sells (out), dan buys but total < 1
  r.block([{ kind: "buy", w: "alice.near", near: 0.2 }, { kind: "sell", w: "carl.near", near: 0.5, tokens: 50 }, { kind: "buy", w: "dan.near", near: 0.2 }], 0.4);
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
  r.block([{ kind: "move", w: "bob.near", tokens: 10 }, { kind: "buy", w: "alice.near", near: 0.5 }, { kind: "recv", w: "friend.near", tokens: 10 }], 1);
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
  assert.ok(Math.abs(m.num("feesIn") - (2 + 0.4 + 1)) < 1e-9, "fees before the start don't count");
  assert.ok(Math.abs(m.num("accrued") - (2 + 0.4 + 1) * SHARE) < 1e-9);
});

test("snapshot shape", () => {
  const r = rig();
  r.block([{ kind: "recv", w: "a.near", tokens: 1 }, { kind: "recv", w: "b.near", tokens: 1 }, { kind: "recv", w: "c.near", tokens: 1 }]);
  r.start();
  r.block([{ kind: "buy", w: "alice.near", near: 1.5 }], 1);
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

  // a new RESET_ID wipes once; the same one again keeps everything
  r.block([{ kind: "buy", w: "bob.near", near: 2 }]);
  bindToken(r.db, "real.near", "r1");
  assert.equal(r.reader.wallet("bob.near").known, false, "a new reset id starts over");
  r.block([{ kind: "buy", w: "carl.near", near: 2 }]);
  bindToken(r.db, "real.near", "r1");
  assert.equal(r.reader.wallet("carl.near").known, true, "the same reset id never wipes again");
});

test("fees: only new NEAR or wNEAR arriving at the fee wallet counts", async () => {
  const { feeIn } = await import("../src/indexer.ts");
  const fee = "vault.dcainnear.near";
  const ok = { executor_id: fee, logs: [] as string[], status: { SuccessValue: "" } as Record<string, unknown> };
  const o = (outcome = ok) => ({ block_height: 1, block_timestamp: 0, index: 0, id: "r", outcome });
  const rc = (from: string, to: string, actions: unknown[]) => ({ predecessor_id: from, receiver_id: to, receipt: { Action: { actions } } }) as never;
  const Y = 10n ** 24n;
  assert.equal(feeIn(o(), rc("launchpad.near", fee, [{ Transfer: { deposit: (3n * Y).toString() } }]), fee), 3n * Y, "a claim");
  assert.equal(feeIn(o(), rc("system", fee, [{ Transfer: { deposit: "5" } }]), fee), 0n, "gas refund");
  assert.equal(feeIn(o(), rc("wrap.near", fee, [{ Transfer: { deposit: "5" } }]), fee), 0n, "unwrapping its own wNEAR");
  assert.equal(feeIn(o(), rc(fee, "alice.near", [{ Transfer: { deposit: "5" } }]), fee), 0n, "a payout going out");
  assert.equal(feeIn(o({ ...ok, status: { Failure: {} } }), rc("launchpad.near", fee, [{ Transfer: { deposit: "5" } }]), fee), 0n, "failed");
  const wnear = (from: string) => ({ executor_id: "wrap.near", status: { SuccessValue: "" },
    logs: [`EVENT_JSON:${JSON.stringify({ standard: "nep141", event: "ft_transfer", data: [{ old_owner_id: from, new_owner_id: fee, amount: "7" }] })}`] });
  assert.equal(feeIn(o(wnear("launchpad.near")), undefined, fee), 7n, "a wNEAR claim");
  assert.equal(feeIn(o(wnear(fee)), undefined, fee), 0n);
});

test("old plain-text token logs are read, and refunds net out the transfer they undo", async () => {
  const { nep141, movesOf, refundsOf } = await import("../src/indexer.ts");
  assert.deepEqual(nep141(["Transfer 5 from a.near to b.near"]), [{ kind: "transfer", from: "a.near", to: "b.near", amount: "5" }]);
  assert.equal(nep141(["Refund 5 from b.near to a.near"])[0].kind, "refund");
  const both = [`EVENT_JSON:${JSON.stringify({ standard: "nep141", event: "ft_transfer", data: [{ old_owner_id: "a.near", new_owner_id: "b.near", amount: "5" }] })}`, "Transfer 5 from a.near to b.near"];
  assert.equal(nep141(both).length, 1, "events win over plain text, nothing counted twice");

  const out = (logs: string[]) => ({ block_height: 1, block_timestamp: 0, index: 0, id: "r", outcome: { executor_id: "dcainnear.tkn.near", logs, status: { SuccessValue: "" } as Record<string, unknown> } });
  const sell = out([`Transfer 100 from carl.near to ${DEX}`]);
  const back = out([`Refund 100 from ${DEX} to carl.near`]);
  const refunds = new Map<string, bigint>();
  refundsOf("t1", back, refunds);
  assert.deepEqual(movesOf(sell, "t1", refunds), [], "a fully refunded (failed) sell is not a sell");
  assert.deepEqual(movesOf(back, "t1", refunds), [], "and the refund is not a buy");

  const part = new Map<string, bigint>();
  refundsOf("t2", out([`Refund 30 from ${DEX} to carl.near`]), part);
  const m = movesOf(out([`Transfer 100 from carl.near to ${DEX}`]), "t2", part);
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, "sell");
  assert.equal(m[0].raw, "70", "only the part that was really sold");
  assert.equal(movesOf(out([`Transfer 100 from ${DEX} to dan.near`]), "t3")[0].kind, "buy");
});

test("the Streaks board only lists wallets that bought this window", () => {
  const r = rig();
  r.block([{ kind: "recv", w: "a.near", tokens: 1 }, { kind: "recv", w: "b.near", tokens: 1 }, { kind: "recv", w: "c.near", tokens: 1 }]);
  r.start();
  r.block([{ kind: "buy", w: "alice.near", near: 1.5 }, { kind: "buy", w: "bob.near", near: 1.5 }]);
  let s = r.reader.snapshot();
  assert.deepEqual(s.board.streaks.map((x) => x.id).sort(), ["alice.near", "bob.near"]);
  r.tick(600); // window 1 closes: both qualified, streak 1
  r.block([{ kind: "buy", w: "alice.near", near: 0.2 }, { kind: "buy", w: "dan.near", near: 0.05 }]);
  s = new Reader(r.db, r.engine).snapshot(); // a fresh reader: snapshots are cached for a second
  assert.deepEqual(s.board.streaks.map((x) => x.id), ["alice.near"], "bob held but didn't buy; dan bought under the minimum");
  assert.deepEqual(s.board.next.map((x) => x.id), ["alice.near"]);
  assert.equal(s.info.topStreak, 2, "top streak still counts every live streak");
});

test("NEAR amounts: failed swaps net out, concentrated-pool swaps are read, the price survives a restart", async () => {
  const { netRoundTrips, swapsOf } = await import("../src/indexer.ts");
  const mv = (kind: Move["kind"], w: string, raw: string, tx = "t"): Move => ({ kind, w, raw, tx, receipt: "r", idx: 0 });

  // an aggregator swap that failed: tokens went in and came straight back
  assert.deepEqual(netRoundTrips([mv("sell", "fluffy.near", "100"), mv("buy", "fluffy.near", "100")]), [], "neither a sell nor a buy");
  const part = netRoundTrips([mv("sell", "a.near", "100"), mv("buy", "a.near", "30")]);
  assert.equal(part.length, 1);
  assert.deepEqual([part[0].kind, part[0].raw], ["sell", "70"]);
  assert.equal(netRoundTrips([mv("buy", "b.near", "5"), mv("sell", "c.near", "5")]).length, 2, "different wallets are untouched");

  // a swap on Rhea's concentrated pools logs a dcl.ref event instead of "Swapped …"
  const dcl = `EVENT_JSON:${JSON.stringify({ standard: "dcl.ref", event: "swap", data: [{ token_in: "wrap.near", amount_in: (2n * Y24).toString(), token_out: "dcainnear.tkn.near", amount_out: "500" }] })}`;
  const tx = { transaction: { hash: "h" }, execution_outcome: {} as never, receipts: [{ execution_outcome: { block_height: 1, block_timestamp: 0, index: 0, id: "r", outcome: { executor_id: DEX, logs: [dcl], status: { SuccessValue: "" } } } }] };
  const s = swapsOf(tx as never);
  assert.equal(s.nearIn, 2n * Y24);
  assert.equal(s.tokOut, 500n);

  // the engine starts from the last traded price after a restart
  const r = rig();
  r.block([{ kind: "buy", w: "alice.near", near: 1 }]);
  const before = r.engine.price;
  assert.ok(before && before > 0);
  assert.equal(new Engine(r.db).price, before);
});
