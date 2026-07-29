import { describe, expect, it } from "vitest";
import { createPaymentWorkerRuntimeConfig } from "./runtime-config";

describe("payment worker runtime config", () => {
  it("uses isolated webhook defaults and a 300 second signature tolerance", () => {
    expect(createPaymentWorkerRuntimeConfig()).toMatchObject({
      healthHost: "0.0.0.0",
      healthPort: 3011,
      webhookHost: "0.0.0.0",
      webhookPort: 3013,
      arcPay: {
        enabled: false,
        apiBaseUrl: "https://api.arcpay.space",
        apiSecret: null,
        webhookSecret: null,
        environment: "sandbox",
        timestampToleranceSeconds: 300
      },
      holdRelease: {
        intervalMs: 60_000,
        batchSize: 100,
        commandTtlMs: 2_592_000_000
      },
      reconciliation: {
        intervalMs: 900_000,
        lookbackMs: 172_800_000,
        pageLimit: 100,
        currency: "RUB"
      }
    });
  });

  it("allows production startup when Arc Pay is disabled", () => {
    expect(
      createPaymentWorkerRuntimeConfig({
        NODE_ENV: "production"
      }).arcPay
    ).toMatchObject({
      enabled: false,
      apiSecret: null,
      webhookSecret: null
    });
  });

  it("requires both Arc Pay credentials when enabled and rejects insecure API URLs", () => {
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_ARC_PAY_ENABLED: "true"
      })
    ).toThrow(
      "PAYMENT_WORKER_ARC_PAY_API_SECRET and PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET are required when Arc Pay is enabled"
    );
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_ARC_PAY_ENABLED: "true",
        PAYMENT_WORKER_ARC_PAY_API_BASE_URL: "http://arc-pay.internal",
        PAYMENT_WORKER_ARC_PAY_API_SECRET: "api-secret",
        PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET: "webhook-secret"
      })
    ).toThrow("PAYMENT_WORKER_ARC_PAY_API_BASE_URL must use HTTPS");
  });

  it("normalizes captured-sale hold release worker settings", () => {
    expect(
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_HOLD_RELEASE_INTERVAL_MS: "300000",
        PAYMENT_WORKER_HOLD_RELEASE_BATCH_SIZE: "500",
        PAYMENT_WORKER_HOLD_RELEASE_COMMAND_TTL_SECONDS: "86400"
      }).holdRelease
    ).toEqual({
      intervalMs: 300_000,
      batchSize: 500,
      commandTtlMs: 86_400_000
    });
  });

  it("normalizes settlement reconciliation worker settings", () => {
    expect(
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_RECONCILIATION_INTERVAL_MS: "600000",
        PAYMENT_WORKER_RECONCILIATION_LOOKBACK_HOURS: "72",
        PAYMENT_WORKER_RECONCILIATION_PAGE_LIMIT: "50",
        PAYMENT_WORKER_RECONCILIATION_CURRENCY: "RUB"
      }).reconciliation
    ).toEqual({
      intervalMs: 600_000,
      lookbackMs: 259_200_000,
      pageLimit: 50,
      currency: "RUB"
    });
  });
});
