// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  MessagingChannelConnection,
  MessagingMessage,
  MessagingThread
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxPageView, type InboxPageViewProps, type InboxThreadFilter } from "./InboxPageView";

describe("InboxPageView", () => {
  afterEach(() => cleanup());

  it("renders Telegram Business setup state without pretending MTProto is available", () => {
    const markup = renderStatic(
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

  it("keeps connected Telegram inbox focused on dialogs instead of setup cards", () => {
    const markup = renderStatic(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection()]}
        threads={[threadFixture({})]}
      />
    );

    expect(markup).not.toContain("Подключить Telegram Business");
    expect(markup).not.toContain("Telegram Account");
    expect(markup).toContain("Каналы:");
    expect(markup).toContain("Поиск по диалогам...");
    expect(markup).toContain("Непрочит.");
    expect(markup).not.toContain("Внутренний чат");
    expect(markup).not.toContain("Instagram");
    expect(markup).not.toContain("Max");
  });

  it("renders thread filter chips as working buttons", () => {
    const onThreadFilterChange = vi.fn();
    const activeFilter: InboxThreadFilter = "telegram";

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection()]}
        activeThreadFilter={activeFilter}
        onThreadFilterChange={onThreadFilterChange}
      />
    );

    expect(screen.getByRole("button", { name: "T Telegram" }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Все" }));
    fireEvent.click(screen.getByRole("button", { name: "Непрочит." }));

    expect(onThreadFilterChange).toHaveBeenCalledWith("all");
    expect(onThreadFilterChange).toHaveBeenCalledWith("unread");
  });

  it("starts Telegram Business connection from the setup card and renders pending state", () => {
    const onStartTelegramBusinessConnection = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection({}, { status: "connecting" })]}
        isStartingTelegramBusinessConnection={false}
        onStartTelegramBusinessConnection={onStartTelegramBusinessConnection}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Ожидаем Telegram" })[0]!);

    expect(onStartTelegramBusinessConnection).toHaveBeenCalledWith();
    expect(screen.getByText("Ожидает подтверждения")).toBeTruthy();
  });

  it("disables Telegram Business start while active or already starting", () => {
    const activeMarkup = renderStatic(
      <InboxPageView {...baseProps()} channelConnections={[telegramConnection()]} />
    );
    const startingMarkup = renderStatic(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isStartingTelegramBusinessConnection
      />
    );

    expect(activeMarkup).toContain("Подключено");
    expect(activeMarkup).toContain('disabled=""');
    expect(startingMarkup).toContain("Открываем Telegram");
    expect(startingMarkup).toContain('disabled=""');
  });

  it("renders thread list, selected messages and unlinked chat actions", () => {
    const markup = renderStatic(
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
    expect(markup).toContain("Связать чат");
    expect(markup).not.toContain("AI-черновик ответа");
    expect(markup).not.toContain("Видеозвонок");
    expect(markup).not.toContain("CRM client user id");
    expect(markup).not.toContain("UUID клиента");
    expect(markup).toContain("Выберите клиента");
    expect(markup).toContain("Имя нового клиента");
  });

  it("links an unlinked chat through a selected CRM client instead of a UUID field", () => {
    const onLinkClientSubmit = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection()]}
        threads={[threadFixture({ clientUserId: null })]}
        selectedThreadResponse={{
          thread: threadFixture({ clientUserId: null }),
          messages: [inboundMessage()],
          nextCursor: null
        }}
        linkClientUserId="22222222-2222-4222-8222-222222222222"
        linkClient={clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова")}
        onLinkClientSubmit={onLinkClientSubmit}
      />
    );

    expect(screen.queryByText("CRM client user id")).toBeNull();
    expect(screen.queryByPlaceholderText("UUID клиента")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Клиент" }).textContent).toContain(
      "Марина Краснова"
    );

    fireEvent.click(screen.getByRole("button", { name: "Связать клиента" }));

    expect(onLinkClientSubmit).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("does not render Telegram provider ids as client contact handles", () => {
    const markup = renderStatic(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection()]}
        threads={[
          threadFixture({
            providerUserId: "8954259054",
            providerChatId: "8954259054",
            username: null
          })
        ]}
        selectedThreadResponse={{
          thread: threadFixture({
            providerUserId: "8954259054",
            providerChatId: "8954259054",
            username: null
          }),
          messages: [inboundMessage()],
          nextCursor: null
        }}
      />
    );

    expect(markup).not.toContain("8954259054");
    expect(markup).toContain("Username не передан");
  });

  it("renders selected thread messages chronologically even when the API page is newest-first", () => {
    const markup = renderStatic(
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
    const markup = renderStatic(
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
    expect(markup).toContain('disabled=""');
  });

  it("renders voice media states and loads audio source only for ready messages", async () => {
    const onLoadMessageMediaSource = vi.fn(async () => ({
      url: "https://storage.example/private/voice.ogg?signed=1",
      expiresAt: "2026-07-22T10:05:00.000Z",
      mimeType: "audio/ogg"
    }));
    renderWithClient(
      <InboxPageView
        {...baseProps()}
        onLoadMessageMediaSource={onLoadMessageMediaSource}
        channelConnections={[telegramConnection()]}
        threads={[threadFixture({})]}
        selectedThreadResponse={{
          thread: threadFixture({}),
          messages: [
            voiceMessage("pending"),
            voiceMessage("failed", { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }),
            voiceMessage("ready", { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" })
          ],
          nextCursor: null
        }}
      />
    );

    expect(screen.getByLabelText("Голос загружается")).toBeTruthy();
    expect(screen.getByText("Голосовое сообщение недоступно")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Воспроизвести голосовое" })).toBeNull();
    expect(screen.queryAllByText("Голосовое сообщение (0:12)")).toHaveLength(0);

    expect(await screen.findByRole("button", { name: "Воспроизвести голосовое" })).toBeTruthy();
    expect(screen.getAllByText("0:12")).toHaveLength(2);
    expect(onLoadMessageMediaSource).toHaveBeenCalledWith("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  });

  it("renders image and video media states from Telegram Business messages", async () => {
    const onLoadMessageMediaSource = vi.fn(async (messageId: string) => {
      if (messageId === "image-ready") {
        return {
          url: "https://storage.example/private/image.jpg?signed=1",
          expiresAt: "2026-07-22T10:05:00.000Z",
          mimeType: "image/jpeg"
        };
      }
      if (messageId === "video-ready") {
        return {
          url: "https://storage.example/private/video.mp4?signed=1",
          expiresAt: "2026-07-22T10:05:00.000Z",
          mimeType: "video/mp4"
        };
      }
      return {
        url: "https://storage.example/private/video-note.mp4?signed=1",
        expiresAt: "2026-07-22T10:05:00.000Z",
        mimeType: "video/mp4"
      };
    });

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        onLoadMessageMediaSource={onLoadMessageMediaSource}
        channelConnections={[telegramConnection()]}
        threads={[threadFixture({ lastMessage: videoNoteMessage("ready") })]}
        selectedThreadResponse={{
          thread: threadFixture({}),
          messages: [imageMessage("ready"), videoNoteMessage("ready"), videoMessage("ready")],
          nextCursor: null
        }}
      />
    );

    expect(screen.queryByRole("button", { name: "Показать изображение" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Воспроизвести видео" })).toBeNull();
    expect(screen.queryByText("Фото карты")).toBeNull();
    expect(screen.queryByText("Видео кружок (0:07)")).toBeNull();
    expect(screen.queryByText("Расклад по дому")).toBeNull();
    expect(screen.getByLabelText("Загружаем изображение")).toBeTruthy();
    expect(screen.getAllByLabelText("Загружаем видео")).toHaveLength(2);

    expect((await screen.findByAltText("Фото карты")).getAttribute("src")).toBe(
      "https://storage.example/private/image.jpg?signed=1"
    );
    expect((await screen.findByLabelText("Видео кружок")).getAttribute("src")).toBe(
      "https://storage.example/private/video-note.mp4?signed=1"
    );
    expect((await screen.findByLabelText("Видео")).getAttribute("src")).toBe(
      "https://storage.example/private/video.mp4?signed=1"
    );
    expect(onLoadMessageMediaSource).toHaveBeenCalledWith("image-ready");
    expect(onLoadMessageMediaSource).toHaveBeenCalledWith("video-note-ready");
    expect(onLoadMessageMediaSource).toHaveBeenCalledWith("video-ready");
  });

  it("keeps the production mobile layout as a responsive state, not a separate app", () => {
    const css = readFileSync(
      join(process.cwd(), "apps/astrologer-web/src/pages/inbox/InboxPage.module.css"),
      "utf8"
    );

    expect(css).toMatch(/\.mobileThreadBack\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media \(max-width: 860px\)[\s\S]*\.contextPanel\s*\{[^}]*display:\s*none/s
    );
    expect(css).toMatch(
      /@media \(max-width: 860px\)[\s\S]*\.mobileThreadBack\s*\{[^}]*display:\s*inline-flex/s
    );
  });
});

function renderWithClient(element: ReactElement) {
  return render(wrapWithQueryClient(element));
}

function renderStatic(element: ReactElement): string {
  return renderToStaticMarkup(wrapWithQueryClient(element));
}

function wrapWithQueryClient(element: ReactElement): ReactElement {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
          }
        })
      }
    >
      {element}
    </QueryClientProvider>
  );
}

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
    activeThreadFilter: "all",
    onSearchChange: vi.fn(),
    onThreadFilterChange: vi.fn(),
    onSelectThread: vi.fn(),
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onMarkRead: vi.fn(),
    isStartingTelegramBusinessConnection: false,
    telegramBusinessStartError: null,
    onStartTelegramBusinessConnection: vi.fn(),
    linkClientUserId: "",
    linkClient: null,
    createClientDisplayName: "",
    isLinkingClient: false,
    isCreatingClient: false,
    clientActionError: null,
    onLinkClientSelect: vi.fn(),
    onCreateClientDisplayNameChange: vi.fn(),
    onLinkClientSubmit: vi.fn(),
    onCreateClientSubmit: vi.fn(),
    onLoadMessageMediaSource: vi.fn()
  };
}

function clientOption(value: string, label: string): NonNullable<InboxPageViewProps["linkClient"]> {
  return {
    value,
    label,
    initials: "МК",
    subtitle: "14.03.1990 · Москва",
    birthDateDisplay: "14.03.1990",
    hasBirthDate: true,
    birthData: null
  };
}

function telegramConnection(
  override: Partial<MessagingChannelConnection["capabilities"]> = {},
  connectionOverride: Partial<MessagingChannelConnection> = {}
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
    lastErrorCode: null,
    ...connectionOverride
  };
}

function threadFixture(input: {
  readonly clientUserId?: string | null;
  readonly unreadCount?: number;
  readonly providerUserId?: string | null;
  readonly providerChatId?: string;
  readonly username?: string | null;
  readonly lastMessage?: MessagingMessage;
}): MessagingThread {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clientUserId: input.clientUserId ?? null,
    status: "open",
    primaryIdentity: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      provider: "telegram",
      providerUserId: input.providerUserId ?? "4242",
      providerChatId: input.providerChatId ?? "4242",
      username: input.username === undefined ? "marina" : input.username,
      displayName: "Марина Краснова",
      avatarMediaId: null,
      linkedClientUserId: input.clientUserId ?? null,
      linkStatus: input.clientUserId ? "linked" : "unlinked",
      firstSeenAt: "2026-07-22T09:00:00.000Z",
      lastSeenAt: "2026-07-22T10:00:00.000Z"
    },
    lastMessage: input.lastMessage ?? inboundMessage(),
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
    media: null,
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

function voiceMessage(
  status: NonNullable<MessagingMessage["media"]>["status"],
  input: Partial<MessagingMessage> = {}
): MessagingMessage {
  return inboundMessage({
    id: `voice-${status}`,
    contentType: "voice",
    text: "Голосовое сообщение (0:12)",
    mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999998" : null,
    media: {
      mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999998" : null,
      kind: "voice",
      status,
      durationSeconds: 12,
      width: null,
      height: null,
      mimeType: "audio/ogg",
      sizeBytes: 2048
    },
    ...input
  });
}

function imageMessage(
  status: NonNullable<MessagingMessage["media"]>["status"],
  input: Partial<MessagingMessage> = {}
): MessagingMessage {
  return inboundMessage({
    id: `image-${status}`,
    contentType: "image",
    text: "Фото карты",
    mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999997" : null,
    media: {
      mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999997" : null,
      kind: "image",
      status,
      durationSeconds: null,
      width: 1280,
      height: 720,
      mimeType: "image/jpeg",
      sizeBytes: 98765
    },
    ...input
  });
}

function videoNoteMessage(
  status: NonNullable<MessagingMessage["media"]>["status"],
  input: Partial<MessagingMessage> = {}
): MessagingMessage {
  return inboundMessage({
    id: `video-note-${status}`,
    contentType: "video_note",
    text: "Видео кружок (0:07)",
    mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999996" : null,
    media: {
      mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999996" : null,
      kind: "video_note",
      status,
      durationSeconds: 7,
      width: 384,
      height: 384,
      mimeType: "video/mp4",
      sizeBytes: 456789
    },
    ...input
  });
}

function videoMessage(
  status: NonNullable<MessagingMessage["media"]>["status"],
  input: Partial<MessagingMessage> = {}
): MessagingMessage {
  return inboundMessage({
    id: `video-${status}`,
    contentType: "video",
    text: "Расклад по дому",
    mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999995" : null,
    media: {
      mediaAssetId: status === "ready" ? "99999999-9999-4999-8999-999999999995" : null,
      kind: "video",
      status,
      durationSeconds: 18,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
      sizeBytes: 7654321
    },
    ...input
  });
}
