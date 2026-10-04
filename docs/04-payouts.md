# Payouts

## Where the money comes from

A share of the fees the project earns funds the **vault**, every time they are claimed. The pool for a round is everything credited to the vault and not yet paid, and never more than the vault account actually holds.

## The split

Every wallet that qualifies is paid.

1. **Equal half:** 50% of the pool is split equally between all of them.
2. **Weighted half:** the other 50% is split by `weight = streak × √buy`, using the streak the wallet will have after this window.
3. **Cap:** no wallet gets more than 25% of the pool. Anything above the cap is shared among the others. With fewer than four qualifiers the cap is an equal share, so the whole pool is still paid.

| Qualifiers | Who is paid |
|---|---|
| 0 | nobody. The pool **stacks** into the next round (a *golden round*) |
| 1 | that wallet, the whole pool |
| 2 | both, 50% each |
| 25 | all 25 |

Slices smaller than **0.001 NEAR** are skipped and roll over.

## Example

Pool: 4 NEAR, five qualifiers. The equal half gives each 0.4 NEAR, and the weighted half adds the rest. alice and bob would each get more than 1 NEAR, so both are capped at 1 NEAR (25%), and the extra is shared among the other three.

| Wallet | Streak | Buy | Weight | Paid |
|---|---|---|---|---|
| alice.near | 9 | 0.5 | 6.36 | 1.00 |
| bob.near | 4 | 1.0 | 4.00 | 1.00 |
| carl.near | 2 | 0.3 | 1.10 | 0.70 |
| dan.near | 1 | 2.0 | 1.41 | 0.75 |
| erin.near | 1 | 0.1 | 0.32 | 0.55 |

## Delivery

Payouts are plain NEAR transfers from the vault to each wallet, sent right after the round closes. Every transfer is listed in [Rounds](/rounds) with its transaction hash. Nothing to claim.

Next: [Buying](/docs/buying)
