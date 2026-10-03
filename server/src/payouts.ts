import { Account, actions, baseEncode, FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import { CFG } from "./config.ts";
import type { Db } from "./db.ts";
import { authFor, txs } from "./near.ts";
import { RpcError } from "./rpc.ts";

type Row = { no: number; w: string; yocto: string; attempts: number; tx: string | null; signed: string | null };
type Outcome = { status?: { SuccessValue?: string; Failure?: unknown } | string; transaction?: { hash: string } };

let vault: Account | null = null;

/** The vault signer. Nonce and block-hash lookups use the transaction endpoints (Lava first), failing over. */
function signer() {
  if (vault) return vault;
  const providers = txs().eps.map((e) => new JsonRpcProvider({ url: e.url, headers: authFor(e.host) }, { retries: 1, wait: 300, backoff: 1.5 }));
  vault = new Account(CFG.vaultAccount, new FailoverRpcProvider(providers), CFG.vaultKey as `ed25519:${string}`);
  return vault;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));

/** Broadcast exact bytes. Re-sending the same signed transaction is idempotent: one hash, one nonce, one transfer. */
const broadcast = (signed: string) =>
  txs().call<Outcome>("send_tx", { signed_tx_base64: signed, wait_until: "EXECUTED_OPTIMISTIC" }, { timeoutMs: 20_000, rounds: 1 });

/** What the chain knows about a hash we already sent: an outcome, or null if it never arrived. */
async function lookup(hash: string): Promise<Outcome | null> {
  try {
    return await txs().call<Outcome>("tx", { tx_hash: hash, sender_account_id: CFG.vaultAccount, wait_until: "EXECUTED_OPTIMISTIC" }, { timeoutMs: 10_000, rounds: 1 });
  } catch (err) {
    if (err instanceof RpcError && /UNKNOWN_TRANSACTION/i.test(err.message)) return null;
    throw err;
  }
}

/** "ok" | "failed" (the chain said no: retrying won't help) | null (still on its way). */
function verdict(o: Outcome | null): "ok" | "failed" | null {
  const s = o?.status;
  if (!s || typeof s === "string") return null;
  if ("Failure" in s && s.Failure) return "failed";
  if ("SuccessValue" in s) return "ok";
  return null;
}

/**
 * Sends pending payouts from the vault, one transfer per wallet, oldest round first, for up to `budgetMs`.
 *
 * Each transfer is signed once and stored before it leaves, so a timeout, a dead RPC or a restarted
 * Worker can only ever re-broadcast the same transaction (or look it up), never pay a wallet twice.
 * Returns how many are still waiting.
 */
export async function sendPayouts(db: Db, budgetMs = 8000): Promise<number> {
  const count = () => Number(db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE status = 'pending'").get()?.n ?? 0);
  if (CFG.dryRun) return 0;
  const next = db.prepare("SELECT no, w, yocto, attempts, tx, signed FROM payouts WHERE status = 'pending' ORDER BY no, amount DESC LIMIT 10");
  const stage = db.prepare("UPDATE payouts SET signed = ?, tx = ? WHERE no = ? AND w = ?");
  const unstage = db.prepare("UPDATE payouts SET signed = NULL, tx = NULL WHERE no = ? AND w = ?");
  const sent = db.prepare("UPDATE payouts SET status = 'sent', signed = NULL, err = NULL WHERE no = ? AND w = ?");
  const failed = db.prepare("UPDATE payouts SET status = 'failed', signed = NULL, err = ? WHERE no = ? AND w = ?");
  const bad = db.prepare("UPDATE payouts SET attempts = attempts + 1, err = ?, status = CASE WHEN attempts + 1 >= 5 AND signed IS NULL THEN 'failed' ELSE 'pending' END WHERE no = ? AND w = ?");
  const settle = (r: Row, hash: string, o: Outcome | null) => {
    const v = verdict(o);
    if (v === "ok") (sent.run(r.no, r.w), console.log(`→ paid ${r.w} for round #${r.no}: ${hash}`));
    if (v === "failed") (failed.run(JSON.stringify((o!.status as { Failure: unknown }).Failure).slice(0, 300), r.no, r.w), console.warn(`✗ payout ${r.w} #${r.no} rejected on chain: ${hash}`));
    return v;
  };

  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const rows = next.all() as unknown as Row[];
    if (!rows.length) break;
    for (const r of rows) {
      if (Date.now() - t0 >= budgetMs) break;
      try {
        let { tx: hash, signed } = r;
        if (signed && hash) {
          // sent before but no answer: ask the chain first
          const known = await lookup(hash);
          if (known && settle(r, hash, known)) continue;
          if (known) return count(); // still executing: check again next tick
        } else {
          const st = await signer().createSignedTransaction({ receiverId: r.w, actions: [actions.transfer(BigInt(r.yocto))] });
          signed = b64(st.encode());
          hash = baseEncode(await sha256(st.transaction.encode()));
          stage.run(signed, hash, r.no, r.w); // on disk before it goes out
        }
        let out: Outcome | null;
        try {
          out = await broadcast(signed);
        } catch (err) {
          // the stored transaction can never land (too old, or its nonce got used): sign a fresh one,
          // but only after making sure this exact one didn't land in the meantime
          if (err instanceof RpcError && /Expired|InvalidNonce|InvalidTxError/i.test(err.message)) {
            const again = await lookup(hash);
            if (again && settle(r, hash, again)) continue;
            if (!again) unstage.run(r.no, r.w);
          }
          throw err;
        }
        if (!settle(r, hash, out)) return count(); // accepted, not executed yet: next tick looks it up
      } catch (err) {
        const msg = String((err as Error)?.message ?? err).slice(0, 300);
        bad.run(msg, r.no, r.w);
        console.warn(`✗ payout ${r.w} #${r.no} (try ${r.attempts + 1}): ${msg}`);
        return count(); // back off until the next tick
      }
    }
  }
  return count();
}
