# How it works

## 1. Windows

A window lasts a random **10–15 minutes**. Nobody knows the exact length in advance, so nobody can snipe the last second. The countdown shows when the current one closes.

## 2. Buy every window

Buy at least **0.1 NEAR** worth of the token inside a window. Several small buys in the same window add up.

Windows in a row with a qualifying buy are your **streak**. Miss one and the streak goes back to zero, but the wallet stays in the game.

## 3. Hold

The wallet must still hold every token it bought.

- **Selling** once takes the wallet out permanently.
- **Transferring** tokens to another wallet counts the same as selling.

## 4. Get paid

When a window closes, the engine ranks everyone who qualified by **weight** and the **top 10** split the vault, proportional to weight. If only two people qualified, those two split everything.

```
weight = streak^1.5 × buy^0.5
```

Streak counts far more than size: showing up every window beats one large buy.

Next: [Rules](/docs/rules)
