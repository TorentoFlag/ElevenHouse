import { HttpException, Inject, Injectable, UnauthorizedException, type MessageEvent } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Observable } from "rxjs";
import {
  MessagingClientRelationshipError,
  MessagingIdempotencyConflictError,
  MessagingThreadNotFoundError,
  MessagingValidationError,
  createClientFromThread,
  createOutboundMessage,
  linkThreadToClient,
  markThreadRead,
  recordTelegramBusinessConnection,
  recordTelegramBusinessDeletedMessages,
  recordTelegramBusinessEditedMessage,
  recordTelegramBusinessMessage,
  startTelegramBusinessConnection,
  type MessagingReadStore,
  type MessagingStore,
  type PrivateObjectStoragePort
} from "@elevenhouse/domain";
import {
  CreateMessagingThreadClientRequestSchema,
  LinkMessagingThreadClientRequestSchema,
  MessagingChannelConnectionResponseSchema,
  MessagingMessageMediaSourceResponseSchema,
  MessagingMessageResponseSchema,
  MessagingThreadClientLinkResponseSchema,
  MessagingThreadDetailQuerySchema,
  MessagingThreadListQuerySchema,
  MessagingThreadListResponseSchema,
  MessagingThreadMutationResponseSchema,
  MessagingThreadParamsSchema,
  MessagingThreadResponseSchema,
  SendMessagingMessageRequestSchema,
  StartTelegramBusinessConnectionResponseSchema,
  type MessagingChannelConnectionResponse,
  type MessagingMessageMediaSourceResponse,
  type MessagingMessageResponse,
  type StartTelegramBusinessConnectionResponse,
  type MessagingThreadClientLinkResponse,
  type MessagingThreadListResponse,
  type MessagingThreadMutationResponse,
  type MessagingThreadResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MEDIA_PRIVATE_OBJECT_STORAGE } from "../media/media.tokens";
import { messagingHttpError } from "./messaging-http-errors";
import {
  MESSAGING_READ_STORE,
  MESSAGING_STORE,
  TELEGRAM_BUSINESS_CONNECTION_LOOKUP
} from "./messaging.tokens";
import { createMessagingRealtimeEventStream } from "./realtime-event-stream";
import type { TelegramBusinessConnectionLookup } from "./telegram-business-connection-lookup";
import type { ParsedTelegramBusinessWebhookUpdate } from "./telegram-business-webhook";

@Injectable()
export class MessagingService {
  constructor(
    @Inject(MESSAGING_STORE) private readonly store: MessagingStore,
    @Inject(MESSAGING_READ_STORE) private readonly readStore: MessagingReadStore,
    @Inject(TELEGRAM_BUSINESS_CONNECTION_LOOKUP)
    private readonly telegramBusinessConnectionLookup: TelegramBusinessConnectionLookup | null,
    @Inject(MEDIA_PRIVATE_OBJECT_STORAGE) private readonly privateObjectStorage: PrivateObjectStoragePort,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async listChannelConnections(
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingChannelConnectionResponse> {
    const astrologerUserId = requireAstrologerUserId(request);
    await this.reconcileTelegramBusinessConnections(astrologerUserId);
    const result = await this.readStore.listChannelConnections({ astrologerUserId });
    return MessagingChannelConnectionResponseSchema.parse(result);
  }

  async startTelegramBusinessConnection(
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<StartTelegramBusinessConnectionResponse> {
    return mapMessagingErrors(async () => {
      const astrologerUserId = requireAstrologerUserId(request);
      const result = await startTelegramBusinessConnection({
        store: this.store,
        astrologerUserId,
        now: this.clock.now()
      });
      const connections = await this.readStore.listChannelConnections({ astrologerUserId });
      const connection = connections.channelConnections.find(
        (candidate) => candidate.id === result.connectionId
      );
      if (!connection) {
        throw new Error("Started Telegram Business connection was not available in the read model");
      }
      const telegramBotUsername = normalizeTelegramBotUsername(
        this.configService.get<string | null>("astrologerApi.telegramBusinessBotUsername") ?? null
      );
      return StartTelegramBusinessConnectionResponseSchema.parse({
        channelConnection: connection,
        telegramBotUsername,
        telegramBotUrl: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : null
      });
    });
  }

  async listThreads(
    query: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingThreadListResponse> {
    const parsedQuery = parseContract(MessagingThreadListQuerySchema, query);
    const astrologerUserId = requireAstrologerUserId(request);
    const result = await this.readStore.listThreads({ astrologerUserId, ...parsedQuery });
    return MessagingThreadListResponseSchema.parse(result);
  }

  async getThread(
    threadId: string,
    query: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingThreadResponse> {
    const params = parseContract(MessagingThreadParamsSchema, { threadId });
    const parsedQuery = parseContract(MessagingThreadDetailQuerySchema, query);
    const astrologerUserId = requireAstrologerUserId(request);
    const result = await this.readStore.getThread({
      astrologerUserId,
      threadId: params.threadId,
      ...parsedQuery
    });
    if (!result) throw messagingHttpError(404, "messaging_thread_not_found", "Messaging thread was not found");
    return MessagingThreadResponseSchema.parse(result);
  }

  async sendMessage(
    threadId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingMessageResponse> {
    return mapMessagingErrors(async () => {
      const params = parseContract(MessagingThreadParamsSchema, { threadId });
      const command = parseContract(SendMessagingMessageRequestSchema, body);
      const result = await createOutboundMessage({
        store: this.store,
        astrologerUserId: requireAstrologerUserId(request),
        threadId: params.threadId,
        channelConnectionId: command.channelConnectionId,
        text: command.text,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now()
      });
      return MessagingMessageResponseSchema.parse({ message: toMessageResponse(result.message) });
    });
  }

  async linkClient(
    threadId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingThreadClientLinkResponse> {
    return mapMessagingErrors(async () => {
      const params = parseContract(MessagingThreadParamsSchema, { threadId });
      const command = parseContract(LinkMessagingThreadClientRequestSchema, body);
      const thread = await linkThreadToClient({
        store: this.store,
        astrologerUserId: requireAstrologerUserId(request),
        threadId: params.threadId,
        clientUserId: command.clientUserId,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now()
      });
      return MessagingThreadClientLinkResponseSchema.parse({
        thread: await this.requireThreadReadModel(thread.id, request),
        clientUserId: command.clientUserId
      });
    });
  }

  async createClient(
    threadId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingThreadClientLinkResponse> {
    return mapMessagingErrors(async () => {
      const params = parseContract(MessagingThreadParamsSchema, { threadId });
      const command = parseContract(CreateMessagingThreadClientRequestSchema, body);
      const thread = await createClientFromThread({
        store: this.store,
        astrologerUserId: requireAstrologerUserId(request),
        threadId: params.threadId,
        displayName: command.displayName,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now()
      });
      if (!thread.clientUserId) throw new Error("Expected created messaging client to be linked to the thread");
      return MessagingThreadClientLinkResponseSchema.parse({
        thread: await this.requireThreadReadModel(thread.id, request),
        clientUserId: thread.clientUserId
      });
    });
  }

  async markRead(
    threadId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingThreadMutationResponse> {
    return mapMessagingErrors(async () => {
      const params = parseContract(MessagingThreadParamsSchema, { threadId });
      const thread = await markThreadRead({
        store: this.store,
        astrologerUserId: requireAstrologerUserId(request),
        threadId: params.threadId,
        now: this.clock.now()
      });
      return MessagingThreadMutationResponseSchema.parse({
        thread: await this.requireThreadReadModel(thread.id, request)
      });
    });
  }

  async getMessageMediaSource(
    messageId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<MessagingMessageMediaSourceResponse> {
    const parsedMessageId = parseContract(MessagingThreadParamsSchema.shape.threadId, messageId);
    const source = await this.readStore.findMessageMediaSource({
      astrologerUserId: requireAstrologerUserId(request),
      messageId: parsedMessageId
    });
    if (!source) {
      throw messagingHttpError(404, "messaging_thread_not_found", "Messaging thread was not found");
    }
    if (
      source.status !== "ready" ||
      !source.mediaAssetId ||
      !source.storageBucket ||
      !source.storageKey ||
      !source.originalFileName ||
      !source.mimeType
    ) {
      throw messagingHttpError(409, "message_media_not_ready", "Message media is not ready");
    }

    return MessagingMessageMediaSourceResponseSchema.parse({
      ...(await this.privateObjectStorage.createPresignedDownload({
        storageBucket: source.storageBucket,
        storageKey: source.storageKey,
        fileName: source.originalFileName,
        mimeType: source.mimeType as never
      })),
      mimeType: source.mimeType
    });
  }

  streamRealtimeEvents(
    lastEventId: string | undefined,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Observable<MessageEvent> {
    return createMessagingRealtimeEventStream({
      readStore: this.readStore,
      astrologerUserId: requireAstrologerUserId(request),
      lastEventId,
      pollIntervalMs: 2000,
      heartbeatIntervalMs: 25_000
    });
  }

  async handleTelegramBusinessWebhookUpdate(
    update: ParsedTelegramBusinessWebhookUpdate
  ): Promise<void> {
    if (update.kind === "business_connection") {
      await recordTelegramBusinessConnection({
        store: this.store,
        businessConnectionId: update.businessConnectionId,
        userId: update.userId,
        userChatId: update.userChatId,
        username: update.username,
        displayName: update.displayName,
        connectedAt: update.connectedAt,
        enabled: update.enabled,
        rights: update.rights,
        now: this.clock.now()
      });
      return;
    }

    if (
      update.kind === "business_message" &&
      isPersistableTelegramBusinessMessage(update.contentType) &&
      update.text
    ) {
      const result = await this.recordTelegramBusinessMessage(update);
      if (
        result.kind === "unmatched" &&
        await this.hydrateTelegramBusinessConnection(update.businessConnectionId)
      ) {
        await this.recordTelegramBusinessMessage(update);
      }
      return;
    }

    if (update.kind === "business_message_edited" && update.contentType === "text" && update.text) {
      await recordTelegramBusinessEditedMessage({
        store: this.store,
        updateId: update.updateId,
        businessConnectionId: update.businessConnectionId,
        providerMessageId: update.providerMessageId,
        providerChatId: update.providerChatId,
        text: update.text,
        providerSentAt: update.providerSentAt,
        providerEditedAt: update.providerEditedAt,
        now: this.clock.now()
      });
      return;
    }

    if (update.kind === "business_messages_deleted") {
      await recordTelegramBusinessDeletedMessages({
        store: this.store,
        businessConnectionId: update.businessConnectionId,
        providerChatId: update.providerChatId,
        providerMessageIds: update.providerMessageIds,
        now: this.clock.now()
      });
    }
  }

  private async requireThreadReadModel(
    threadId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ) {
    const result = await this.readStore.getThread({
      astrologerUserId: requireAstrologerUserId(request),
      threadId,
      limit: 1,
      offset: 0
    });
    if (!result) throw messagingHttpError(404, "messaging_thread_not_found", "Messaging thread was not found");
    return result.thread;
  }

  private recordTelegramBusinessMessage(
    update: Extract<ParsedTelegramBusinessWebhookUpdate, { readonly kind: "business_message" }>
  ) {
    return recordTelegramBusinessMessage({
      store: this.store,
      updateId: update.updateId,
      businessConnectionId: update.businessConnectionId,
      providerMessageId: update.providerMessageId,
      providerChatId: update.providerChatId,
      providerUserId: update.providerUserId,
      username: update.username,
      displayName: update.displayName,
      chatUsername: update.chatUsername,
      chatDisplayName: update.chatDisplayName,
      contentType: update.contentType,
      text: update.text ?? "",
      mediaAttachment: update.mediaAttachment,
      providerSentAt: update.providerSentAt,
      now: this.clock.now()
    });
  }

  private async hydrateTelegramBusinessConnection(businessConnectionId: string): Promise<boolean> {
    const snapshot = await this.telegramBusinessConnectionLookup?.findBusinessConnection(
      businessConnectionId
    );
    if (!snapshot) return false;
    const result = await recordTelegramBusinessConnection({
      store: this.store,
      ...snapshot,
      now: this.clock.now()
    });
    return result.kind === "recorded";
  }

  private async reconcileTelegramBusinessConnections(astrologerUserId: string): Promise<void> {
    if (!this.telegramBusinessConnectionLookup) return;

    const { candidates } = await this.readStore.listTelegramBusinessConnectionReconciliationCandidates({
      astrologerUserId
    });
    await Promise.all(candidates.map((candidate) => this.reconcileTelegramBusinessConnection(candidate.businessConnectionId)));
  }

  private async reconcileTelegramBusinessConnection(businessConnectionId: string): Promise<void> {
    const snapshot = await this.telegramBusinessConnectionLookup?.findBusinessConnection(
      businessConnectionId
    );
    if (!snapshot) return;
    await recordTelegramBusinessConnection({
      store: this.store,
      ...snapshot,
      now: this.clock.now()
    });
  }
}

function toMessageResponse(message: {
  readonly id: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string | null;
  readonly direction: "inbound" | "outbound";
  readonly text: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}) {
  return {
    id: message.id,
    threadId: message.threadId,
    channelConnectionId: message.channelConnectionId,
    externalIdentityId: message.externalIdentityId,
    direction: message.direction,
    senderKind: message.direction === "outbound" ? "astrologer" : "client",
    contentType: "text",
    text: message.text,
    mediaAssetId: null,
    status: message.status,
    failureCode: null,
    providerSentAt: null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
  };
}

function isPersistableTelegramBusinessMessage(
  contentType: ParsedTelegramBusinessWebhookUpdate extends infer T
    ? T extends { readonly kind: "business_message"; readonly contentType: infer TContentType }
      ? TContentType
      : never
    : never
): contentType is "text" | "voice" | "image" | "video_note" | "video" {
  return (
    contentType === "text" ||
    contentType === "voice" ||
    contentType === "image" ||
    contentType === "video_note" ||
    contentType === "video"
  );
}

function requireAstrologerUserId(
  request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
): string {
  const astrologerUserId = request.currentAstrologerAccount?.account.id;
  if (!astrologerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return astrologerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw messagingHttpError(400, "messaging_validation_error", "Invalid messaging request");
  }
  return result.data;
}

function normalizeTelegramBotUsername(value: string | null): string | null {
  const normalized = value?.trim().replace(/^@/, "");
  return normalized || null;
}

async function mapMessagingErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof MessagingValidationError) {
      throw messagingHttpError(400, error.code, "Invalid messaging request");
    }
    if (error instanceof MessagingThreadNotFoundError) {
      throw messagingHttpError(404, error.code, "Messaging thread was not found");
    }
    if (error instanceof MessagingIdempotencyConflictError) {
      throw messagingHttpError(409, error.code, "Messaging request conflicts with a previous request");
    }
    if (error instanceof MessagingClientRelationshipError) {
      throw messagingHttpError(422, error.code, "Client relationship is not active");
    }
    throw error;
  }
}
