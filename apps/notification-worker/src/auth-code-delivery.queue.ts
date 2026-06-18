import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";

export const authCodeDeliveryQueueName = "notifications.auth-code-delivery";
export const authCodeDeliveryJobName = "deliver-passwordless-auth-code";

export type AuthCodeDeliveryJobData = {
  readonly outboxEventId: string;
};

export type AuthCodeDeliveryQueueOptions = {
  readonly attempts: number;
  readonly backoffMs: number;
};

export type AuthCodeDeliveryQueue = Queue<
  AuthCodeDeliveryJobData,
  void,
  typeof authCodeDeliveryJobName
>;

export type AuthCodeDeliveryWorker = Worker<
  AuthCodeDeliveryJobData,
  void,
  typeof authCodeDeliveryJobName
>;

export function createAuthCodeDeliveryQueue(
  redisUrl: string,
  queueName = authCodeDeliveryQueueName
): AuthCodeDeliveryQueue {
  return new Queue<AuthCodeDeliveryJobData, void, typeof authCodeDeliveryJobName>(
    queueName,
    { connection: toRedisConnectionOptions(redisUrl) }
  );
}

export function createAuthCodeDeliveryWorker(
  redisUrl: string,
  processor: Processor<AuthCodeDeliveryJobData, void, typeof authCodeDeliveryJobName>,
  queueName = authCodeDeliveryQueueName
): AuthCodeDeliveryWorker {
  return new Worker<AuthCodeDeliveryJobData, void, typeof authCodeDeliveryJobName>(
    queueName,
    processor,
    {
      connection: toRedisConnectionOptions(redisUrl),
      concurrency: 5
    }
  );
}

export function toAuthCodeDeliveryJobOptions(
  input: AuthCodeDeliveryQueueOptions & { readonly outboxEventId: string }
): JobsOptions {
  return {
    jobId: `auth-code-delivery-${input.outboxEventId}`,
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
