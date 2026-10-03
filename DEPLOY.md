# Deploy on Cloudflare (dashboard only)

Two Cloudflare projects, both built straight from this GitHub repo. No CLI needed.

| Project | Type | What it runs |
|---|---|---|
| `dcaf-engine` | Worker + Durable Object | indexer, rounds, payouts, API |
| `dcaf` | Pages | the website (+ a small function that forwards `/api/*` to the engine) |

> **Plan:** the engine runs an alarm every ~2 s. Use **Workers Paid** ($5/mo); the free plan's 10 ms CPU limit is too tight once trading picks up.

---

## 1. Engine (Worker)

1. **Workers & Pages → Create → Workers → Import a repository**, choose `meisems/dcaf`.
2. Settings:
   - Project name: `dcaf-engine`
   - **Root directory:** `server`
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy`
3. **Deploy.** The Durable Object, its SQLite storage and the 1-minute cron are created from `server/wrangler.jsonc`.
4. **dcaf-engine → Settings → Variables and Secrets → Add**:

| Name | Type | Example |
|---|---|---|
| `TOKEN_CONTRACT` | Text | `dcaf.tkn.near` |
| `TOKEN_SYMBOL` | Text | `DCAF` |
| `VAULT_ACCOUNT` | Text | `vault.dcaf.near` |
| `START_BLOCK` | Text | launch block height |
| `REF_POOL_ID` | Text | TOKEN/wNEAR pool id on Rhea |
| `FEE_BPS` | Text | `300` (3% creator fee) |
| `VAULT_BPS` | Text | `100` (1% of volume to the vault; the other 2% stays in the creator wallet) |
| `TOP_N` | Text | `10` |
| `MIN_BUY` / `MIN_TOTAL` | Text | `0.1` / `1` |
| `ROUND_MIN` / `ROUND_MAX` | Text | `10` / `15` (minutes) |
| `VAULT_PRIVATE_KEY` | **Secret** | `ed25519:…` of the vault. **Leave unset for a dry run.** |
| `FASTNEAR_API_KEY` | Secret | optional, higher rate limits |

   Saving deploys a new version. `keep_vars` in `wrangler.jsonc` keeps these on every future Git deploy.
5. Check `https://dcaf-engine.<your-subdomain>.workers.dev/api/health`. `started: true` means it is live.

The fee split is never published: `/api/snapshot` omits `FEE_BPS` and `VAULT_BPS`.

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
| `VITE_TOKEN_CONTRACT` | `dcaf.tkn.near` |
| `VITE_TOKEN_SYMBOL` | `DCAF` |
| `VITE_BUY_URL` | optional, default Rhea swap for the token |

4. **Save and Deploy.**
5. **dcaf → Settings → Bindings → Add → Service binding:** variable `ENGINE`, service `dcaf-engine`. Save, then **Deployments → … → Retry deployment** so the binding applies.

   Without a binding you can instead add a variable `ENGINE_URL` = the Worker's `workers.dev` URL.

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
