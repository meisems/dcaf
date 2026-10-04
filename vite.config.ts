import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site's settings live in wrangler.jsonc (the Pages project config). Load its VITE_ vars into the build;
// anything already set in the environment (e.g. a local .env.local, or a shell variable) wins.
try {
  const json = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "") // whole-line comments
    .replace(/,(\s*[}\]])/g, "$1"); // trailing commas
  const vars = (JSON.parse(json) as { vars?: Record<string, string> }).vars ?? {};
  for (const [k, v] of Object.entries(vars)) if (k.startsWith("VITE_") && process.env[k] === undefined) process.env[k] = v;
} catch (e) {
  console.warn("wrangler.jsonc: settings not loaded:", (e as Error).message);
}

// In dev the engine runs on :8787 and Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": process.env.ENGINE_URL || "http://localhost:8787" },
  },
});
