import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@elevenhouse/ai": fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
      "@elevenhouse/contracts/products": fileURLToPath(
        new URL("./packages/contracts/src/products.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/media": fileURLToPath(
        new URL("./packages/contracts/src/media.ts", import.meta.url)
      ),
      "@elevenhouse/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Modal": fileURLToPath(
        new URL("./packages/design-system/src/components/Modal/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/ActionMenu": fileURLToPath(
        new URL("./packages/design-system/src/components/ActionMenu/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/ActionMenu.css": fileURLToPath(
        new URL(
          "./packages/design-system/src/components/ActionMenu/ActionMenu.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/components/SelectableTile": fileURLToPath(
        new URL("./packages/design-system/src/components/SelectableTile/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/SelectableTile.css": fileURLToPath(
        new URL(
          "./packages/design-system/src/components/SelectableTile/SelectableTile.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/components/NumberStepper": fileURLToPath(
        new URL("./packages/design-system/src/components/NumberStepper/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/NumberStepper.css": fileURLToPath(
        new URL(
          "./packages/design-system/src/components/NumberStepper/NumberStepper.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/components/IconPicker": fileURLToPath(
        new URL("./packages/design-system/src/components/IconPicker/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/IconPicker.css": fileURLToPath(
        new URL(
          "./packages/design-system/src/components/IconPicker/IconPicker.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/icons/Icon": fileURLToPath(
        new URL("./packages/design-system/src/icons/Icon/index.ts", import.meta.url)
      ),
      "@elevenhouse/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/phone": fileURLToPath(
        new URL("./packages/validation/src/phone/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/products": fileURLToPath(
        new URL("./packages/validation/src/products/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation/media": fileURLToPath(
        new URL("./packages/validation/src/media/index.ts", import.meta.url)
      ),
      "@elevenhouse/validation": fileURLToPath(
        new URL("./packages/validation/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["{apps,packages}/**/*.test.{ts,tsx}"],
    passWithNoTests: false
  }
});
