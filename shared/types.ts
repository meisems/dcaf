/**
 * The contract between the engine (server) and the app (web).
 * GET /api/snapshot → Snapshot, GET /api/wallet/:id → WalletReport.
 */

export type Rules = {
  roundMin: number; // window length range, minutes
  roundMax: number;
  minBuy: number; // NEAR a wallet must buy inside a window
  minTotal: number; // NEAR a wallet must have bought in total
  streakExp: number;
  amountExp: number;
  topN: number; // only the top N DCAers of a window are paid
  maxShare: number; // optional cap per wallet (1 = no cap)
  minPayout: number; // slices smaller than this (NEAR) roll over
  graceWindows: number;
  minHolders: number; // the first window opens once this many wallets hold the token
  feeBps: number; // creator fee charged on every trade (300 = 3%)
  vaultBps: number; // part of the trade volume that feeds the vault (100 = 1%)
};

/** What the API publishes: the game rules, without the fee configuration. */
export type PublicRules = Omit<Rules, "feeBps" | "vaultBps">;

export type Status = "dcaing" | "waiting" | "notyet" | "idle" | "out";

export type Info = {
  symbol: string;
  token: string;
  vaultAccount: string;
  vaultBalance: number | null; // NEAR the payout account actually holds
  started: boolean; // first window has opened
  holders: number; // indexed wallets holding the token
  syncing: boolean; // indexer still catching up to the chain head
  lagSec: number; // seconds behind the chain head
  dryRun: boolean; // rounds are computed but nothing is sent
  updatedAt: number;

  windowNo: number;
  windowStart: number; // unix seconds
  nextRoundAt: number;

  pool: number; // NEAR that the next close will split (accrued vault fees not yet paid)
  accrued: number; // all vault fees ever accrued
  goldenStack: number; // closes in a row with nobody qualifying
  dcaingNow: number;
  atRisk: number;
  topStreak: number;
  roundsRun: number;
  totalPaid: number;
  wallets: number;

  price: number | null; // NEAR per token
  usdPerNear: number | null;
  supply: number | null;
  change24h: number | null;
  volume24h: number;
  rules: PublicRules;
};

export type Trade = { t: number; w: string; side: "buy" | "sell"; q: number; p: number; tx: string };

export type BoardRow = {
  id: string;
  status: Status;
  streak: number;
  liveStreak: number;
  windowBuy: number;
  total: number;
  share: number;
  est: number;
  earned: number;
};

export type Payout = { w: string; amount: number; streak: number; buy: number; tx: string | null; status: PayoutStatus };
export type PayoutStatus = "pending" | "sent" | "failed" | "dry";

export type Round = {
  no: number;
  at: number;
  pool: number;
  paid: number;
  rolled: number;
  qualifiers: number;
  golden: number;
  payouts: Payout[];
};

export type Snapshot = {
  info: Info;
  trades: Trade[]; // oldest → newest
  board: { next: BoardRow[]; streaks: BoardRow[]; allTime: BoardRow[] };
  rounds: Round[]; // newest first
};

export type RuleCheck = { key: string; ok: boolean; pending?: boolean; label: string; detail: string };

export type WalletReport = {
  id: string;
  known: boolean;
  status: Status;
  outReason: "sold" | "moved" | null;
  streak: number;
  liveStreak: number;
  bestStreak: number;
  windowBuy: number;
  total: number;
  holding: number;
  earned: number;
  rank: number | null;
  est: number;
  share: number;
  firstAt: number | null;
  lastBuyAt: number | null;
  checks: RuleCheck[];
  history: { round: number; at: number; amount: number; streak: number; tx: string | null }[];
  trades?: Trade[]; // this wallet's latest trades
};
