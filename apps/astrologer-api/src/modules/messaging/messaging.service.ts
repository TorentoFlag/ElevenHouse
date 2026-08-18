import { createHmac, timingSafeEqual } from "node:crypto";
import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type MessageEvent
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createAes256GcmSecretCipher } from "@elevenhouse/auth";
import type { Observable } from "rxjs";
import {
  MessagingClientRelationshipError,
  MessagingIdempotencyConflictError,
  MessagingThreadNotFoundError,
  MessagingValidationError,
  bindTelegramBusinessConnectionUser,
  completeInstagramGraphConnection,
  createClientFromThread,
  createOutboundMessage,
  linkThreadToClient,
  markThreadRead,
  recordTelegramBusinessConnection,
  recordTelegramBusinessDeletedMessages,
  recordTelegramBusinessEditedMessage,
  recordTelegramBusinessMessage,
  recordInstagramGraphMessage,
  recordTelegramMtprotoCodeResult,
  recordTelegramMtprotoPasswordResult,
  revokeInstagramGraphConnectionByMetaUserId,
  requireTelegramMtprotoLoginSession,
  startInstagramGraphConnection,
  startTelegramBusinessConnection,
  startTelegramMtprotoConnection,
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
  StartInstagramGraphConnectionResponseSchema,
  StartTelegramMtprotoConnectionRequestSchema,
  SubmitTelegramMtprotoCodeRequestSchema,
  SubmitTelegramMtprotoPasswordRequestSchema,
  TelegramMtprotoLoginResponseSchema,
  type MessagingChannelConnectionResponse,
  type MessagingMessageMediaSourceResponse,
  type MessagingMessageResponse,
  type StartInstagramGraphConnectionResponse,
  type StartTelegramBusinessConnectionResponse,
  type TelegramMtprotoLoginResponse,
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
  INSTAGRAM_GRAPH_AUTH_PROVIDER,
  MESSAGING_READ_STORE,
  MESSAGING_STORE,
  TELEGRAM_BUSINESS_CONNECTION_LOOKUP,
  TELEGRAM_MTPROTO_AUTH_PROVIDER
} from "./messaging.tokens";
import { createMessagingRealtimeEventStream } from "./realtime-event-stream";
import type { TelegramBusinessConnectionLookup } from "./telegram-business-connection-lookup";
import type { InstagramGraphAuthProvider } from "./instagram-graph-auth-provider";
import type { ParsedInstagramGraphWebhookUpdate } from "./instagram-graph-webhook";
import type { ParsedTelegramBusinessWebhookUpdate } from "./telegram-business-webhook";
import type { TelegramMtprotoAuthProvider } from "./telegram-mtproto-auth-provider";
import { z } from "@elevenhouse/validation";

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @Inject(MESSAGING_STORE) private readonly store: MessagingStore,
    @Inject(MESSAGING_READ_STORE) private readonly readStore: MessagingReadStore,
    @Inject(TELEGRAM_BUSINESS_CONNECTION_LOOKUP)
    private readonly telegramBusinessConnectionLookup: TelegramBusinessConnectionLookup | null,
    @Inject(TELEGRAM_MTPROTO_AUTH_PROVIDER)
    private readonly telegramMtprotoAuthProvider: TelegramMtprotoAuthProvider | null,
    @Inject(INSTAGRAM_GRAPH_AUTH_PROVIDER)
    private readonly instagramGraphAuthProvider: InstagramGraphAuthProvider | null,
    @Inject(MEDIA_PRIVATE_OBJECT_STORAGE)
    private readonly privateObjectStorage: PrivateObjectStoragePort,
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
        telegramBotUrl: telegramBotUsername
          ? telegramBusinessBotSetupUrl({
              username: telegramBotUsername,
              connectionId: result.connectionId,
              secret: this.requireTelegramBotWebhookSecret()
            })
          : null
      });
    });
  }

  async startInstagramGraphConnection(
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<StartInstagramGraphConnectionResponse> {
    return mapMessagingErrors(async () => {
      const instagramGraphConfig =
        this.configService.get<InstagramGraphRuntimeConfig | null>(
          "astrologerApi.instagramGraph"
        ) ?? null;
      if (!instagramGraphConfig) {
        throw messagingHttpError(
          503,
          "instagram_graph_connection_unavailable",
          "Instagram Graph login is not configured"
        );
      }

      const astrologerUserId = requireAstrologerUserId(request);
      const result = await startInstagramGraphConnection({
        store: this.store,
        astrologerUserId,
        now: this.clock.now()
      });
      const connections = await this.readStore.listChannelConnections({ astrologerUserId });
      const connection = connections.channelConnections.find(
        (candidate) => candidate.id === result.connectionId
      );
      if (!connection) {
        throw new Error("Started Instagram Graph connection was not available in the read model");
      }

      return StartInstagramGraphConnectionResponseSchema.parse({
        channelConnection: connection,
        authorizationUrl: instagramGraphAuthorizationUrl({
          config: instagramGraphConfig,
          state: createInstagramGraphCallbackState({
            config: instagramGraphConfig,
            astrologerUserId,
            connectionId: result.connectionId,
            issuedAtSeconds: Math.floor(this.clock.now().getTime() / 1000)
          })
        })
      });
    });
  }

  async completeInstagramGraphConnectionCallback(
    query: unknown
  ): Promise<{ readonly redirectUrl: string }> {
    const instagramGraphConfig =
      this.configService.get<InstagramGraphRuntimeConfig | null>("astrologerApi.instagramGraph") ??
      null;
    if (!instagramGraphConfig) {
      throw messagingHttpError(
        503,
        "instagram_graph_connection_unavailable",
        "Instagram Graph login is not configured"
      );
    }

    const parsed = parseContract(InstagramGraphCallbackQuerySchema, query);
    if (parsed.error || !parsed.code || !parsed.state) {
      return {
        redirectUrl: instagramGraphRedirectUrl({
          config: instagramGraphConfig,
          status: "error",
          code: parsed.error ?? "instagram_graph_callback_denied"
        })
      };
    }

    const authorizationCode = parsed.code;
    const state = verifyInstagramGraphCallbackState({
      config: instagramGraphConfig,
      state: parsed.state,
      nowSeconds: Math.floor(this.clock.now().getTime() / 1000)
    });
    if (!state) {
      return {
        redirectUrl: instagramGraphRedirectUrl({
          config: instagramGraphConfig,
          status: "error",
          code: "instagram_graph_state_invalid"
        })
      };
    }

    const authProvider = this.instagramGraphAuthProvider;
    if (!authProvider) {
      throw messagingHttpError(
        503,
        "instagram_graph_connection_unavailable",
        "Instagram Graph login is not configured"
      );
    }

    return mapMessagingErrors(async () => {
      const shortLivedToken = await authProvider.exchangeCode({
        code: authorizationCode,
        redirectUri: instagramGraphConfig.redirectUri
      });
      const longLivedToken = await authProvider.exchangeLongLivedToken({
        shortLivedAccessToken: shortLivedToken.accessToken
      });
      const account = await authProvider.resolveConnectedAccount({
        accessToken: longLivedToken.accessToken,
        fallbackInstagramUserId: shortLivedToken.instagramUserId
      });
      await authProvider.subscribeAccountToWebhooks({
        accessToken: longLivedToken.accessToken,
        instagramUserId: account.instagramUserId,
        fields: ["messages"]
      });
      const cipher = createAes256GcmSecretCipher(instagramGraphConfig.tokenEncryptionKey);
      const tokenExpiresAt = new Date(
        this.clock.now().getTime() + longLivedToken.expiresInSeconds * 1000
      ).toISOString();
      const result = await completeInstagramGraphConnection({
        store: this.store,
        astrologerUserId: state.astrologerUserId,
        connectionId: state.connectionId,
        instagramAccountId: account.instagramAccountId,
        instagramAppScopedUserId: account.instagramAppScopedUserId,
        instagramUserId: account.instagramUserId,
        instagramUsername: account.instagramUsername,
        instagramDisplayName: account.instagramDisplayName,
        encryptedAccessToken: encryptedMessagingSecret(
          "instagram_graph_v1",
          cipher.encrypt({
            plaintext: longLivedToken.accessToken,
            aad: instagramGraphSecretAad(state.astrologerUserId, state.connectionId, "access_token")
          })
        ),
        tokenExpiresAt,
        now: this.clock.now()
      });

      return {
        redirectUrl: instagramGraphRedirectUrl({
          config: instagramGraphConfig,
          status: result.kind === "recorded" ? "connected" : "error",
          code: result.kind === "recorded" ? undefined : "instagram_graph_connection_not_found"
        })
      };
    });
  }

  async handleInstagramGraphDeauthorizeCallback(body: unknown): Promise<{ readonly ok: true }> {
    const signedRequest = this.parseInstagramGraphSignedRequestBody(body);
    await revokeInstagramGraphConnectionByMetaUserId({
      store: this.store,
      instagramAppScopedUserId: signedRequest.userId,
      reason: "deauthorized",
      now: this.clock.now()
    });
    return { ok: true };
  }

  async handleInstagramGraphDataDeletionCallback(
    body: unknown
  ): Promise<{ readonly url: string; readonly confirmation_code: string }> {
    const signedRequest = this.parseInstagramGraphSignedRequestBody(body);
    await revokeInstagramGraphConnectionByMetaUserId({
      store: this.store,
      instagramAppScopedUserId: signedRequest.userId,
      reason: "data_deletion",
      now: this.clock.now()
    });
    const confirmationCode = instagramGraphDeletionConfirmationCode({
      config: this.requireInstagramGraphConfig(),
      userId: signedRequest.userId
    });
    return {
      url: instagramGraphDeletionStatusUrl({
        config: this.requireInstagramGraphConfig(),
        confirmationCode
      }),
      confirmation_code: confirmationCode
    };
  }

  getInstagramGraphDataDeletionStatus(confirmationCode: string): {
    readonly status: "completed";
    readonly confirmation_code: string;
  } {
    const normalized = confirmationCode.trim();
    if (!normalized || normalized.length > 128) {
      throw messagingHttpError(
        400,
        "instagram_graph_data_deletion_confirmation_invalid",
        "Instagram Graph data deletion confirmation code is invalid"
      );
    }
    return { status: "completed", confirmation_code: normalized };
  }

  private parseInstagramGraphSignedRequestBody(body: unknown): { readonly userId: string } {
    const config = this.requireInstagramGraphConfig();
    const parsed = parseContract(InstagramGraphSignedRequestBodySchema, body);
    const signedRequest = verifyInstagramGraphSignedRequest({
      appSecret: config.appSecret,
      signedRequest: parsed.signed_request
    });
    if (!signedRequest) {
      throw messagingHttpError(
        401,
        "instagram_graph_signed_request_invalid",
        "Instagram Graph signed_request is invalid"
      );
    }
    return signedRequest;
  }

  private requireInstagramGraphConfig(): InstagramGraphRuntimeConfig {
    const instagramGraphConfig =
      this.configService.get<InstagramGraphRuntimeConfig | null>("astrologerApi.instagramGraph") ??
      null;
    if (!instagramGraphConfig) {
      throw messagingHttpError(
        503,
        "instagram_graph_connection_unavailable",
        "Instagram Graph login is not configured"
      );
    }
    return instagramGraphConfig;
  }

  async startTelegramMtprotoConnection(
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<TelegramMtprotoLoginResponse> {
    return mapMessagingErrors(async () => {
      if (!this.telegramMtprotoAuthProvider) {
        throw messagingHttpError(
          503,
          "telegram_mtproto_login_unavailable",
          "Telegram Account login is not configured"
        );
      }

      const command = parseContract(StartTelegramMtprotoConnectionRequestSchema, body);
      const astrologerUserId = requireAstrologerUserId(request);
      const phoneNumber = normalizeTelegramPhoneNumber(command.phoneNumber);
      const mtprotoConfig = this.configService.get<{
        readonly sessionEncryptionKey: Buffer;
      } | null>("astrologerApi.telegramMtproto");
      if (!mtprotoConfig?.sessionEncryptionKey) {
        throw messagingHttpError(
          503,
          "telegram_mtproto_login_unavailable",
          "Telegram Account login is not configured"
        );
      }
      const codeResult = await this.telegramMtprotoAuthProvider.sendCode({ phoneNumber });
      const cipher = createAes256GcmSecretCipher(mtprotoConfig.sessionEncryptionKey);
      const result = await startTelegramMtprotoConnection({
        store: this.store,
        astrologerUserId,
        phoneNumberLast4: phoneLast4(phoneNumber),
        maskedPhoneNumber: maskPhoneNumber(phoneNumber),
        encryptedPhoneNumber: encryptedMessagingSecret(
          "telegram_mtproto_v1",
          cipher.encrypt({
            plaintext: phoneNumber,
            aad: telegramMtprotoSecretAad(astrologerUserId, "phone_number")
          })
        ),
        encryptedPhoneCodeHash: encryptedMessagingSecret(
          "telegram_mtproto_v1",
          cipher.encrypt({
            plaintext: codeResult.phoneCodeHash,
            aad: telegramMtprotoSecretAad(astrologerUserId, "phone_code_hash")
          })
        ),
        consentAccepted: command.consentAccepted,
        now: this.clock.now()
      });
      const connections = await this.readStore.listChannelConnections({ astrologerUserId });
      const connection = connections.channelConnections.find(
        (candidate) => candidate.id === result.connectionId
      );
      if (!connection) {
        throw new Error("Started Telegram Account connection was not available in the read model");
      }

      return TelegramMtprotoLoginResponseSchema.parse({
        channelConnection: connection,
        loginStep: result.loginStep,
        maskedPhoneNumber: result.maskedPhoneNumber,
        retryAfterSeconds: null
      });
    });
  }

  async submitTelegramMtprotoCode(
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<TelegramMtprotoLoginResponse> {
    return mapMessagingErrors(async () => {
      const command = parseContract(SubmitTelegramMtprotoCodeRequestSchema, body);
      const context = await this.requireTelegramMtprotoLoginContext({
        astrologerUserId: requireAstrologerUserId(request),
        connectionId: command.channelConnectionId,
        expectedLoginState: "code_required"
      });
      const phoneNumber = context.cipher.decrypt({
        encrypted: context.session.encryptedPhoneNumber,
        aad: telegramMtprotoSecretAad(context.astrologerUserId, "phone_number")
      });
      const phoneCodeHash = context.cipher.decrypt({
        encrypted: context.session.encryptedPhoneCodeHash,
        aad: telegramMtprotoSecretAad(context.astrologerUserId, "phone_code_hash")
      });
      const providerResult = await context.provider.signInWithCode({
        phoneNumber,
        phoneCodeHash,
        code: command.code
      });
      const encryptedSession = encryptedMessagingSecret(
        "telegram_mtproto_v1",
        context.cipher.encrypt({
          plaintext: providerResult.session,
          aad: telegramMtprotoSecretAad(context.astrologerUserId, "session")
        })
      );
      const result = await recordTelegramMtprotoCodeResult({
        store: this.store,
        astrologerUserId: context.astrologerUserId,
        connectionId: command.channelConnectionId,
        loginStep: providerResult.loginStep,
        encryptedSession,
        telegramUserId:
          providerResult.loginStep === "connected" ? providerResult.telegramUserId : null,
        username: providerResult.loginStep === "connected" ? providerResult.username : null,
        displayName: providerResult.loginStep === "connected" ? providerResult.displayName : null,
        now: this.clock.now()
      });
      return this.telegramMtprotoLoginResponse(context.astrologerUserId, result);
    });
  }

  async submitTelegramMtprotoPassword(
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<TelegramMtprotoLoginResponse> {
    return mapMessagingErrors(async () => {
      const command = parseContract(SubmitTelegramMtprotoPasswordRequestSchema, body);
      const context = await this.requireTelegramMtprotoLoginContext({
        astrologerUserId: requireAstrologerUserId(request),
        connectionId: command.channelConnectionId,
        expectedLoginState: "password_required"
      });
      if (!context.session.encryptedSession) {
        throw messagingHttpError(
          409,
          "telegram_mtproto_login_step_invalid",
          "Telegram Account login step is invalid"
        );
      }
      const session = context.cipher.decrypt({
        encrypted: context.session.encryptedSession,
        aad: telegramMtprotoSecretAad(context.astrologerUserId, "session")
      });
      const providerResult = await context.provider.signInWithPassword({
        session,
        password: command.password
      });
      const encryptedSession = encryptedMessagingSecret(
        "telegram_mtproto_v1",
        context.cipher.encrypt({
          plaintext: providerResult.session,
          aad: telegramMtprotoSecretAad(context.astrologerUserId, "session")
        })
      );
      const result = await recordTelegramMtprotoPasswordResult({
        store: this.store,
        astrologerUserId: context.astrologerUserId,
        connectionId: command.channelConnectionId,
        encryptedSession,
        telegramUserId: providerResult.telegramUserId,
        username: providerResult.username,
        displayName: providerResult.displayName,
        now: this.clock.now()
      });
      return this.telegramMtprotoLoginResponse(context.astrologerUserId, result);
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
    if (!result)
      throw messagingHttpError(404, "messaging_thread_not_found", "Messaging thread was not found");
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
      if (!thread.clientUserId)
        throw new Error("Expected created messaging client to be linked to the thread");
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

  private async requireTelegramMtprotoLoginContext(input: {
    readonly astrologerUserId: string;
    readonly connectionId: string;
    readonly expectedLoginState: "code_required" | "password_required";
  }) {
    if (!this.telegramMtprotoAuthProvider) {
      throw messagingHttpError(
        503,
        "telegram_mtproto_login_unavailable",
        "Telegram Account login is not configured"
      );
    }
    const mtprotoConfig = this.configService.get<{
      readonly sessionEncryptionKey: Buffer;
    } | null>("astrologerApi.telegramMtproto");
    if (!mtprotoConfig?.sessionEncryptionKey) {
      throw messagingHttpError(
        503,
        "telegram_mtproto_login_unavailable",
        "Telegram Account login is not configured"
      );
    }

    return {
      astrologerUserId: input.astrologerUserId,
      provider: this.telegramMtprotoAuthProvider,
      cipher: createAes256GcmSecretCipher(mtprotoConfig.sessionEncryptionKey),
      session: await requireTelegramMtprotoLoginSession({
        store: this.store,
        astrologerUserId: input.astrologerUserId,
        connectionId: input.connectionId,
        expectedLoginState: input.expectedLoginState
      })
    };
  }

  private async telegramMtprotoLoginResponse(
    astrologerUserId: string,
    result: {
      readonly connectionId: string;
      readonly loginStep: "password_required" | "connected";
      readonly maskedPhoneNumber: string;
    }
  ): Promise<TelegramMtprotoLoginResponse> {
    const connections = await this.readStore.listChannelConnections({ astrologerUserId });
    const connection = connections.channelConnections.find(
      (candidate) => candidate.id === result.connectionId
    );
    if (!connection) {
      throw new Error("Telegram Account connection was not available in the read model");
    }
    return TelegramMtprotoLoginResponseSchema.parse({
      channelConnection: connection,
      loginStep: result.loginStep,
      maskedPhoneNumber: result.maskedPhoneNumber,
      retryAfterSeconds: null
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
    if (update.kind === "business_setup_start") {
      const connectionId = verifyTelegramBusinessSetupToken({
        token: update.setupToken,
        secret: this.requireTelegramBotWebhookSecret()
      });
      if (!connectionId) {
        this.logger.warn(
          `Ignored Telegram Business setup start with invalid token ${update.updateId}`
        );
        return;
      }
      await bindTelegramBusinessConnectionUser({
        store: this.store,
        connectionId,
        telegramUserId: update.telegramUserId,
        userChatId: update.userChatId,
        username: update.username,
        displayName: update.displayName,
        now: this.clock.now()
      });
      return;
    }

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
        (await this.hydrateTelegramBusinessConnection(update.businessConnectionId))
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

  async handleInstagramGraphWebhookUpdates(
    updates: readonly ParsedInstagramGraphWebhookUpdate[]
  ): Promise<void> {
    for (const update of updates) {
      const result = await recordInstagramGraphMessage({
        store: this.store,
        instagramAccountId: update.instagramAccountId,
        providerMessageId: update.providerMessageId,
        senderId: update.senderId,
        recipientId: update.recipientId,
        text: update.text,
        providerSentAt: update.providerSentAt,
        now: this.clock.now()
      });
      if (result.kind === "unmatched") {
        this.logger.warn(
          `Instagram Graph webhook message unmatched instagramAccountId=${update.instagramAccountId} senderId=${update.senderId} recipientId=${update.recipientId} providerMessageId=${update.providerMessageId}`
        );
      } else {
        this.logger.log(
          `Instagram Graph webhook message recorded kind=${result.kind} instagramAccountId=${update.instagramAccountId} providerMessageId=${update.providerMessageId}`
        );
      }
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
    if (!result)
      throw messagingHttpError(404, "messaging_thread_not_found", "Messaging thread was not found");
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
    const snapshot =
      await this.telegramBusinessConnectionLookup?.findBusinessConnection(businessConnectionId);
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

    const { candidates } =
      await this.readStore.listTelegramBusinessConnectionReconciliationCandidates({
        astrologerUserId
      });
    await Promise.all(
      candidates.map((candidate) =>
        this.reconcileTelegramBusinessConnection(candidate.businessConnectionId)
      )
    );
  }

  private async reconcileTelegramBusinessConnection(businessConnectionId: string): Promise<void> {
    const snapshot =
      await this.telegramBusinessConnectionLookup?.findBusinessConnection(businessConnectionId);
    if (!snapshot) return;
    await recordTelegramBusinessConnection({
      store: this.store,
      ...snapshot,
      now: this.clock.now()
    });
  }

  private requireTelegramBotWebhookSecret(): string {
    const secret = this.configService.get<string | null>("astrologerApi.telegramBotWebhookSecret");
    if (!secret) {
      throw messagingHttpError(
        503,
        "telegram_business_connection_unavailable",
        "Telegram Business connection is not configured"
      );
    }
    return secret;
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

function telegramBusinessBotSetupUrl(input: {
  readonly username: string;
  readonly connectionId: string;
  readonly secret: string;
}): string {
  const url = new URL(`https://t.me/${input.username}`);
  url.searchParams.set("start", createTelegramBusinessSetupToken(input));
  return url.toString();
}

const telegramBusinessSetupTokenVersion = "telegram_business_setup:v1";

function createTelegramBusinessSetupToken(input: {
  readonly connectionId: string;
  readonly secret: string;
}): string {
  const connectionHex = input.connectionId.replaceAll("-", "").toLowerCase();
  const signature = signTelegramBusinessSetupToken({
    connectionHex,
    secret: input.secret
  });
  return `${connectionHex}_${signature}`;
}

function verifyTelegramBusinessSetupToken(input: {
  readonly token: string;
  readonly secret: string;
}): string | null {
  const match = /^([a-f0-9]{32})_([A-Za-z0-9_-]{22})$/.exec(input.token);
  if (!match) return null;
  const [, connectionHex, signature] = match;
  if (!connectionHex || !signature) return null;
  const expectedSignature = signTelegramBusinessSetupToken({
    connectionHex,
    secret: input.secret
  });
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  return [
    connectionHex.slice(0, 8),
    connectionHex.slice(8, 12),
    connectionHex.slice(12, 16),
    connectionHex.slice(16, 20),
    connectionHex.slice(20)
  ].join("-");
}

function signTelegramBusinessSetupToken(input: {
  readonly connectionHex: string;
  readonly secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${telegramBusinessSetupTokenVersion}:${input.connectionHex}`)
    .digest("base64url")
    .slice(0, 22);
}

type InstagramGraphRuntimeConfig = {
  readonly enabled: true;
  readonly appId: string;
  readonly appSecret: string;
  readonly redirectUri: string;
  readonly tokenEncryptionKey: Buffer;
  readonly callbackStateTtlSeconds: number;
  readonly authBaseUrl: string;
  readonly tokenExchangeBaseUrl: string;
  readonly graphTokenBaseUrl: string;
  readonly graphApiBaseUrl: string;
  readonly astrologerWebBaseUrl: string;
  readonly scopes: readonly string[];
};

const InstagramGraphCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  error: z.string().trim().min(1).optional(),
  error_description: z.string().trim().min(1).optional()
});

const InstagramGraphSignedRequestBodySchema = z.object({
  signed_request: z.string().trim().min(1)
});

const InstagramGraphSignedRequestPayloadSchema = z.object({
  user_id: z.union([z.string().trim().min(1), z.number()])
});

type InstagramGraphCallbackState = {
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly issuedAtSeconds: number;
};

const instagramGraphCallbackStateVersion = "v1";

function instagramGraphAuthorizationUrl(input: {
  readonly config: InstagramGraphRuntimeConfig;
  readonly state: string;
}): string {
  const url = new URL(input.config.authBaseUrl);
  url.searchParams.set("client_id", input.config.appId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.config.scopes.join(","));
  url.searchParams.set("state", input.state);
  url.searchParams.set("enable_fb_login", "false");
  return url.toString();
}

function createInstagramGraphCallbackState(input: {
  readonly config: InstagramGraphRuntimeConfig;
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly issuedAtSeconds: number;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      astrologerUserId: input.astrologerUserId,
      connectionId: input.connectionId,
      issuedAtSeconds: input.issuedAtSeconds
    }),
    "utf8"
  ).toString("base64url");
  return [
    instagramGraphCallbackStateVersion,
    payload,
    signInstagramGraphCallbackState(input.config, payload)
  ].join(".");
}

function verifyInstagramGraphCallbackState(input: {
  readonly config: InstagramGraphRuntimeConfig;
  readonly state: string;
  readonly nowSeconds: number;
}): InstagramGraphCallbackState | null {
  const [version, payload, signature] = input.state.split(".");
  if (version !== instagramGraphCallbackStateVersion || !payload || !signature) return null;
  const expectedSignature = signInstagramGraphCallbackState(input.config, payload);
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  const payloadJson = parseInstagramGraphStatePayload(payload);
  if (!payloadJson) return null;
  const parsed = InstagramGraphCallbackStateSchema.safeParse(payloadJson);
  if (!parsed.success) return null;
  if (input.nowSeconds - parsed.data.issuedAtSeconds > input.config.callbackStateTtlSeconds) {
    return null;
  }
  if (parsed.data.issuedAtSeconds > input.nowSeconds + 60) return null;
  return parsed.data;
}

const InstagramGraphCallbackStateSchema = z.object({
  astrologerUserId: z.string().uuid(),
  connectionId: z.string().uuid(),
  issuedAtSeconds: z.number().int().positive()
});

function signInstagramGraphCallbackState(
  config: InstagramGraphRuntimeConfig,
  payload: string
): string {
  return createHmac("sha256", config.appSecret).update(payload).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseInstagramGraphStatePayload(payload: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function verifyInstagramGraphSignedRequest(input: {
  readonly appSecret: string;
  readonly signedRequest: string;
}): { readonly userId: string } | null {
  const [encodedSignature, encodedPayload] = input.signedRequest.split(".", 2);
  if (!encodedSignature || !encodedPayload) return null;
  const expectedSignature = createHmac("sha256", input.appSecret)
    .update(encodedPayload)
    .digest("base64url");
  if (!constantTimeEqual(encodedSignature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const parsed = InstagramGraphSignedRequestPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    return { userId: parsed.data.user_id.toString() };
  } catch {
    return null;
  }
}

function instagramGraphRedirectUrl(input: {
  readonly config: InstagramGraphRuntimeConfig;
  readonly status: "connected" | "error";
  readonly code?: string;
}): string {
  const url = new URL("/inbox", input.config.astrologerWebBaseUrl);
  url.searchParams.set("channel", "instagram");
  url.searchParams.set("status", input.status);
  if (input.code) url.searchParams.set("code", input.code);
  return url.toString();
}

function instagramGraphDeletionConfirmationCode(input: {
  readonly config: InstagramGraphRuntimeConfig;
  readonly userId: string;
}): string {
  return createHmac("sha256", input.config.appSecret)
    .update(`instagram_graph_data_deletion:${input.userId}`)
    .digest("base64url")
    .slice(0, 32);
}

function instagramGraphDeletionStatusUrl(input: {
  readonly config: InstagramGraphRuntimeConfig;
  readonly confirmationCode: string;
}): string {
  const url = new URL(
    `/api/messaging/channel-connections/instagram/graph/data-deletion/status/${encodeURIComponent(
      input.confirmationCode
    )}`,
    input.config.astrologerWebBaseUrl
  );
  return url.toString();
}

function normalizeTelegramPhoneNumber(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function phoneLast4(value: string): string {
  return value.replace(/\D/g, "").slice(-4);
}

function maskPhoneNumber(value: string): string {
  const normalized = normalizeTelegramPhoneNumber(value);
  const last4 = phoneLast4(normalized);
  if (normalized.startsWith("+")) return `${normalized.slice(0, 2)}******${last4}`;
  return `******${last4}`;
}

function telegramMtprotoSecretAad(
  astrologerUserId: string,
  purpose: "phone_number" | "phone_code_hash" | "session"
): string {
  return `messaging:telegram_mtproto:${astrologerUserId}:${purpose}`;
}

function instagramGraphSecretAad(
  astrologerUserId: string,
  connectionId: string,
  purpose: "access_token"
): string {
  return `messaging:instagram_graph:${astrologerUserId}:${connectionId}:${purpose}`;
}

function encryptedMessagingSecret(
  keyId: string,
  encrypted: {
    readonly algorithm: "aes-256-gcm";
    readonly iv: string;
    readonly authTag: string;
    readonly ciphertext: string;
  }
) {
  return {
    algorithm: encrypted.algorithm,
    keyId,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    ciphertext: encrypted.ciphertext
  };
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
      throw messagingHttpError(
        409,
        error.code,
        "Messaging request conflicts with a previous request"
      );
    }
    if (error instanceof MessagingClientRelationshipError) {
      throw messagingHttpError(422, error.code, "Client relationship is not active");
    }
    throw error;
  }
}
