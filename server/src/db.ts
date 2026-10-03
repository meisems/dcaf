/**
 * Storage, independent of where it runs. Two drivers implement it:
 * node:sqlite locally (db-node.ts) and Durable Object SQLite on Cloudflare (worker.ts).
 */
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface Driver {
  exec(sql: string): void;
  run(sql: string, args: SqlValue[]): void;
  all(sql: string, args: SqlValue[]): Row[];
  tx<T>(fn: () => T): T;
}

export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY,
    t INTEGER NOT NULL, block INTEGER NOT NULL, w TEXT NOT NULL,
    side TEXT NOT NULL, tokens REAL NOT NULL, q REAL NOT NULL, p REAL NOT NULL,
    tx TEXT NOT NULL, receipt TEXT NOT NULL, idx INTEGER NOT NULL,
    UNIQUE (receipt, idx))`,
  "CREATE INDEX IF NOT EXISTS trades_t ON trades (t)",
  "CREATE INDEX IF NOT EXISTS trades_w ON trades (w, t)",
  "CREATE INDEX IF NOT EXISTS trades_tx ON trades (tx)",
  `CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    first_at INTEGER, last_buy_at INTEGER,
    total REAL NOT NULL DEFAULT 0, tokens REAL NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0, moved INTEGER NOT NULL DEFAULT 0, out_at INTEGER,
    streak INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0,
    earned REAL NOT NULL DEFAULT 0)`,
  "CREATE INDEX IF NOT EXISTS wallets_streak ON wallets (streak DESC)",
  "CREATE INDEX IF NOT EXISTS wallets_earned ON wallets (earned DESC)",
  `CREATE TABLE IF NOT EXISTS windows (
    no INTEGER PRIMARY KEY,
    start INTEGER NOT NULL, close_at INTEGER NOT NULL, closed_at INTEGER,
    pool REAL, paid REAL, rolled REAL, qualifiers INTEGER, golden INTEGER)`,
  `CREATE TABLE IF NOT EXISTS window_buys (
    no INTEGER NOT NULL, w TEXT NOT NULL, q REAL NOT NULL,
    PRIMARY KEY (no, w))`,
  `CREATE TABLE IF NOT EXISTS payouts (
    no INTEGER NOT NULL, w TEXT NOT NULL,
    amount REAL NOT NULL, yocto TEXT NOT NULL, streak INTEGER NOT NULL, buy REAL NOT NULL,
    status TEXT NOT NULL, tx TEXT, err TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (no, w))`,
  "CREATE INDEX IF NOT EXISTS payouts_status ON payouts (status)",
  "CREATE INDEX IF NOT EXISTS payouts_w ON payouts (w)",
];

export type Stmt = {
  run(...args: SqlValue[]): void;
  get(...args: SqlValue[]): Row | undefined;
  all(...args: SqlValue[]): Row[];
};

export function makeDb(driver: Driver) {
  for (const s of SCHEMA) driver.exec(s);
  // v2: a payout's signed transaction is stored before it is sent, so retries can never pay twice
  try {
    driver.exec("ALTER TABLE payouts ADD COLUMN signed TEXT");
  } catch {
    /* already there */
  }
  const prepare = (sql: string): Stmt => ({
    run: (...a) => driver.run(sql, a),
    get: (...a) => driver.all(sql, a)[0],
    all: (...a) => driver.all(sql, a),
  });
  const getMeta = prepare("SELECT v FROM meta WHERE k = ?");
  const setMeta = prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v");
  return {
    prepare,
    tx: <T>(fn: () => T) => driver.tx(fn),
    meta: {
      get: (k: string) => getMeta.get(k)?.v as string | undefined,
      num: (k: string, d = 0) => {
        const v = getMeta.get(k)?.v;
        return v === undefined || v === null ? d : Number(v);
      },
      set: (k: string, v: string | number) => setMeta.run(k, String(v)),
    },
  };
}

export type Db = ReturnType<typeof makeDb>;
