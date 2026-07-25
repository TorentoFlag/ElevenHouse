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
        apiBaseUrl: "https://api.arcpay.space",
        apiSecret: null,
        webhookSecret: null,
        environment: "sandbox",
        timestampToleranceSeconds: 300
      }
    });
  });

  it("requires both Arc Pay credentials in production and rejects insecure API URLs", () => {
    expect(() =>
      createPaymentWorkerRuntimeConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://local" })
    ).toThrow("PAYMENT_WORKER_ARC_PAY_API_SECRET and PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET are required in production");
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_ARC_PAY_API_BASE_URL: "http://arc-pay.internal",
        PAYMENT_WORKER_ARC_PAY_API_SECRET: "api-secret",
        PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET: "webhook-secret"
      })
    ).toThrow("PAYMENT_WORKER_ARC_PAY_API_BASE_URL must use HTTPS");
  });
});
