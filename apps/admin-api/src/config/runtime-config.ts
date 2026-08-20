import { z } from "@elevenhouse/validation";

const adminApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_API_PORT: z.coerce.number().int().positive().default(3003),
  ADMIN_API_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_API_SESSION_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_admin_session"),
  ADMIN_API_CSRF_SECRET: z.string().trim().min(32).optional(),
  ADMIN_API_CSRF_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_admin_csrf"),
  ADMIN_API_CSRF_HEADER_NAME: z.string().trim().min(1).default("x-csrf-token"),
  ADMIN_API_CSRF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  ADMIN_API_ALLOWED_ORIGINS: z.string().trim().optional(),
  ADMIN_API_FINANCE_WEBAUTHN_RP_ID: z.string().trim().min(1).max(253).optional(),
  ADMIN_API_FINANCE_WEBAUTHN_ORIGIN: z.string().url().optional(),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ENABLED: z.enum(["true", "false"]).default("false"),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ARTIFACT_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .default(".local/finance-payout-evidence"),
  ADMIN_API_FINANCE_REFUND_DISPATCH_ENABLED: z.enum(["true", "false"]).default("false"),
  ADMIN_API_FINANCE_REFUND_ARTIFACT_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .default(".local/finance-artifacts"),
  ADMIN_API_FINANCE_ARTIFACT_S3_ENDPOINT: z.string().url().optional(),
  ADMIN_API_FINANCE_ARTIFACT_S3_REGION: z.string().trim().min(1).optional(),
  ADMIN_API_FINANCE_ARTIFACT_S3_BUCKET: z.string().trim().min(1).optional(),
  ADMIN_API_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  ADMIN_API_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  ADMIN_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_CASH_POOL_ID: z.string().trim().min(1).max(160).optional(),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_STATEMENT_SOURCE_FINGERPRINT: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional(),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .optional(),
  ADMIN_API_FINANCE_PAYOUT_EVIDENCE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  ADMIN_API_FINANCE_REFUND_DISPATCH_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional(),
  ADMIN_API_FINANCE_REFUND_DISPATCH_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .optional()
});

export type AdminApiRuntimeConfig = {
  readonly port: number;
  readonly trustProxy: boolean;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
  readonly csrfSecret: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly csrfTokenTtlSeconds: number;
  readonly allowedOrigins: readonly string[];
  readonly financeWebAuthn: Readonly<{ rpId: string; origin: string }> | null;
  readonly financePayoutEvidence: Readonly<{
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
        }>;
    bankCashPoolId: string;
    statementSourceFingerprint: `sha256:${string}`;
    retentionPolicy: Readonly<{ policyId: string; policyVersion: string }>;
    maxBytes: number;
  }> | null;
  readonly financeRefundDispatch: Readonly<{
    artifactDirectory: string;
    retentionPolicy: Readonly<{ policyId: string; policyVersion: string }>;
  }> | null;
};

export function createAdminApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): AdminApiRuntimeConfig {
  const config = adminApiRuntimeConfigSchema.parse(source);
  const allowedOrigins = parseAllowedOrigins(config.ADMIN_API_ALLOWED_ORIGINS);

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("ADMIN_API_ALLOWED_ORIGINS is required in production");
  }
  if (config.NODE_ENV === "production" && !config.ADMIN_API_CSRF_SECRET) {
    throw new Error("ADMIN_API_CSRF_SECRET is required in production");
  }
  const financePayoutEvidence = resolveFinancePayoutEvidence(config);
  const financeRefundDispatch = resolveFinanceRefundDispatch(config);
  const financeWebAuthn = resolveFinanceWebAuthn(config);

  return {
    port: config.ADMIN_API_PORT,
    trustProxy: config.ADMIN_API_TRUST_PROXY,
    sessionCookieSecure: config.ADMIN_API_SESSION_COOKIE_SECURE,
    sessionCookieName: config.ADMIN_API_SESSION_COOKIE_NAME,
    csrfSecret: config.ADMIN_API_CSRF_SECRET ?? "development-admin-csrf-secret-32-bytes-minimum",
    csrfCookieName: config.ADMIN_API_CSRF_COOKIE_NAME,
    csrfHeaderName: config.ADMIN_API_CSRF_HEADER_NAME,
    csrfTokenTtlSeconds: config.ADMIN_API_CSRF_TOKEN_TTL_SECONDS,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ["http://localhost:5175"],
    financeWebAuthn,
    financePayoutEvidence,
    financeRefundDispatch
  };
}

function resolveFinanceWebAuthn(
  config: z.infer<typeof adminApiRuntimeConfigSchema>
): AdminApiRuntimeConfig["financeWebAuthn"] {
  const rpId = config.ADMIN_API_FINANCE_WEBAUTHN_RP_ID;
  const originValue = config.ADMIN_API_FINANCE_WEBAUTHN_ORIGIN;
  if (!rpId && !originValue) {
    if (config.NODE_ENV === "production") {
      throw new Error(
        "ADMIN_API_FINANCE_WEBAUTHN_RP_ID and ADMIN_API_FINANCE_WEBAUTHN_ORIGIN are required in production"
      );
    }
    return null;
  }
  if (!rpId || !originValue) {
    throw new Error(
      "ADMIN_API_FINANCE_WEBAUTHN_RP_ID and ADMIN_API_FINANCE_WEBAUTHN_ORIGIN must be configured together"
    );
  }
  const origin = new URL(originValue);
  if (
    origin.origin !== originValue ||
    (origin.protocol !== "https:" && origin.protocol !== "http:")
  ) {
    throw new Error("ADMIN_API_FINANCE_WEBAUTHN_ORIGIN must be an exact HTTP(S) origin");
  }
  if (config.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new Error("ADMIN_API_FINANCE_WEBAUTHN_ORIGIN must use HTTPS in production");
  }
  if (origin.hostname !== rpId && !origin.hostname.endsWith(`.${rpId}`)) {
    throw new Error("ADMIN_API_FINANCE_WEBAUTHN_RP_ID must match the WebAuthn origin host");
  }
  return Object.freeze({ rpId, origin: origin.origin });
}

function resolveFinancePayoutEvidence(
  config: z.infer<typeof adminApiRuntimeConfigSchema>
): AdminApiRuntimeConfig["financePayoutEvidence"] {
  if (config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ENABLED === "false") return null;
  const artifactStorage =
    config.NODE_ENV === "production"
      ? resolvePayoutEvidenceS3Storage(config)
      : config.ADMIN_API_FINANCE_ARTIFACT_S3_ENDPOINT
        ? resolvePayoutEvidenceS3Storage(config)
        : Object.freeze({
            kind: "filesystem" as const,
            rootDirectory: config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ARTIFACT_DIRECTORY
          });
  return Object.freeze({
    artifactStorage,
    bankCashPoolId: requiredPayoutEvidenceConfig(
      config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_CASH_POOL_ID
    ),
    statementSourceFingerprint: requiredPayoutEvidenceConfig(
      config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_STATEMENT_SOURCE_FINGERPRINT
    ) as `sha256:${string}`,
    retentionPolicy: Object.freeze({
      policyId: requiredPayoutEvidenceConfig(
        config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_RETENTION_POLICY_ID
      ),
      policyVersion: requiredPayoutEvidenceConfig(
        config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_RETENTION_POLICY_VERSION
      )
    }),
    maxBytes: config.ADMIN_API_FINANCE_PAYOUT_EVIDENCE_MAX_BYTES
  });
}

function resolvePayoutEvidenceS3Storage(config: z.infer<typeof adminApiRuntimeConfigSchema>) {
  const endpoint = requiredPayoutEvidenceConfig(config.ADMIN_API_FINANCE_ARTIFACT_S3_ENDPOINT);
  if (new URL(endpoint).protocol !== "https:") {
    throw new Error("ADMIN_API_FINANCE_ARTIFACT_S3_ENDPOINT must use HTTPS");
  }
  const forcePathStyle = config.ADMIN_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE;
  if (forcePathStyle === undefined) {
    throw new Error(
      "ADMIN_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE is required when payout evidence is enabled"
    );
  }
  return Object.freeze({
    kind: "s3" as const,
    endpoint,
    region: requiredPayoutEvidenceConfig(config.ADMIN_API_FINANCE_ARTIFACT_S3_REGION),
    bucket: requiredPayoutEvidenceConfig(config.ADMIN_API_FINANCE_ARTIFACT_S3_BUCKET),
    accessKeyId: requiredPayoutEvidenceConfig(config.ADMIN_API_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID),
    secretAccessKey: requiredPayoutEvidenceConfig(
      config.ADMIN_API_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY
    ),
    forcePathStyle: forcePathStyle === "true"
  });
}

function resolveFinanceRefundDispatch(
  config: z.infer<typeof adminApiRuntimeConfigSchema>
): AdminApiRuntimeConfig["financeRefundDispatch"] {
  if (config.ADMIN_API_FINANCE_REFUND_DISPATCH_ENABLED === "false") return null;
  return Object.freeze({
    artifactDirectory: config.ADMIN_API_FINANCE_REFUND_ARTIFACT_DIRECTORY,
    retentionPolicy: Object.freeze({
      policyId: requiredRefundDispatchConfig(
        config.ADMIN_API_FINANCE_REFUND_DISPATCH_RETENTION_POLICY_ID
      ),
      policyVersion: requiredRefundDispatchConfig(
        config.ADMIN_API_FINANCE_REFUND_DISPATCH_RETENTION_POLICY_VERSION
      )
    })
  });
}

function requiredRefundDispatchConfig(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "ADMIN_API_FINANCE_REFUND_DISPATCH_ENABLED requires a provider-request retention policy"
    );
  }
  return value;
}

function requiredPayoutEvidenceConfig(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ENABLED requires private artifact storage, cash-pool identity and retention policy configuration"
    );
  }
  return value;
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
