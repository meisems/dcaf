import { CFG } from "./config.ts";

const headers = (): Record<string, string> => ({
  "content-type": "application/json",
  ...(CFG.apiKey ? { authorization: `Bearer ${CFG.apiKey}` } : {}),
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let wait = 400;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries - 1) throw err;
      await sleep(wait);
      wait = Math.min(wait * 2, 10_000);
    }
  }
}

export async function rpc<T>(method: string, params: unknown): Promise<T> {
  return retry(async () => {
    const r = await fetch(CFG.rpc, { method: "POST", headers: headers(), body: JSON.stringify({ jsonrpc: "2.0", id: "dcaf", method, params }) });
    if (!r.ok) throw new Error(`rpc ${method}: http ${r.status}`);
    const j = (await r.json()) as { result?: T; error?: { message?: string; data?: unknown } };
    if (j.error) throw new Error(`rpc ${method}: ${j.error.message ?? "error"} ${JSON.stringify(j.error.data ?? "")}`);
    return j.result as T;
  });
}

/** Read-only contract call, JSON in and out. */
export async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const res = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: b64(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(res.result))) as T;
}

/** Spendable NEAR (yocto): balance minus what storage locks. */
export async function available(account: string): Promise<bigint> {
  const a = await rpc<{ amount: string; storage_usage: number }>("query", { request_type: "view_account", finality: "final", account_id: account });
  const locked = BigInt(a.storage_usage) * 10n ** 19n;
  const v = BigInt(a.amount) - locked;
  return v > 0n ? v : 0n;
}

const b64 = (s: string) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

export const yoctoToNear = (y: bigint | string) => Number(BigInt(y) / 10n ** 15n) / 1e9;
export const nearToYocto = (n: number) => BigInt(Math.floor(n * 1e9)) * 10n ** 15n;
export const units = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

// ------------------------------------------------------------------ FastNEAR transaction API

export async function txApi<T>(path: string, body: object): Promise<T> {
  return retry(async () => {
    const r = await fetch(`${CFG.txApi}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`tx api ${path}: http ${r.status}`);
    return (await r.json()) as T;
  }, 10);
}

export async function finalHeight(): Promise<number> {
  const b = await rpc<{ header: { height: number } }>("block", { finality: "final" });
  return b.header.height;
}
