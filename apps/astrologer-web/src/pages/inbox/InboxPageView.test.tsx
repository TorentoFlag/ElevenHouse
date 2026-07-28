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

  it("renders a lean empty inbox setup state without channel setup cards", () => {
    const markup = renderStatic(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        threads={[]}
        selectedThreadResponse={null}
      />
    );

    expect(markup).toContain("Подключить канал");
    expect(markup).toContain("Поиск по диалогам...");
    expect(markup).toContain("Пока нет диалогов. Подключите Telegram.");
    expect(markup).not.toContain("Telegram Account");
    expect(markup).not.toContain("Будет доступно позже");
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

  it("shows only connected channel badges next to the connect button", () => {
    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[
          telegramConnection(),
          telegramConnection(
            {},
            {
              id: "22222222-2222-4222-8222-222222222222",
              status: "connecting",
              displayName: "Ожидающий Telegram",
              username: "pending_telegram"
            }
          ),
          instagramConnection()
        ]}
      />
    );

    expect(screen.getByLabelText("Подключен Telegram: Алиса Вега")).toBeTruthy();
    expect(screen.getByLabelText("Подключен Instagram: Instagram")).toBeTruthy();
    expect(screen.queryByLabelText("Подключен Telegram: Ожидающий Telegram")).toBeNull();
    expect(screen.getByRole("button", { name: "Подключить канал" })).toBeTruthy();
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

  it("opens channel selection before Telegram-specific connection steps", () => {
    renderWithClient(
      <InboxPageView {...baseProps()} channelConnections={[]} isTelegramBusinessGuideOpen />
    );

    expect(screen.getByRole("dialog", { name: "Каналы" })).toBeTruthy();
    expect(
      screen.getByText("Подключите канал, через который клиенты будут писать вам.")
    ).toBeTruthy();
    expect(screen.getByText("Telegram")).toBeTruthy();
    expect(screen.getByText("Instagram")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Выбрать Telegram" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Выбрать Instagram" })).toBeTruthy();
  });

  it("opens Instagram guide and starts the Meta connection flow", () => {
    const onStartInstagramGraphConnection = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isTelegramBusinessGuideOpen
        onStartInstagramGraphConnection={onStartInstagramGraphConnection}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Instagram" }));

    expect(screen.getByRole("dialog", { name: "Подключить Instagram" })).toBeTruthy();
    expect(
      screen.getByText("Instagram подключается через официальный Meta Graph API.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Продолжить в Meta" }));

    expect(onStartInstagramGraphConnection).toHaveBeenCalledWith();
  });

  it("opens Telegram method selection before the Secretary bot guide", () => {
    const onStartTelegramBusinessConnection = vi.fn();
    const onOpenTelegramBusinessGuide = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isTelegramBusinessGuideOpen
        isStartingTelegramBusinessConnection={false}
        onOpenTelegramBusinessGuide={onOpenTelegramBusinessGuide}
        onStartTelegramBusinessConnection={onStartTelegramBusinessConnection}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Telegram" }));

    expect(screen.getByRole("dialog", { name: "Telegram" })).toBeTruthy();
    expect(screen.getByText("Telegram Business / Secretary bot")).toBeTruthy();
    expect(screen.getByText("Telegram Account / MTProto")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Настроить Telegram Business" }));

    expect(onStartTelegramBusinessConnection).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Подключить Telegram Business" })).toBeTruthy();
    expect(onOpenTelegramBusinessGuide).not.toHaveBeenCalled();
  });

  it("keeps the Telegram Account MTProto method visible but disabled for later", () => {
    const onStartTelegramMtprotoConnection = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isTelegramBusinessGuideOpen
        telegramMtprotoPhoneNumber="+78005553535"
        isTelegramMtprotoConsentAccepted
        onStartTelegramMtprotoConnection={onStartTelegramMtprotoConnection}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Telegram" }));
    const mtprotoMethod = screen.getByRole("button", { name: "Telegram Account скоро" });

    expect(mtprotoMethod.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Будет доступно позже")).toBeTruthy();
    fireEvent.click(mtprotoMethod);

    expect(screen.getByRole("dialog", { name: "Telegram" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Подключить Telegram Account" })).toBeNull();
    expect(screen.queryByLabelText("Номер телефона Telegram")).toBeNull();
    expect(
      screen.queryByText("MTProto подключает ElevenHouse как новый Telegram-клиент.")
    ).toBeNull();
    expect(onStartTelegramMtprotoConnection).not.toHaveBeenCalled();
  });

  it("enables composer through the selected thread MTProto connection", () => {
    const mtprotoConnection = telegramConnection(
      {},
      {
        id: "99999999-9999-4999-8999-999999999999",
        mode: "telegram_mtproto_account",
        displayName: "Личный Telegram",
        username: null
      }
    );
    const markup = renderStatic(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection({}, { status: "revoked" }), mtprotoConnection]}
        threads={[
          threadFixture({
            channelConnectionId: "99999999-9999-4999-8999-999999999999"
          })
        ]}
        selectedThreadResponse={{
          thread: threadFixture({
            channelConnectionId: "99999999-9999-4999-8999-999999999999"
          }),
          messages: [inboundMessage()],
          nextCursor: null
        }}
        draft="Ответ"
      />
    );

    expect(markup).toContain("Ответить через Telegram...");
    expect(markup).not.toContain("Нет прав на отправку");
  });

  it("starts the Secretary bot connection from the Telegram Business guide", () => {
    const onOpenTelegramBusinessGuide = vi.fn();
    const onStartTelegramBusinessConnection = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isTelegramBusinessGuideOpen
        onOpenTelegramBusinessGuide={onOpenTelegramBusinessGuide}
        onStartTelegramBusinessConnection={onStartTelegramBusinessConnection}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Telegram" }));
    fireEvent.click(screen.getByRole("button", { name: "Настроить Telegram Business" }));

    expect(screen.getByText("Настройки → Telegram Business → Чат-боты")).toBeTruthy();
    expect(
      screen.getByText("Нажмите «Создать подключение», чтобы получить username бота.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Создать подключение" }));

    expect(onStartTelegramBusinessConnection).toHaveBeenCalledWith();
    expect(onOpenTelegramBusinessGuide).not.toHaveBeenCalled();
  });

  it("keeps Telegram Business guide on opening Telegram after the bot username appears", () => {
    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isTelegramBusinessGuideOpen
        telegramBusinessBotUsername="elevenhouse_test_bot"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Telegram" }));
    fireEvent.click(screen.getByRole("button", { name: "Настроить Telegram Business" }));

    expect(
      screen.getByRole("button", { name: "Шаг 2: Открыть Telegram" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(screen.getByText("Откройте настройки Telegram Business")).toBeTruthy();
    expect(screen.getByText("Чат-боты")).toBeTruthy();
    expect(screen.getAllByText("@elevenhouse_test_bot").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Шаг 3: Найти бота" }));

    expect(screen.getByText("Введите username бота в Telegram")).toBeTruthy();
    expect(screen.getAllByText("@elevenhouse_test_bot").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ДОБАВИТЬ")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Шаг 4: Выбрать чаты" }));

    expect(screen.getByText("Выберите доступные чаты")).toBeTruthy();
    expect(screen.getByText("Доступные чаты")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Шаг 2: Открыть Telegram" }));

    expect(screen.getByText("Откройте настройки Telegram Business")).toBeTruthy();
  });

  it("shows a prepared connection state instead of repeated guide actions", () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isTelegramBusinessGuideOpen
        telegramBusinessBotUsername="elevenhouse_test_bot"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Telegram" }));
    fireEvent.click(screen.getByRole("button", { name: "Настроить Telegram Business" }));

    expect(screen.queryByRole("button", { name: "Создать подключение" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Закрыть" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Подключение создано")).toBeNull();
    expect(screen.queryByText("Продолжайте настройку в Telegram")).toBeNull();
    expect(screen.getByRole("button", { name: "Закрыть инструкцию" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Скопировать username" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Открыть бота" })).toBeNull();
    expect(screen.getByText("@elevenhouse_test_bot")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Скопировать username бота" }));

    expect(writeText).toHaveBeenCalledWith("@elevenhouse_test_bot");
  });

  it("lets astrologers recover the bot username for an existing pending connection", () => {
    const onStartTelegramBusinessConnection = vi.fn();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[telegramConnection({}, { status: "connecting" })]}
        isTelegramBusinessGuideOpen
        onStartTelegramBusinessConnection={onStartTelegramBusinessConnection}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Telegram" }));
    fireEvent.click(screen.getByRole("button", { name: "Настроить Telegram Business" }));

    expect(screen.queryByRole("button", { name: "Создать подключение" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Показать username бота" }));

    expect(onStartTelegramBusinessConnection).toHaveBeenCalledWith();
  });

  it("keeps channel selection available while Telegram status changes", () => {
    const { unmount } = renderWithClient(
      <InboxPageView {...baseProps()} channelConnections={[telegramConnection()]} />
    );
    expect(
      screen.getByRole("button", { name: "Подключить канал" }).getAttribute("disabled")
    ).toBeNull();
    unmount();

    renderWithClient(
      <InboxPageView
        {...baseProps()}
        channelConnections={[]}
        isStartingTelegramBusinessConnection
      />
    );

    expect(
      screen.getByRole("button", { name: "Подключить канал" }).getAttribute("disabled")
    ).toBeNull();
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
    isTelegramBusinessGuideOpen: false,
    telegramBusinessBotUsername: null,
    isStartingTelegramBusinessConnection: false,
    telegramBusinessStartError: null,
    isStartingInstagramGraphConnection: false,
    instagramGraphStartError: null,
    telegramMtprotoStep: "phone",
    telegramMtprotoPhoneNumber: "",
    telegramMtprotoCode: "",
    telegramMtprotoPassword: "",
    telegramMtprotoMaskedPhoneNumber: null,
    telegramMtprotoRetryAfterSeconds: null,
    isTelegramMtprotoConsentAccepted: false,
    isStartingTelegramMtprotoConnection: false,
    isSubmittingTelegramMtprotoCode: false,
    isSubmittingTelegramMtprotoPassword: false,
    telegramMtprotoError: null,
    onOpenTelegramBusinessGuide: vi.fn(),
    onCloseTelegramBusinessGuide: vi.fn(),
    onStartTelegramBusinessConnection: vi.fn(),
    onStartInstagramGraphConnection: vi.fn(),
    onTelegramMtprotoPhoneNumberChange: vi.fn(),
    onTelegramMtprotoConsentAcceptedChange: vi.fn(),
    onTelegramMtprotoCodeChange: vi.fn(),
    onTelegramMtprotoPasswordChange: vi.fn(),
    onStartTelegramMtprotoConnection: vi.fn(),
    onSubmitTelegramMtprotoCode: vi.fn(),
    onSubmitTelegramMtprotoPassword: vi.fn(),
    onResetTelegramMtprotoConnection: vi.fn(),
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

function instagramConnection(
  connectionOverride: Partial<MessagingChannelConnection> = {}
): MessagingChannelConnection {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    provider: "instagram",
    mode: "instagram_graph",
    status: "active",
    displayName: "Instagram",
    username: "alisa_vega",
    capabilities: {
      canRead: true,
      canReceive: true,
      canSend: true,
      supportsAttachments: false,
      supportsHistoryImport: false,
      supportsMessageDeletes: false,
      supportsMessageEdits: false
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
  readonly channelConnectionId?: string;
  readonly username?: string | null;
  readonly lastMessage?: MessagingMessage;
}): MessagingThread {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clientUserId: input.clientUserId ?? null,
    status: "open",
    primaryIdentity: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      channelConnectionId: input.channelConnectionId ?? "11111111-1111-4111-8111-111111111111",
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
