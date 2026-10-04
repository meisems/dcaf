# dcainnear — DCA. No jitters.

A NEAR DCA tracker and rewards engine, in the spirit of dca.community.

- Tracks every wallet buying and selling the token, live, straight from the chain.
- Time is cut into random **10–15 minute windows**. Buy ≥ 0.1 NEAR in a window to keep your **streak**.
- At each close, the **top 10 DCAers** (by `streak^1.5 × buy^0.5`) split the **vault**. Two qualifiers? They split 100%.
- Sell once or move tokens away and that wallet is out for good.
- **No wallet connect.** Rewards are sent to buyers automatically.

```
├── src/          website (React, multi-page) → Cloudflare Pages
├── functions/    Pages Function: /api/* → engine Worker
├── server/       engine: Worker + Durable Object (indexer, rounds, payouts, API)
├── shared/       types + rule math used by both
└── docs/         documentation (also rendered at /docs)
```

## Deploy

Cloudflare dashboard only, no CLI: see **[DEPLOY.md](DEPLOY.md)**.

## Develop locally (optional)

```bash
npm install && (cd server && npm install)
cp server/.env.example server/.dev.vars
npm run engine
npm run dev
```

`npm run engine` runs the Worker locally in Cloudflare's runtime; `npm run dev` serves the site and proxies `/api` to it. Tests: `cd server && npm test`.

## Docs

[Introduction](docs/01-introduction.md) · [How it works](docs/02-how-it-works.md) · [Rules](docs/03-rules.md) · [Payouts](docs/04-payouts.md) · [Buying](docs/05-buying.md) · [Engine](docs/06-engine.md) · [API](docs/07-api.md) · [FAQ](docs/08-faq.md)

All artwork is hand-written SVG and CSS, with no generated images. Fonts: Unbounded, Manrope and JetBrains Mono.
