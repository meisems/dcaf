// Brand + chain settings. A rename or a new token is a one-file change (plus .env).

const env = import.meta.env;

export const BRAND = {
  name: "dcainnear",
  tagline: "DCA. No jitters.",
  twitter: env.VITE_TWITTER_URL || "",
  telegram: env.VITE_TELEGRAM_URL || "",
};

export const NETWORK: "mainnet" | "testnet" = env.VITE_NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
export const TOKEN: string = env.VITE_TOKEN_CONTRACT || "dcainnear.tkn.near";
export const SYMBOL: string = env.VITE_TOKEN_SYMBOL || "DCA";

/** Same origin by default: the engine serves the app and the API together. */
export const API_URL: string = (env.VITE_API_URL || "").replace(/\/$/, "");


const nearblocks = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

export const LINKS = {
  buy: (env.VITE_BUY_URL || "https://app.rhea.finance/#near|{token}").replace("{token}", TOKEN),
  token: `${nearblocks}/token/${TOKEN}`,
  tx: (hash: string) => `${nearblocks}/txns/${hash}`,
  account: (id: string) => `${nearblocks}/address/${id}`,
};
