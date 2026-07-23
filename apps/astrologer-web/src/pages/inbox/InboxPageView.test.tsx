import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  MessagingChannelConnection,
  MessagingMessage,
  MessagingThread
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { InboxPageView, type InboxPageViewProps } from "./InboxPageView";

describe("InboxPageView", () => {
  it("renders Telegram Business setup state without pretending MTProto is available", () => {
    const markup = renderToStaticMarkup(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        threads={[]}
        selectedThreadResponse={null}
      />
    );

    expect(markup).toContain("Подключить Telegram Business");
    expect(markup).toContain("Telegram Account");
    expect(markup).toContain("Будет доступно позже");
    expect(markup).not.toContain("Подключить Instagram");
  });

  it("renders thread list, selected messages and unlinked chat actions", () => {
    const markup = renderToStaticMarkup(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection()]}
        threads={[threadFixture({ clientUserId: null, unreadCount: 2 })]}
        selectedThreadResponse={{
          thread: threadFixture({ clientUserId: null, unreadCount: 2 }),
          messages: [inboundMessage(), outboundMessage({ status: "sent" })],
          nextCursor: null
        }}
      />
    );

    expect(markup).toContain("Марина Краснова");
    expect(markup).toContain("Telegram");
    expect(markup).toContain("2");
    expect(markup).toContain("Когда будет готов разбор?");
    expect(markup).toContain("Черновик уже готов");
    expect(markup).toContain("Связать клиента");
    expect(markup).toContain("Создать клиента");
    expect(markup).toContain("CRM client user id");
    expect(markup).toContain("Имя нового клиента");
  });

  it("renders selected thread messages chronologically even when the API page is newest-first", () => {
    const markup = renderToStaticMarkup(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection()]}
        threads={[threadFixture({})]}
        selectedThreadResponse={{
          thread: threadFixture({}),
          messages: [
            outboundMessage({
              status: "queued",
              text: "Отвечаю вторым",
              createdAt: "2026-07-22T10:02:00.000Z"
            }),
            inboundMessage({
              text: "Пишу первым",
              createdAt: "2026-07-22T10:00:00.000Z"
            })
          ],
          nextCursor: null
        }}
      />
    );

    expect(markup.indexOf("Пишу первым")).toBeLessThan(markup.indexOf("Отвечаю вторым"));
  });


  it("shows delivery states and disables composer while send is unavailable", () => {
    const markup = renderToStaticMarkup(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection({ canSend: false })]}
        threads={[threadFixture({ clientUserId: "22222222-2222-4222-8222-222222222222" })]}
        selectedThreadResponse={{
          thread: threadFixture({ clientUserId: "22222222-2222-4222-8222-222222222222" }),
          messages: [outboundMessage({ status: "queued" }), outboundMessage({ status: "failed" })],
          nextCursor: null
        }}
        draft="Ответ"
      />
    );

    expect(markup).toContain("В очереди");
    expect(markup).toContain("Не доставлено");
    expect(markup).toContain("Нет прав на отправку");
    expect(markup).toContain("disabled=\"\"");
  });

  it("keeps the production mobile layout as a responsive state, not a separate app", () => {
    const css = readFileSync(new URL("./InboxPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.mobileThreadBack\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/@media \(max-width: 860px\)[\s\S]*\.contextPanel\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media \(max-width: 860px\)[\s\S]*\.mobileThreadBack\s*\{[^}]*display:\s*inline-flex/s
    );
  });
});

function baseProps(): InboxPageViewProps {
  return {
    channelConnections: [telegramConnection()],
    threads: [],
    selectedThreadId: null,
    selectedThreadResponse: null,
    isConnectionsLoading: false,
    isThreadsLoading: false,
    isThreadsError: false,
    isThreadLoading: false,
    isThreadError: false,
    isSending: false,
    sendError: null,
    draft: "",
    search: "",
    onSearchChange: vi.fn(),
    onSelectThread: vi.fn(),
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onMarkRead: vi.fn(),
    linkClientUserId: "",
    createClientDisplayName: "",
    isLinkingClient: false,
    isCreatingClient: false,
    clientActionError: null,
    onLinkClientUserIdChange: vi.fn(),
    onCreateClientDisplayNameChange: vi.fn(),
    onLinkClientSubmit: vi.fn(),
    onCreateClientSubmit: vi.fn()
  };
}

function telegramConnection(
  override: Partial<MessagingChannelConnection["capabilities"]> = {}
): MessagingChannelConnection {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "telegram",
    mode: "telegram_business_bot",
    status: "active",
    displayName: "Алиса Вега",
    username: "alisa_vega",
    capabilities: {
      canRead: true,
      canReceive: true,
      canSend: true,
      supportsAttachments: false,
      supportsHistoryImport: false,
      supportsMessageDeletes: false,
      supportsMessageEdits: false,
      ...override
    },
    connectedAt: "2026-07-22T09:00:00.000Z",
    lastSyncedAt: "2026-07-22T10:00:00.000Z",
    lastErrorCode: null
  };
}

function threadFixture(input: {
  readonly clientUserId?: string | null;
  readonly unreadCount?: number;
}): MessagingThread {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clientUserId: input.clientUserId ?? null,
    status: "open",
    primaryIdentity: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      provider: "telegram",
      providerUserId: "4242",
      providerChatId: "4242",
      username: "marina",
      displayName: "Марина Краснова",
      avatarMediaId: null,
      linkedClientUserId: input.clientUserId ?? null,
      linkStatus: input.clientUserId ? "linked" : "unlinked",
      firstSeenAt: "2026-07-22T09:00:00.000Z",
      lastSeenAt: "2026-07-22T10:00:00.000Z"
    },
    lastMessage: inboundMessage(),
    lastMessageAt: "2026-07-22T10:00:00.000Z",
    unreadCount: input.unreadCount ?? 0,
    createdAt: "2026-07-22T09:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  };
}

function inboundMessage(input: Partial<MessagingMessage> = {}): MessagingMessage {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    channelConnectionId: "11111111-1111-4111-8111-111111111111",
    externalIdentityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    direction: "inbound",
    senderKind: "client",
    contentType: "text",
    text: "Когда будет готов разбор?",
    mediaAssetId: null,
    status: "received",
    failureCode: null,
    providerSentAt: "2026-07-22T10:00:00.000Z",
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...input
  };
}

function outboundMessage(
  input: { readonly status: MessagingMessage["status"] } & Partial<MessagingMessage>
): MessagingMessage {
  const { status, ...override } = input;

  return {
    ...inboundMessage(),
    id: crypto.randomUUID(),
    direction: "outbound",
    senderKind: "astrologer",
    text: "Черновик уже готов",
    status,
    failureCode: status === "failed" ? "provider_error" : null,
    ...override
  };
}
