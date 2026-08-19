import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import { messagingProviderWebhookEvents } from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleMessagingProviderWebhookProcessingStore } from "./drizzle-messaging-provider-webhook-processing-store";

describe.sequential("Drizzle messaging provider webhook processing store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("claims only pending WhatsApp sync webhook events and marks them processed", async () => {
    const store = createDrizzleMessagingProviderWebhookProcessingStore(runtime.database);
    const syncEventKey = `whatsapp:history-chunk:waba-1:phone-1:initial:${randomUUID()}`;
    const liveEventKey = `whatsapp:message:phone-1:${randomUUID()}`;
    await runtime.database.insert(messagingProviderWebhookEvents).values([
      whatsappWebhookEvent({ eventKey: syncEventKey, field: "history" }),
      whatsappWebhookEvent({ eventKey: liveEventKey, field: "messages" })
    ]);

    const claimed = await store.claimDueById({
      eventKey: syncEventKey,
      leaseOwner: "worker-1",
      now: "2026-08-19T00:40:00.000Z"
    });

    expect(claimed).toMatchObject({
      eventKey: syncEventKey,
      field: "history",
      externalAccountId: "phone-1",
      externalOwnerUserId: "waba-1",
      normalizedSummary: { itemCount: 3 }
    });

    await expect(
      store.claimDueById({
        eventKey: liveEventKey,
        leaseOwner: "worker-1",
        now: "2026-08-19T00:40:00.000Z"
      })
    ).resolves.toEqual(null);

    await store.markProcessed({
      eventKey: syncEventKey,
      now: "2026-08-19T00:40:01.000Z"
    });

    const [event] = await runtime.database
      .select()
      .from(messagingProviderWebhookEvents)
      .where(eq(messagingProviderWebhookEvents.eventKey, syncEventKey));
    expect(event).toMatchObject({
      processingStatus: "processed",
      attemptCount: 1,
      lastErrorCode: null,
      lastErrorMessage: null
    });
    expect(event?.processedAt?.toISOString()).toBe("2026-08-19T00:40:01.000Z");
  });

  it("records retryable and final sync webhook processing failures", async () => {
    const store = createDrizzleMessagingProviderWebhookProcessingStore(runtime.database);
    const retryableEventKey = `whatsapp:contact-sync:phone-1:15551234567:upsert:${randomUUID()}`;
    const finalEventKey = `whatsapp:history-chunk:waba-1:phone-1:initial:${randomUUID()}`;
    await runtime.database.insert(messagingProviderWebhookEvents).values([
      whatsappWebhookEvent({ eventKey: retryableEventKey, field: "smb_app_state_sync" }),
      whatsappWebhookEvent({ eventKey: finalEventKey, field: "history" })
    ]);

    await store.claimDueById({
      eventKey: retryableEventKey,
      leaseOwner: "worker-1",
      now: "2026-08-19T00:41:00.000Z"
    });
    await store.markRetryableFailed({
      eventKey: retryableEventKey,
      errorCode: "SYNC_RETRYABLE",
      errorMessage: "temporary",
      now: "2026-08-19T00:41:01.000Z"
    });

    await store.claimDueById({
      eventKey: finalEventKey,
      leaseOwner: "worker-1",
      now: "2026-08-19T00:41:00.000Z"
    });
    await store.markFinalFailed({
      eventKey: finalEventKey,
      errorCode: "SYNC_FINAL",
      errorMessage: "payload unsupported",
      now: "2026-08-19T00:41:02.000Z"
    });

    const rows = await runtime.database
      .select()
      .from(messagingProviderWebhookEvents)
      .where(eq(messagingProviderWebhookEvents.provider, "whatsapp"));
    const retryable = rows.find((row) => row.eventKey === retryableEventKey);
    const final = rows.find((row) => row.eventKey === finalEventKey);

    expect(retryable).toMatchObject({
      processingStatus: "pending",
      attemptCount: 1,
      lastErrorCode: "SYNC_RETRYABLE",
      lastErrorMessage: "temporary"
    });
    expect(retryable?.processedAt).toBeNull();
    expect(final).toMatchObject({
      processingStatus: "failed",
      attemptCount: 1,
      lastErrorCode: "SYNC_FINAL",
      lastErrorMessage: "payload unsupported"
    });
  });
});

function whatsappWebhookEvent(input: { readonly eventKey: string; readonly field: string }) {
  return {
    provider: "whatsapp",
    mode: "whatsapp_cloud",
    eventKey: input.eventKey,
    field: input.field,
    externalAccountId: "phone-1",
    externalOwnerUserId: "waba-1",
    normalizedSummary: { itemCount: 3 },
    receivedAt: new Date("2026-08-19T00:39:00.000Z")
  };
}
