import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyPair } from "near-api-js";

Object.assign(process.env, {
  TOKEN_CONTRACT: "dcainnear.tkn.near",
  VAULT_ACCOUNT: "vault.dcainnear.near",
  REWARD_SHARE: "0.25",
  VAULT_PRIVATE_KEY: KeyPair.fromRandom("ed25519").toString(),
  RPC_URLS: "https://pub-a.test,https://pub-b.test",
  LAVA_RPC_URL: "https://lava.test/KEY",
  DRPC_RPC_URL: "https://drpc.test/KEY",
  FASTNEAR_API_KEY: "fn-secret",
});

const { initConfig } = await import("../src/config.ts");
initConfig(process.env);
const { RpcPool, RpcError, endpoint } = await import("../src/rpc.ts");
const { reads, txs } = await import("../src/near.ts");
const { openNodeDb } = await import("../src/db-node.ts");
const { sendPayouts } = await import("../src/payouts.ts");

type Call = { host: string; method: string; params: Record<string, unknown>; auth?: string };
type Handler = (c: Call) => unknown; // a value = JSON body; Error = network failure; Response = as is
const calls: Call[] = [];
let handler: Handler = () => ({ result: null });

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  const h = (init?.headers ?? {}) as Record<string, string>;
  const c: Call = { host: new URL(String(url)).host, method: body.method, params: body.params, auth: h.authorization };
  calls.push(c);
  const out = handler(c);
  if (out instanceof Error) throw out;
  if (out instanceof Response) return out;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...(out as object) }), { status: 200 });
}) as typeof fetch;

test("reads fail over past dead and rate-limited endpoints, and stop on real answers", async () => {
  const pool = new RpcPool("t", ["https://a.test", "https://b.test", "https://c.test"].map((u, i) => endpoint(u, false, i)));
  calls.length = 0;
  handler = (c) =>
    c.host === "a.test" ? new Error("ECONNRESET")
    : c.host === "b.test" ? new Response("slow down", { status: 429 })
    : { result: { header: { height: 7 } } };
  const r = await pool.call<{ header: { height: number } }>("block", { finality: "final" });
  assert.equal(r.header.height, 7);
  assert.deepEqual(calls.map((c) => c.host), ["a.test", "b.test", "c.test"]);

  // the two broken ones cool off: the next call goes straight to the healthy one
  calls.length = 0;
  await pool.call("block", { finality: "final" });
  assert.deepEqual(calls.map((c) => c.host), ["c.test"]);

  // a request error is the same everywhere: no failover
  calls.length = 0;
  handler = () => ({ error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT" }, message: "Server error" } });
  await assert.rejects(pool.call("query", {}), (e) => e instanceof RpcError && /UNKNOWN_ACCOUNT/.test(e.message));
  assert.equal(calls.length, 1);
});

test("pools: private first with public fallback for reads, Lava first for transactions, keys never leak", async () => {
  assert.deepEqual(reads().order().map((e) => e.host), ["lava.test", "drpc.test", "pub-a.test", "pub-b.test"]);
  assert.deepEqual(txs().order().map((e) => e.host), ["lava.test", "drpc.test", "pub-a.test", "pub-b.test"]);
  // transactions keep Lava first even when another endpoint is faster
  txs().eps[1].ms = 1;
  assert.equal(txs().order()[0].host, "lava.test");
  const shown = JSON.stringify([reads().stats(), txs().stats()]);
  assert.ok(!shown.includes("KEY") && !shown.includes("https://"), "stats show hostnames only");
  // the FastNEAR key only goes to FastNEAR
  calls.length = 0;
  handler = () => ({ result: 1 });
  await reads().call("status", []);
  assert.equal(calls[0].auth, undefined);
});

test("a payout whose send times out is looked up, never signed twice", async () => {
  const db = openNodeDb(":memory:");
  db.prepare("INSERT INTO payouts (no, w, amount, yocto, streak, buy, status) VALUES (1, 'alice.near', 1, ?, 3, 1, 'pending')").run((10n ** 24n).toString());
  const sends = new Set<string>();
  let landed = false;
  handler = (c) => {
    if (c.method === "query") return { result: { nonce: 41, permission: "FullAccess", block_hash: "11111111111111111111111111111111", block_height: 9 } };
    if (c.method === "block") return { result: { header: { hash: "11111111111111111111111111111111", height: 9 } } };
    if (c.method === "send_tx") {
      sends.add(String(c.params.signed_tx_base64));
      landed = true; // it reaches the chain…
      return new Error("socket hang up"); // …but every RPC times out on the reply
    }
    if (c.method === "tx") return landed ? { result: { status: { SuccessValue: "" } } } : { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_TRANSACTION" }, message: "unknown" } };
    return { result: null };
  };

  calls.length = 0;
  assert.equal(await sendPayouts(db, 3000), 1, "still pending after the timeout");
  assert.equal(calls.filter((c) => c.method === "send_tx")[0].host, "lava.test", "Lava gets the transaction first");
  const row = db.prepare("SELECT status, tx, signed FROM payouts").get()!;
  assert.equal(row.status, "pending");
  assert.ok(row.tx && row.signed, "signed transaction stored before sending");

  assert.equal(await sendPayouts(db, 3000), 0);
  const done = db.prepare("SELECT status, tx, signed FROM payouts").get()!;
  assert.equal(done.status, "sent");
  assert.equal(done.tx, row.tx);
  assert.equal(sends.size, 1, "exactly one signed transaction ever existed");
});
