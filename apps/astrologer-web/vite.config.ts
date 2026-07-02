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
      "@elevenhouse/design-system/navigation/NavigationDrawer.css": fileURLToPath(
        new URL(
          "../../packages/design-system/src/navigation/NavigationDrawer/NavigationDrawer.css",
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
      "@elevenhouse/design-system/components/Chip": fileURLToPath(
        new URL("../../packages/design-system/src/components/Chip/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Chip.css": fileURLToPath(
        new URL("../../packages/design-system/src/components/Chip/Chip.css", import.meta.url)
      ),
      "@elevenhouse/design-system/components/IconButton": fileURLToPath(
        new URL("../../packages/design-system/src/components/IconButton/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/IconButton.css": fileURLToPath(
        new URL(
          "../../packages/design-system/src/components/IconButton/IconButton.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/components/Modal": fileURLToPath(
        new URL("../../packages/design-system/src/components/Modal/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Modal.css": fileURLToPath(
        new URL("../../packages/design-system/src/components/Modal/Modal.css", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Card": fileURLToPath(
        new URL("../../packages/design-system/src/components/Card/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Card.css": fileURLToPath(
        new URL("../../packages/design-system/src/components/Card/Card.css", import.meta.url)
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
      "@elevenhouse/design-system/icons/Bell": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Bell/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Check": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Check/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/ChevronDown": fileURLToPath(
        new URL("../../packages/design-system/src/icons/ChevronDown/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Content": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Content/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Edit": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Edit/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Flow": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Flow/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/LayoutGrid": fileURLToPath(
        new URL("../../packages/design-system/src/icons/LayoutGrid/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/LogoMoon": fileURLToPath(
        new URL("../../packages/design-system/src/icons/LogoMoon/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Orbit": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Orbit/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Plus": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Plus/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Refresh": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Refresh/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Reference": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Reference/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Search": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Search/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Sparkle": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Sparkle/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Trash": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Trash/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Verified": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Verified/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/icons/Wallet": fileURLToPath(
        new URL("../../packages/design-system/src/icons/Wallet/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/motion": fileURLToPath(
        new URL("../../packages/design-system/src/motion/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/motion.css": fileURLToPath(
        new URL("../../packages/design-system/src/motion/motion.css", import.meta.url)
      ),
      "@elevenhouse/i18n": fileURLToPath(
        new URL("../../packages/i18n/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/phone": fileURLToPath(
        new URL("../../packages/validation/src/phone/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation": fileURLToPath(
        new URL("../../packages/validation/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
