# API

All endpoints are `GET`, return JSON and allow CORS. Types live in `shared/types.ts`.

## `/api/snapshot`

Everything the app shows, cached for one second.

| Field | Contents |
|---|---|
| `info` | window, countdown, vault, counts, price, rules |
| `trades` | buys and sells of the last 24 h, oldest first |
| `board.next` | wallets in the open window, ranked by estimated payout |
| `board.streaks` | longest live streaks |
| `board.allTime` | top earners |
| `rounds` | the latest 60 closed rounds with payouts |

```json
{
  "info": {
    "windowNo": 412,
    "windowStart": 1790961000,
    "nextRoundAt": 1790961742,
    "pool": 3.214,
    "dcaingNow": 17,
    "topStreak": 41,
    "rules": { "minBuy": 0.1, "minTotal": 1, "topN": 0, "equalShare": 0.5, "maxShare": 0.25 }
  }
}
```

## `/api/wallet/:account`

One wallet: status, streak, the rule checks, estimated payout and rank, payout history and its latest trades.

## `/api/rounds` and `/api/rounds/:no`

Closed rounds (`?limit=` up to 500), or one round with all its payouts.

## `/api/health`

```json
{ "ok": true, "height": 218231964, "lagSec": 4, "started": true, "holders": 42, "dryRun": false }
```

Next: [FAQ](/docs/faq)
