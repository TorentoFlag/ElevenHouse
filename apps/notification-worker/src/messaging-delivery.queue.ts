import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";

export const messagingDeliveryQueueName = "messaging.delivery";
export const messagingDeliveryJobName = "deliver-messaging-message";

export type MessagingDeliveryJobData = {
  readonly outboxEventId: string;
};

export type MessagingDeliveryQueueOptions = {
  readonly attempts: number;
  readonly backoffMs: number;
};

export type MessagingDeliveryQueue = Queue<
  MessagingDeliveryJobData,
  void,
  typeof messagingDeliveryJobName
>;

export type MessagingDeliveryWorker = Worker<
  MessagingDeliveryJobData,
  void,
  typeof messagingDeliveryJobName
>;

export function createMessagingDeliveryQueue(
  redisUrl: string,
  queueName = messagingDeliveryQueueName
): MessagingDeliveryQueue {
  return new Queue<MessagingDeliveryJobData, void, typeof messagingDeliveryJobName>(
    queueName,
    { connection: toRedisConnectionOptions(redisUrl) }
  );
}

export function createMessagingDeliveryWorker(
  redisUrl: string,
  processor: Processor<MessagingDeliveryJobData, void, typeof messagingDeliveryJobName>,
  queueName = messagingDeliveryQueueName
): MessagingDeliveryWorker {
  return new Worker<MessagingDeliveryJobData, void, typeof messagingDeliveryJobName>(
    queueName,
    processor,
    {
      connection: toRedisConnectionOptions(redisUrl),
      concurrency: 5
    }
  );
}

export function toMessagingDeliveryJobOptions(
  input: MessagingDeliveryQueueOptions & { readonly outboxEventId: string }
): JobsOptions {
  return {
    jobId: `messaging-delivery-${input.outboxEventId}`,
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
