# Rules

A wallet is paid in a round if **all** of these are true when the window closes:

| # | Check | Default |
|---|---|---|
| 1 | Bought inside this window | ≥ 0.1 NEAR |
| 2 | Bought in total, across all windows | ≥ 1 NEAR |
| 3 | Never sold | – |
| 4 | Still holds every token it bought | – |

## Statuses

| Status | Meaning |
|---|---|
| **DCAing** | Qualifies for the round that is open now |
| **At risk** | Has a streak, hasn't bought this window yet |
| **Warming up** | Hasn't bought 1 NEAR in total yet |
| **Idle** | No streak, no buy this window |
| **Out** | Sold or moved tokens. Permanent. |

## What counts as a buy or a sell

| Token movement | Meaning |
|---|---|
| DEX → wallet | buy |
| wallet → DEX | sell |
| wallet → another wallet | the sender is **out** |
| burn | the owner is **out** |
| a sell or transfer that fails and is refunded | nothing: only what actually left the wallet counts |

The token contract, DEX contracts, the vault and any excluded account never count.

The first window only opens once at least 15 wallets hold the token (`minHolders`). Until then trades are indexed and count toward each wallet's total, but there is no timer.

All parameters are set by the operator. The live values are always in [`/api/snapshot`](/docs/api) under `info.rules`.

Next: [Payouts](/docs/payouts)
