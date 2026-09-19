/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind v4 is CSS-first: no tailwind.config.js, no PostCSS step. The
  // plugin scans sources itself and the theme lives in index.css.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Playwright specs live in e2e/ and must not be picked up by Vitest.
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
  },
  server: {
    port: 5173,
    // The API sets httpOnly cookies. Proxying in development keeps the browser
    // on one origin, so cookies are first-party and SameSite=Lax works exactly
    // as it will in production behind a shared domain.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
