import { readFileSync } from "node:fs";
import type {
  InboxFlowContext,
  InboxPageViewProps
} from "./InboxPageView";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxPageView } from "./InboxPageView";

describe("InboxPage", () => {
  it("mounts the production Inbox view through messaging queries and realtime invalidation", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { InboxPageView } from "./InboxPageView"');
    expect(source).toContain("listMessagingChannelConnectionsQueryOptions");
    expect(source).toContain("listMessagingThreadsQueryOptions");
    expect(source).toContain("getMessagingThreadQueryOptions");
    expect(source).toContain("sendMessagingMessageMutationOptions");
    expect(source).toContain("createMessagingRealtimeClient");
    expect(source).toContain("handleMessagingRealtimeEvent");
    expect(source).toContain("isTelegramBusinessGuideOpen");
    expect(source).toContain("hasActiveTelegramConnection");
    expect(source).toContain("wasTelegramActiveRef");
    expect(source).toContain("setIsTelegramBusinessGuideOpen(false)");
    expect(source).toContain("setTelegramBusinessStartGuide(result)");
    expect(source).toContain("startTelegramMtprotoConnectionMutationOptions");
    expect(source).toContain("deriveTelegramMtprotoWizardState(result)");
    expect(source).toContain("useFlowListQuery");
    expect(source).toContain(
      'useFlowListQuery({ state: "all", runtimeStatus: "all", limit: 50, offset: 0 })'
    );
    expect(source).not.toContain('useFlowListQuery({ status: "all"');
    expect(source).toContain("flowRunsQueryOptions");
    expect(source).toContain('limit: 100');
    expect(source).toContain("buildInboxFlowContexts");
    expect(source).toContain("canProjectLiveFlowRuntime");
    expect(source).toContain("enabled: liveFlowRuntimeAvailable");
    expect(source).toContain("runtimeAvailability: flowsQuery.data?.runtime");
    expect(source).toContain("flowContextStatus=");
    expect(source).not.toContain("flowContexts={[]}");
    expect(source).not.toContain('<h1 id="inbox-title">Сообщения</h1>');
    expect(source).not.toContain("window.prompt");
    expect(source).not.toContain("window.open");
  });

  it("shows flow context only when the selected thread read model provides it", () => {
    const flowContext = {
      threadId,
      flowName: "Прогрев к консультации",
      currentStepTitle: "AI-черновик ответа"
    } satisfies InboxFlowContext;
    const withContext = renderToStaticMarkup(
      <InboxPageView {...baseInboxProps()} flowContexts={[flowContext]} />
    );
    const withoutContext = renderToStaticMarkup(<InboxPageView {...baseInboxProps()} />);

    expect(withContext).toContain("Прогрев к консультации");
    expect(withContext).toContain("AI-черновик ответа");
    expect(withContext).toContain("Открыть воронки");
    expect(withoutContext).not.toContain("Прогрев к консультации");
    expect(withoutContext).not.toContain("AI-черновик ответа");
  });

  it("does not present loading or failed flow context as confirmed absence", () => {
    const loadingMarkup = renderToStaticMarkup(
      <InboxPageView {...baseInboxProps()} flowContextStatus="loading" />
    );
    const errorMarkup = renderToStaticMarkup(
      <InboxPageView {...baseInboxProps()} flowContextStatus="error" />
    );

    expect(loadingMarkup).toContain("Проверяем активные воронки");
    expect(errorMarkup).toContain("Не удалось загрузить контекст воронки");
  });

  it("shows an explicit unavailable state instead of projecting legacy preview history", () => {
    const markup = renderToStaticMarkup(
      <InboxPageView {...baseInboxProps()} flowContextStatus="unavailable" />
    );

    expect(markup).toContain("Активный контекст появится после запуска исполнения воронок");
    expect(markup).not.toContain("AI-черновик ответа");
  });
});

const threadId = "11111111-1111-4111-8111-111111111111";
const channelConnectionId = "22222222-2222-4222-8222-222222222222";
const externalIdentityId = "33333333-3333-4333-8333-333333333333";

function baseInboxProps(): InboxPageViewProps {
  return {
    channelConnections: [
      {
        id: channelConnectionId,
        provider: "telegram",
        mode: "telegram_business_bot",
        status: "active",
        displayName: "Telegram",
        username: "elevenhouse_bot",
        capabilities: {
          canSend: true,
          canReceive: true,
          canRead: true,
          supportsHistoryImport: false,
          supportsMessageEdits: false,
          supportsMessageDeletes: false,
          supportsAttachments: true
        },
        connectedAt: "2026-07-22T10:00:00.000Z",
        lastSyncedAt: null,
        lastErrorCode: null
      }
    ],
    threads: [thread()],
    selectedThreadId: threadId,
    selectedThreadResponse: { thread: thread(), messages: [], nextCursor: null },
    isConnectionsLoading: false,
    isThreadsLoading: false,
    isThreadsError: false,
    isThreadLoading: false,
    isThreadError: false,
    isSending: false,
    sendError: null,
    isTelegramBusinessGuideOpen: false,
    telegramBusinessBotUsername: null,
    telegramBusinessBotUrl: null,
    isStartingTelegramBusinessConnection: false,
    telegramBusinessStartError: null,
    isStartingInstagramGraphConnection: false,
    instagramGraphStartError: null,
    telegramMtprotoStep: "connected",
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
    draft: "",
    search: "",
    activeThreadFilter: "all",
    linkClientUserId: "",
    linkClient: null,
    createClientDisplayName: "",
    isLinkingClient: false,
    isCreatingClient: false,
    clientActionError: null,
    onSearchChange: () => undefined,
    onThreadFilterChange: () => undefined,
    onSelectThread: () => undefined,
    onDraftChange: () => undefined,
    onOpenTelegramBusinessGuide: () => undefined,
    onCloseTelegramBusinessGuide: () => undefined,
    onStartTelegramBusinessConnection: () => undefined,
    onStartInstagramGraphConnection: () => undefined,
    onTelegramMtprotoPhoneNumberChange: () => undefined,
    onTelegramMtprotoConsentAcceptedChange: () => undefined,
    onTelegramMtprotoCodeChange: () => undefined,
    onTelegramMtprotoPasswordChange: () => undefined,
    onStartTelegramMtprotoConnection: () => undefined,
    onSubmitTelegramMtprotoCode: () => undefined,
    onSubmitTelegramMtprotoPassword: () => undefined,
    onResetTelegramMtprotoConnection: () => undefined,
    onSend: () => undefined,
    onMarkRead: () => undefined,
    onLinkClientSelect: () => undefined,
    onCreateClientDisplayNameChange: () => undefined,
    onLinkClientSubmit: () => undefined,
    onCreateClientSubmit: () => undefined,
    onLoadMessageMediaSource: async () => ({
      url: "https://example.test/media",
      expiresAt: "2026-07-22T10:10:00.000Z",
      mimeType: "image/png"
    })
  };
}

function thread() {
  return {
    id: threadId,
    clientUserId: "44444444-4444-4444-8444-444444444444",
    status: "open",
    primaryIdentity: {
      id: externalIdentityId,
      channelConnectionId,
      provider: "telegram",
      providerUserId: "telegram-user-1",
      providerChatId: "telegram-chat-1",
      username: "marina",
      displayName: "Марина Краснова",
      avatarMediaId: null,
      linkedClientUserId: "44444444-4444-4444-8444-444444444444",
      linkStatus: "linked",
      firstSeenAt: "2026-07-22T10:00:00.000Z",
      lastSeenAt: "2026-07-22T10:00:00.000Z"
    },
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: 0,
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  } as const;
}
