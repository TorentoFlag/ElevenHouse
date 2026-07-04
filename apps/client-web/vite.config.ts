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
      "@elevenhouse/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/navigation/Breadcrumbs.css": fileURLToPath(
        new URL(
          "../../packages/design-system/src/navigation/Breadcrumbs/Breadcrumbs.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/navigation": fileURLToPath(
        new URL("../../packages/design-system/src/navigation/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/OtpAuthForm": fileURLToPath(
        new URL("../../packages/design-system/src/components/OtpAuthForm/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/OtpAuthForm.css": fileURLToPath(
        new URL(
          "../../packages/design-system/src/components/OtpAuthForm/OtpAuthForm.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/components/OtpCodeForm": fileURLToPath(
        new URL("../../packages/design-system/src/components/OtpCodeForm/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/OtpCodeForm.css": fileURLToPath(
        new URL(
          "../../packages/design-system/src/components/OtpCodeForm/OtpCodeForm.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/helpers": fileURLToPath(
        new URL("../../packages/design-system/src/helpers/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Icon": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Icon/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/motion": fileURLToPath(
        new URL("../../packages/design-system/src/motion/index.ts", import.meta.url)
      ),
      "@elevenhouse/i18n": fileURLToPath(
        new URL("../../packages/i18n/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/phone": fileURLToPath(
        new URL("../../packages/validation/src/phone/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/products": fileURLToPath(
        new URL("../../packages/validation/src/products/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/media": fileURLToPath(
        new URL("../../packages/validation/src/media/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation": fileURLToPath(
        new URL("../../packages/validation/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
