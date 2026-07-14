import { z } from "@elevenhouse/validation";

const schema = z.object({
  REDIS_URL: z.string().trim().url().default("redis://localhost:6379"),
  WORKERS_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
  WORKERS_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  WORKERS_MATRIX_PDF_OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKERS_MATRIX_PDF_OUTBOX_RELAY_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(500)
    .default(25),
  WORKERS_MATRIX_PDF_OUTBOX_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  WORKERS_MATRIX_PDF_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  WORKERS_MATRIX_PDF_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  WORKERS_MATRIX_PDF_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  ASTROLOGER_MEDIA_STORAGE_ENDPOINT: z.string().trim().url().default("http://localhost:9000"),
  ASTROLOGER_MEDIA_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
  ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse-local-private"),
  ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).default("elevenhouse"),
  ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse-secret"),
  ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true")
});

export type WorkersRuntimeConfig = ReturnType<typeof createWorkersRuntimeConfig>;

export function createWorkersRuntimeConfig(
  source: Record<string, string | undefined> = process.env
) {
  const value = schema.parse(source);
  return {
    redisUrl: value.REDIS_URL,
    healthHost: value.WORKERS_HEALTH_HOST,
    healthPort: value.WORKERS_HEALTH_PORT,
    outboxRelayIntervalMs: value.WORKERS_MATRIX_PDF_OUTBOX_RELAY_INTERVAL_MS,
    outboxRelayBatchSize: value.WORKERS_MATRIX_PDF_OUTBOX_RELAY_BATCH_SIZE,
    outboxLockTimeoutMs: value.WORKERS_MATRIX_PDF_OUTBOX_LOCK_TIMEOUT_MS,
    matrixPdfAttempts: value.WORKERS_MATRIX_PDF_ATTEMPTS,
    matrixPdfBackoffMs: value.WORKERS_MATRIX_PDF_BACKOFF_MS,
    matrixPdfConcurrency: value.WORKERS_MATRIX_PDF_CONCURRENCY,
    storage: {
      endpoint: value.ASTROLOGER_MEDIA_STORAGE_ENDPOINT,
      region: value.ASTROLOGER_MEDIA_STORAGE_REGION,
      privateBucket: value.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET,
      accessKeyId: value.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: value.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: value.ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE === "true"
    }
  };
}
