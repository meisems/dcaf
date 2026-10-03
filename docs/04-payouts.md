# Payouts

## Where the money comes from

Every trade of the token pays a fee, and a share of it funds the **vault**. The pool for a round is everything credited to the vault and not yet paid, and never more than the vault account actually holds.

## The split

1. Take every wallet that qualifies.
2. Compute `weight = streak^1.5 × buy^0.5`, using the streak it will have after this window.
3. Keep the **top 10** by weight.
4. Split the pool between them, proportional to weight.

| Qualifiers | Who is paid |
|---|---|
| 0 | nobody. The pool **stacks** into the next round (a *golden round*) |
| 2 | both, 100% of the pool between them |
| 25 | the top 10 only |

Slices smaller than **0.001 NEAR** are skipped and roll over.

## Example

Pool: 3 NEAR, three qualifiers.

| Wallet | Streak | Buy | Weight | Paid |
|---|---|---|---|---|
| alice.near | 9 | 0.5 | 19.09 | 2.03 |
| bob.near | 4 | 1.0 | 8.00 | 0.85 |
| carl.near | 1 | 1.2 | 1.10 | 0.12 |

## Delivery

Payouts are plain NEAR transfers from the vault to each wallet, sent right after the round closes. Every transfer is listed in [Rounds](/rounds) with its transaction hash. Nothing to claim.

Next: [Buying](/docs/buying)
