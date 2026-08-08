import {
  createOutboundMessage,
  selectSingleSendableMessagingConversation,
  type FlowMessagingRequester
} from "@elevenhouse/domain";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingMessages,
  messagingThreadIdentities,
  messagingThreads
} from "../../schema";
import { createDrizzleMessagingStore } from "../messaging/drizzle-messaging-store";

/**
 * The Flow runtime asks Messaging to select an already established send-capable
 * conversation. It never writes Messaging tables directly or selects a
 * provider. A semantic key is global to the Flow activation, so a retry cannot
 * switch a client to another conversation after the first durable request.
 */
export function createDrizzleFlowMessagingRequester(
  database: ElevenHouseDatabase,
  input: { readonly now?: () => Date } = {}
): FlowMessagingRequester {
  const now = input.now ?? (() => new Date());
  const store = createDrizzleMessagingStore(database);

  return {
    prepare: async (request) => {
      const idempotencyKey = `flow.message:${request.runId}:${request.tokenId}:${request.nodeActivationSequence}`;
      const [existing] = await database
        .select({ messageId: messagingMessages.id })
        .from(messagingMessages)
        .innerJoin(messagingThreads, eq(messagingThreads.id, messagingMessages.threadId))
        .where(
          and(
            eq(messagingMessages.direction, "outbound"),
            eq(messagingMessages.idempotencyKey, idempotencyKey),
            eq(messagingThreads.astrologerUserId, request.ownerUserId)
          )
        )
        .limit(1);
      if (existing) return { kind: "queued", messageId: existing.messageId };

      const candidates = await database
        .select({
          threadId: messagingThreads.id,
          channelConnectionId: messagingChannelConnections.id,
          capabilities: messagingChannelConnections.capabilities
        })
        .from(messagingThreads)
        .innerJoin(
          messagingThreadIdentities,
          and(
            eq(messagingThreadIdentities.threadId, messagingThreads.id),
            eq(messagingThreadIdentities.isPrimary, true)
          )
        )
        .innerJoin(
          messagingExternalIdentities,
          eq(messagingExternalIdentities.id, messagingThreadIdentities.externalIdentityId)
        )
        .innerJoin(
          messagingChannelConnections,
          eq(messagingChannelConnections.id, messagingExternalIdentities.channelConnectionId)
        )
        .where(
          and(
            eq(messagingThreads.astrologerUserId, request.ownerUserId),
            eq(messagingThreads.clientUserId, request.clientUserId),
            eq(messagingThreads.status, "open"),
            eq(messagingChannelConnections.status, "active")
          )
        );
      const candidate = selectSingleSendableMessagingConversation(
        candidates.map(({ capabilities, ...conversation }) => ({
          ...conversation,
          canSend: capabilities.canSend === true
        }))
      );
      if (!candidate) return { kind: "rejected" };

      const created = await createOutboundMessage({
        store,
        astrologerUserId: request.ownerUserId,
        threadId: candidate.threadId,
        channelConnectionId: candidate.channelConnectionId,
        text: request.textTemplate,
        idempotencyKey,
        flowTerminalSignal: true,
        now: now()
      });
      return { kind: "queued", messageId: created.message.id };
    }
  };
}
