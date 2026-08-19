import type { MessagingProviderWebhookProcessingStore } from "@elevenhouse/db/messaging";
import {
  messagingProviderWebhookJobName,
  toMessagingProviderWebhookJobOptions,
  type MessagingProviderWebhookQueue,
  type MessagingProviderWebhookQueueOptions
} from "./messaging-provider-webhook.queue";

export async function relayPendingMessagingProviderWebhooks(input: {
  readonly store: Pick<MessagingProviderWebhookProcessingStore, "listPendingSyncEventKeys">;
  readonly queue: Pick<MessagingProviderWebhookQueue, "add">;
  readonly batchSize: number;
  readonly queueOptions: MessagingProviderWebhookQueueOptions;
}): Promise<void> {
  const eventKeys = await input.store.listPendingSyncEventKeys({ limit: input.batchSize });
  for (const eventKey of eventKeys) {
    await input.queue.add(
      messagingProviderWebhookJobName,
      { eventKey },
      toMessagingProviderWebhookJobOptions({ ...input.queueOptions, eventKey })
    );
  }
}
