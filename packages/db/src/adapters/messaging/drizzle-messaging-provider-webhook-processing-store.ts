import { and, eq, inArray, sql } from "drizzle-orm";
import type { ElevenHouseDatabase } from "../../runtime";
import { messagingProviderWebhookEvents } from "../../schema";

const syncWebhookFields = ["history", "smb_app_state_sync"] as const;

export type MessagingProviderWebhookProcessingWorkItem = {
  readonly eventKey: string;
  readonly provider: "whatsapp";
  readonly mode: "whatsapp_cloud";
  readonly field: "history" | "smb_app_state_sync";
  readonly externalAccountId: string | null;
  readonly externalOwnerUserId: string | null;
  readonly normalizedSummary: Readonly<Record<string, unknown>>;
};

export type MessagingProviderWebhookProcessingStore = {
  readonly listPendingSyncEventKeys: (input: {
    readonly limit: number;
  }) => Promise<readonly string[]>;
  readonly claimDueById: (input: {
    readonly eventKey: string;
    readonly leaseOwner: string;
    readonly now: string;
  }) => Promise<MessagingProviderWebhookProcessingWorkItem | null>;
  readonly markProcessed: (input: { readonly eventKey: string; readonly now: string }) => Promise<void>;
  readonly markRetryableFailed: (input: {
    readonly eventKey: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly now: string;
  }) => Promise<void>;
  readonly markFinalFailed: (input: {
    readonly eventKey: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly now: string;
  }) => Promise<void>;
};

export function createDrizzleMessagingProviderWebhookProcessingStore(
  database: ElevenHouseDatabase
): MessagingProviderWebhookProcessingStore {
  return {
    listPendingSyncEventKeys: (input) => listPendingSyncEventKeys(database, input),
    claimDueById: (input) => claimDueById(database, input),
    markProcessed: (input) => markProcessed(database, input),
    markRetryableFailed: (input) => markFailed(database, input, "pending"),
    markFinalFailed: (input) => markFailed(database, input, "failed")
  };
}

async function listPendingSyncEventKeys(
  database: ElevenHouseDatabase,
  input: { readonly limit: number }
): Promise<readonly string[]> {
  const rows = await database
    .select({ eventKey: messagingProviderWebhookEvents.eventKey })
    .from(messagingProviderWebhookEvents)
    .where(
      and(
        eq(messagingProviderWebhookEvents.provider, "whatsapp"),
        eq(messagingProviderWebhookEvents.mode, "whatsapp_cloud"),
        inArray(messagingProviderWebhookEvents.field, syncWebhookFields),
        eq(messagingProviderWebhookEvents.processingStatus, "pending")
      )
    )
    .limit(input.limit);
  return rows.map((row) => row.eventKey);
}

async function claimDueById(
  database: ElevenHouseDatabase,
  input: {
    readonly eventKey: string;
    readonly leaseOwner: string;
    readonly now: string;
  }
): Promise<MessagingProviderWebhookProcessingWorkItem | null> {
  void input.leaseOwner;
  const [row] = await database
    .update(messagingProviderWebhookEvents)
    .set({
      processingStatus: "processing",
      attemptCount: sqlAttemptCountIncrement(),
      lastErrorCode: null,
      lastErrorMessage: null
    })
    .where(
      and(
        eq(messagingProviderWebhookEvents.provider, "whatsapp"),
        eq(messagingProviderWebhookEvents.mode, "whatsapp_cloud"),
        inArray(messagingProviderWebhookEvents.field, syncWebhookFields),
        eq(messagingProviderWebhookEvents.eventKey, input.eventKey),
        eq(messagingProviderWebhookEvents.processingStatus, "pending")
      )
    )
    .returning({
      eventKey: messagingProviderWebhookEvents.eventKey,
      provider: messagingProviderWebhookEvents.provider,
      mode: messagingProviderWebhookEvents.mode,
      field: messagingProviderWebhookEvents.field,
      externalAccountId: messagingProviderWebhookEvents.externalAccountId,
      externalOwnerUserId: messagingProviderWebhookEvents.externalOwnerUserId,
      normalizedSummary: messagingProviderWebhookEvents.normalizedSummary
    });

  if (!row) return null;
  if (row.provider !== "whatsapp" || row.mode !== "whatsapp_cloud") return null;
  if (row.field !== "history" && row.field !== "smb_app_state_sync") return null;
  return {
    eventKey: row.eventKey,
    provider: "whatsapp",
    mode: "whatsapp_cloud",
    field: row.field,
    externalAccountId: row.externalAccountId,
    externalOwnerUserId: row.externalOwnerUserId,
    normalizedSummary: row.normalizedSummary
  };
}

async function markProcessed(
  database: ElevenHouseDatabase,
  input: { readonly eventKey: string; readonly now: string }
): Promise<void> {
  await database
    .update(messagingProviderWebhookEvents)
    .set({
      processingStatus: "processed",
      lastErrorCode: null,
      lastErrorMessage: null,
      processedAt: new Date(input.now)
    })
    .where(
      and(
        eq(messagingProviderWebhookEvents.provider, "whatsapp"),
        eq(messagingProviderWebhookEvents.mode, "whatsapp_cloud"),
        inArray(messagingProviderWebhookEvents.field, syncWebhookFields),
        eq(messagingProviderWebhookEvents.eventKey, input.eventKey)
      )
    );
}

async function markFailed(
  database: ElevenHouseDatabase,
  input: {
    readonly eventKey: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly now: string;
  },
  processingStatus: "pending" | "failed"
): Promise<void> {
  await database
    .update(messagingProviderWebhookEvents)
    .set({
      processingStatus,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
      processedAt: processingStatus === "failed" ? new Date(input.now) : null
    })
    .where(
      and(
        eq(messagingProviderWebhookEvents.provider, "whatsapp"),
        eq(messagingProviderWebhookEvents.mode, "whatsapp_cloud"),
        inArray(messagingProviderWebhookEvents.field, syncWebhookFields),
        eq(messagingProviderWebhookEvents.eventKey, input.eventKey)
      )
    );
}

function sqlAttemptCountIncrement() {
  return sql`${messagingProviderWebhookEvents.attemptCount} + 1`;
}
