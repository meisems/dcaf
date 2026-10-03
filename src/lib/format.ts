export const nowS = () => Math.floor(Date.now() / 1000);

export function num(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

/** NEAR amount with sensible precision for tiny and large values. */
export function near(n: number | null | undefined, unit = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  const d = a === 0 ? 0 : a < 0.01 ? 4 : a < 1 ? 3 : a < 100 ? 2 : 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: d }) + (unit ? " NEAR" : "");
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: a >= 100 ? 0 : 2 });
}

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

export function price(p: number | null | undefined): string {
  if (p === null || p === undefined) return "–";
  if (p >= 0.01) return p.toFixed(4);
  if (p >= 1e-6) return p.toFixed(9).replace(/0+$/, "");
  return p.toExponential(2);
}

/** NEAR account ids can be 64-char implicit hex – shorten those, keep named ones readable. */
export function acct(id: string, max = 18): string {
  if (id.length <= max) return id;
  if (/^[0-9a-f]{64}$/.test(id) || id.startsWith("0x")) return id.slice(0, 6) + "…" + id.slice(-4);
  const dot = id.lastIndexOf(".");
  if (dot > 0) {
    const tail = id.slice(dot);
    return id.slice(0, Math.max(4, max - tail.length - 1)) + "…" + tail;
  }
  return id.slice(0, max - 5) + "…" + id.slice(-4);
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ago(ts: number, now = nowS()): string {
  const s = Math.max(0, now - ts);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const clockS = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const dateTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const pct = (f: number, d = 1) => (f * 100).toFixed(d) + "%";

export const isAccountId = (s: string) =>
  /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(s) && s.length >= 2 && s.length <= 64;
