import type { JobsOptions } from "bullmq";
import {
  messagingMediaIngestionJobName,
  toMessagingMediaIngestionJobOptions,
  type MessagingMediaIngestionQueueOptions
} from "./messaging-media-ingestion.queue";

export type MessagingMediaIngestionRelayStore = {
  readonly listDueIds: (input: {
    readonly now: Date;
    readonly limit: number;
  }) => Promise<readonly string[]>;
};

export type MessagingMediaIngestionRelayQueue = {
  readonly add: (
    name: typeof messagingMediaIngestionJobName,
    data: { readonly ingestionId: string },
    options: JobsOptions
  ) => Promise<unknown>;
};

export async function relayPendingMessagingMediaIngestions(input: {
  readonly store: MessagingMediaIngestionRelayStore;
  readonly queue: MessagingMediaIngestionRelayQueue;
  readonly now: Date;
  readonly batchSize: number;
  readonly queueOptions: MessagingMediaIngestionQueueOptions;
}): Promise<void> {
  const ingestionIds = await input.store.listDueIds({
    now: input.now,
    limit: input.batchSize
  });

  for (const ingestionId of ingestionIds) {
    await input.queue.add(
      messagingMediaIngestionJobName,
      { ingestionId },
      toMessagingMediaIngestionJobOptions({
        ingestionId,
        attempts: input.queueOptions.attempts,
        backoffMs: input.queueOptions.backoffMs
      })
    );
  }
}
