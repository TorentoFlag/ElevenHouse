import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";
import type { Logger } from "@elevenhouse/observability";

export const chartCalculationQueueName = "chart.calculation";
export const chartCalculationJobName = "calculate-natal-chart";
export const astroCalendarGenerationJobName = "generate-astro-calendar";

export type ChartCalculationQueuePayload = {
  readonly jobId: string;
};
export type AstroCalendarGenerationQueuePayload = {
  readonly generationId: string;
};
export type ChartWorkerQueuePayload =
  | ChartCalculationQueuePayload
  | AstroCalendarGenerationQueuePayload;
export type ChartWorkerJobName =
  | typeof chartCalculationJobName
  | typeof astroCalendarGenerationJobName;
export type ChartCalculationQueueOptions = {
  readonly attempts: number;
  readonly backoffMs: number;
  readonly jitter: number;
};
export type ChartCalculationQueue = Queue<ChartWorkerQueuePayload, void, ChartWorkerJobName>;
export type ChartCalculationWorker = Worker<ChartWorkerQueuePayload, void, ChartWorkerJobName>;

export function createChartCalculationQueue(redisUrl: string): ChartCalculationQueue {
  return new Queue<ChartWorkerQueuePayload, void, ChartWorkerJobName>(chartCalculationQueueName, {
    connection: toRedisConnectionOptions(redisUrl)
  });
}

export function createChartCalculationWorker(
  redisUrl: string,
  processor: Processor<ChartWorkerQueuePayload, void, ChartWorkerJobName>,
  concurrency: number
): ChartCalculationWorker {
  return new Worker<ChartWorkerQueuePayload, void, ChartWorkerJobName>(
    chartCalculationQueueName,
    processor,
    { connection: toRedisConnectionOptions(redisUrl), concurrency }
  );
}

export function buildChartCalculationBullMqJobId(jobId: string): string {
  return `chart-calculation-${jobId}`;
}

export function buildAstroCalendarGenerationBullMqJobId(generationId: string): string {
  return `astro-calendar-generation-${generationId}`;
}

export function toChartCalculationJobOptions(
  input: ChartCalculationQueueOptions & { readonly jobId: string }
): JobsOptions {
  return {
    jobId: buildChartCalculationBullMqJobId(input.jobId),
    attempts: input.attempts,
    backoff: { type: "exponential", delay: input.backoffMs, jitter: input.jitter },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
  };
}

export function toAstroCalendarGenerationJobOptions(
  input: ChartCalculationQueueOptions & { readonly generationId: string }
): JobsOptions {
  return {
    ...toChartCalculationJobOptions({ ...input, jobId: input.generationId }),
    jobId: buildAstroCalendarGenerationBullMqJobId(input.generationId)
  };
}

export function observeChartCalculationWorker(
  worker: Pick<ChartCalculationWorker, "on" | "off">,
  logger: Logger
): () => void {
  const completed = (job: { id?: string; name: string; attemptsMade: number }) => {
    logger.info("chart calculation queue job completed", {
      queueJobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade
    });
  };
  const failed = (
    job: { id?: string; name: string; attemptsMade: number } | undefined,
    error: Error
  ) => {
    logger.error("chart calculation queue job failed", {
      queueJobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      errorMessage: error.message
    });
  };
  const stalled = (jobId: string, previous: string) => {
    logger.warn("chart calculation queue job stalled", { queueJobId: jobId, previous });
  };
  const errored = (error: Error) => {
    logger.error("chart calculation queue worker error", { errorMessage: error.message });
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
