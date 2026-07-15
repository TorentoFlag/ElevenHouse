import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";
import type { Logger } from "@elevenhouse/observability";

export const calculationPdfQueueName = "calculation.pdf";
export const calculationPdfRenderJobName = "render-calculation-pdf";
export const calculationPdfDeleteJobName = "delete-calculation-pdf";

export type CalculationPdfRenderJobData = { readonly jobId: string };
export type CalculationPdfDeleteJobData = { readonly mediaAssetId: string };
export type CalculationPdfQueueJobData = CalculationPdfRenderJobData | CalculationPdfDeleteJobData;
export type CalculationPdfJobName =
  | typeof calculationPdfRenderJobName
  | typeof calculationPdfDeleteJobName;
export type CalculationPdfQueueOptions = {
  readonly attempts: number;
  readonly backoffMs: number;
  readonly jitter: number;
};
export type CalculationPdfQueue = Queue<CalculationPdfQueueJobData, void, CalculationPdfJobName>;
export type CalculationPdfWorker = Worker<CalculationPdfQueueJobData, void, CalculationPdfJobName>;

export function createCalculationPdfQueue(redisUrl: string): CalculationPdfQueue {
  return new Queue<CalculationPdfQueueJobData, void, CalculationPdfJobName>(
    calculationPdfQueueName,
    { connection: toRedisConnectionOptions(redisUrl) }
  );
}

export function createCalculationPdfWorker(
  redisUrl: string,
  processor: Processor<CalculationPdfQueueJobData, void, CalculationPdfJobName>,
  concurrency: number
): CalculationPdfWorker {
  return new Worker<CalculationPdfQueueJobData, void, CalculationPdfJobName>(
    calculationPdfQueueName,
    processor,
    { connection: toRedisConnectionOptions(redisUrl), concurrency }
  );
}

export function observeCalculationPdfWorker(
  worker: Pick<CalculationPdfWorker, "on" | "off">,
  logger: Logger
): () => void {
  const completed = (job: { id?: string; name: string; attemptsMade: number }) => {
    logger.info("calculation PDF queue job completed", {
      queueJobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade
    });
  };
  const failed = (
    job: { id?: string; name: string; attemptsMade: number } | undefined,
    error: Error
  ) => {
    logger.error("calculation PDF queue job failed", {
      queueJobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      errorMessage: error.message
    });
  };
  const stalled = (jobId: string, previous: string) => {
    logger.warn("calculation PDF queue job stalled", { queueJobId: jobId, previous });
  };
  const errored = (error: Error) => {
    logger.error("calculation PDF queue worker error", { errorMessage: error.message });
  };
  worker.on("completed", completed);
  worker.on("failed", failed);
  worker.on("stalled", stalled);
  worker.on("error", errored);
  return () => {
    worker.off("completed", completed);
    worker.off("failed", failed);
    worker.off("stalled", stalled);
    worker.off("error", errored);
  };
}

export function toCalculationPdfJobOptions(
  input: CalculationPdfQueueOptions &
    (
      | {
          readonly jobName: typeof calculationPdfRenderJobName;
          readonly data: CalculationPdfRenderJobData;
        }
      | {
          readonly jobName: typeof calculationPdfDeleteJobName;
          readonly data: CalculationPdfDeleteJobData;
        }
    )
): JobsOptions {
  const identity =
    input.jobName === calculationPdfRenderJobName
      ? `render-${input.data.jobId}`
      : `delete-${input.data.mediaAssetId}`;
  return {
    jobId: `calculation-pdf-${identity}`,
    attempts: input.attempts,
    backoff: { type: "exponential", delay: input.backoffMs, jitter: input.jitter },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
  };
}

function toRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null
  };
}
