import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";

export const messagingProviderWebhookQueueName = "messaging.provider-webhook";
export const messagingProviderWebhookJobName = "process-messaging-provider-webhook";

export type MessagingProviderWebhookJobData = {
  readonly eventKey: string;
};

export type MessagingProviderWebhookQueueOptions = {
  readonly attempts: number;
  readonly backoffMs: number;
};

export type MessagingProviderWebhookQueue = Queue<
  MessagingProviderWebhookJobData,
  void,
  typeof messagingProviderWebhookJobName
>;

export type MessagingProviderWebhookWorker = Worker<
  MessagingProviderWebhookJobData,
  void,
  typeof messagingProviderWebhookJobName
>;

export function createMessagingProviderWebhookQueue(
  redisUrl: string,
  queueName = messagingProviderWebhookQueueName
): MessagingProviderWebhookQueue {
  return new Queue<MessagingProviderWebhookJobData, void, typeof messagingProviderWebhookJobName>(
    queueName,
    { connection: toRedisConnectionOptions(redisUrl) }
  );
}

export function createMessagingProviderWebhookWorker(
  redisUrl: string,
  processor: Processor<MessagingProviderWebhookJobData, void, typeof messagingProviderWebhookJobName>,
  queueName = messagingProviderWebhookQueueName
): MessagingProviderWebhookWorker {
  return new Worker<MessagingProviderWebhookJobData, void, typeof messagingProviderWebhookJobName>(
    queueName,
    processor,
    {
      connection: toRedisConnectionOptions(redisUrl),
      concurrency: 3
    }
  );
}

export function toMessagingProviderWebhookJobOptions(
  input: MessagingProviderWebhookQueueOptions & { readonly eventKey: string }
): JobsOptions {
  return {
    jobId: `messaging-provider-webhook-${input.eventKey}`,
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
