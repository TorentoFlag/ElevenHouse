import {
  DelayedError,
  Queue,
  Worker,
  type ConnectionOptions,
  type JobsOptions,
  type Processor,
  type WorkerOptions
} from "bullmq";
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
  options: {
    readonly concurrency: number;
    readonly durableLeaseMs: number;
  }
): ChartCalculationWorker {
  return new Worker<ChartWorkerQueuePayload, void, ChartWorkerJobName>(
    chartCalculationQueueName,
    processor,
    toChartCalculationWorkerOptions(redisUrl, options)
  );
}

export function toChartCalculationWorkerOptions(
  redisUrl: string,
  input: {
    readonly concurrency: number;
    readonly durableLeaseMs: number;
  }
): WorkerOptions {
  if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1) {
    throw new Error("Chart worker concurrency must be a positive integer");
  }
  const lockDuration = input.durableLeaseMs * 2;
  if (!Number.isSafeInteger(lockDuration) || input.durableLeaseMs < 1) {
    throw new Error("Chart worker durable lease must be a positive safe integer");
  }
  return {
    connection: toRedisConnectionOptions(redisUrl),
    concurrency: input.concurrency,
    lockDuration,
    autorun: false
  };
}

export function buildChartCalculationBullMqJobId(jobId: string, durableAttempts: number): string {
  if (!Number.isSafeInteger(durableAttempts) || durableAttempts < 0) {
    throw new Error("Chart durable attempts must be a non-negative integer");
  }
  return `chart-calculation-${jobId}-delivery-${durableAttempts}`;
}

export function buildAstroCalendarGenerationBullMqJobId(generationId: string): string {
  return `astro-calendar-generation-${generationId}`;
}

export function isFinalConfiguredQueueAttempt(input: {
  readonly attempts: number | undefined;
  readonly attemptsMade: number;
}): boolean {
  if (!Number.isSafeInteger(input.attempts) || input.attempts === undefined || input.attempts < 1) {
    throw new Error("Queue attempts must be explicitly configured");
  }
  if (!Number.isSafeInteger(input.attemptsMade) || input.attemptsMade < 0) {
    throw new Error("Queue attempts made is invalid");
  }
  return input.attemptsMade + 1 >= input.attempts;
}

export function toChartCalculationJobOptions(
  input: ChartCalculationQueueOptions & {
    readonly jobId: string;
    readonly durableAttempts: number;
    readonly maxAttempts: number;
  }
): JobsOptions {
  if (
    !Number.isSafeInteger(input.maxAttempts) ||
    input.maxAttempts < 1 ||
    input.durableAttempts >= input.maxAttempts
  ) {
    throw new Error("Chart durable retry budget is invalid");
  }
  return {
    jobId: buildChartCalculationBullMqJobId(input.jobId, input.durableAttempts),
    attempts: 1,
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
  };
}

export function toAstroCalendarGenerationJobOptions(
  input: ChartCalculationQueueOptions & {
    readonly generationId: string;
    readonly attempts: number;
  }
): JobsOptions {
  return {
    jobId: buildAstroCalendarGenerationBullMqJobId(input.generationId),
    attempts: input.attempts,
    backoff: { type: "exponential", delay: input.backoffMs, jitter: input.jitter },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
  };
}

export async function deferChartCalculationDelivery(
  job: {
    readonly token?: string;
    readonly moveToDelayed: (timestamp: number, token?: string) => Promise<void>;
  },
  input: { readonly delayMs: number; readonly nowMs?: number }
): Promise<never> {
  if (!Number.isSafeInteger(input.delayMs) || input.delayMs < 1) {
    throw new Error("CHART_QUEUE_DEFER_DELAY_INVALID");
  }
  try {
    await job.moveToDelayed((input.nowMs ?? Date.now()) + input.delayMs, job.token);
  } catch {
    throw new Error("CHART_QUEUE_DEFER_FAILED");
  }
  throw new DelayedError();
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
  const failed = (job: { id?: string; name: string; attemptsMade: number } | undefined) => {
    logger.error("chart calculation queue job failed", {
      queueJobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      errorCode: "chart_queue_job_failed"
    });
  };
  const stalled = (jobId: string) => {
    logger.warn("chart calculation queue job stalled", {
      queueJobId: jobId,
      errorCode: "chart_queue_job_stalled"
    });
  };
  const errored = () => {
    logger.error("chart calculation queue worker error", {
      errorCode: "chart_queue_transport_failure"
    });
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
