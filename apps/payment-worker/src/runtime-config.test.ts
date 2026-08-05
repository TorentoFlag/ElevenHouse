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
      },
      onlineWalletHoldRelease: {
        intervalMs: 60_000,
        batchSize: 100
      },
      reconciliation: {
        intervalMs: 900_000,
        lookbackMs: 172_800_000,
        pageLimit: 100,
        currency: "RUB"
      },
      canonicalClientOrderCapture: {
        leaseDurationSeconds: 90,
        maximumAttempts: 8,
        retryBaseDelayMilliseconds: 5_000,
        retryMaximumDelayMilliseconds: 300_000
      },
      financeProviderDispatch: null
    });
  });

  it("requires both Arc Pay credentials in production and rejects insecure API URLs", () => {
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://local"
      })
    ).toThrow(
      "PAYMENT_WORKER_ARC_PAY_API_SECRET and PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET are required in production"
    );
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_ARC_PAY_API_BASE_URL: "http://arc-pay.internal",
        PAYMENT_WORKER_ARC_PAY_API_SECRET: "api-secret",
        PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET: "webhook-secret"
      })
    ).toThrow("PAYMENT_WORKER_ARC_PAY_API_BASE_URL must use HTTPS");
  });

  it("normalizes v2 online-wallet hold release worker settings", () => {
    expect(
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_ONLINE_WALLET_HOLD_RELEASE_INTERVAL_MS: "300000",
        PAYMENT_WORKER_ONLINE_WALLET_HOLD_RELEASE_BATCH_SIZE: "500"
      }).onlineWalletHoldRelease
    ).toEqual({
      intervalMs: 300_000,
      batchSize: 500
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

  it("normalizes fenced canonical capture lease and retry settings", () => {
    expect(
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_CANONICAL_CAPTURE_LEASE_SECONDS: "120",
        PAYMENT_WORKER_CANONICAL_CAPTURE_MAXIMUM_ATTEMPTS: "12",
        PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_BASE_DELAY_MS: "10000",
        PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS: "600000"
      }).canonicalClientOrderCapture
    ).toEqual({
      leaseDurationSeconds: 120,
      maximumAttempts: 12,
      retryBaseDelayMilliseconds: 10_000,
      retryMaximumDelayMilliseconds: 600_000
    });
  });

  it("rejects a canonical capture retry cap below its base delay", () => {
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_BASE_DELAY_MS: "10000",
        PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS: "5000"
      })
    ).toThrow("PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS must not be below the base delay");
  });

  it("requires explicit ArcPay, private S3/KMS and retention authority before enabling provider dispatch", () => {
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED: "true"
      })
    ).toThrow("PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires ArcPay API credentials");
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED: "true",
        PAYMENT_WORKER_ARC_PAY_API_SECRET: "arc-secret"
      })
    ).toThrow(
      "PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires an ArcPay webhook signing secret"
    );

    expect(
      createPaymentWorkerRuntimeConfig({
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED: "true",
        PAYMENT_WORKER_ARC_PAY_API_SECRET: "arc-secret",
        PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET: "arc-webhook-secret",
        PAYMENT_WORKER_ARC_PAY_WEBHOOK_SIGNING_KEY_VERSION_ID: "arc-pay-webhook-key-2026-08",
        PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ENDPOINT: "https://s3.example.test",
        PAYMENT_WORKER_FINANCE_ARTIFACT_S3_REGION: "eu-central-1",
        PAYMENT_WORKER_FINANCE_ARTIFACT_S3_BUCKET: "elevenhouse-finance-private",
        PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: "access-key",
        PAYMENT_WORKER_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: "secret-key",
        PAYMENT_WORKER_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: "false",
        PAYMENT_WORKER_FINANCE_ARTIFACT_KMS_KEY_ARN:
          "arn:aws:kms:eu-central-1:123456789012:key/4b456f46-bf3c-4764-9c1b-381e8c69a545",
        PAYMENT_WORKER_FINANCE_PROVIDER_RESPONSE_RETENTION_POLICY_ID: "provider-response",
        PAYMENT_WORKER_FINANCE_PROVIDER_RESPONSE_RETENTION_POLICY_VERSION: "1",
        PAYMENT_WORKER_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID: "provider-request",
        PAYMENT_WORKER_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION: "1",
        PAYMENT_WORKER_FINANCE_PROVIDER_WEBHOOK_RETENTION_POLICY_ID: "provider-webhook",
        PAYMENT_WORKER_FINANCE_PROVIDER_WEBHOOK_RETENTION_POLICY_VERSION: "1",
        PAYMENT_WORKER_ASTROLOGER_BILLING_RETURN_ORIGIN: "https://astrologer.example.test",
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_INTERVAL_MS: "5000",
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_BATCH_SIZE: "25",
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_LOCK_TIMEOUT_MS: "60000"
      }).financeProviderDispatch
    ).toEqual({
      intervalMs: 5_000,
      batchSize: 25,
      publishingLockTimeoutMs: 60_000,
      artifactStorage: {
        endpoint: "https://s3.example.test",
        region: "eu-central-1",
        bucket: "elevenhouse-finance-private",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        forcePathStyle: false,
        kmsKeyArn: "arn:aws:kms:eu-central-1:123456789012:key/4b456f46-bf3c-4764-9c1b-381e8c69a545"
      },
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" },
      requestArtifactRetention: { policyId: "provider-request", policyVersion: "1" },
      webhookArtifactRetention: { policyId: "provider-webhook", policyVersion: "1" },
      webhookSigningKeyVersionId: "arc-pay-webhook-key-2026-08",
      astrologerBillingReturnOrigin: "https://astrologer.example.test"
    });
  });
});
