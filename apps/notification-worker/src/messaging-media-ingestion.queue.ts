import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";

export const messagingMediaIngestionQueueName = "messaging.media-ingestion";
export const messagingMediaIngestionJobName = "ingest-message-media";

export type MessagingMediaIngestionJobData = {
  readonly ingestionId: string;
};

export type MessagingMediaIngestionQueueOptions = {
  readonly attempts: number;
  readonly backoffMs: number;
};

export type MessagingMediaIngestionQueue = Queue<
  MessagingMediaIngestionJobData,
  void,
  typeof messagingMediaIngestionJobName
>;

export type MessagingMediaIngestionWorker = Worker<
  MessagingMediaIngestionJobData,
  void,
  typeof messagingMediaIngestionJobName
>;

export function createMessagingMediaIngestionQueue(
  redisUrl: string,
  queueName = messagingMediaIngestionQueueName
): MessagingMediaIngestionQueue {
  return new Queue<MessagingMediaIngestionJobData, void, typeof messagingMediaIngestionJobName>(
    queueName,
    { connection: toRedisConnectionOptions(redisUrl) }
  );
}

export function createMessagingMediaIngestionWorker(
  redisUrl: string,
  processor: Processor<MessagingMediaIngestionJobData, void, typeof messagingMediaIngestionJobName>,
  queueName = messagingMediaIngestionQueueName
): MessagingMediaIngestionWorker {
  return new Worker<MessagingMediaIngestionJobData, void, typeof messagingMediaIngestionJobName>(
    queueName,
    processor,
    {
      connection: toRedisConnectionOptions(redisUrl),
      concurrency: 3
    }
  );
}

export function toMessagingMediaIngestionJobOptions(
  input: MessagingMediaIngestionQueueOptions & { readonly ingestionId: string }
): JobsOptions {
  return {
    jobId: `messaging-media-ingestion-${input.ingestionId}`,
    attempts: input.attempts,
    backoff: {
      type: "exponential",
      delay: input.backoffMs
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60
    }
  };
}

function toRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    maxRetriesPerRequest: null
  };
}
