# Engine

The engine runs on Cloudflare: a Worker in front, one Durable Object behind it. The Durable Object's built-in SQLite holds all state, and an alarm loop does the work every couple of seconds.

```
FastNEAR tx API ──► Durable Object (alarm loop) ──► SQLite
                         │                ▲
                         ▼                │
                NEAR transfers       Worker + edge cache ◄── Pages site (/api/*)
              (vault → top DCAers)
```

## Indexer

Instead of reading every block on NEAR, it asks the FastNEAR transaction API for transactions that touch the **token contract**, then fetches their full receipt trees.

- `nep141` events (`ft_transfer`, `ft_mint`, `ft_burn`) become buys, sells and moves.
- Ref swap logs in the same transaction (`Swapped X wrap.near for Y token`) give the exact NEAR amount. Without one, the trade is valued at the pool's spot price.
- Receipts are applied strictly in block order. Each block is written in one transaction together with the cursor, so a restart never double counts.

## Windows and rounds

- Window lengths are drawn from the platform's secure random source, between the min and the max.
- Time is **block time**, never wall time, so replaying the same blocks gives the same rounds.
- Rounds start only once the indexer is live, so history never pays out retroactively.
- When block time passes a window's close, the engine closes it, ranks qualifiers, records payouts and opens the next window.

## Payouts

Payouts are queued as `pending`, then sent one NEAR transfer at a time from the vault. Failures retry up to 5 times. Without a vault key the engine runs a **dry run**: rounds are computed and recorded, nothing is sent.

## Caching

| Layer | What |
|---|---|
| Edge | the Worker caches API responses for 1–30 s, so traffic never piles onto the engine |
| API | ETags with `304` revalidation, `stale-while-revalidate` |
| Browser | last snapshot kept locally for an instant first paint; wallets and settled rounds cached in memory |
| Service worker | app shell, hashed assets and fonts cached for instant, offline-capable loads |

## Files

| File | Role |
|---|---|
| `server/src/worker.ts` | Worker + Durable Object: alarm loop, edge cache |
| `server/src/indexer.ts` | account-scoped indexer, event classification |
| `server/src/engine.ts` | windows, streaks, round close, vault accrual |
| `server/src/payouts.ts` | payout sender |
| `server/src/read.ts` | snapshot and wallet read models |
| `server/src/routes.ts` | the API |
| `shared/rules.ts` | weight, split and checks, shared with the site |

Next: [API](/docs/api)
