# Deploy on Cloudflare (dashboard only)

Two Cloudflare projects, both built straight from this GitHub repo. No CLI needed.

| Project | Type | What it runs |
|---|---|---|
| `dcaf` | Worker + Durable Object | indexer, rounds, payouts, API |
| `dcaf-7qd` (any name) | Pages | the website (+ a small function that forwards `/api/*` to the engine) |

> **Plan:** the engine runs an alarm every ~2 s. Use **Workers Paid** ($5/mo); the free plan's 10 ms CPU limit is too tight once trading picks up.

---

## 1. Engine (Worker)

1. **Workers & Pages → Create → Workers → Import a repository**, choose `meisems/dcaf`.
2. Settings:
   - Project name: `dcaf` (must match `name` in `server/wrangler.jsonc`)
   - **Root directory:** `server`
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy`
3. **Deploy.** The Durable Object, its SQLite storage and the 1-minute cron are created from `server/wrangler.jsonc`.
4. **dcaf (Worker) → Settings → Variables and Secrets → Add**:

| Name | Type | Example |
|---|---|---|
| `TOKEN_CONTRACT` | Text | `dcainnear.tkn.near` |
| `TOKEN_SYMBOL` | Text | `DCA` |
| `VAULT_ACCOUNT` | Text | `vault.dcainnear.near` |
| `START_BLOCK` | Text | launch block height |
| `REF_POOL_ID` | Text | TOKEN/wNEAR pool id on Rhea |
| `FEE_BPS` | Text | `300` (3% creator fee) |
| `VAULT_BPS` | Text | `100` (1% of volume to the vault; the other 2% stays in the creator wallet) |
| `TOP_N` | Text | `10` |
| `MIN_BUY` / `MIN_TOTAL` | Text | `0.1` / `1` |
| `ROUND_MIN` / `ROUND_MAX` | Text | `10` / `15` (minutes) |
| `MIN_HOLDERS` | Text | `15` (the first window opens once this many wallets hold the token) |
| `VAULT_PRIVATE_KEY` | **Secret** | `ed25519:…` of the vault. **Leave unset for a dry run.** |
| `LAVA_RPC_URL` | **Secret** | your Lava NEAR mainnet HTTPS endpoint (key inside). First choice for payouts. |
| `DRPC_RPC_URL` | **Secret** | your dRPC NEAR HTTPS endpoint (key inside). Second choice for payouts. |
| `PRIVATE_RPC_URLS` | Secret | optional, more private endpoints, comma separated (GetBlock, NodeReal, QuickNode…) |
| `FASTNEAR_API_KEY` | Secret | optional, higher rate limits (sent to FastNEAR hosts only) |

   Saving deploys a new version. `keep_vars` in `wrangler.jsonc` keeps these on every future Git deploy.
5. Check `https://dcaf.<your-subdomain>.workers.dev/api/health`. `started: true` means it is live; until the token has `MIN_HOLDERS` holders the engine indexes but no window opens.

The fee split is never published: `/api/snapshot` omits `FEE_BPS` and `VAULT_BPS`.

### RPC endpoints

- **Reads** (balances, metadata, price, block height) go to public endpoints, fastest healthy one first. An endpoint that errors, times out or rate-limits is skipped and cooled off (5 s, doubling up to 5 min). Built in, all verified for `block`, view calls and `send_tx`:
  `free.rpc.fastnear.com`, `rpc.mainnet.fastnear.com`, `near.drpc.org`, `rpc.shitzuapes.xyz`, `rpc.intea.rs`, `near-mainnet.gateway.tatum.io`, `archival-rpc.mainnet.fastnear.com`, `rpc.mainnet.near.org`.
  Your private endpoints are the last resort for reads, so they're only used when every public one fails.
- **Transactions** (payouts) go to `LAVA_RPC_URL` first, then `DRPC_RPC_URL`, then `PRIVATE_RPC_URLS` in order. If all of them are down, the already-signed payout is broadcast through the public endpoints (set `TX_PUBLIC_FALLBACK` = `false` to forbid that).
- Every payout is signed once and stored before it is sent. A timeout or a switch to another RPC re-sends or looks up that same transaction, so a wallet is never paid twice.
- `RPC_URLS` (Text, comma separated) replaces the public list. `RPC_URL` adds one endpoint in front of it.
- Lava's old public `near.lava.build` endpoint is discontinued, and Ankr and BlockPI now need keys. Use the URL from your own Lava or dRPC dashboard.
- `/api/health` shows each endpoint's state by **hostname only**. URLs, and the keys in them, are never shown or logged.

## 2. Website (Pages)

1. **Workers & Pages → Create → Pages → Connect to Git**, choose `meisems/dcaf`.
2. Build settings:
   - Framework preset: *None*
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: *(empty)*
3. **Environment variables** (Production):

| Name | Example |
|---|---|
| `VITE_TOKEN_CONTRACT` | `dcainnear.tkn.near` |
| `VITE_TOKEN_SYMBOL` | `DCA` |
| `VITE_BUY_URL` | optional, default Rhea swap for the token |

4. **Save and Deploy.**
5. Optional: **Pages project → Settings → Bindings → Add → Service binding:** variable `ENGINE`, service `dcaf`. Save, then **Deployments → … → Retry deployment** so the binding applies.

   Without a binding the site forwards `/api/*` to `ENGINE_URL`, or to `https://dcaf.laidev.workers.dev` (`DEFAULT_ENGINE_URL` in `functions/api/[[path]].ts`).

Open the Pages URL. `/api/health` on the site should answer from the engine.

## Updating

Push to `main`. Both projects rebuild and redeploy automatically.

## Going live checklist

- [ ] Dry run first (no `VAULT_PRIVATE_KEY`) and check a few rounds in **Rounds**
- [ ] Vault account funded; keep only what upcoming rounds need
- [ ] Add `VAULT_PRIVATE_KEY` as a **Secret**
- [ ] Custom domain on the Pages project (optional)

## Local development (optional)

```bash
npm install && (cd server && npm install)
cp server/.env.example server/.dev.vars   # then fill it in
npm run engine   # the Worker, locally, in Cloudflare's runtime
npm run dev      # the site, proxying /api to the engine
```
