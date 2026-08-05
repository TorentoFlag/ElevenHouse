import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@elevenhouse/ai": fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
      "@elevenhouse/birth-place-search": fileURLToPath(
        new URL("./packages/birth-place-search/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/chart-engine-client": fileURLToPath(
        new URL("./packages/chart-engine-client/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/products": fileURLToPath(
        new URL("./packages/contracts/src/products.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/media": fileURLToPath(
        new URL("./packages/contracts/src/media.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/finance-policies": fileURLToPath(
        new URL("./packages/contracts/src/finance-policies.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/money": fileURLToPath(
        new URL("./packages/contracts/src/money.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/payouts": fileURLToPath(
        new URL("./packages/contracts/src/payouts.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/payments": fileURLToPath(
        new URL("./packages/contracts/src/payments.ts", import.meta.url)
      ),
      "@elevenhouse/contracts/reconciliation": fileURLToPath(
        new URL("./packages/contracts/src/reconciliation.ts", import.meta.url)
      ),
      "@elevenhouse/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/auth/roles": fileURLToPath(
        new URL("./packages/auth/src/roles.ts", import.meta.url)
      ),
      "@elevenhouse/auth": fileURLToPath(new URL("./packages/auth/src/index.ts", import.meta.url)),
      "@elevenhouse/db/finance": fileURLToPath(
        new URL("./packages/db/src/adapters/finance/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/auth-sessions": fileURLToPath(
        new URL("./packages/db/src/adapters/identity/auth-sessions/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/audit-log": fileURLToPath(
        new URL("./packages/db/src/adapters/audit-log/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/adapters/audit-log": fileURLToPath(
        new URL("./packages/db/src/adapters/audit-log/index.ts", import.meta.url)
      ),
      "@elevenhouse/db/runtime": fileURLToPath(
        new URL("./packages/db/src/runtime/index.ts", import.meta.url)
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
      "@elevenhouse/design-system/components/Popover": fileURLToPath(
        new URL("./packages/design-system/src/components/Popover/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Popover.css": fileURLToPath(
        new URL("./packages/design-system/src/components/Popover/Popover.css", import.meta.url)
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
      "@elevenhouse/design-system/components/Tooltip": fileURLToPath(
        new URL("./packages/design-system/src/components/Tooltip/index.ts", import.meta.url)
      ),
      "@elevenhouse/design-system/components/Tooltip.css": fileURLToPath(
        new URL("./packages/design-system/src/components/Tooltip/Tooltip.css", import.meta.url)
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
      "@elevenhouse/design-system/components/InfiniteScrollTrigger": fileURLToPath(
        new URL(
          "./packages/design-system/src/components/InfiniteScrollTrigger/index.ts",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/components/InfiniteScrollTrigger.css": fileURLToPath(
        new URL(
          "./packages/design-system/src/components/InfiniteScrollTrigger/InfiniteScrollTrigger.css",
          import.meta.url
        )
      ),
      "@elevenhouse/design-system/icons/Icon": fileURLToPath(
        new URL("./packages/design-system/src/icons/Icon/index.ts", import.meta.url)
      ),
      "@elevenhouse/domain/finance-core/reconciliation": fileURLToPath(
        new URL("./packages/domain/src/finance-core/reconciliation.ts", import.meta.url)
      ),
      "@elevenhouse/domain/finance-core": fileURLToPath(
        new URL("./packages/domain/src/finance-core/index.ts", import.meta.url)
      ),
      "@elevenhouse/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/finance-infrastructure": fileURLToPath(
        new URL("./packages/finance-infrastructure/src/index.ts", import.meta.url)
      ),
      "@elevenhouse/numerology-presentation": fileURLToPath(
        new URL("./packages/numerology-presentation/src/index.ts", import.meta.url)
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
