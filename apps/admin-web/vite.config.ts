import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@elevenhouse/auth/roles": fileURLToPath(
        new URL("../../packages/auth/src/roles.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/finance-policies": fileURLToPath(
        new URL("../../packages/contracts/src/finance-policies.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/money": fileURLToPath(
        new URL("../../packages/contracts/src/money.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/payouts": fileURLToPath(
        new URL("../../packages/contracts/src/payouts.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/payments": fileURLToPath(
        new URL("../../packages/contracts/src/payments.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/reconciliation": fileURLToPath(
        new URL("../../packages/contracts/src/reconciliation.ts", import.meta.url)
      ),
      "@elevenhouse/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/media": fileURLToPath(
        new URL("../../packages/validation/src/media/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/products": fileURLToPath(
        new URL("../../packages/validation/src/products/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation": fileURLToPath(
        new URL("../../packages/validation/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    proxy: {
      "/admin": {
        target: "http://localhost:3003",
        changeOrigin: true
      }
    }
  }
});
