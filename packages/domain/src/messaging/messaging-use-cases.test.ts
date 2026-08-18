import { describe, expect, it } from "vitest";
import {
  MessagingClientRelationshipError,
  MessagingIdempotencyConflictError,
  MessagingValidationError
} from "./messaging-errors";
import {
  messagingMessageDeliveryRequestedEventType,
  messagingMessageReceivedEventType,
  messagingThreadUpdatedEventType
} from "./messaging-events";
import type {
  AppendMessagingRealtimeEventInput,
  BindTelegramBusinessConnectionUserStoreInput,
  CreateClientFromThreadStoreInput,
  CreateOutboundMessageStoreInput,
  InboundMessageRecordResult,
  LinkThreadToClientStoreInput,
  MarkThreadReadStoreInput,
  MarkThreadReadStoreResult,
  CompleteInstagramGraphConnectionStoreInput,
  MessagingStore,
  RecordInstagramGraphMessageStoreInput,
  RecordTelegramMtprotoCodeResultStoreInput,
  RecordTelegramMtprotoPasswordResultStoreInput,
  RecordInboundProviderMessageStoreInput,
  RecordTelegramBusinessConnectionStoreInput,
  RecordTelegramBusinessDeletedMessagesStoreInput,
  RecordTelegramBusinessEditedMessageStoreInput,
  RecordTelegramBusinessMessageStoreInput,
  RecordTelegramMtprotoMessageStoreInput,
  RevokeInstagramGraphConnectionStoreInput,
  StartInstagramGraphConnectionStoreInput,
  StartTelegramBusinessConnectionStoreInput,
  StartTelegramMtprotoConnectionStoreInput
} from "./messaging-store";
import type {
  MessagingMessage,
  MessagingMessageWithRequestHash,
  MessagingOutboxEvent,
  MessagingRealtimeEvent,
  MessagingThread
} from "./messaging-types";
import {
  createClientFromThread,
  createOutboundMessage,
  linkThreadToClient,
  markThreadRead,
  normalizeRealtimeEvent,
  recordInboundProviderMessage,
  recordInstagramGraphMessage,
  recordTelegramBusinessMessage,
  recordTelegramBusinessDeletedMessages,
  recordTelegramBusinessEditedMessage,
  recordTelegramMtprotoMessage,
  recordTelegramMtprotoCodeResult,
  recordTelegramMtprotoPasswordResult,
  requireTelegramMtprotoLoginSession,
  selectSingleSendableMessagingConversation,
  completeInstagramGraphConnection,
  startInstagramGraphConnection,
  startTelegramBusinessConnection,
  startTelegramMtprotoConnection
} from "./messaging-use-cases";

const now = new Date("2026-07-21T10:00:00.000Z");
const astrologerUserId = "astrologer-1";

describe("Messaging use cases", () => {
  it("selects the sole send-capable conversation without inspecting its provider", () => {
    expect(
      selectSingleSendableMessagingConversation([
        {
          threadId: "thread-read-only",
          channelConnectionId: "connection-read-only",
          canSend: false
        },
        { threadId: "thread-sendable", channelConnectionId: "connection-sendable", canSend: true }
      ])
    ).toEqual({
      threadId: "thread-sendable",
      channelConnectionId: "connection-sendable",
      canSend: true
    });

    expect(
      selectSingleSendableMessagingConversation([
        { threadId: "thread-1", channelConnectionId: "connection-1", canSend: true },
        { threadId: "thread-2", channelConnectionId: "connection-2", canSend: true }
      ])
    ).toBeNull();
  });

  it("normalizes an opaque persisted realtime cursor as eventId", () => {
    expect(
      normalizeRealtimeEvent({
        eventId: "00000000000000000042",
        astrologerUserId,
        type: messagingThreadUpdatedEventType,
        occurredAt: now.toISOString(),
        threadId: "thread-1"
      })
    ).toMatchObject({ eventId: "00000000000000000042", type: messagingThreadUpdatedEventType });

    expect(() =>
      normalizeRealtimeEvent({
        eventId: "   ",
        astrologerUserId,
        type: messagingThreadUpdatedEventType,
        occurredAt: now.toISOString()
      })
    ).toThrow(MessagingValidationError);
  });

  it("returns the realtime event with its persisted cursor", async () => {
    const store = new InMemoryMessagingStore();

    const event = await store.appendRealtimeEvent({
      astrologerUserId,
      type: messagingThreadUpdatedEventType,
      occurredAt: now.toISOString(),
      threadId: "thread-1",
      messageId: undefined,
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1"
    });

    expect(event).toMatchObject({ eventId: "00000000000000000001" });
    expect(store.realtimeEvents).toEqual([event]);
  });

  it("persists one queued outbound message and identifier-only delivery event across an idempotent replay", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      text: "  Hello, client.  ",
      idempotencyKey: "send-message-001",
      idGenerator: createIdGenerator(),
      now
    };

    const created = await createOutboundMessage(input);
    const replayed = await createOutboundMessage({ ...input, text: "Hello, client." });

    expect(created).toMatchObject({
      replayed: false,
      message: { text: "Hello, client.", status: "queued" }
    });
    expect(replayed).toMatchObject({ message: { id: created.message.id }, replayed: true });
    expect(store.messages).toHaveLength(1);
    expect(store.outboxEvents).toEqual([
      expect.objectContaining({
        type: messagingMessageDeliveryRequestedEventType,
        payload: {
          messageId: created.message.id,
          threadId: "thread-1",
          channelConnectionId: "connection-1",
          astrologerUserId
        }
      })
    ]);
    expect(store.outboxEvents[0]?.payload).not.toHaveProperty("text");
  });

  it("rejects an outbound send to a thread owned by another astrologer", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      createOutboundMessage({
        store,
        astrologerUserId: "astrologer-2",
        threadId: "thread-1",
        channelConnectionId: "connection-1",
        text: "Unauthorized send",
        idempotencyKey: "send-message-foreign",
        now
      })
    ).rejects.toMatchObject({ code: "messaging_thread_not_found" });

    expect(store.messages).toHaveLength(0);
    expect(store.outboxEvents).toHaveLength(0);
  });

  it("rejects an idempotency-key replay with different normalized content without a second persisted message", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      idempotencyKey: "send-message-001",
      now
    };
    await createOutboundMessage({ ...input, text: "Original" });

    await expect(createOutboundMessage({ ...input, text: "Changed" })).rejects.toBeInstanceOf(
      MessagingIdempotencyConflictError
    );
    expect(store.messages).toHaveLength(1);
    expect(store.outboxEvents).toHaveLength(1);
  });

  it("deduplicates inbound provider messages without persisting a second message or realtime event", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: "telegram-100",
      text: "Hello from Telegram",
      idGenerator: createIdGenerator(),
      now
    };

    const created = await recordInboundProviderMessage(input);
    const duplicate = await recordInboundProviderMessage(input);

    expect(created.duplicate).toBe(false);
    expect(duplicate).toEqual({ message: created.message, duplicate: true });
    expect(store.messages).toHaveLength(1);
    expect(store.realtimeEvents).toHaveLength(1);
    expect(store.realtimeEvents[0]).toMatchObject({
      eventId: "00000000000000000001",
      type: messagingMessageReceivedEventType,
      messageId: created.message.id
    });
  });

  it("deduplicates inbound provider messages per external identity", async () => {
    const store = new InMemoryMessagingStore();

    const first = await recordInboundProviderMessage({
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: "chat-scoped-100",
      text: "First chat",
      idGenerator: createIdGenerator(),
      now
    });
    const second = await recordInboundProviderMessage({
      store,
      astrologerUserId,
      threadId: "thread-2",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-2",
      providerMessageId: "chat-scoped-100",
      text: "Second chat",
      idGenerator: createIdGenerator("second"),
      now
    });
    const duplicateFirst = await recordInboundProviderMessage({
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: "chat-scoped-100",
      text: "First chat",
      idGenerator: createIdGenerator("duplicate"),
      now
    });

    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: false, message: { text: "Second chat" } });
    expect(duplicateFirst).toEqual({ message: first.message, duplicate: true });
    expect(store.messages).toHaveLength(2);
  });

  it("rejects an inbound external identity that is not attached to the target thread", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordInboundProviderMessage({
        store,
        astrologerUserId,
        threadId: "thread-1",
        channelConnectionId: "connection-1",
        externalIdentityId: "identity-2",
        providerMessageId: "telegram-foreign-identity",
        text: "Wrong thread",
        now
      })
    ).rejects.toBeInstanceOf(MessagingValidationError);

    expect(store.messages).toHaveLength(0);
    expect(store.realtimeEvents).toHaveLength(0);
  });

  it("rejects linking a thread to a client without an active relationship", async () => {
    await expect(
      linkThreadToClient({
        store: new InMemoryMessagingStore(),
        astrologerUserId,
        threadId: "thread-1",
        clientUserId: "unrelated-client",
        idempotencyKey: "thread-link:unrelated-client",
        now
      })
    ).rejects.toBeInstanceOf(MessagingClientRelationshipError);
  });

  it("creates a manual client through the Clients port and persists the resulting thread link", async () => {
    const store = new InMemoryMessagingStore();

    const linked = await createClientFromThread({
      store,
      astrologerUserId,
      threadId: "thread-1",
      displayName: "  Telegram contact  ",
      idempotencyKey: "thread-create:manual-client",
      now
    });

    expect(store.createClientCommands).toEqual([
      expect.objectContaining({
        astrologerUserId,
        displayName: "Telegram contact",
        now: now.toISOString()
      })
    ]);
    expect(linked.clientUserId).toBe("client-created");
    expect(store.thread("thread-1")?.clientUserId).toBe("client-created");
  });

  it("passes a normalized idempotent link-client command to the store", async () => {
    const store = new InMemoryMessagingStore();

    await linkThreadToClient({
      store,
      astrologerUserId,
      threadId: " thread-1 ",
      clientUserId: " client-existing ",
      idempotencyKey: "thread-link:request-1",
      now
    });

    expect(store.linkClientCommands).toEqual([
      expect.objectContaining({
        astrologerUserId,
        threadId: "thread-1",
        clientUserId: "client-existing",
        idempotencyKey: "thread-link:request-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      })
    ]);
  });

  it("creates and links a manual client through one idempotent store command", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      displayName: "  Telegram contact  ",
      idempotencyKey: "thread-create:request-1",
      now
    };

    const created = await createClientFromThread(input);
    const replayed = await createClientFromThread(input);

    expect(created.clientUserId).toBe("client-created");
    expect(replayed).toEqual(created);
    expect(store.createClientCommands).toEqual([
      expect.objectContaining({
        astrologerUserId,
        threadId: "thread-1",
        displayName: "Telegram contact",
        idempotencyKey: "thread-create:request-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      })
    ]);
  });

  it("rejects a thread-client idempotency key reused for a different normalized request", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      clientUserId: "client-existing",
      idempotencyKey: "thread-link:request-1",
      now
    };

    await linkThreadToClient(input);

    await expect(
      linkThreadToClient({ ...input, clientUserId: "client-other" })
    ).rejects.toBeInstanceOf(MessagingIdempotencyConflictError);
  });

  it("persists mark-read state and its thread-updated realtime event", async () => {
    const store = new InMemoryMessagingStore();

    const updated = await markThreadRead({
      store,
      astrologerUserId,
      threadId: "thread-1",
      now
    });

    expect(updated.unreadAstrologerCount).toBe(0);
    expect(store.thread("thread-1")?.unreadAstrologerCount).toBe(0);
    expect(store.markReadCommands).toEqual([
      expect.objectContaining({
        realtimeEvent: expect.objectContaining({
          type: messagingThreadUpdatedEventType,
          threadId: "thread-1",
          channelConnectionId: "connection-1",
          externalIdentityId: "identity-1"
        })
      })
    ]);
    expect(store.realtimeEvents).toEqual([
      expect.objectContaining({
        type: messagingThreadUpdatedEventType,
        eventId: "00000000000000000001",
        threadId: "thread-1",
        channelConnectionId: "connection-1",
        externalIdentityId: "identity-1"
      })
    ]);
  });

  it("starts Telegram Business connection as one owner-scoped pending channel", async () => {
    const store = new InMemoryMessagingStore();

    const started = await startTelegramBusinessConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("connection"),
      now
    });
    const replayed = await startTelegramBusinessConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("second"),
      now
    });

    expect(started).toEqual({ connectionId: "connection-1" });
    expect(replayed).toEqual(started);
    expect(store.startTelegramBusinessCommands).toEqual([
      {
        connectionId: "connection-1",
        astrologerUserId,
        now: now.toISOString()
      },
      {
        connectionId: "second-1",
        astrologerUserId,
        now: now.toISOString()
      }
    ]);
  });

  it("starts Instagram Graph connection as one owner-scoped pending channel", async () => {
    const store = new InMemoryMessagingStore();

    const started = await startInstagramGraphConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("instagram"),
      now
    });
    const replayed = await startInstagramGraphConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("second"),
      now
    });

    expect(started).toEqual({ connectionId: "instagram-1" });
    expect(replayed).toEqual(started);
    expect(store.startInstagramGraphCommands).toEqual([
      {
        connectionId: "instagram-1",
        astrologerUserId,
        now: now.toISOString()
      },
      {
        connectionId: "second-1",
        astrologerUserId,
        now: now.toISOString()
      }
    ]);
  });

  it("completes Instagram Graph connection with encrypted token snapshots", async () => {
    const store = new InMemoryMessagingStore();
    const encryptedToken = encryptedSecretFixture("token-ciphertext");
    await startInstagramGraphConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("instagram"),
      now
    });

    await expect(
      completeInstagramGraphConnection({
        store,
        astrologerUserId,
        connectionId: "instagram-1",
        instagramAccountId: " ig-scoped-123 ",
        instagramAppScopedUserId: " app-scoped-123 ",
        instagramUserId: " ig-456 ",
        instagramUsername: " alisa.astro ",
        instagramDisplayName: " Alisa Astro ",
        encryptedAccessToken: encryptedToken,
        tokenExpiresAt: "2026-09-22T10:00:00.000Z",
        now
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(store.completeInstagramGraphCommands).toEqual([
      {
        astrologerUserId,
        connectionId: "instagram-1",
        instagramAccountId: "ig-scoped-123",
        instagramAppScopedUserId: "app-scoped-123",
        instagramUserId: "ig-456",
        instagramUsername: "alisa.astro",
        instagramDisplayName: "Alisa Astro",
        encryptedAccessToken: encryptedToken,
        tokenExpiresAt: "2026-09-22T10:00:00.000Z",
        now: now.toISOString()
      }
    ]);
  });

  it("starts Telegram Account connection with encrypted login material and no plaintext phone", async () => {
    const store = new InMemoryMessagingStore();
    const encryptedSecret = {
      algorithm: "aes-256-gcm" as const,
      keyId: "mtproto-key-1",
      iv: "base64-iv",
      authTag: "base64-tag",
      ciphertext: "base64-ciphertext"
    };

    const started = await startTelegramMtprotoConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("mtproto-connection"),
      phoneNumberLast4: "3535",
      maskedPhoneNumber: "+7******3535",
      encryptedPhoneNumber: encryptedSecret,
      encryptedPhoneCodeHash: { ...encryptedSecret, ciphertext: "phone-code-hash" },
      consentAccepted: true,
      now
    });
    const replayed = await startTelegramMtprotoConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("second-mtproto"),
      phoneNumberLast4: "3535",
      maskedPhoneNumber: "+7******3535",
      encryptedPhoneNumber: encryptedSecret,
      encryptedPhoneCodeHash: { ...encryptedSecret, ciphertext: "phone-code-hash" },
      consentAccepted: true,
      now
    });

    expect(started).toEqual({
      connectionId: "mtproto-connection-1",
      loginStep: "code_required",
      maskedPhoneNumber: "+7******3535"
    });
    expect(replayed).toEqual(started);
    expect(JSON.stringify(store.startTelegramMtprotoCommands)).not.toContain("78005553535");
    expect(store.startTelegramMtprotoCommands).toEqual([
      {
        connectionId: "mtproto-connection-1",
        astrologerUserId,
        phoneNumberLast4: "3535",
        maskedPhoneNumber: "+7******3535",
        encryptedPhoneNumber: encryptedSecret,
        encryptedPhoneCodeHash: { ...encryptedSecret, ciphertext: "phone-code-hash" },
        consentAccepted: true,
        now: now.toISOString()
      },
      {
        connectionId: "second-mtproto-1",
        astrologerUserId,
        phoneNumberLast4: "3535",
        maskedPhoneNumber: "+7******3535",
        encryptedPhoneNumber: encryptedSecret,
        encryptedPhoneCodeHash: { ...encryptedSecret, ciphertext: "phone-code-hash" },
        consentAccepted: true,
        now: now.toISOString()
      }
    ]);
  });

  it("reads a pending Telegram Account login session and records a password-required code result", async () => {
    const store = new InMemoryMessagingStore();
    const encryptedSecret = encryptedSecretFixture("phone-ciphertext");
    await startTelegramMtprotoConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("mtproto-connection"),
      phoneNumberLast4: "3535",
      maskedPhoneNumber: "+7******3535",
      encryptedPhoneNumber: encryptedSecret,
      encryptedPhoneCodeHash: encryptedSecretFixture("phone-code-hash"),
      consentAccepted: true,
      now
    });

    await expect(
      requireTelegramMtprotoLoginSession({
        store,
        astrologerUserId,
        connectionId: "mtproto-connection-1",
        expectedLoginState: "code_required"
      })
    ).resolves.toMatchObject({
      connectionId: "mtproto-connection-1",
      loginState: "code_required",
      maskedPhoneNumber: "+7******3535",
      encryptedPhoneNumber: encryptedSecret,
      encryptedPhoneCodeHash: encryptedSecretFixture("phone-code-hash"),
      encryptedSession: null
    });

    await expect(
      recordTelegramMtprotoCodeResult({
        store,
        astrologerUserId,
        connectionId: "mtproto-connection-1",
        loginStep: "password_required",
        encryptedSession: encryptedSecretFixture("partial-session"),
        telegramUserId: null,
        username: null,
        displayName: null,
        now
      })
    ).resolves.toEqual({
      connectionId: "mtproto-connection-1",
      loginStep: "password_required",
      maskedPhoneNumber: "+7******3535"
    });
    expect(store.telegramMtprotoCodeCommands).toEqual([
      expect.objectContaining({
        connectionId: "mtproto-connection-1",
        loginStep: "password_required",
        encryptedSession: encryptedSecretFixture("partial-session")
      })
    ]);
    expect(JSON.stringify(store.telegramMtprotoCodeCommands)).not.toMatch(
      /777777|phone-code-hash-plaintext/
    );
  });

  it("records Telegram Account password completion without plaintext password", async () => {
    const store = new InMemoryMessagingStore();
    await startTelegramMtprotoConnection({
      store,
      astrologerUserId,
      idGenerator: createIdGenerator("mtproto-connection"),
      phoneNumberLast4: "3535",
      maskedPhoneNumber: "+7******3535",
      encryptedPhoneNumber: encryptedSecretFixture("phone-ciphertext"),
      encryptedPhoneCodeHash: encryptedSecretFixture("phone-code-hash"),
      consentAccepted: true,
      now
    });
    await recordTelegramMtprotoCodeResult({
      store,
      astrologerUserId,
      connectionId: "mtproto-connection-1",
      loginStep: "password_required",
      encryptedSession: encryptedSecretFixture("partial-session"),
      telegramUserId: null,
      username: null,
      displayName: null,
      now
    });

    await expect(
      recordTelegramMtprotoPasswordResult({
        store,
        astrologerUserId,
        connectionId: "mtproto-connection-1",
        encryptedSession: encryptedSecretFixture("final-session"),
        telegramUserId: "987654321",
        username: "alisa_astro",
        displayName: "Alisa",
        now
      })
    ).resolves.toEqual({
      connectionId: "mtproto-connection-1",
      loginStep: "connected",
      maskedPhoneNumber: "+7******3535"
    });
    expect(store.telegramMtprotoPasswordCommands).toEqual([
      expect.objectContaining({
        connectionId: "mtproto-connection-1",
        encryptedSession: encryptedSecretFixture("final-session"),
        telegramUserId: "987654321"
      })
    ]);
    expect(JSON.stringify(store.telegramMtprotoPasswordCommands)).not.toContain("secret-password");
  });

  it("normalizes Telegram Business deleted message ids before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramBusinessDeletedMessages({
        store,
        businessConnectionId: " bc_123 ",
        providerChatId: " 777 ",
        providerMessageIds: [" 345 ", "346"],
        now
      })
    ).resolves.toEqual({ kind: "recorded", deletedCount: 2 });

    expect(store.telegramBusinessDeleteCommands).toEqual([
      {
        businessConnectionId: "bc_123",
        providerChatId: "777",
        providerMessageIds: ["345", "346"],
        now: now.toISOString()
      }
    ]);
  });

  it("normalizes Telegram Business voice messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramBusinessMessage({
        store,
        updateId: " 1008 ",
        businessConnectionId: " bc_123 ",
        providerMessageId: " 349 ",
        providerChatId: " 777 ",
        providerUserId: " 555 ",
        username: " marina ",
        displayName: " Marina ",
        chatUsername: " marina ",
        chatDisplayName: " Marina ",
        contentType: "voice",
        text: "  Голосовое сообщение (0:12)  ",
        mediaAttachment: {
          kind: "voice",
          providerFileId: " voice-file-id ",
          providerFileUniqueId: " voice-file-unique-id ",
          durationSeconds: 12,
          width: null,
          height: null,
          providerMimeType: " audio/ogg ",
          providerSizeBytes: 3210
        },
        providerSentAt: "2026-07-22T06:07:00.000Z",
        now
      })
    ).resolves.toMatchObject({ kind: "created" });

    expect(store.telegramBusinessMessageCommands).toEqual([
      expect.objectContaining({
        updateId: "1008",
        businessConnectionId: "bc_123",
        providerMessageId: "349",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
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
          providerSizeBytes: 3210
        },
        providerSentAt: "2026-07-22T06:07:00.000Z",
        now: now.toISOString()
      })
    ]);
  });

  it("normalizes Telegram Business image messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramBusinessMessage({
        store,
        updateId: "1009",
        businessConnectionId: "bc_123",
        providerMessageId: "350",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
        contentType: "image",
        text: "  Фото карты  ",
        mediaAttachment: {
          kind: "image",
          providerFileId: " image-file-id ",
          providerFileUniqueId: " image-file-unique-id ",
          durationSeconds: null,
          width: 1280,
          height: 720,
          providerMimeType: null,
          providerSizeBytes: 98765
        },
        providerSentAt: "2026-07-22T06:08:00.000Z",
        now
      })
    ).resolves.toMatchObject({ kind: "created" });

    expect(store.telegramBusinessMessageCommands.at(-1)).toEqual(
      expect.objectContaining({
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
      })
    );
  });

  it("normalizes Telegram Business video note messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramBusinessMessage({
        store,
        updateId: "1010",
        businessConnectionId: "bc_123",
        providerMessageId: "351",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
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
        },
        providerSentAt: "2026-07-22T06:09:00.000Z",
        now
      })
    ).resolves.toMatchObject({ kind: "created" });

    expect(store.telegramBusinessMessageCommands.at(-1)).toEqual(
      expect.objectContaining({
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
      })
    );
  });

  it("normalizes Telegram Business video messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramBusinessMessage({
        store,
        updateId: "1011",
        businessConnectionId: "bc_123",
        providerMessageId: "352",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
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
        },
        providerSentAt: "2026-07-22T06:10:00.000Z",
        now
      })
    ).resolves.toMatchObject({ kind: "created" });

    expect(store.telegramBusinessMessageCommands.at(-1)).toEqual(
      expect.objectContaining({
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
      })
    );
  });

  it("normalizes Telegram MTProto account messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramMtprotoMessage({
        store,
        channelConnectionId: " connection-1 ",
        leaseOwner: " notification-worker:pid-1 ",
        providerMessageId: " 4401 ",
        providerChatId: " 777 ",
        providerUserId: " 555 ",
        username: " marina ",
        displayName: " Marina ",
        isOutgoing: false,
        text: "  Хочу записаться  ",
        providerSentAt: "2026-07-28T10:04:00.000Z",
        cursor: {
          pts: 128,
          qts: null,
          dateCursor: "2026-07-28T10:04:01.000Z",
          seq: 9
        },
        now
      })
    ).resolves.toMatchObject({ kind: "created" });

    expect(store.telegramMtprotoMessageCommands).toEqual([
      {
        channelConnectionId: "connection-1",
        leaseOwner: "notification-worker:pid-1",
        providerMessageId: "4401",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        isOutgoing: false,
        text: "Хочу записаться",
        providerSentAt: "2026-07-28T10:04:00.000Z",
        cursor: {
          pts: 128,
          qts: null,
          dateCursor: "2026-07-28T10:04:01.000Z",
          seq: 9
        },
        now: now.toISOString()
      }
    ]);
  });

  it("rejects Telegram MTProto account messages without text", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramMtprotoMessage({
        store,
        channelConnectionId: "connection-1",
        leaseOwner: "notification-worker:pid-1",
        providerMessageId: "4402",
        providerChatId: "777",
        providerUserId: "555",
        username: null,
        displayName: null,
        isOutgoing: false,
        text: "   ",
        providerSentAt: "2026-07-28T10:04:00.000Z",
        now
      })
    ).rejects.toThrow(MessagingValidationError);
    expect(store.telegramMtprotoMessageCommands).toEqual([]);
  });

  it("normalizes Telegram Business edited messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordTelegramBusinessEditedMessage({
        store,
        updateId: " 1007 ",
        businessConnectionId: " bc_123 ",
        providerMessageId: " 345 ",
        providerChatId: " 777 ",
        text: "  Здравствуйте, исправлено  ",
        providerSentAt: "2026-07-22T06:01:00.000Z",
        providerEditedAt: "2026-07-22T06:06:00.000Z",
        now
      })
    ).resolves.toEqual({ kind: "recorded", updatedCount: 1 });

    expect(store.telegramBusinessEditCommands).toEqual([
      {
        updateId: "1007",
        businessConnectionId: "bc_123",
        providerMessageId: "345",
        providerChatId: "777",
        text: "Здравствуйте, исправлено",
        providerSentAt: "2026-07-22T06:01:00.000Z",
        providerEditedAt: "2026-07-22T06:06:00.000Z",
        now: now.toISOString()
      }
    ]);
  });

  it("normalizes Instagram Graph messages before passing them to the store", async () => {
    const store = new InMemoryMessagingStore();

    await recordInstagramGraphMessage({
      store,
      instagramAccountId: " ig-business-1 ",
      providerMessageId: " ig-mid-1 ",
      senderId: " ig-client-1 ",
      recipientId: " ig-business-1 ",
      text: "  Здравствуйте  ",
      providerSentAt: "2026-07-22T06:01:00.000Z",
      now
    });

    expect(store.instagramGraphMessageCommands).toEqual([
      {
        instagramAccountId: "ig-business-1",
        providerMessageId: "ig-mid-1",
        senderId: "ig-client-1",
        recipientId: "ig-business-1",
        text: "Здравствуйте",
        providerSentAt: "2026-07-22T06:01:00.000Z",
        now: now.toISOString()
      }
    ]);
  });
});

class InMemoryMessagingStore implements MessagingStore {
  readonly messages: MessagingMessage[] = [];
  readonly outboxEvents: MessagingOutboxEvent<Record<string, string>>[] = [];
  readonly realtimeEvents: MessagingRealtimeEvent[] = [];
  readonly markReadCommands: MarkThreadReadStoreInput[] = [];
  readonly linkClientCommands: Array<
    LinkThreadToClientStoreInput & {
      readonly idempotencyKey?: string;
      readonly requestHash?: string;
    }
  > = [];
  readonly createClientCommands: Array<{
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly displayName: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly now: string;
  }> = [];
  readonly startTelegramBusinessCommands: StartTelegramBusinessConnectionStoreInput[] = [];
  readonly bindTelegramBusinessConnectionUserCommands: BindTelegramBusinessConnectionUserStoreInput[] =
    [];
  readonly startInstagramGraphCommands: StartInstagramGraphConnectionStoreInput[] = [];
  readonly completeInstagramGraphCommands: CompleteInstagramGraphConnectionStoreInput[] = [];
  readonly revokeInstagramGraphCommands: RevokeInstagramGraphConnectionStoreInput[] = [];
  readonly startTelegramMtprotoCommands: StartTelegramMtprotoConnectionStoreInput[] = [];
  readonly telegramMtprotoCodeCommands: RecordTelegramMtprotoCodeResultStoreInput[] = [];
  readonly telegramMtprotoPasswordCommands: RecordTelegramMtprotoPasswordResultStoreInput[] = [];
  readonly telegramBusinessMessageCommands: RecordTelegramBusinessMessageStoreInput[] = [];
  readonly instagramGraphMessageCommands: RecordInstagramGraphMessageStoreInput[] = [];
  readonly telegramMtprotoMessageCommands: RecordTelegramMtprotoMessageStoreInput[] = [];
  readonly telegramBusinessDeleteCommands: RecordTelegramBusinessDeletedMessagesStoreInput[] = [];
  readonly telegramBusinessEditCommands: RecordTelegramBusinessEditedMessageStoreInput[] = [];
  readonly #threads = new Map<string, MessagingThread>([
    ["thread-1", createThread()],
    ["thread-2", createThread({ id: "thread-2", externalIdentityId: "identity-2" })]
  ]);
  readonly #requestHashes = new Map<string, `sha256:${string}`>();
  readonly #providerMessages = new Map<string, MessagingMessage>();
  readonly #threadClientRequests = new Map<
    string,
    { readonly requestHash: string; readonly thread: MessagingThread }
  >();
  readonly #activeClientUserIds = new Set(["client-existing"]);
  #nextRealtimeEventId = 1;
  #instagramGraphConnectionId: string | null = null;
  #telegramBusinessConnectionId: string | null = null;
  #telegramMtprotoConnectionId: string | null = null;
  #telegramMtprotoLoginSession: {
    readonly connectionId: string;
    readonly loginState: "code_required" | "password_required" | "authorized";
    readonly maskedPhoneNumber: string;
    readonly encryptedPhoneNumber: ReturnType<typeof encryptedSecretFixture>;
    readonly encryptedPhoneCodeHash: ReturnType<typeof encryptedSecretFixture>;
    readonly encryptedSession: ReturnType<typeof encryptedSecretFixture> | null;
  } | null = null;

  thread(threadId: string): MessagingThread | undefined {
    return this.#threads.get(threadId);
  }

  async findThreadForAstrologer(input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
  }): Promise<MessagingThread | null> {
    const thread = this.#threads.get(input.threadId);
    return thread?.astrologerUserId === input.astrologerUserId ? thread : null;
  }

  async findOutboundMessageByIdempotencyKey(input: {
    readonly threadId: string;
    readonly idempotencyKey: string;
  }): Promise<MessagingMessageWithRequestHash | null> {
    const message = this.messages.find(
      (candidate) =>
        candidate.threadId === input.threadId && candidate.idempotencyKey === input.idempotencyKey
    );
    if (!message) return null;
    return {
      ...message,
      requestHash: this.#requestHashes.get(`${input.threadId}:${input.idempotencyKey}`)!
    };
  }

  async createOutboundMessage(input: CreateOutboundMessageStoreInput): Promise<MessagingMessage> {
    const message = createMessage({
      id: input.messageId,
      threadId: input.threadId,
      channelConnectionId: input.channelConnectionId,
      text: input.text,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      updatedAt: input.now
    });
    this.messages.push(message);
    this.#requestHashes.set(`${input.threadId}:${input.idempotencyKey}`, input.requestHash);
    this.outboxEvents.push(input.deliveryRequestedEvent);
    return message;
  }

  async recordInboundProviderMessage(
    input: RecordInboundProviderMessageStoreInput
  ): Promise<InboundMessageRecordResult> {
    const key = `${input.channelConnectionId}:${input.externalIdentityId}:${input.providerMessageId}`;
    const existing = this.#providerMessages.get(key);
    if (existing) return { kind: "duplicate", message: existing };
    const message = createMessage({
      id: input.messageId,
      threadId: input.threadId,
      channelConnectionId: input.channelConnectionId,
      externalIdentityId: input.externalIdentityId,
      direction: "inbound",
      text: input.text,
      status: "received",
      providerMessageId: input.providerMessageId,
      idempotencyKey: null,
      createdAt: input.now,
      updatedAt: input.now
    });
    this.messages.push(message);
    this.#providerMessages.set(key, message);
    this.persistRealtimeEvent(input.receivedEvent);
    return { kind: "created", message };
  }

  async recordTelegramBusinessConnection(
    input: RecordTelegramBusinessConnectionStoreInput
  ): Promise<{ readonly kind: "recorded" }> {
    void input;
    return { kind: "recorded" };
  }

  async bindTelegramBusinessConnectionUser(
    input: BindTelegramBusinessConnectionUserStoreInput
  ): Promise<{ readonly kind: "recorded" }> {
    this.bindTelegramBusinessConnectionUserCommands.push(input);
    return { kind: "recorded" };
  }

  async recordTelegramBusinessMessage(
    input: RecordTelegramBusinessMessageStoreInput
  ): Promise<InboundMessageRecordResult> {
    this.telegramBusinessMessageCommands.push(input);
    return this.recordInboundProviderMessage({
      messageId: "message-telegram-business",
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: input.providerMessageId,
      text: input.text,
      now: input.now,
      receivedEvent: {
        astrologerUserId,
        type: messagingMessageReceivedEventType,
        occurredAt: input.now,
        threadId: "thread-1",
        messageId: "message-telegram-business",
        channelConnectionId: "connection-1",
        externalIdentityId: "identity-1"
      }
    });
  }

  async recordInstagramGraphMessage(
    input: RecordInstagramGraphMessageStoreInput
  ): Promise<InboundMessageRecordResult> {
    this.instagramGraphMessageCommands.push(input);
    return this.recordInboundProviderMessage({
      messageId: "message-instagram-graph",
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-instagram",
      externalIdentityId: "identity-1",
      providerMessageId: input.providerMessageId,
      text: input.text,
      now: input.now,
      receivedEvent: {
        astrologerUserId,
        type: messagingMessageReceivedEventType,
        occurredAt: input.now,
        threadId: "thread-1",
        messageId: "message-instagram-graph",
        channelConnectionId: "connection-instagram",
        externalIdentityId: "identity-1"
      }
    });
  }

  async recordTelegramMtprotoMessage(
    input: RecordTelegramMtprotoMessageStoreInput
  ): Promise<InboundMessageRecordResult> {
    this.telegramMtprotoMessageCommands.push(input);
    return this.recordInboundProviderMessage({
      messageId: "message-telegram-mtproto",
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: input.channelConnectionId,
      externalIdentityId: "identity-1",
      providerMessageId: input.providerMessageId,
      text: input.text,
      now: input.now,
      receivedEvent: {
        astrologerUserId,
        type: messagingMessageReceivedEventType,
        occurredAt: input.now,
        threadId: "thread-1",
        messageId: "message-telegram-mtproto",
        channelConnectionId: input.channelConnectionId,
        externalIdentityId: "identity-1"
      }
    });
  }

  async recordTelegramBusinessDeletedMessages(
    input: RecordTelegramBusinessDeletedMessagesStoreInput
  ): Promise<{ readonly kind: "recorded"; readonly deletedCount: number }> {
    this.telegramBusinessDeleteCommands.push(input);
    return { kind: "recorded", deletedCount: input.providerMessageIds.length };
  }

  async recordTelegramBusinessEditedMessage(
    input: RecordTelegramBusinessEditedMessageStoreInput
  ): Promise<{ readonly kind: "recorded"; readonly updatedCount: number }> {
    this.telegramBusinessEditCommands.push(input);
    return { kind: "recorded", updatedCount: 1 };
  }

  async startTelegramBusinessConnection(
    input: StartTelegramBusinessConnectionStoreInput
  ): Promise<{ readonly connectionId: string }> {
    this.startTelegramBusinessCommands.push(input);
    this.#telegramBusinessConnectionId ??= input.connectionId;
    return { connectionId: this.#telegramBusinessConnectionId };
  }

  async startInstagramGraphConnection(
    input: StartInstagramGraphConnectionStoreInput
  ): Promise<{ readonly connectionId: string }> {
    this.startInstagramGraphCommands.push(input);
    this.#instagramGraphConnectionId ??= input.connectionId;
    return { connectionId: this.#instagramGraphConnectionId };
  }

  async completeInstagramGraphConnection(
    input: CompleteInstagramGraphConnectionStoreInput
  ): Promise<{ readonly kind: "recorded" | "unmatched" }> {
    this.completeInstagramGraphCommands.push(input);
    return {
      kind: this.#instagramGraphConnectionId === input.connectionId ? "recorded" : "unmatched"
    };
  }

  async revokeInstagramGraphConnectionByMetaUserId(
    input: RevokeInstagramGraphConnectionStoreInput
  ): Promise<{ readonly kind: "recorded" | "unmatched" }> {
    this.revokeInstagramGraphCommands.push(input);
    return { kind: "recorded" };
  }

  async startTelegramMtprotoConnection(input: StartTelegramMtprotoConnectionStoreInput): Promise<{
    readonly connectionId: string;
    readonly loginStep: "code_required";
    readonly maskedPhoneNumber: string;
  }> {
    this.startTelegramMtprotoCommands.push(input);
    this.#telegramMtprotoConnectionId ??= input.connectionId;
    this.#telegramMtprotoLoginSession ??= {
      connectionId: this.#telegramMtprotoConnectionId,
      loginState: "code_required",
      maskedPhoneNumber: input.maskedPhoneNumber,
      encryptedPhoneNumber: input.encryptedPhoneNumber,
      encryptedPhoneCodeHash: input.encryptedPhoneCodeHash,
      encryptedSession: null
    };
    return {
      connectionId: this.#telegramMtprotoConnectionId,
      loginStep: "code_required",
      maskedPhoneNumber: input.maskedPhoneNumber
    };
  }

  async findTelegramMtprotoLoginSession(input: {
    readonly astrologerUserId: string;
    readonly connectionId: string;
  }) {
    if (input.astrologerUserId !== astrologerUserId) return null;
    if (this.#telegramMtprotoLoginSession?.connectionId !== input.connectionId) return null;
    return this.#telegramMtprotoLoginSession;
  }

  async recordTelegramMtprotoCodeResult(input: RecordTelegramMtprotoCodeResultStoreInput) {
    this.telegramMtprotoCodeCommands.push(input);
    if (this.#telegramMtprotoLoginSession?.connectionId !== input.connectionId) {
      throw new Error("Unexpected Telegram Account connection");
    }
    this.#telegramMtprotoLoginSession = {
      ...this.#telegramMtprotoLoginSession,
      loginState: input.loginStep === "connected" ? "authorized" : "password_required",
      encryptedSession: input.encryptedSession
    };
    return {
      connectionId: input.connectionId,
      loginStep: input.loginStep,
      maskedPhoneNumber: this.#telegramMtprotoLoginSession.maskedPhoneNumber
    };
  }

  async recordTelegramMtprotoPasswordResult(input: RecordTelegramMtprotoPasswordResultStoreInput) {
    this.telegramMtprotoPasswordCommands.push(input);
    if (this.#telegramMtprotoLoginSession?.connectionId !== input.connectionId) {
      throw new Error("Unexpected Telegram Account connection");
    }
    this.#telegramMtprotoLoginSession = {
      ...this.#telegramMtprotoLoginSession,
      loginState: "authorized",
      encryptedSession: input.encryptedSession
    };
    return {
      connectionId: input.connectionId,
      loginStep: "connected" as const,
      maskedPhoneNumber: this.#telegramMtprotoLoginSession.maskedPhoneNumber
    };
  }

  async linkThreadToClient(input: LinkThreadToClientStoreInput): Promise<MessagingThread> {
    const existing = this.#threadClientRequests.get(input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new MessagingIdempotencyConflictError();
      return existing.thread;
    }
    if (!this.#activeClientUserIds.has(input.clientUserId))
      throw new MessagingClientRelationshipError();
    this.linkClientCommands.push(input);
    const thread = this.#threads.get(input.threadId)!;
    const updated = { ...thread, clientUserId: input.clientUserId, updatedAt: input.now };
    this.#threads.set(updated.id, updated);
    this.#threadClientRequests.set(input.idempotencyKey, {
      requestHash: input.requestHash,
      thread: updated
    });
    return updated;
  }

  async createClientFromThread(input: CreateClientFromThreadStoreInput): Promise<MessagingThread> {
    const existing = this.#threadClientRequests.get(input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new MessagingIdempotencyConflictError();
      return existing.thread;
    }
    const thread = this.#threads.get(input.threadId)!;
    const updated = { ...thread, clientUserId: "client-created", updatedAt: input.now };
    this.#threads.set(updated.id, updated);
    this.createClientCommands.push(input);
    this.#activeClientUserIds.add("client-created");
    this.#threadClientRequests.set(input.idempotencyKey, {
      requestHash: input.requestHash,
      thread: updated
    });
    return updated;
  }

  async markThreadRead(input: MarkThreadReadStoreInput): Promise<MarkThreadReadStoreResult> {
    const thread = this.#threads.get(input.threadId)!;
    const updated = { ...thread, unreadAstrologerCount: 0, updatedAt: input.now };
    this.#threads.set(updated.id, updated);
    this.markReadCommands.push(input);
    return { thread: updated, realtimeEvent: this.persistRealtimeEvent(input.realtimeEvent) };
  }

  async appendRealtimeEvent(
    input: AppendMessagingRealtimeEventInput
  ): Promise<MessagingRealtimeEvent> {
    return this.persistRealtimeEvent(input);
  }

  async findExternalIdentityForThread(input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly externalIdentityId: string;
  }): Promise<{ readonly id: string; readonly channelConnectionId: string } | null> {
    const thread = await this.findThreadForAstrologer(input);
    if (thread?.externalIdentityId !== input.externalIdentityId) return null;
    return { id: input.externalIdentityId, channelConnectionId: thread.channelConnectionId };
  }

  private persistRealtimeEvent(input: AppendMessagingRealtimeEventInput): MessagingRealtimeEvent {
    const event = {
      ...input,
      eventId: this.#nextRealtimeEventId.toString().padStart(20, "0")
    };
    this.#nextRealtimeEventId += 1;
    this.realtimeEvents.push(event);
    return event;
  }
}

function createThread(overrides: Partial<MessagingThread> = {}): MessagingThread {
  return {
    id: "thread-1",
    astrologerUserId,
    clientUserId: null,
    channelConnectionId: "connection-1",
    externalIdentityId: "identity-1",
    status: "open",
    lastMessageAt: null,
    unreadAstrologerCount: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createMessage(overrides: Partial<MessagingMessage> = {}): MessagingMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    channelConnectionId: "connection-1",
    externalIdentityId: "identity-1",
    direction: "outbound",
    text: "Hello, client.",
    status: "queued",
    providerMessageId: null,
    idempotencyKey: "send-message-001",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createIdGenerator(prefix = "id"): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function encryptedSecretFixture(ciphertext: string) {
  return {
    algorithm: "aes-256-gcm" as const,
    keyId: "mtproto-key-1",
    iv: "base64-iv",
    authTag: "base64-tag",
    ciphertext
  };
}
