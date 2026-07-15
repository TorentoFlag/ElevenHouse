import { describe, expect, it } from "vitest";
import { createWorkersRuntimeConfig } from "./runtime-config";

describe("createWorkersRuntimeConfig", () => {
  it("uses safe local defaults and the private media bucket", () => {
    expect(createWorkersRuntimeConfig({})).toEqual({
      redisUrl: "redis://localhost:6379",
      healthHost: "0.0.0.0",
      healthPort: 3010,
      outboxRelayIntervalMs: 1000,
      outboxRelayBatchSize: 25,
      outboxLockTimeoutMs: 60000,
      calculationPdfAttempts: 5,
      calculationPdfBackoffMs: 1000,
      calculationPdfJitter: 0.5,
      calculationPdfConcurrency: 2,
      storage: {
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        privateBucket: "elevenhouse-local-private",
        accessKeyId: "elevenhouse",
        secretAccessKey: "elevenhouse-secret",
        forcePathStyle: true
      }
    });
  });

  it("parses production queue and private storage settings", () => {
    expect(
      createWorkersRuntimeConfig({
        REDIS_URL: "rediss://worker:secret@redis.internal:6380/2",
        WORKERS_CALCULATION_PDF_ATTEMPTS: "7",
        WORKERS_CALCULATION_PDF_JITTER: "0.25",
        WORKERS_CALCULATION_PDF_CONCURRENCY: "4",
        ASTROLOGER_MEDIA_STORAGE_ENDPOINT: "https://objects.internal",
        ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: "elevenhouse-private",
        ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: "false"
      })
    ).toMatchObject({
      redisUrl: "rediss://worker:secret@redis.internal:6380/2",
      calculationPdfAttempts: 7,
      calculationPdfJitter: 0.25,
      calculationPdfConcurrency: 4,
      storage: {
        endpoint: "https://objects.internal",
        privateBucket: "elevenhouse-private",
        forcePathStyle: false
      }
    });
  });

  it("rejects unsafe queue bounds", () => {
    expect(() =>
      createWorkersRuntimeConfig({ WORKERS_CALCULATION_PDF_CONCURRENCY: "50" })
    ).toThrow();
    expect(() => createWorkersRuntimeConfig({ WORKERS_CALCULATION_PDF_JITTER: "1.5" })).toThrow();
  });
});
