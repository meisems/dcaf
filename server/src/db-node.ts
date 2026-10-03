import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { makeDb, type Driver, type Row } from "./db.ts";

/** Local driver: one SQLite file via node:sqlite (used for local runs and tests). */
export function openNodeDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  const cache = new Map<string, ReturnType<DatabaseSync["prepare"]>>();
  const stmt = (sql: string) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const driver: Driver = {
    exec: (sql) => db.exec(sql),
    run: (sql, args) => void stmt(sql).run(...(args as SQLInputValue[])),
    all: (sql, args) => stmt(sql).all(...(args as SQLInputValue[])) as Row[],
    tx(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return makeDb(driver);
}
