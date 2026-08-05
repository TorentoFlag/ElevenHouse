import { describe, expect, it } from "vitest";

const workspaceRelativeImport = (path: string) => import(/* @vite-ignore */ path);

describe("platform capability runtime evidence round three", () => {
  it("runtime-imports the AstroCalendar worker processor instead of grepping source text", async () => {
    const module = (await workspaceRelativeImport(
      "../../../../../apps/chart-worker/src/astro-calendar-jobs.processor.ts"
    )) as Record<string, unknown>;
    expect(module.processAstroCalendarGenerationJob).toBeTypeOf("function");
  });

  it("runtime-imports the chart worker processor after the schema import blocker was removed", async () => {
    const module = (await workspaceRelativeImport(
      "../../../../../apps/chart-worker/src/chart-jobs.processor.ts"
    )) as Record<string, unknown>;
    expect(module.processChartCalculationJob).toBeTypeOf("function");
  });

  it("runtime-imports every exact payment continuation factory and domain command", async () => {
    const webhookServer = (await workspaceRelativeImport(
      "../../../../../apps/payment-worker/src/webhooks/payment-webhook.server.ts"
    )) as Record<string, unknown>;
    const webhookProcessor = (await workspaceRelativeImport(
      "../../../../../apps/payment-worker/src/webhooks/payment-webhook.processor.ts"
    )) as Record<string, unknown>;
    const settlementProcessor = (await workspaceRelativeImport(
      "../../../../../apps/payment-worker/src/reconciliation/settlement-ledger.processor.ts"
    )) as Record<string, unknown>;
    const holdProcessor = (await workspaceRelativeImport(
      "../../../../../apps/payment-worker/src/holds/hold-release.processor.ts"
    )) as Record<string, unknown>;
    const arcPayPaymentReader = (await workspaceRelativeImport(
      "../../../../../apps/payment-worker/src/arc-pay/arc-pay-payment-reader.ts"
    )) as Record<string, unknown>;
    const arcPaySettlementReader = (await workspaceRelativeImport(
      "../../../../../apps/payment-worker/src/arc-pay/arc-pay-settlement-ledger-client.ts"
    )) as Record<string, unknown>;
    const payments = (await import("../payments/payment-use-cases.js")) as Record<string, unknown>;
    const wallet = (await import("../wallet/ledger-use-cases.js")) as Record<string, unknown>;
    const reconciliation =
      (await import("../reconciliation/reconciliation-use-cases.js")) as Record<string, unknown>;

    for (const [module, exports] of [
      [webhookServer, ["createPaymentWebhookHandler", "createPaymentWebhookServer"]],
      [webhookProcessor, ["createPaymentWebhookProcessor"]],
      [
        settlementProcessor,
        [
          "createSettlementLedgerReconciliationProcessor",
          "startSettlementLedgerReconciliationInterval"
        ]
      ],
      [holdProcessor, ["createHoldReleaseProcessor", "startHoldReleaseInterval"]],
      [arcPayPaymentReader, ["createArcPayPaymentAttemptResolver"]],
      [arcPaySettlementReader, ["createArcPaySettlementLedgerClient"]],
      [payments, ["ingestPaymentProviderWebhook", "releaseTerminalPaymentProviderWebhook"]],
      [
        wallet,
        [
          "capturePaymentProviderWebhook",
          "recordPaymentReversalProviderWebhook",
          "releaseDueCapturedSaleHolds"
        ]
      ],
      [
        reconciliation,
        [
          "recordProviderSettlementMatch",
          "recordProviderReconciliationException",
          "reconcileProviderSettlementLedgerBatch"
        ]
      ]
    ] as const) {
      for (const exportName of exports) expect(module[exportName]).toBeTypeOf("function");
    }
  });
});
