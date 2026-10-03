import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { CFG } from "./config.ts";
import type { Engine } from "./engine.ts";
import type { Reader } from "./read.ts";
import { CC, route } from "./routes.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain",
  ".md": "text/markdown; charset=utf-8", ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".txt", ".md", ".webmanifest"]);

const CCX = { ...CC, asset: "public, max-age=31536000, immutable", page: "no-cache" };

/** A body encoded once: raw bytes, etag, and lazily compressed variants. */
type Encoded = { raw: Buffer; etag: string; br?: Buffer; gz?: Buffer; plain?: boolean };
const encode = (raw: Buffer): Encoded => ({ raw, etag: `"${createHash("sha1").update(raw).digest("base64url").slice(0, 20)}"` });

function pick(req: IncomingMessage, e: Encoded): { body: Buffer; enc?: string } {
  const ae = String(req.headers["accept-encoding"] ?? "");
  if (e.plain || e.raw.length < 1024) return { body: e.raw };
  if (/\bbr\b/.test(ae)) return { body: (e.br ??= brotliCompressSync(e.raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })), enc: "br" };
  if (/\bgzip\b/.test(ae)) return { body: (e.gz ??= gzipSync(e.raw, { level: 6 })), enc: "gzip" };
  return { body: e.raw };
}

function write(req: IncomingMessage, res: ServerResponse, code: number, e: Encoded, type: string, cache: string) {
  const base: Record<string, string> = {
    "access-control-allow-origin": CFG.cors,
    "access-control-expose-headers": "etag",
    "cache-control": cache,
    etag: e.etag,
    vary: "accept-encoding",
  };
  if (code === 200 && req.headers["if-none-match"] === e.etag) {
    res.writeHead(304, base);
    return res.end();
  }
  const { body, enc } = pick(req, e);
  res.writeHead(code, { ...base, "content-type": type, "content-length": String(body.length), ...(enc ? { "content-encoding": enc } : {}) });
  res.end(req.method === "HEAD" ? undefined : body);
}

export function startApi(reader: Reader, engine: Engine) {
  const root = CFG.staticDir ? resolve(CFG.staticDir) : "";
  const hasStatic = !!root && existsSync(join(root, "index.html"));
  const snapCache = new WeakMap<object, Encoded>(); // the reader reuses one snapshot per second
  const files = new Map<string, { e: Encoded; mtime: number }>(); // static files, compressed once

  const json = (req: IncomingMessage, res: ServerResponse, code: number, body: unknown, cache: string) =>
    write(req, res, code, encode(Buffer.from(JSON.stringify(body))), "application/json", cache);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": CFG.cors, "access-control-allow-headers": "content-type, if-none-match" });
      return res.end();
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(req, res, 405, { error: "method not allowed" }, CC.none);

    try {
      if (p === "/api/snapshot") {
        const snap = reader.snapshot();
        let e = snapCache.get(snap);
        if (!e) snapCache.set(snap, (e = encode(Buffer.from(JSON.stringify(snap)))));
        return write(req, res, 200, e, "application/json", CC.live);
      }
      const r = route(reader, engine, p, url.searchParams);
      if (r) return json(req, res, r.status, r.body, r.cache);
    } catch (err) {
      console.error(err);
      return json(req, res, 500, { error: "internal error" }, CC.none);
    }

    if (!hasStatic) return json(req, res, 404, { error: "not found" }, CC.none);
    // the web app: real files, else index.html so client routes work on reload
    let file = normalize(join(root, decodeURIComponent(p)));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    const mtime = statSync(file).mtimeMs;
    let hit = files.get(file);
    if (!hit || hit.mtime !== mtime) files.set(file, (hit = { e: encode(readFileSync(file)), mtime }));
    const ext = extname(file);
    const cache = file.startsWith(join(root, "assets")) ? CCX.asset : CCX.page;
    hit.e.plain = !COMPRESSIBLE.has(ext);
    return write(req, res, 200, hit.e, TYPES[ext] ?? "application/octet-stream", cache);
  });

  server.listen(CFG.port, () => console.log(`◎ api on http://localhost:${CFG.port}${hasStatic ? " (serving web app)" : ""}`));
  return server;
}
