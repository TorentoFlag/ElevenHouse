import { describe, expect, test } from "vitest";

import { createAdminApiRuntimeConfig } from "./runtime-config";

const baseProductionConfig = {
  NODE_ENV: "production",
  ADMIN_API_SESSION_COOKIE_SECURE: "true",
  ADMIN_API_ALLOWED_ORIGINS: "https://admin.elevenhouse.ai",
  ADMIN_API_CSRF_SECRET: "admin-api-csrf-secret-32-bytes-minimum",
  ADMIN_API_FINANCE_WEBAUTHN_RP_ID: "admin.elevenhouse.ai",
  ADMIN_API_FINANCE_WEBAUTHN_ORIGIN: "https://admin.elevenhouse.ai"
} as const;

describe("admin API finance payout evidence runtime config", () => {
  test("resolves production payout evidence with private versioned S3 storage without KMS", () => {
    const config = createAdminApiRuntimeConfig({
      ...baseProductionConfig,
      ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ENABLED: "true",
      ADMIN_API_FINANCE_ARTIFACT_S3_ENDPOINT: "https://finance-artifacts.example.com",
      ADMIN_API_FINANCE_ARTIFACT_S3_REGION: "eu-central-1",
      ADMIN_API_FINANCE_ARTIFACT_S3_BUCKET: "elevenhouse-finance-private",
      ADMIN_API_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: "finance-access-key",
      ADMIN_API_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: "finance-secret-key",
      ADMIN_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: "false",
      ADMIN_API_FINANCE_PAYOUT_EVIDENCE_CASH_POOL_ID: "elevenhouse-rub-pool",
      ADMIN_API_FINANCE_PAYOUT_EVIDENCE_STATEMENT_SOURCE_FINGERPRINT:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      ADMIN_API_FINANCE_PAYOUT_EVIDENCE_RETENTION_POLICY_ID: "manual-payout-proof",
      ADMIN_API_FINANCE_PAYOUT_EVIDENCE_RETENTION_POLICY_VERSION: "1"
    });

    expect(config.financePayoutEvidence?.artifactStorage).toEqual({
      kind: "s3",
      endpoint: "https://finance-artifacts.example.com",
      region: "eu-central-1",
      bucket: "elevenhouse-finance-private",
      accessKeyId: "finance-access-key",
      secretAccessKey: "finance-secret-key",
      forcePathStyle: false
    });
  });
});
