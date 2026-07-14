import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";

export const matrixPdfQueueName = "matrix.pdf";
export const matrixPdfJobName = "render-matrix-pdf";

export type MatrixPdfQueueJobData = { readonly jobId: string };
export type MatrixPdfQueueOptions = { readonly attempts: number; readonly backoffMs: number };
export type MatrixPdfQueue = Queue<MatrixPdfQueueJobData, void, typeof matrixPdfJobName>;
export type MatrixPdfWorker = Worker<MatrixPdfQueueJobData, void, typeof matrixPdfJobName>;

export function createMatrixPdfQueue(redisUrl: string): MatrixPdfQueue {
  return new Queue<MatrixPdfQueueJobData, void, typeof matrixPdfJobName>(matrixPdfQueueName, {
    connection: toRedisConnectionOptions(redisUrl)
  });
}

export function createMatrixPdfWorker(
  redisUrl: string,
  processor: Processor<MatrixPdfQueueJobData, void, typeof matrixPdfJobName>,
  concurrency: number
): MatrixPdfWorker {
  return new Worker<MatrixPdfQueueJobData, void, typeof matrixPdfJobName>(
    matrixPdfQueueName,
    processor,
    { connection: toRedisConnectionOptions(redisUrl), concurrency }
  );
}

export function toMatrixPdfJobOptions(
  input: MatrixPdfQueueOptions & { readonly jobId: string }
): JobsOptions {
  return {
    jobId: `matrix-pdf-${input.jobId}`,
    attempts: input.attempts,
    backoff: { type: "exponential", delay: input.backoffMs },
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
