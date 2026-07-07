import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@elevenhouse/design-system/components/LanguageSwitcher": fileURLToPath(
        new URL("../../packages/design-system/src/components/LanguageSwitcher/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/LanguageSwitcher.css": fileURLToPath(
        new URL(
          "../../packages/design-system/src/components/LanguageSwitcher/LanguageSwitcher.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/motion": fileURLToPath(
        new URL("../../packages/design-system/src/motion/index.ts", import.meta.url)
      )
    }
  }
});
