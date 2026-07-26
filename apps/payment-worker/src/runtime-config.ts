import { z } from "@elevenhouse/validation";

const runtimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PAYMENT_WORKER_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
  PAYMENT_WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3011),
  PAYMENT_WORKER_WEBHOOK_HOST: z.string().trim().min(1).default("0.0.0.0"),
  PAYMENT_WORKER_WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(3013),
  PAYMENT_WORKER_ARC_PAY_API_BASE_URL: z.string().url().default("https://api.arcpay.space"),
  PAYMENT_WORKER_ARC_PAY_API_SECRET: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  PAYMENT_WORKER_ARC_PAY_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYMENT_WORKER_ARC_PAY_TIMESTAMP_TOLERANCE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(3600)
    .default(300),
  PAYMENT_WORKER_HOLD_RELEASE_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
  PAYMENT_WORKER_HOLD_RELEASE_BATCH_SIZE: z.coerce.number().int().positive().max(1_000).default(100),
  PAYMENT_WORKER_HOLD_RELEASE_COMMAND_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(31_536_000)
    .default(2_592_000)
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
    readonly environment: "sandbox" | "live";
    readonly timestampToleranceSeconds: number;
  };
  readonly holdRelease: {
    readonly intervalMs: number;
    readonly batchSize: number;
    readonly commandTtlMs: number;
  };
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

  return {
    healthHost: config.PAYMENT_WORKER_HEALTH_HOST,
    healthPort: config.PAYMENT_WORKER_HEALTH_PORT,
    webhookHost: config.PAYMENT_WORKER_WEBHOOK_HOST,
    webhookPort: config.PAYMENT_WORKER_WEBHOOK_PORT,
    arcPay: {
      apiBaseUrl: config.PAYMENT_WORKER_ARC_PAY_API_BASE_URL,
      apiSecret: config.PAYMENT_WORKER_ARC_PAY_API_SECRET ?? null,
      webhookSecret: config.PAYMENT_WORKER_ARC_PAY_WEBHOOK_SECRET ?? null,
      environment: config.PAYMENT_WORKER_ARC_PAY_ENVIRONMENT,
      timestampToleranceSeconds: config.PAYMENT_WORKER_ARC_PAY_TIMESTAMP_TOLERANCE_SECONDS
    },
    holdRelease: {
      intervalMs: config.PAYMENT_WORKER_HOLD_RELEASE_INTERVAL_MS,
      batchSize: config.PAYMENT_WORKER_HOLD_RELEASE_BATCH_SIZE,
      commandTtlMs: config.PAYMENT_WORKER_HOLD_RELEASE_COMMAND_TTL_SECONDS * 1000
    }
  };
}
