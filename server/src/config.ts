import { DEFAULT_RULES } from "../../shared/rules.ts";
import { PUBLIC_RPC } from "./rpc.ts";
import type { Rules } from "../../shared/types.ts";

/**
 * Engine settings, read from environment variables: the Worker's Variables & Secrets
 * on Cloudflare, process.env locally. Call initConfig() once at start.
 */
export type EnvLike = Record<string, string | undefined>;

/** Stand-ins used until the real token is configured: an active token, a vault that never pays. */
const TEST = { token: "token.v2.ref-finance.near", symbol: "REF", vault: "dcaf-test-vault.near", pool: 79 };

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(+v) ? +v : d);

function build(e: EnvLike) {
  const need = (k: string) => {
    const v = e[k];
    if (!v) throw new Error(`Missing ${k}. Add it in the Worker's Settings → Variables and Secrets.`);
    return v;
  };
  const network = e.NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
  const main = network === "mainnet";

  const rules: Rules = {
    ...DEFAULT_RULES,
    roundMin: num(e.ROUND_MIN, DEFAULT_RULES.roundMin),
    roundMax: num(e.ROUND_MAX, DEFAULT_RULES.roundMax),
    minBuy: num(e.MIN_BUY, DEFAULT_RULES.minBuy),
    minTotal: num(e.MIN_TOTAL, DEFAULT_RULES.minTotal),
    topN: num(e.TOP_N, DEFAULT_RULES.topN),
    maxShare: num(e.MAX_SHARE, DEFAULT_RULES.maxShare),
    minPayout: num(e.MIN_PAYOUT, DEFAULT_RULES.minPayout),
    minHolders: num(e.MIN_HOLDERS, DEFAULT_RULES.minHolders),
    feeBps: num(e.FEE_BPS, DEFAULT_RULES.feeBps),
    vaultBps: num(e.VAULT_BPS, DEFAULT_RULES.vaultBps),
  };
  if (rules.roundMax < rules.roundMin) throw new Error("ROUND_MAX must be ≥ ROUND_MIN");
  if (rules.vaultBps > rules.feeBps) throw new Error("VAULT_BPS can't be more than FEE_BPS");

  // test mode: until TOKEN_CONTRACT is set on mainnet, track REF on its Rhea REF/wNEAR pool as a dry run
  const test = main && !e.TOKEN_CONTRACT;
  const token = test ? TEST.token : need("TOKEN_CONTRACT");
  const vaultAccount = e.VAULT_ACCOUNT || (test ? TEST.vault : need("VAULT_ACCOUNT"));
  const dexes = list(e.DEX_ACCOUNTS || (main ? "v2.ref-finance.near" : "ref-finance-101.testnet"));
  const vaultKey = e.VAULT_PRIVATE_KEY || "";

  return {
    network,
    // reads: public endpoints with failover (RPC_URLS replaces the built-in list, RPC_URL is tried first)
    rpcRead: [...new Set([...list(e.RPC_URL), ...(list(e.RPC_URLS).length ? list(e.RPC_URLS) : PUBLIC_RPC[network])])],
    // private endpoints (keys inside the URL, so set them as Secrets): Lava first for transactions,
    // then dRPC and any others; also the last resort for reads
    rpcPrivate: [...new Set([...list(e.LAVA_RPC_URL), ...list(e.DRPC_RPC_URL), ...list(e.PRIVATE_RPC_URLS)])],
    // if every private endpoint is down, broadcast the (already signed) payout through the public ones
    txPublicFallback: e.TX_PUBLIC_FALLBACK !== "false",
    txApi: e.TX_API_URL || (main ? "https://tx.main.fastnear.com" : "https://tx.test.fastnear.com"),
    apiKey: e.FASTNEAR_API_KEY || "",
    token,
    symbol: e.TOKEN_SYMBOL || (test ? TEST.symbol : "DCAF"),
    wrap: e.WRAP_CONTRACT || (main ? "wrap.near" : "wrap.testnet"),
    dexes: new Set(dexes),
    ref: e.REF_CONTRACT || dexes[0],
    refPoolId: e.REF_POOL_ID ? Number(e.REF_POOL_ID) : test ? TEST.pool : null,
    // never DCAers: the token itself, DEXes, the vault, plus anything listed
    excluded: new Set([token, vaultAccount, ...dexes, ...list(e.EXCLUDE_ACCOUNTS)]),
    vaultAccount,
    vaultKey,
    test,
    dryRun: test || e.DRY_RUN === "true" || !vaultKey,
    reserve: num(e.VAULT_RESERVE_NEAR, 0.5),
    startBlock: e.START_BLOCK ? Number(e.START_BLOCK) : null,
    liveLagSec: num(e.LIVE_LAG_SEC, 30),
    port: num(e.PORT, 8787),
    db: e.DB_PATH || "./data/dcaf.db",
    staticDir: e.STATIC_DIR ?? "../dist",
    cors: e.CORS_ORIGIN || "*",
    rules,
  };
}

export type Config = ReturnType<typeof build>;

/** Live binding: modules read CFG after initConfig() has run. */
export let CFG: Config = undefined as unknown as Config;

export function initConfig(e: EnvLike): Config {
  CFG = build(e);
  return CFG;
}
