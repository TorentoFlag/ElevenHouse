import { describe, expect, test } from "vitest";

import { createPublicApiRuntimeConfig } from "./runtime-config";

const baseProductionConfig = {
  NODE_ENV: "production",
  PUBLIC_API_SESSION_COOKIE_SECURE: "true",
  PUBLIC_API_ALLOWED_ORIGINS: "https://client.elevenhouse.ai",
  PUBLIC_API_CSRF_SECRET: "public-api-csrf-secret-32-bytes-minimum",
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  PUBLIC_API_PASSWORDLESS_CODE_SECRET: "public-passwordless-secret",
  PUBLIC_API_GEOAPIFY_API_KEY: "geoapify-production-key"
} as const;

describe("public API finance checkout runtime config", () => {
  test("requires S3 private artifact storage when production checkout preparation is enabled", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        ...baseProductionConfig,
        PUBLIC_API_FINANCE_CHECKOUT_PREPARATION_ENABLED: "true",
        PUBLIC_API_FINANCE_CHECKOUT_PAYMENT_METHODS:
          '[{"method":"bank_card","paymentMode":"redirect"}]'
      })
    ).toThrow("PUBLIC_API_FINANCE_CHECKOUT_PREPARATION_ENABLED requires S3 artifact storage");
  });

  test("resolves production checkout preparation with private S3 artifact storage", () => {
    const config = createPublicApiRuntimeConfig({
      ...baseProductionConfig,
      PUBLIC_API_FINANCE_CHECKOUT_PREPARATION_ENABLED: "true",
      PUBLIC_API_FINANCE_CHECKOUT_PAYMENT_METHODS:
        '[{"method":"bank_card","paymentMode":"redirect"}]',
      PUBLIC_API_FINANCE_ARTIFACT_S3_ENDPOINT: "https://finance-artifacts.example.com",
      PUBLIC_API_FINANCE_ARTIFACT_S3_REGION: "eu-central-1",
      PUBLIC_API_FINANCE_ARTIFACT_S3_BUCKET: "elevenhouse-finance-private",
      PUBLIC_API_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: "finance-access-key",
      PUBLIC_API_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: "finance-secret-key",
      PUBLIC_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: "false",
      PUBLIC_API_FINANCE_ARTIFACT_KMS_KEY_ARN:
        "arn:aws:kms:eu-central-1:123456789012:key/00000000-0000-4000-8000-000000000000"
    });

    expect(config.financeCheckout?.artifactStorage).toEqual({
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
