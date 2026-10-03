import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the engine runs on :8787 and Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": process.env.ENGINE_URL || "http://localhost:8787" },
  },
});
