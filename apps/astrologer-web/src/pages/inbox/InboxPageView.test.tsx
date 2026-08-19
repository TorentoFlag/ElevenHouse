// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxPageView, type InboxPageViewProps } from "./InboxPageView";

afterEach(() => cleanup());

describe("InboxPageView", () => {
  it("renders the linked CRM client name as the thread identity", () => {
    renderInbox({
      threads: [linkedThread],
      selectedThreadResponse: { thread: linkedThread, messages: [], nextCursor: null }
    });

    expect(screen.getAllByText("QA Inbox Client").length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: "Открыть карточку клиента" })).not.toBeInTheDocument();
  });

  it("uses channel-aware empty copy for an empty WhatsApp filter", () => {
    renderInbox({
      threads: [],
      selectedThreadId: null,
      selectedThreadResponse: null,
      activeThreadFilter: "whatsapp"
    });

    expect(screen.getByText("Пока нет диалогов WhatsApp.")).toBeInTheDocument();
  });

  it("exposes mobile pane state and calls back from the mobile back button", () => {
    const onMobileBack = vi.fn();
    const { container } = renderInbox({
      isMobileThreadOpen: true,
      onMobileBack
    });

    expect(container.querySelector("[data-mobile-thread-open='true']")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(onMobileBack).toHaveBeenCalledTimes(1);
  });
});

function renderInbox(overrides: Partial<InboxPageViewProps> = {}) {
  return render(<InboxPageView {...baseProps} {...overrides} />);
}

const channelConnection = {
  id: "10000000-0000-4000-8000-000000000001",
  provider: "instagram",
  mode: "instagram_graph",
  status: "active",
  displayName: "Astrolog",
  username: "astrolog",
  capabilities: {
    canSend: true,
    canReceive: true,
    canRead: true,
    supportsHistoryImport: false,
    supportsMessageEdits: false,
    supportsMessageDeletes: false,
    supportsAttachments: false
  },
  connectedAt: "2026-08-19T12:00:00.000Z",
  lastSyncedAt: null,
  lastErrorCode: null
} as const;

const linkedThread = {
  id: "10000000-0000-4000-8000-000000000010",
  clientUserId: "10000000-0000-4000-8000-000000000020",
  linkedClient: {
    userId: "10000000-0000-4000-8000-000000000020",
    displayName: "QA Inbox Client",
    birthDate: null
  },
  status: "open",
  primaryIdentity: {
    id: "10000000-0000-4000-8000-000000000030",
    channelConnectionId: channelConnection.id,
    provider: "instagram",
    providerUserId: null,
    providerChatId: "ig-1",
    username: null,
    displayName: null,
    avatarMediaId: null,
    linkedClientUserId: "10000000-0000-4000-8000-000000000020",
    linkStatus: "linked",
    firstSeenAt: "2026-08-19T12:00:00.000Z",
    lastSeenAt: "2026-08-19T12:00:00.000Z"
  },
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  createdAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:00:00.000Z"
} as const;

const baseProps: InboxPageViewProps = {
  channelConnections: [channelConnection],
  threads: [linkedThread],
  selectedThreadId: linkedThread.id,
  selectedThreadResponse: { thread: linkedThread, messages: [], nextCursor: null },
  flowContexts: [],
  flowContextStatus: "ready",
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
  isStartingWhatsAppCloudConnection: false,
  whatsappCloudError: null,
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
  draft: "",
  search: "",
  activeThreadFilter: "all",
  linkClientUserId: "",
  linkClient: null,
  createClientDisplayName: "",
  isLinkingClient: false,
  isCreatingClient: false,
  clientActionError: null,
  isMobileThreadOpen: true,
  onSearchChange: vi.fn(),
  onThreadFilterChange: vi.fn(),
  onSelectThread: vi.fn(),
  onMobileBack: vi.fn(),
  onDraftChange: vi.fn(),
  onOpenTelegramBusinessGuide: vi.fn(),
  onCloseTelegramBusinessGuide: vi.fn(),
  onStartTelegramBusinessConnection: vi.fn(),
  onStartInstagramGraphConnection: vi.fn(),
  onStartWhatsAppCloudConnection: vi.fn(),
  onTelegramMtprotoPhoneNumberChange: vi.fn(),
  onTelegramMtprotoConsentAcceptedChange: vi.fn(),
  onTelegramMtprotoCodeChange: vi.fn(),
  onTelegramMtprotoPasswordChange: vi.fn(),
  onStartTelegramMtprotoConnection: vi.fn(),
  onSubmitTelegramMtprotoCode: vi.fn(),
  onSubmitTelegramMtprotoPassword: vi.fn(),
  onResetTelegramMtprotoConnection: vi.fn(),
  onSend: vi.fn(),
  onMarkRead: vi.fn(),
  onLinkClientSelect: vi.fn(),
  onCreateClientDisplayNameChange: vi.fn(),
  onLinkClientSubmit: vi.fn(),
  onCreateClientSubmit: vi.fn(),
  onLoadMessageMediaSource: vi.fn()
};
