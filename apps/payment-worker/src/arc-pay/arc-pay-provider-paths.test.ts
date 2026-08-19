import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();

const arcPayBoundaryFiles = [
  "apps/payment-worker/src/arc-pay/arc-pay-card-setup-client.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-saved-card-charge-client.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-canonical-payment-reader.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-payment-reader.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-refund-client.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-settlement-balance-client.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-settlement-ledger-client.ts",
  "apps/payment-worker/src/arc-pay/arc-pay-settlement-ledger-exact-client.ts",
  "packages/finance-infrastructure/src/arc-pay-three-ds-action.ts"
] as const;

const documentedArcPayPaths = [
  "/cards",
  "/cards/setup",
  "/checkout/sessions",
  "/payments/saved-card",
  "/payments/{id}",
  "/payments/{id}/complete-3ds-method",
  "/payments/{id}/execute",
  "/payments/{id}/refunds",
  "/settlement/balance",
  "/settlement/ledger",
  "/settlement/payouts"
] as const;

describe("ArcPay provider REST paths", () => {
  test("uses documented unversioned endpoint paths across worker-owned ArcPay clients", () => {
    const fixture = JSON.parse(
      readFileSync(
        join(repoRoot, "apps/payment-worker/src/arc-pay/fixtures/openapi-2026-08-12.json"),
        "utf8"
      )
    ) as { readonly paths?: Record<string, unknown> };
    const fixturePaths = new Set(Object.keys(fixture.paths ?? {}));
    expect(documentedArcPayPaths.filter((path) => !fixturePaths.has(path))).toEqual([]);

    const offenders = arcPayBoundaryFiles.flatMap((filePath) => {
      const source = readFileSync(join(repoRoot, filePath), "utf8");
      return source
        .split("\n")
        .map((line, index) => ({ filePath, line: index + 1, text: line.trim() }))
        .filter(({ text }) => text.includes("/v1/") || text.includes('"/v1'));
    });

    expect(offenders).toEqual([]);
  });
});
