import { z } from "@elevenhouse/validation";

const runtimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PAYMENT_WORKER_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
  PAYMENT_WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3011),
  PAYMENT_WORKER_WEBHOOK_HOST: z.string().trim().min(1).default("0.0.0.0"),
  PAYMENT_WORKER_WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(3013),
  PAYMENT_WORKER_ARC_PAY_API_BASE_URL: z.string().url().default("https://api.arcpay.space/v1"),
  PAYMENT_WORKER_ARC_PAY_API_SECRET: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_ARC_PAY_WEBHOOK_SIGNING_KEY_VERSION_ID: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_ARC_PAY_TIMESTAMP_TOLERANCE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(3600)
    .default(300),
  PAYMENT_WORKER_ONLINE_WALLET_HOLD_RELEASE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(60_000),
  PAYMENT_WORKER_ONLINE_WALLET_HOLD_RELEASE_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(1_000)
    .default(100),
  PAYMENT_WORKER_RECONCILIATION_INTERVAL_MS: z.coerce.number().int().min(0).default(900_000),
  PAYMENT_WORKER_RECONCILIATION_LOOKBACK_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .max(720)
    .default(48),
  PAYMENT_WORKER_RECONCILIATION_PAGE_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(100),
  PAYMENT_WORKER_RECONCILIATION_CURRENCY: z.enum(["RUB"]).default("RUB"),
  PAYMENT_WORKER_SETTLEMENT_INGESTION_CURSOR_OVERLAP_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(604_800)
    .default(3600),
  PAYMENT_WORKER_SETTLEMENT_INGESTION_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(86_400)
    .default(120),
  PAYMENT_WORKER_SETTLEMENT_INGESTION_MAXIMUM_PAGE_COUNT: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(100),
  PAYMENT_WORKER_CANONICAL_CAPTURE_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(300)
    .default(90),
  PAYMENT_WORKER_CANONICAL_CAPTURE_MAXIMUM_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(8),
  PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(300_000)
    .default(5_000),
  PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3_600_000)
    .default(300_000),
  PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED: z.enum(["true", "false"]).default("false"),
  PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(5_000),
  PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(25),
  PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_LOCK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(60_000),
  PAYMENT_WORKER_FINANCE_ARTIFACT_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .default(".local/finance-artifacts"),
  PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ENDPOINT: z.string().url().optional(),
  PAYMENT_WORKER_FINANCE_ARTIFACT_S3_REGION: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_FINANCE_ARTIFACT_S3_BUCKET: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  PAYMENT_WORKER_FINANCE_ARTIFACT_KMS_KEY_ARN: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_FINANCE_PROVIDER_RESPONSE_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .default("provider-response"),
  PAYMENT_WORKER_FINANCE_PROVIDER_RESPONSE_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default("1"),
  PAYMENT_WORKER_FINANCE_PROVIDER_CANONICAL_READ_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .default("provider-canonical-read"),
  PAYMENT_WORKER_FINANCE_PROVIDER_CANONICAL_READ_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default("1"),
  PAYMENT_WORKER_FINANCE_PROVIDER_SETTLEMENT_PAGE_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .default("provider-settlement-page"),
  PAYMENT_WORKER_FINANCE_PROVIDER_SETTLEMENT_PAGE_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default("1"),
  PAYMENT_WORKER_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .default("provider-request"),
  PAYMENT_WORKER_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default("1"),
  PAYMENT_WORKER_FINANCE_PROVIDER_WEBHOOK_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .default("provider-webhook"),
  PAYMENT_WORKER_FINANCE_PROVIDER_WEBHOOK_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default("1"),
  PAYMENT_WORKER_ASTROLOGER_BILLING_RETURN_ORIGIN: z.string().url().optional()
});

export type PaymentWorkerRuntimeConfig = {
  readonly healthHost: string;
  readonly healthPort: number;
  readonly webhookHost: string;
  readonly webhookPort: number;
  readonly arcPay: {
    readonly apiBaseUrl: string;
    readonly apiSecret: string | null;
    readonly webhookSecret: string | null;
    readonly timestampToleranceSeconds: number;
  };
  readonly onlineWalletHoldRelease: {
    readonly intervalMs: number;
    readonly batchSize: number;
  };
  readonly reconciliation: {
    readonly intervalMs: number;
    readonly lookbackMs: number;
    readonly pageLimit: number;
    readonly currency: "RUB";
  };
  readonly settlementIngestion: {
    readonly cursorOverlapSeconds: number;
    readonly leaseDurationSeconds: number;
    readonly maximumPageCount: number;
  };
  readonly canonicalClientOrderCapture: {
    readonly leaseDurationSeconds: number;
    readonly maximumAttempts: number;
    readonly retryBaseDelayMilliseconds: number;
    readonly retryMaximumDelayMilliseconds: number;
  };
  readonly financeProviderDispatch: Readonly<{
    intervalMs: number;
    batchSize: number;
    publishingLockTimeoutMs: number;
    artifactStorage:
      | Readonly<{ kind: "filesystem"; rootDirectory: string }>
      | Readonly<{
          kind: "s3";
          endpoint: string;
          region: string;
          bucket: string;
          accessKeyId: string;
          secretAccessKey: string;
          forcePathStyle: boolean;
          kmsKeyArn: string;
        }>;
    responseArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
    canonicalReadArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
    settlementPageArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
    requestArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
    webhookArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
    webhookSigningKeyVersionId: string;
    astrologerBillingReturnOrigin: string;
  }> | null;
};

export function createPaymentWorkerRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): PaymentWorkerRuntimeConfig {
  const config = runtimeConfigSchema.parse(source);
  if (
    config.NODE_ENV === "production" &&
    (!config.PAYMENT_WORKER_ARC_PAY_API_SECRET || !config.PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET)
  ) {
    throw new Error(
      "PAYMENT_WORKER_ARC_PAY_API_SECRET and PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET are required in production"
    );
  }
  if (new URL(config.PAYMENT_WORKER_ARC_PAY_API_BASE_URL).protocol !== "https:") {
    throw new Error("PAYMENT_WORKER_ARC_PAY_API_BASE_URL must use HTTPS");
  }
  if (
    config.PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS <
    config.PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_BASE_DELAY_MS
  ) {
    throw new Error(
      "PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS must not be below the base delay"
    );
  }
  const financeProviderDispatch = resolveFinanceProviderDispatch(config);

  return {
    healthHost: config.PAYMENT_WORKER_HEALTH_HOST,
    healthPort: config.PAYMENT_WORKER_HEALTH_PORT,
    webhookHost: config.PAYMENT_WORKER_WEBHOOK_HOST,
    webhookPort: config.PAYMENT_WORKER_WEBHOOK_PORT,
    arcPay: {
      apiBaseUrl: config.PAYMENT_WORKER_ARC_PAY_API_BASE_URL,
      apiSecret: config.PAYMENT_WORKER_ARC_PAY_API_SECRET ?? null,
      webhookSecret: config.PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET ?? null,
      timestampToleranceSeconds: config.PAYMENT_WORKER_ARC_PAY_TIMESTAMP_TOLERANCE_SECONDS
    },
    onlineWalletHoldRelease: {
      intervalMs: config.PAYMENT_WORKER_ONLINE_WALLET_HOLD_RELEASE_INTERVAL_MS,
      batchSize: config.PAYMENT_WORKER_ONLINE_WALLET_HOLD_RELEASE_BATCH_SIZE
    },
    reconciliation: {
      intervalMs: config.PAYMENT_WORKER_RECONCILIATION_INTERVAL_MS,
      lookbackMs: config.PAYMENT_WORKER_RECONCILIATION_LOOKBACK_HOURS * 60 * 60 * 1000,
      pageLimit: config.PAYMENT_WORKER_RECONCILIATION_PAGE_LIMIT,
      currency: config.PAYMENT_WORKER_RECONCILIATION_CURRENCY
    },
    settlementIngestion: {
      cursorOverlapSeconds: config.PAYMENT_WORKER_SETTLEMENT_INGESTION_CURSOR_OVERLAP_SECONDS,
      leaseDurationSeconds: config.PAYMENT_WORKER_SETTLEMENT_INGESTION_LEASE_SECONDS,
      maximumPageCount: config.PAYMENT_WORKER_SETTLEMENT_INGESTION_MAXIMUM_PAGE_COUNT
    },
    canonicalClientOrderCapture: Object.freeze({
      leaseDurationSeconds: config.PAYMENT_WORKER_CANONICAL_CAPTURE_LEASE_SECONDS,
      maximumAttempts: config.PAYMENT_WORKER_CANONICAL_CAPTURE_MAXIMUM_ATTEMPTS,
      retryBaseDelayMilliseconds: config.PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_BASE_DELAY_MS,
      retryMaximumDelayMilliseconds: config.PAYMENT_WORKER_CANONICAL_CAPTURE_RETRY_MAXIMUM_DELAY_MS
    }),
    financeProviderDispatch
  };
}

function resolveFinanceProviderDispatch(
  config: z.infer<typeof runtimeConfigSchema>
): PaymentWorkerRuntimeConfig["financeProviderDispatch"] {
  if (config.PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED === "false") return null;
  if (!config.PAYMENT_WORKER_ARC_PAY_API_SECRET) {
    throw new Error(
      "PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires ArcPay API credentials"
    );
  }
  if (!config.PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET) {
    throw new Error(
      "PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires an ArcPay webhook signing secret"
    );
  }
  const webhookSigningKeyVersionId = required(
    config.PAYMENT_WORKER_ARC_PAY_WEBHOOK_SIGNING_KEY_VERSION_ID
  );
  return Object.freeze({
    intervalMs: config.PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_INTERVAL_MS,
    batchSize: config.PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_BATCH_SIZE,
    publishingLockTimeoutMs: config.PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_LOCK_TIMEOUT_MS,
    artifactStorage: resolveFinanceProviderDispatchArtifactStorage(config),
    responseArtifactRetention: Object.freeze({
      policyId: required(config.PAYMENT_WORKER_FINANCE_PROVIDER_RESPONSE_RETENTION_POLICY_ID),
      policyVersion: required(
        config.PAYMENT_WORKER_FINANCE_PROVIDER_RESPONSE_RETENTION_POLICY_VERSION
      )
    }),
    canonicalReadArtifactRetention: Object.freeze({
      policyId: required(config.PAYMENT_WORKER_FINANCE_PROVIDER_CANONICAL_READ_RETENTION_POLICY_ID),
      policyVersion: required(
        config.PAYMENT_WORKER_FINANCE_PROVIDER_CANONICAL_READ_RETENTION_POLICY_VERSION
      )
    }),
    settlementPageArtifactRetention: Object.freeze({
      policyId: required(
        config.PAYMENT_WORKER_FINANCE_PROVIDER_SETTLEMENT_PAGE_RETENTION_POLICY_ID
      ),
      policyVersion: required(
        config.PAYMENT_WORKER_FINANCE_PROVIDER_SETTLEMENT_PAGE_RETENTION_POLICY_VERSION
      )
    }),
    requestArtifactRetention: Object.freeze({
      policyId: required(config.PAYMENT_WORKER_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID),
      policyVersion: required(
        config.PAYMENT_WORKER_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION
      )
    }),
    webhookArtifactRetention: Object.freeze({
      policyId: required(config.PAYMENT_WORKER_FINANCE_PROVIDER_WEBHOOK_RETENTION_POLICY_ID),
      policyVersion: required(
        config.PAYMENT_WORKER_FINANCE_PROVIDER_WEBHOOK_RETENTION_POLICY_VERSION
      )
    }),
    webhookSigningKeyVersionId,
    astrologerBillingReturnOrigin: requiredHttpsOrigin(
      config.PAYMENT_WORKER_ASTROLOGER_BILLING_RETURN_ORIGIN
    )
  });
}

function resolveFinanceProviderDispatchArtifactStorage(
  config: z.infer<typeof runtimeConfigSchema>
): NonNullable<PaymentWorkerRuntimeConfig["financeProviderDispatch"]>["artifactStorage"] {
  if (config.NODE_ENV === "production" || config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ENDPOINT) {
    return resolveFinanceProviderDispatchS3Storage(config);
  }
  return Object.freeze({
    kind: "filesystem" as const,
    rootDirectory: config.PAYMENT_WORKER_FINANCE_ARTIFACT_DIRECTORY
  });
}

function resolveFinanceProviderDispatchS3Storage(config: z.infer<typeof runtimeConfigSchema>) {
  const endpoint = requiredS3(config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ENDPOINT);
  if (new URL(endpoint).protocol !== "https:") {
    throw new Error("PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ENDPOINT must use HTTPS");
  }
  const forcePathStyle = config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE;
  if (forcePathStyle === undefined) {
    throw new Error(
      "PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires S3 artifact storage"
    );
  }
  const kmsKeyArn = requiredS3(config.PAYMENT_WORKER_FINANCE_ARTIFACT_KMS_KEY_ARN);
  if (!/^arn:aws[a-z-]*:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/i.test(kmsKeyArn)) {
    throw new Error(
      "PAYMENT_WORKER_FINANCE_ARTIFACT_KMS_KEY_ARN must be a customer-managed KMS key ARN"
    );
  }
  return Object.freeze({
    kind: "s3" as const,
    endpoint,
    region: requiredS3(config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_REGION),
    bucket: requiredS3(config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_BUCKET),
    accessKeyId: requiredS3(config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID),
    secretAccessKey: requiredS3(config.PAYMENT_WORKER_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY),
    forcePathStyle: forcePathStyle === "true",
    kmsKeyArn
  });
}

function required(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires private artifact storage and retention policy configuration"
    );
  }
  return value;
}

function requiredS3(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "PAYMENT_WORKER_FINANCE_PROVIDER_DISPATCH_ENABLED requires S3 artifact storage"
    );
  }
  return value;
}

function requiredHttpsOrigin(value: string | undefined): string {
  const raw = required(value);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.origin !== raw) {
    throw new Error("PAYMENT_WORKER_ASTROLOGER_BILLING_RETURN_ORIGIN must be an HTTPS origin");
  }
  return url.origin;
}
