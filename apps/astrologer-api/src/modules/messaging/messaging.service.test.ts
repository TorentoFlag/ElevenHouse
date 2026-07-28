import {
  MessagingClientRelationshipError,
  type MessagingMessage,
  type MessagingReadStore,
  type MessagingStore,
  type MessagingThread
} from "@elevenhouse/domain";
import {
  createAes256GcmSecretCipher,
  type Aes256GcmSecretCipher
} from "@elevenhouse/auth";
import { describe, expect, it, vi } from "vitest";
import { MessagingService } from "./messaging.service";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const threadId = "33333333-3333-4333-8333-333333333333";
const clientUserId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const connectionId = "66666666-6666-4666-8666-666666666666";
const identityId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-07-22T10:00:00.000Z");

describe("MessagingService", () => {
  it("lists threads for the current astrologer session", async () => {
    const readStore = createReadStore();
    const service = createService({ readStore });

    await expect(service.listThreads({}, request())).resolves.toMatchObject({
      threads: [{ id: threadId }]
    });
    expect(readStore.listThreads).toHaveBeenCalledWith({
      astrologerUserId,
      limit: 50,
      offset: 0
    });
  });

  it("requests the complete persisted thread detail when no pagination is explicit", async () => {
    const readStore = createReadStore();
    const service = createService({ readStore });

    await expect(service.getThread(threadId, {}, request())).resolves.toMatchObject({
      thread: { id: threadId },
      messages: [{ id: messageId }]
    });
    expect(readStore.getThread).toHaveBeenCalledWith({
      astrologerUserId,
      threadId,
      offset: 0
    });
  });

  it("starts Telegram Business connection and returns the public bot link", async () => {
    const store = createStore();
    const service = createService({
      store,
      readStore: createReadStore({ connectionStatus: "connecting" }),
      telegramBusinessBotUsername: "ElevenHouseTestBot"
    });

    await expect(service.startTelegramBusinessConnection(request())).resolves.toMatchObject({
      channelConnection: {
        id: connectionId,
        provider: "telegram",
        mode: "telegram_business_bot",
        status: "connecting"
      },
      telegramBotUsername: "ElevenHouseTestBot",
      telegramBotUrl: "https://t.me/ElevenHouseTestBot"
    });
    expect(
      (store as unknown as { startTelegramBusinessConnection: ReturnType<typeof vi.fn> })
        .startTelegramBusinessConnection
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        now: now.toISOString()
      })
    );
  });

  it("starts Telegram Account login with encrypted-only phone snapshots", async () => {
    const store = createStore();
    const mtprotoAuthProvider = {
      sendCode: vi.fn(async () => ({
        phoneCodeHash: "telegram-phone-code-hash",
        isCodeViaApp: true
      })),
      signInWithCode: vi.fn(async () => ({
        loginStep: "password_required" as const,
        session: "partial-session-string"
      })),
      signInWithPassword: vi.fn(async () => ({
        loginStep: "connected" as const,
        session: "final-session-string",
        telegramUserId: "987654321",
        username: "alisa_astro",
        displayName: "Alisa"
      }))
    };
    const service = createService({
      store,
      readStore: createReadStore({ mode: "telegram_mtproto_account", connectionStatus: "connecting" }),
      mtprotoAuthProvider
    });

    const response = await service.startTelegramMtprotoConnection(
      { phoneNumber: "+78005553535", consentAccepted: true },
      request()
    );

    expect(response).toMatchObject({
      loginStep: "code_required",
      maskedPhoneNumber: "+7******3535",
      retryAfterSeconds: null,
      channelConnection: {
        id: connectionId,
        provider: "telegram",
        mode: "telegram_mtproto_account",
        status: "connecting"
      }
    });
    expect(mtprotoAuthProvider.sendCode).toHaveBeenCalledWith({ phoneNumber: "+78005553535" });
    expect(store.startTelegramMtprotoConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        phoneNumberLast4: "3535",
        maskedPhoneNumber: "+7******3535",
        consentAccepted: true,
        now: now.toISOString(),
        encryptedPhoneNumber: expect.objectContaining({
          algorithm: "aes-256-gcm",
          ciphertext: expect.any(String)
        }),
        encryptedPhoneCodeHash: expect.objectContaining({
          algorithm: "aes-256-gcm",
          ciphertext: expect.any(String)
        })
      })
    );
    expect(JSON.stringify((store.startTelegramMtprotoConnection as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      "+78005553535"
    );
    expect(JSON.stringify((store.startTelegramMtprotoConnection as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      "telegram-phone-code-hash"
    );
    expect(JSON.stringify(response)).not.toMatch(/phoneCodeHash|session|\+78005553535/i);
  });

  it("returns a typed unavailable error when Telegram Account login is not configured", async () => {
    const store = createStore();
    const service = createService({ store, mtprotoAuthProvider: null });

    await expect(
      service.startTelegramMtprotoConnection(
        { phoneNumber: "+78005553535", consentAccepted: true },
        request()
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "telegram_mtproto_login_unavailable" })
    });
    expect(store.startTelegramMtprotoConnection).not.toHaveBeenCalled();
  });

  it("submits Telegram Account code and persists only an encrypted partial session when password is required", async () => {
    const store = createStore();
    const mtprotoAuthProvider = {
      sendCode: vi.fn(async () => ({ phoneCodeHash: "telegram-phone-code-hash", isCodeViaApp: true })),
      signInWithCode: vi.fn(async () => ({
        loginStep: "password_required" as const,
        session: "partial-session-string"
      })),
      signInWithPassword: vi.fn()
    };
    const service = createService({
      store,
      readStore: createReadStore({ mode: "telegram_mtproto_account", connectionStatus: "connecting" }),
      mtprotoAuthProvider
    });

    await expect(
      service.submitTelegramMtprotoCode(
        { channelConnectionId: connectionId, code: "777777" },
        request()
      )
    ).resolves.toMatchObject({
      loginStep: "password_required",
      maskedPhoneNumber: "+7******3535",
      channelConnection: {
        id: connectionId,
        mode: "telegram_mtproto_account",
        status: "connecting"
      }
    });
    expect(mtprotoAuthProvider.signInWithCode).toHaveBeenCalledWith({
      phoneNumber: "+78005553535",
      phoneCodeHash: "telegram-phone-code-hash",
      code: "777777"
    });
    expect(store.recordTelegramMtprotoCodeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        connectionId,
        loginStep: "password_required",
        encryptedSession: expect.objectContaining({ algorithm: "aes-256-gcm" }),
        telegramUserId: null
      })
    );
    expect(JSON.stringify((store.recordTelegramMtprotoCodeResult as ReturnType<typeof vi.fn>).mock.calls)).not.toMatch(
      /777777|partial-session-string/
    );
  });

  it("submits Telegram Account password and activates the connection without storing the password", async () => {
    const store = createStore({ mtprotoLoginState: "password_required" });
    const mtprotoAuthProvider = {
      sendCode: vi.fn(async () => ({ phoneCodeHash: "telegram-phone-code-hash", isCodeViaApp: true })),
      signInWithCode: vi.fn(),
      signInWithPassword: vi.fn(async () => ({
        loginStep: "connected" as const,
        session: "final-session-string",
        telegramUserId: "987654321",
        username: "alisa_astro",
        displayName: "Alisa"
      }))
    };
    const service = createService({
      store,
      readStore: createReadStore({ mode: "telegram_mtproto_account", connectionStatus: "active" }),
      mtprotoAuthProvider
    });

    await expect(
      service.submitTelegramMtprotoPassword(
        { channelConnectionId: connectionId, password: "secret-password" },
        request()
      )
    ).resolves.toMatchObject({
      loginStep: "connected",
      maskedPhoneNumber: "+7******3535",
      channelConnection: {
        id: connectionId,
        mode: "telegram_mtproto_account",
        status: "active"
      }
    });
    expect(mtprotoAuthProvider.signInWithPassword).toHaveBeenCalledWith({
      session: "partial-session-string",
      password: "secret-password"
    });
    expect(store.recordTelegramMtprotoPasswordResult).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        connectionId,
        encryptedSession: expect.objectContaining({ algorithm: "aes-256-gcm" }),
        telegramUserId: "987654321",
        username: "alisa_astro",
        displayName: "Alisa"
      })
    );
    expect(
      JSON.stringify((store.recordTelegramMtprotoPasswordResult as ReturnType<typeof vi.fn>).mock.calls)
    ).not.toMatch(/secret-password|final-session-string/);
  });

  it("reconciles Telegram Business connection status before listing connections", async () => {
    const store = createStore();
    const readStore = createReadStore({ reconciliationBusinessConnectionId: "bc_revoked" });
    const connectionLookup = {
      findBusinessConnection: vi.fn(async () => ({
        businessConnectionId: "bc_revoked",
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa",
        connectedAt: "2026-07-22T06:00:00.000Z",
        enabled: false,
        rights: telegramBusinessRights({ canReply: false, canReadMessages: false })
      }))
    };
    const service = createService({ store, readStore, connectionLookup });

    await expect(service.listChannelConnections(request())).resolves.toMatchObject({
      channelConnections: [{ id: connectionId }]
    });
    expect(readStore.listTelegramBusinessConnectionReconciliationCandidates).toHaveBeenCalledWith({
      astrologerUserId
    });
    expect(connectionLookup.findBusinessConnection).toHaveBeenCalledWith("bc_revoked");
    expect(store.recordTelegramBusinessConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        businessConnectionId: "bc_revoked",
        userId: "987654321",
        enabled: false,
        now: now.toISOString()
      })
    );
  });

  it("does not block connection listing when Telegram Business lookup is not configured", async () => {
    const readStore = createReadStore({ reconciliationBusinessConnectionId: "bc_active" });
    const service = createService({ readStore, connectionLookup: null });

    await expect(service.listChannelConnections(request())).resolves.toMatchObject({
      channelConnections: [{ id: connectionId }]
    });
    expect(readStore.listTelegramBusinessConnectionReconciliationCandidates).not.toHaveBeenCalled();
  });

  it("validates a send request and persists it with the supplied idempotency key", async () => {
    const store = createStore();
    const service = createService({ store });

    await expect(
      service.sendMessage(threadId, { text: "Здравствуйте" }, "message:request-1", request())
    ).resolves.toMatchObject({ message: { id: messageId, text: "Здравствуйте" } });
    expect(store.createOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        threadId,
        idempotencyKey: "message:request-1",
        text: "Здравствуйте"
      })
    );
    await expect(
      service.sendMessage(threadId, { text: "" }, "message:request-2", request())
    ).rejects.toMatchObject({ status: 400 });
  });

  it("maps an unrelated client relationship to a safe validation error", async () => {
    const store = createStore();
    vi.mocked(store.linkThreadToClient).mockRejectedValue(new MessagingClientRelationshipError());
    const service = createService({ store });

    await expect(
      service.linkClient(threadId, { clientUserId }, "thread-link:unrelated", request())
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: "messaging_client_relationship_error" })
    });
  });

  it("creates and returns the real client linked to the thread", async () => {
    const service = createService({
      readStore: createReadStore({ clientUserId })
    });

    await expect(
      service.createClient(
        threadId,
        { displayName: "Марина" },
        "thread-create:request-1",
        request()
      )
    ).resolves.toMatchObject({
      clientUserId,
      thread: {
        id: threadId,
        clientUserId,
        primaryIdentity: { linkedClientUserId: clientUserId, linkStatus: "linked" }
      }
    });
  });

  it("forwards idempotency keys to link-client and create-client commands", async () => {
    const store = createStore();
    const service = createService({ store, readStore: createReadStore({ clientUserId }) });

    await expect(
      service.linkClient(threadId, { clientUserId }, "thread-link:request-1", request())
    ).resolves.toMatchObject({ clientUserId });
    await expect(
      service.createClient(
        threadId,
        { displayName: "Марина" },
        "thread-create:request-1",
        request()
      )
    ).resolves.toMatchObject({ clientUserId });

    expect(store.linkThreadToClient).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "thread-link:request-1" })
    );
    expect(
      (store as unknown as { createClientFromThread: ReturnType<typeof vi.fn> })
        .createClientFromThread
    ).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "thread-create:request-1" }));
  });

  it("marks an owned thread read", async () => {
    const store = createStore();
    const service = createService({ store, readStore: createReadStore({ unreadCount: 0 }) });

    await expect(service.markRead(threadId, request())).resolves.toMatchObject({
      thread: { id: threadId, unreadCount: 0 }
    });
    expect(store.markThreadRead).toHaveBeenCalledWith(
      expect.objectContaining({ astrologerUserId, threadId })
    );
  });

  it("records Telegram Business voice messages instead of dropping them as unsupported", async () => {
    const store = createStore();
    const service = createService({ store });

    await service.handleTelegramBusinessWebhookUpdate({
      kind: "business_message",
      updateId: "1008",
      businessConnectionId: "bc_123",
      providerMessageId: "349",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:07:00.000Z",
      contentType: "voice",
      text: "Голосовое сообщение (0:12)",
      mediaAttachment: {
        kind: "voice",
        providerFileId: "voice-file-id",
        providerFileUniqueId: "voice-file-unique-id",
        durationSeconds: 12,
        width: null,
        height: null,
        providerMimeType: "audio/ogg",
        providerSizeBytes: 34567
      }
    } as never);

    expect(store.recordTelegramBusinessMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        updateId: "1008",
        contentType: "voice",
        text: "Голосовое сообщение (0:12)",
        mediaAttachment: {
          kind: "voice",
          providerFileId: "voice-file-id",
          providerFileUniqueId: "voice-file-unique-id",
          durationSeconds: 12,
          width: null,
          height: null,
          providerMimeType: "audio/ogg",
          providerSizeBytes: 34567
        }
      })
    );
  });

  it("hydrates a pending Telegram Business connection from the first business message", async () => {
    const store = createStore();
    vi.mocked(store.recordTelegramBusinessMessage)
      .mockResolvedValueOnce({ kind: "unmatched" })
      .mockResolvedValueOnce({ kind: "created", message: domainMessage("inbound") });
    const connectionLookup = {
      findBusinessConnection: vi.fn(async () => ({
        businessConnectionId: "bc_recovered",
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa",
        connectedAt: "2026-07-22T06:00:00.000Z",
        enabled: true,
        rights: {
          canReply: true,
          canReadMessages: true,
          canDeleteSentMessages: true,
          canDeleteAllMessages: false,
          canEditName: false,
          canEditBio: false,
          canEditProfilePhoto: false,
          canEditUsername: false,
          canChangeGiftSettings: false,
          canViewGiftsAndStars: false,
          canConvertGiftsToStars: false,
          canTransferAndUpgradeGifts: false,
          canTransferStars: false,
          canManageStories: false
        }
      }))
    };
    const service = createService({ store, connectionLookup });

    await service.handleTelegramBusinessWebhookUpdate({
      kind: "business_message",
      updateId: "1012",
      businessConnectionId: "bc_recovered",
      providerMessageId: "353",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:11:00.000Z",
      contentType: "text",
      text: "Здравствуйте"
    });

    expect(connectionLookup.findBusinessConnection).toHaveBeenCalledWith("bc_recovered");
    expect(store.recordTelegramBusinessConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        businessConnectionId: "bc_recovered",
        userId: "987654321",
        username: "alisa_astro",
        enabled: true
      })
    );
    expect(store.recordTelegramBusinessMessage).toHaveBeenCalledTimes(2);
  });

  it("records Telegram Business image and video note messages as media updates", async () => {
    const store = createStore();
    const service = createService({ store });

    await service.handleTelegramBusinessWebhookUpdate({
      kind: "business_message",
      updateId: "1009",
      businessConnectionId: "bc_123",
      providerMessageId: "350",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:08:00.000Z",
      contentType: "image",
      text: "Фото карты",
      mediaAttachment: {
        kind: "image",
        providerFileId: "image-file-id",
        providerFileUniqueId: "image-file-unique-id",
        durationSeconds: null,
        width: 1280,
        height: 720,
        providerMimeType: null,
        providerSizeBytes: 98765
      }
    } as never);

    await service.handleTelegramBusinessWebhookUpdate({
      kind: "business_message",
      updateId: "1010",
      businessConnectionId: "bc_123",
      providerMessageId: "351",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:09:00.000Z",
      contentType: "video_note",
      text: "Видео кружок (0:07)",
      mediaAttachment: {
        kind: "video_note",
        providerFileId: "video-note-file-id",
        providerFileUniqueId: "video-note-file-unique-id",
        durationSeconds: 7,
        width: 384,
        height: 384,
        providerMimeType: "video/mp4",
        providerSizeBytes: 456789
      }
    } as never);

    await service.handleTelegramBusinessWebhookUpdate({
      kind: "business_message",
      updateId: "1011",
      businessConnectionId: "bc_123",
      providerMessageId: "352",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:10:00.000Z",
      contentType: "video",
      text: "Расклад по дому",
      mediaAttachment: {
        kind: "video",
        providerFileId: "video-file-id",
        providerFileUniqueId: "video-file-unique-id",
        durationSeconds: 18,
        width: 1280,
        height: 720,
        providerMimeType: "video/mp4",
        providerSizeBytes: 7654321
      }
    } as never);

    expect(store.recordTelegramBusinessMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contentType: "image",
        mediaAttachment: expect.objectContaining({
          kind: "image",
          providerFileId: "image-file-id",
          width: 1280,
          height: 720
        })
      })
    );
    expect(store.recordTelegramBusinessMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contentType: "video_note",
        mediaAttachment: expect.objectContaining({
          kind: "video_note",
          providerFileId: "video-note-file-id",
          durationSeconds: 7,
          width: 384,
          height: 384
        })
      })
    );
    expect(store.recordTelegramBusinessMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        contentType: "video",
        mediaAttachment: expect.objectContaining({
          kind: "video",
          providerFileId: "video-file-id",
          durationSeconds: 18,
          width: 1280,
          height: 720
        })
      })
    );
  });

  it("rejects invalid identifiers and a missing astrologer session", async () => {
    const service = createService();

    await expect(service.getThread("not-a-uuid", {}, request())).rejects.toMatchObject({
      status: 400
    });
    await expect(service.listThreads({}, {} as never)).rejects.toMatchObject({ status: 401 });
  });
});

function request() {
  return { currentAstrologerAccount: { account: { id: astrologerUserId } } } as never;
}

function testMtprotoCipher(): Aes256GcmSecretCipher {
  return createAes256GcmSecretCipher(Buffer.alloc(32, 12));
}

function encryptedMtprotoSecret(
  cipher: Aes256GcmSecretCipher,
  purpose: "phone_number" | "phone_code_hash" | "session",
  plaintext: string
) {
  const encrypted = cipher.encrypt({
    plaintext,
    aad: `messaging:telegram_mtproto:${astrologerUserId}:${purpose}`
  });
  return {
    ...encrypted,
    keyId: "telegram_mtproto_v1"
  };
}

function createService(
  overrides: {
    store?: MessagingStore;
    readStore?: MessagingReadStore;
    telegramBusinessBotUsername?: string | null;
    connectionLookup?: ConstructorParameters<typeof MessagingService>[2];
    mtprotoAuthProvider?: ConstructorParameters<typeof MessagingService>[3];
  } = {}
) {
  return new MessagingService(
    overrides.store ?? createStore(),
    overrides.readStore ?? createReadStore(),
    overrides.connectionLookup ?? null,
    Object.hasOwn(overrides, "mtprotoAuthProvider")
      ? overrides.mtprotoAuthProvider ?? null
      : {
          sendCode: vi.fn(async () => ({ phoneCodeHash: "telegram-phone-code-hash", isCodeViaApp: true })),
          signInWithCode: vi.fn(async () => ({
            loginStep: "password_required" as const,
            session: "partial-session-string"
          })),
          signInWithPassword: vi.fn(async () => ({
            loginStep: "connected" as const,
            session: "final-session-string",
            telegramUserId: "987654321",
            username: "alisa_astro",
            displayName: "Alisa"
          }))
        },
    { createPresignedDownload: vi.fn(async () => ({ url: "https://storage.example/voice.ogg", expiresAt: now.toISOString() })) },
    { now: () => now },
    {
      get: (key: string) =>
        key === "astrologerApi.telegramBusinessBotUsername"
          ? (overrides.telegramBusinessBotUsername ?? null)
          : key === "astrologerApi.telegramMtproto"
            ? { enabled: true, apiId: 12345, apiHash: "0123456789abcdef0123456789abcdef", sessionEncryptionKey: Buffer.alloc(32, 12) }
          : undefined
    } as never
  );
}

function createStore(
  options: { readonly mtprotoLoginState?: "code_required" | "password_required" } = {}
): MessagingStore {
  const thread = domainThread();
  const cipher = testMtprotoCipher();
  return {
    findThreadForAstrologer: vi.fn(async () => thread),
    findExternalIdentityForThread: vi.fn(async () => ({
      id: identityId,
      channelConnectionId: connectionId
    })),
    findOutboundMessageByIdempotencyKey: vi.fn(async () => null),
    createOutboundMessage: vi.fn(async (input) => domainMessage(input.text)),
    recordInboundProviderMessage: vi.fn(async () => ({
      kind: "created" as const,
      message: domainMessage("inbound")
    })),
    recordTelegramBusinessConnection: vi.fn(async () => ({ kind: "recorded" as const })),
    recordTelegramBusinessMessage: vi.fn(async () => ({
      kind: "created" as const,
      message: domainMessage("inbound")
    })),
    recordTelegramBusinessDeletedMessages: vi.fn(async () => ({ kind: "recorded" as const, deletedCount: 0 })),
    recordTelegramBusinessEditedMessage: vi.fn(async () => ({ kind: "recorded" as const, updatedCount: 0 })),
    startTelegramBusinessConnection: vi.fn(async () => ({ connectionId })),
    startTelegramMtprotoConnection: vi.fn(async () => ({
      connectionId,
      loginStep: "code_required" as const,
      maskedPhoneNumber: "+7******3535"
    })),
    findTelegramMtprotoLoginSession: vi.fn(async () => ({
      connectionId,
      loginState: options.mtprotoLoginState ?? "code_required" as const,
      maskedPhoneNumber: "+7******3535",
      encryptedPhoneNumber: encryptedMtprotoSecret(cipher, "phone_number", "+78005553535"),
      encryptedPhoneCodeHash: encryptedMtprotoSecret(
        cipher,
        "phone_code_hash",
        "telegram-phone-code-hash"
      ),
      encryptedSession:
        options.mtprotoLoginState === "password_required"
          ? encryptedMtprotoSecret(cipher, "session", "partial-session-string")
          : null
    })),
    recordTelegramMtprotoCodeResult: vi.fn(async (input) => ({
      connectionId: input.connectionId,
      loginStep: input.loginStep,
      maskedPhoneNumber: "+7******3535"
    })),
    recordTelegramMtprotoPasswordResult: vi.fn(async (input) => ({
      connectionId: input.connectionId,
      loginStep: "connected" as const,
      maskedPhoneNumber: "+7******3535"
    })),
    linkThreadToClient: vi.fn(async (input) => ({ ...thread, clientUserId: input.clientUserId })),
    createClientFromThread: vi.fn(async () => ({ ...thread, clientUserId })),
    markThreadRead: vi.fn(async () => ({
      thread: { ...thread, unreadAstrologerCount: 0 },
      realtimeEvent: realtimeEvent()
    })),
    appendRealtimeEvent: vi.fn(async () => realtimeEvent())
  };
}

function createReadStore(
  overrides: {
    clientUserId?: string | null;
    connectionStatus?: ReturnType<typeof channelConnection>["status"];
    mode?: ReturnType<typeof channelConnection>["mode"];
    reconciliationBusinessConnectionId?: string;
    unreadCount?: number;
  } = {}
): MessagingReadStore {
  return {
    listChannelConnections: vi.fn(async () => ({
      channelConnections: [channelConnection({ status: overrides.connectionStatus, mode: overrides.mode })]
    })),
    listTelegramBusinessConnectionReconciliationCandidates: vi.fn(async () => ({
      candidates: overrides.reconciliationBusinessConnectionId
        ? [
            {
              channelConnectionId: connectionId,
              businessConnectionId: overrides.reconciliationBusinessConnectionId
            }
          ]
        : []
    })),
    listThreads: vi.fn(async () => ({ threads: [readThread(overrides)], nextCursor: null })),
    getThread: vi.fn(async () => ({
      thread: readThread(overrides),
      messages: [readMessage()],
      nextCursor: null
    })),
    findMessageMediaSource: vi.fn(async () => null),
    listRealtimeEvents: vi.fn(async () => ({ events: [] }))
  };
}

function domainThread(): MessagingThread {
  return {
    id: threadId,
    astrologerUserId,
    clientUserId: null,
    channelConnectionId: connectionId,
    externalIdentityId: identityId,
    status: "open",
    lastMessageAt: now.toISOString(),
    unreadAstrologerCount: 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function domainMessage(text: string): MessagingMessage {
  return {
    id: messageId,
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: null,
    direction: "outbound",
    text,
    status: "queued",
    providerMessageId: null,
    idempotencyKey: "message:request-1",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function channelConnection(overrides: {
  status?: "connecting" | "active" | "revoked";
  mode?: "telegram_business_bot" | "telegram_mtproto_account";
} = {}) {
  return {
    id: connectionId,
    provider: "telegram" as const,
    mode: overrides.mode ?? "telegram_business_bot" as const,
    status: overrides.status ?? "active" as const,
    displayName: "Telegram",
    username: "telegram",
    capabilities: {
      canSend: true,
      canReceive: true,
      canRead: true,
      supportsHistoryImport: false,
      supportsMessageEdits: false,
      supportsMessageDeletes: false,
      supportsAttachments: false
    },
    connectedAt: overrides.status === "connecting" ? null : now.toISOString(),
    lastSyncedAt: overrides.status === "connecting" ? null : now.toISOString(),
    lastErrorCode: null
  };
}

function telegramBusinessRights(
  overrides: Partial<{
    canReply: boolean;
    canReadMessages: boolean;
    canDeleteSentMessages: boolean;
    canDeleteAllMessages: boolean;
    canEditName: boolean;
    canEditBio: boolean;
    canEditProfilePhoto: boolean;
    canEditUsername: boolean;
    canChangeGiftSettings: boolean;
    canViewGiftsAndStars: boolean;
    canConvertGiftsToStars: boolean;
    canTransferAndUpgradeGifts: boolean;
    canTransferStars: boolean;
    canManageStories: boolean;
  }> = {}
) {
  return {
    canReply: true,
    canReadMessages: true,
    canDeleteSentMessages: true,
    canDeleteAllMessages: false,
    canEditName: false,
    canEditBio: false,
    canEditProfilePhoto: false,
    canEditUsername: false,
    canChangeGiftSettings: false,
    canViewGiftsAndStars: false,
    canConvertGiftsToStars: false,
    canTransferAndUpgradeGifts: false,
    canTransferStars: false,
    canManageStories: false,
    ...overrides
  };
}

function readThread(overrides: { clientUserId?: string | null; unreadCount?: number } = {}) {
  return {
    id: threadId,
    clientUserId: overrides.clientUserId ?? null,
    status: "open" as const,
    primaryIdentity: {
      id: identityId,
      channelConnectionId: connectionId,
      provider: "telegram" as const,
      providerUserId: "123",
      providerChatId: "456",
      username: "marina",
      displayName: "Марина",
      avatarMediaId: null,
      linkedClientUserId: overrides.clientUserId ?? null,
      linkStatus: overrides.clientUserId ? ("linked" as const) : ("unlinked" as const),
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString()
    },
    lastMessage: readMessage(),
    lastMessageAt: now.toISOString(),
    unreadCount: overrides.unreadCount ?? 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function readMessage() {
  return {
    id: messageId,
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: null,
    direction: "outbound" as const,
    senderKind: "astrologer" as const,
    contentType: "text" as const,
    text: "Здравствуйте",
    mediaAssetId: null,
    media: null,
    status: "queued" as const,
    failureCode: null,
    providerSentAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function realtimeEvent() {
  return {
    eventId: "event-1",
    astrologerUserId,
    type: "thread.updated" as const,
    occurredAt: now.toISOString(),
    threadId,
    messageId: undefined,
    channelConnectionId: connectionId,
    externalIdentityId: identityId
  };
}
