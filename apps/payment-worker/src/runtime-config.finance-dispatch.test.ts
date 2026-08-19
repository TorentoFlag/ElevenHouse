import { describe, expect, test } from "vitest";

import { createPaymentWorkerRuntimeConfig } from "./runtime-config";

const baseProductionConfig = {
  NODE_ENV: "production",
  PAYMENT_WORKER_ARC_PAY_API_SECRET:
    "sk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET:
    "whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  PAYMENT_WORKER_ARC_PAY_WEBHOOK_SIGNING_KEY_VERSION_ID: "arc-pay-webhook-v1",
  PAYMENT_WORKER_ASTROLOGER_BILLING_RETURN_ORIGIN: "https://app.elevenhouse.ai"
} as const;

describe("payment worker finance provider dispatch runtime config", () => {
  test("defaults ArcPay API base URL to the documented OpenAPI v1 server", () => {
    const config = createPaymentWorkerRuntimeConfig({
      NODE_ENV: "development"
    });

    expect(config.arcPay.apiBaseUrl).toBe("https://api.arcpay.space/v1");
  });

  test("requires S3 private artifact storage when production provider dispatch is enabled", () => {
    expect(() =>
      createPaymentWorkerRuntimeConfig({
        ...baseProductionConfig,
        PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED: "true"
      })
    ).toThrow("PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires S3 artifact storage");
  });

  test("resolves production provider dispatch with private S3 artifact storage", () => {
    const config = createPaymentWorkerRuntimeConfig({
      ...baseProductionConfig,
      PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED: "true",
      PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ENDPOINT: "https://finance-artifacts.example.com",
      PAYMENT_WORKER_FINANCE_ARTIFACT_S3_REGION: "eu-central-1",
      PAYMENT_WORKER_FINANCE_ARTIFACT_S3_BUCKET: "elevenhouse-finance-private",
      PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: "finance-access-key",
      PAYMENT_WORKER_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: "finance-secret-key",
      PAYMENT_WORKER_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: "false",
      PAYMENT_WORKER_FINANCE_ARTIFACT_KMS_KEY_ARN:
        "arn:aws:kms:eu-central-1:123456789012:key/00000000-0000-4000-8000-000000000000"
    });

    expect(config.financeProviderDispatch?.artifactStorage).toEqual({
      kind: "s3",
      endpoint: "https://finance-artifacts.example.com",
      region: "eu-central-1",
      bucket: "elevenhouse-finance-private",
      accessKeyId: "finance-access-key",
      secretAccessKey: "finance-secret-key",
      forcePathStyle: false,
      kmsKeyArn: "arn:aws:kms:eu-central-1:123456789012:key/00000000-0000-4000-8000-000000000000"
    });
  });
});
