import type {
  MessagingChannelConnection,
  MessagingMessage,
  MessagingThread,
  MessagingThreadResponse
} from "@elevenhouse/contracts";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import type { FlowInboxContext } from "../../features/flows/model/inboxFlowContexts";
import type { InboxThreadFilter } from "../../features/messaging/model/inboxThreadFilters";
import type { TelegramMtprotoWizardStep } from "../../features/messaging/model/telegramMtprotoConnectionWizard";
import styles from "./InboxPage.module.css";
import { ChannelConnectionDialog } from "./TelegramBusinessSetupGuide";
import { MessageMediaBubble } from "./MessageMediaBubble";

export type { InboxThreadFilter };

export type InboxFlowContext = FlowInboxContext;

export type InboxPageViewProps = {
  readonly channelConnections: MessagingChannelConnection[];
  readonly threads: MessagingThread[];
  readonly selectedThreadId: string | null;
  readonly selectedThreadResponse: MessagingThreadResponse | null;
  readonly flowContexts?: readonly InboxFlowContext[];
  readonly flowContextStatus?: "ready" | "loading" | "error" | "unavailable";
  readonly isConnectionsLoading: boolean;
  readonly isThreadsLoading: boolean;
  readonly isThreadsError: boolean;
  readonly isThreadLoading: boolean;
  readonly isThreadError: boolean;
  readonly isSending: boolean;
  readonly sendError: string | null;
  readonly isTelegramBusinessGuideOpen: boolean;
  readonly telegramBusinessBotUsername: string | null;
  readonly telegramBusinessBotUrl: string | null;
  readonly isStartingTelegramBusinessConnection: boolean;
  readonly telegramBusinessStartError: string | null;
  readonly isStartingInstagramGraphConnection: boolean;
  readonly instagramGraphStartError: string | null;
  readonly isStartingWhatsAppCloudConnection: boolean;
  readonly whatsappCloudError: string | null;
  readonly telegramMtprotoStep: TelegramMtprotoWizardStep;
  readonly telegramMtprotoPhoneNumber: string;
  readonly telegramMtprotoCode: string;
  readonly telegramMtprotoPassword: string;
  readonly telegramMtprotoMaskedPhoneNumber: string | null;
  readonly telegramMtprotoRetryAfterSeconds: number | null;
  readonly isTelegramMtprotoConsentAccepted: boolean;
  readonly isStartingTelegramMtprotoConnection: boolean;
  readonly isSubmittingTelegramMtprotoCode: boolean;
  readonly isSubmittingTelegramMtprotoPassword: boolean;
  readonly telegramMtprotoError: string | null;
  readonly draft: string;
  readonly search: string;
  readonly activeThreadFilter: InboxThreadFilter;
  readonly isMobileThreadOpen: boolean;
  readonly linkClientUserId: string;
  readonly linkClient: ClientSelectOption | null;
  readonly createClientDisplayName: string;
  readonly isLinkingClient: boolean;
  readonly isCreatingClient: boolean;
  readonly clientActionError: string | null;
  readonly onSearchChange: (value: string) => void;
  readonly onThreadFilterChange: (value: InboxThreadFilter) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onMobileBack: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onOpenTelegramBusinessGuide: () => void;
  readonly onCloseTelegramBusinessGuide: () => void;
  readonly onStartTelegramBusinessConnection: () => void;
  readonly onStartInstagramGraphConnection: () => void;
  readonly onStartWhatsAppCloudConnection: () => void;
  readonly onTelegramMtprotoPhoneNumberChange: (value: string) => void;
  readonly onTelegramMtprotoConsentAcceptedChange: (value: boolean) => void;
  readonly onTelegramMtprotoCodeChange: (value: string) => void;
  readonly onTelegramMtprotoPasswordChange: (value: string) => void;
  readonly onStartTelegramMtprotoConnection: () => void;
  readonly onSubmitTelegramMtprotoCode: () => void;
  readonly onSubmitTelegramMtprotoPassword: () => void;
  readonly onResetTelegramMtprotoConnection: () => void;
  readonly onSend: () => void;
  readonly onMarkRead: (threadId: string) => void;
  readonly onLinkClientSelect: (client: ClientSelectOption) => void;
  readonly onCreateClientDisplayNameChange: (value: string) => void;
  readonly onLinkClientSubmit: (threadId: string) => void;
  readonly onCreateClientSubmit: (threadId: string) => void;
  readonly onLoadMessageMediaSource: (messageId: string) => Promise<{
    readonly url: string;
    readonly expiresAt: string;
    readonly mimeType: string;
  }>;
};

export function InboxPageView({
  channelConnections,
  threads,
  selectedThreadId,
  selectedThreadResponse,
  flowContexts = [],
  flowContextStatus = "ready",
  isConnectionsLoading,
  isThreadsLoading,
  isThreadsError,
  isThreadLoading,
  isThreadError,
  isSending,
  sendError,
  isTelegramBusinessGuideOpen,
  telegramBusinessBotUsername,
  telegramBusinessBotUrl,
  isStartingTelegramBusinessConnection,
  telegramBusinessStartError,
  isStartingInstagramGraphConnection,
  instagramGraphStartError,
  isStartingWhatsAppCloudConnection,
  whatsappCloudError,
  telegramMtprotoStep,
  telegramMtprotoPhoneNumber,
  telegramMtprotoCode,
  telegramMtprotoPassword,
  telegramMtprotoMaskedPhoneNumber,
  telegramMtprotoRetryAfterSeconds,
  isTelegramMtprotoConsentAccepted,
  isStartingTelegramMtprotoConnection,
  isSubmittingTelegramMtprotoCode,
  isSubmittingTelegramMtprotoPassword,
  telegramMtprotoError,
  draft,
  search,
  activeThreadFilter,
  isMobileThreadOpen,
  linkClientUserId,
  linkClient,
  createClientDisplayName,
  isLinkingClient,
  isCreatingClient,
  clientActionError,
  onSearchChange,
  onThreadFilterChange,
  onSelectThread,
  onMobileBack,
  onDraftChange,
  onOpenTelegramBusinessGuide,
  onCloseTelegramBusinessGuide,
  onStartTelegramBusinessConnection,
  onStartInstagramGraphConnection,
  onStartWhatsAppCloudConnection,
  onTelegramMtprotoPhoneNumberChange,
  onTelegramMtprotoConsentAcceptedChange,
  onTelegramMtprotoCodeChange,
  onTelegramMtprotoPasswordChange,
  onStartTelegramMtprotoConnection,
  onSubmitTelegramMtprotoCode,
  onSubmitTelegramMtprotoPassword,
  onResetTelegramMtprotoConnection,
  onSend,
  onMarkRead,
  onLinkClientSelect,
  onCreateClientDisplayNameChange,
  onLinkClientSubmit,
  onCreateClientSubmit,
  onLoadMessageMediaSource
}: InboxPageViewProps) {
  const selectedThread = selectedThreadResponse?.thread ?? null;
  const selectedIdentity = selectedThread?.primaryIdentity ?? null;
  const selectedProvider = selectedIdentity?.provider ?? "telegram";
  const selectedProviderLabel = providerLabel(selectedProvider);
  const telegramBusiness = channelConnections.find(
    (connection) => connection.mode === "telegram_business_bot"
  );
  const telegramMtproto = channelConnections.find(
    (connection) => connection.mode === "telegram_mtproto_account"
  );
  const instagramGraph = channelConnections.find(
    (connection) => connection.mode === "instagram_graph"
  );
  const whatsappCloud = channelConnections.find(
    (connection) => connection.mode === "whatsapp_cloud"
  );
  const selectedChannelConnection = selectedIdentity
    ? channelConnections.find(
        (connection) => connection.id === selectedIdentity.channelConnectionId
      )
    : null;
  const showTelegramSetup =
    isConnectionsLoading ||
    !channelConnections.some(
      (connection) => connection.provider === "telegram" && connection.status === "active"
    ) ||
    Boolean(telegramBusinessStartError);
  const connectedChannelConnections = channelConnections.filter(
    (connection) => connection.status === "active"
  );
  const availableThreadProviders = uniqueProviders(channelConnections);
  const canSend =
    selectedChannelConnection?.status === "active" &&
    selectedChannelConnection.capabilities.canSend;
  const composerDisabled = !selectedThread || !canSend || isSending;
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const visibleMessages = selectedThreadResponse
    ? [...selectedThreadResponse.messages].sort(compareMessagesByCreatedAt)
    : [];
  const selectedFlowContext = selectedThread
    ? flowContexts.find((flowContext) => flowContext.threadId === selectedThread.id) ?? null
    : null;

  return (
    <section className={styles.inboxPage} aria-labelledby="inbox-title">
      <header className={styles.subhead}>
        <div>
          <p className={styles.kicker}>Единый инбокс</p>
          <h1 id="inbox-title" className={styles.title}>
            Сообщения
            {totalUnread > 0 && <span className={styles.countBadge}>{totalUnread}</span>}
          </h1>
        </div>
        <div className={styles.channelStrip} aria-label="Каналы подключения">
          <span className={styles.channelStripLabel}>Каналы:</span>
          {connectedChannelConnections.map((connection) => (
            <ChannelBadge key={connection.id} connection={connection} />
          ))}
          <button
            className={styles.connectButton}
            type="button"
            onClick={() => onOpenTelegramBusinessGuide()}
          >
            Подключить канал
          </button>
        </div>
      </header>

      <div
        className={styles.body}
        data-mobile-thread-open={isMobileThreadOpen ? "true" : "false"}
      >
        <aside className={styles.threadListPanel} aria-label="Диалоги">
          {showTelegramSetup && telegramBusinessStartError ? (
            <p className={styles.connectionError} role="alert">
              {telegramBusinessStartError}
            </p>
          ) : null}

          <label className={styles.searchBox}>
            <span>Поиск по диалогам</span>
            <input
              id="inbox-thread-search"
              name="inboxThreadSearch"
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Поиск по диалогам..."
            />
          </label>

          <div className={styles.filterChips} aria-label="Фильтры диалогов">
            <button
              className={activeThreadFilter === "all" ? styles.filterChipActive : styles.filterChip}
              type="button"
              aria-pressed={activeThreadFilter === "all"}
              onClick={() => onThreadFilterChange("all")}
            >
              Все
            </button>
            {availableThreadProviders.map((provider) => (
              <button
                key={provider}
                className={
                  activeThreadFilter === provider ? styles.filterChipActive : styles.filterChip
                }
                type="button"
                aria-pressed={activeThreadFilter === provider}
                onClick={() => onThreadFilterChange(provider)}
              >
                <ProviderPill provider={provider} /> {providerLabel(provider)}
              </button>
            ))}
            <button
              className={
                activeThreadFilter === "unread" ? styles.filterChipActive : styles.filterChip
              }
              type="button"
              aria-pressed={activeThreadFilter === "unread"}
              onClick={() => onThreadFilterChange("unread")}
            >
              Непрочит.
            </button>
          </div>

          <div className={styles.threadList} data-inbox-thread-list="true">
            {isThreadsLoading && <p className={styles.stateText}>Загружаем диалоги</p>}
            {isThreadsError && (
              <p className={styles.stateText} role="alert">
                Не удалось загрузить диалоги
              </p>
            )}
            {!isThreadsLoading && !isThreadsError && threads.length === 0 && (
              <p className={styles.stateText}>
                {emptyThreadListMessage(activeThreadFilter, search)}
              </p>
            )}
            {threads.map((thread) => (
              <button
                key={thread.id}
                className={
                  thread.id === selectedThreadId ? styles.threadItemActive : styles.threadItem
                }
                type="button"
                onClick={() => {
                  onSelectThread(thread.id);
                  if (thread.unreadCount > 0) {
                    onMarkRead(thread.id);
                  }
                }}
              >
                <span className={styles.avatar}>{initialsForThread(thread)}</span>
                <span className={styles.threadMain}>
                  <span className={styles.threadTitle}>{threadTitle(thread)}</span>
                  <span className={styles.threadPreview}>{threadPreview(thread.lastMessage)}</span>
                </span>
                <span className={styles.threadMeta}>
                  <ProviderPill provider={thread.primaryIdentity?.provider ?? "telegram"} />
                  {thread.unreadCount > 0 && (
                    <span className={styles.unreadBadge}>{thread.unreadCount}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.threadPanel} aria-label="Переписка">
          <div className={styles.threadHeader}>
            <button className={styles.mobileThreadBack} type="button" onClick={onMobileBack}>
              Назад
            </button>
            {selectedThread ? (
              <>
                <span className={styles.avatar}>{initialsForThread(selectedThread)}</span>
                <div className={styles.threadHeaderIdentity}>
                  <h2>{threadTitle(selectedThread)}</h2>
                  <p>
                    <ProviderPill provider={selectedProvider} /> {selectedProviderLabel}
                  </p>
                </div>
                <div className={styles.threadHeaderActions}>
                  {!selectedThread.clientUserId && (
                    <a className={styles.threadHeaderAction} href="#inbox-link-client-user-id">
                      Связать чат
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div>
                <h2>Выберите диалог</h2>
                <p>Новые сообщения появятся здесь после webhook или realtime обновления.</p>
              </div>
            )}
          </div>

          <div className={styles.messages}>
            {isThreadLoading && <p className={styles.stateText}>Загружаем переписку</p>}
            {isThreadError && (
              <p className={styles.stateText} role="alert">
                Не удалось загрузить переписку
              </p>
            )}
            {visibleMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onLoadMessageMediaSource={onLoadMessageMediaSource}
              />
            ))}
          </div>

          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              if (!composerDisabled && draft.trim()) {
                onSend();
              }
            }}
          >
            {!canSend && selectedThread && (
              <p className={styles.composerWarning}>
                Нет прав на отправку через подключенный канал
              </p>
            )}
            {sendError && (
              <p className={styles.composerWarning} role="alert">
                {sendError}
              </p>
            )}
            <div className={styles.composerRow}>
              <input
                id="inbox-composer"
                name="inboxComposer"
                value={draft}
                onChange={(event) => onDraftChange(event.currentTarget.value)}
                aria-label="Сообщение"
                placeholder={
                  canSend ? `Ответить через ${selectedProviderLabel}...` : "Подключите отправку"
                }
                disabled={composerDisabled}
              />
              <button type="submit" disabled={composerDisabled || !draft.trim()}>
                {isSending ? "Отправляем" : "Отправить"}
              </button>
            </div>
          </form>
        </main>

        <aside className={styles.contextPanel} aria-label="Контекст клиента">
          {selectedThread ? (
            <>
              <div className={styles.contextIdentity}>
                <span className={styles.avatarLarge}>{initialsForThread(selectedThread)}</span>
                <h2>{threadTitle(selectedThread)}</h2>
                <p className={styles.contextMuted}>
                  {selectedThread.clientUserId ? "CRM клиент" : "Новый внешний чат"}
                </p>
              </div>
              <section className={styles.contextSection} aria-label="Каналы клиента">
                <div className={styles.contextSectionTitle}>Каналы клиента</div>
                <div className={styles.contextChannelCard}>
                  <ProviderPill provider={selectedIdentity?.provider ?? "telegram"} />
                  <div>
                    <strong>{providerLabel(selectedIdentity?.provider ?? "telegram")}</strong>
                    <span>{identityHandle(selectedIdentity)}</span>
                  </div>
                </div>
              </section>
              {flowContextStatus === "loading" ? (
                <section className={styles.contextSection} aria-label="Активная воронка клиента">
                  <div className={styles.contextSectionTitle}>Воронка</div>
                  <p className={styles.contextMuted}>Проверяем активные воронки</p>
                </section>
              ) : flowContextStatus === "error" ? (
                <section className={styles.contextSection} aria-label="Активная воронка клиента">
                  <div className={styles.contextSectionTitle}>Воронка</div>
                  <p className={styles.contextError} role="alert">
                    Не удалось загрузить контекст воронки
                  </p>
                </section>
              ) : flowContextStatus === "unavailable" ? (
                <section className={styles.contextSection} aria-label="Активная воронка клиента">
                  <div className={styles.contextSectionTitle}>Воронка</div>
                  <p className={styles.contextMuted}>
                    Активный контекст появится после запуска исполнения воронок
                  </p>
                </section>
              ) : selectedFlowContext ? (
                <section className={styles.contextSection} aria-label="Активная воронка клиента">
                  <div className={styles.contextSectionTitle}>Воронка</div>
                  <div className={styles.flowContextCard}>
                    <h3>{selectedFlowContext.flowName}</h3>
                    <p>{selectedFlowContext.currentStepTitle}</p>
                    <a href="/flows">Открыть воронки</a>
                  </div>
                </section>
              ) : null}
              <div className={styles.contextActions}>
                {!selectedThread.clientUserId && (
                  <>
                    {clientActionError && (
                      <p className={styles.composerWarning} role="alert">
                        {clientActionError}
                      </p>
                    )}
                    <section
                      className={styles.contextSection}
                      aria-label="Связать существующего клиента"
                    >
                      <div className={styles.contextSectionTitle}>Связь с CRM</div>
                      <form
                        className={styles.clientActionForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          onLinkClientSubmit(selectedThread.id);
                        }}
                      >
                        <ClientSearchCombobox
                          id="inbox-link-client-user-id"
                          label="Клиент"
                          value={linkClientUserId}
                          placeholder="Выберите клиента"
                          selectedClient={linkClient}
                          requireBirthDate={false}
                          fullWidth
                          emptyMessage="Клиентов пока нет"
                          disabled={isLinkingClient}
                          onSelect={onLinkClientSelect}
                        />
                        <button
                          type="submit"
                          disabled={isLinkingClient || !linkClientUserId.trim()}
                        >
                          {isLinkingClient ? "Связываем" : "Связать клиента"}
                        </button>
                      </form>
                    </section>
                    <section className={styles.contextSection} aria-label="Создать клиента">
                      <div className={styles.contextSectionTitle}>Новая карточка</div>
                      <form
                        className={styles.clientActionForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          onCreateClientSubmit(selectedThread.id);
                        }}
                      >
                        <label>
                          <span>Имя нового клиента</span>
                          <input
                            id="inbox-create-client-display-name"
                            name="createClientDisplayName"
                            value={createClientDisplayName}
                            onChange={(event) =>
                              onCreateClientDisplayNameChange(event.currentTarget.value)
                            }
                            placeholder="Марина Краснова"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={isCreatingClient || !createClientDisplayName.trim()}
                        >
                          {isCreatingClient ? "Создаём" : "Создать клиента"}
                        </button>
                      </form>
                    </section>
                  </>
                )}
                {selectedThread.clientUserId && !selectedThread.linkedClient && (
                  <p className={styles.contextMuted}>CRM-клиент связан без доступного профиля.</p>
                )}
              </div>
            </>
          ) : (
            <p className={styles.contextMuted}>Контекст клиента появится после выбора диалога.</p>
          )}
        </aside>
      </div>
      {isTelegramBusinessGuideOpen ? (
        <ChannelConnectionDialog
          connection={telegramBusiness}
          mtprotoConnection={telegramMtproto}
          instagramConnection={instagramGraph}
          whatsappConnection={whatsappCloud}
          isStarting={isStartingTelegramBusinessConnection}
          errorMessage={telegramBusinessStartError}
          isStartingInstagramGraph={isStartingInstagramGraphConnection}
          instagramGraphErrorMessage={instagramGraphStartError}
          isStartingWhatsAppCloud={isStartingWhatsAppCloudConnection}
          whatsappCloudErrorMessage={whatsappCloudError}
          telegramBotUsername={telegramBusinessBotUsername}
          telegramBotUrl={telegramBusinessBotUrl}
          mtprotoStep={telegramMtprotoStep}
          mtprotoPhoneNumber={telegramMtprotoPhoneNumber}
          mtprotoCode={telegramMtprotoCode}
          mtprotoPassword={telegramMtprotoPassword}
          mtprotoMaskedPhoneNumber={telegramMtprotoMaskedPhoneNumber}
          mtprotoRetryAfterSeconds={telegramMtprotoRetryAfterSeconds}
          isMtprotoConsentAccepted={isTelegramMtprotoConsentAccepted}
          isStartingMtproto={isStartingTelegramMtprotoConnection}
          isSubmittingMtprotoCode={isSubmittingTelegramMtprotoCode}
          isSubmittingMtprotoPassword={isSubmittingTelegramMtprotoPassword}
          mtprotoErrorMessage={telegramMtprotoError}
          onStartConnection={onStartTelegramBusinessConnection}
          onStartInstagramGraphConnection={onStartInstagramGraphConnection}
          onStartWhatsAppCloudConnection={onStartWhatsAppCloudConnection}
          onMtprotoPhoneNumberChange={onTelegramMtprotoPhoneNumberChange}
          onMtprotoConsentAcceptedChange={onTelegramMtprotoConsentAcceptedChange}
          onMtprotoCodeChange={onTelegramMtprotoCodeChange}
          onMtprotoPasswordChange={onTelegramMtprotoPasswordChange}
          onStartMtprotoConnection={onStartTelegramMtprotoConnection}
          onSubmitMtprotoCode={onSubmitTelegramMtprotoCode}
          onSubmitMtprotoPassword={onSubmitTelegramMtprotoPassword}
          onResetMtprotoConnection={onResetTelegramMtprotoConnection}
          onClose={onCloseTelegramBusinessGuide}
        />
      ) : null}
    </section>
  );
}

function compareMessagesByCreatedAt(left: MessagingMessage, right: MessagingMessage): number {
  const createdAtDelta = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return left.id.localeCompare(right.id);
}

function ChannelBadge({ connection }: { readonly connection: MessagingChannelConnection }) {
  return (
    <span
      className={providerClassName(connection.provider)}
      title={connection.displayName ?? connection.mode}
      aria-label={`Подключен ${providerLabel(connection.provider)}: ${channelDisplayName(connection)}`}
    >
      {providerInitial(connection.provider)}
    </span>
  );
}

function ProviderPill({ provider }: { readonly provider: MessagingChannelConnection["provider"] }) {
  return <span className={providerClassName(provider)}>{providerInitial(provider)}</span>;
}

function providerLabel(provider: MessagingChannelConnection["provider"]) {
  if (provider === "telegram") return "Telegram";
  if (provider === "instagram") return "Instagram";
  return "WhatsApp";
}

function providerInitial(provider: MessagingChannelConnection["provider"]) {
  if (provider === "telegram") return "T";
  if (provider === "instagram") return "I";
  return "W";
}

function providerClassName(provider: MessagingChannelConnection["provider"]) {
  if (provider === "telegram") return styles.providerTelegram;
  if (provider === "instagram") return styles.providerInstagram;
  return styles.providerWhatsApp;
}

function uniqueProviders(channelConnections: MessagingChannelConnection[]) {
  const providers: Array<MessagingChannelConnection["provider"]> = [];
  for (const connection of channelConnections) {
    if (!providers.includes(connection.provider)) {
      providers.push(connection.provider);
    }
  }
  return providers;
}

function channelDisplayName(connection: MessagingChannelConnection) {
  return connection.displayName ?? connection.username ?? providerLabel(connection.provider);
}

function identityHandle(identity: MessagingThread["primaryIdentity"] | null): string {
  const username = identity?.username?.trim();

  if (!username) {
    return "Username не передан";
  }

  return username.startsWith("@") ? username : `@${username}`;
}

function MessageBubble({
  message,
  onLoadMessageMediaSource
}: {
  readonly message: MessagingMessage;
  readonly onLoadMessageMediaSource: InboxPageViewProps["onLoadMessageMediaSource"];
}) {
  const outgoing = message.direction === "outbound";
  const className = [
    outgoing ? styles.messageOutgoing : styles.messageIncoming,
    message.media ? messageMediaClassName(message.media.kind ?? message.contentType) : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      {message.media ? (
        <MessageMediaBubble message={message} onLoadSource={onLoadMessageMediaSource} />
      ) : (
        <p>{message.text ?? "Неподдерживаемый тип сообщения"}</p>
      )}
      <span>{messageStatusLabel(message.status)}</span>
    </article>
  );
}

function messageMediaClassName(kind: MessagingMessage["contentType"]): string {
  switch (kind) {
    case "image":
      return styles.messageMediaImage ?? "";
    case "video":
      return styles.messageMediaVideo ?? "";
    case "video_note":
      return styles.messageMediaVideoNote ?? "";
    case "voice":
      return styles.messageMediaVoice ?? "";
    default:
      return "";
  }
}

function messageStatusLabel(status: MessagingMessage["status"]) {
  switch (status) {
    case "queued":
    case "sending":
      return "В очереди";
    case "failed":
      return "Не доставлено";
    case "sent":
    case "delivered":
    case "read":
      return "Отправлено";
    case "received":
      return "Получено";
    default:
      return "Статус неизвестен";
  }
}

function threadTitle(thread: MessagingThread) {
  return (
    thread.linkedClient?.displayName ??
    thread.primaryIdentity?.displayName ??
    thread.primaryIdentity?.username ??
    (thread.clientUserId ? "CRM клиент" : "Новый клиент")
  );
}

function emptyThreadListMessage(activeFilter: InboxThreadFilter, search: string) {
  if (search.trim()) return "Ничего не найдено по запросу.";

  if (activeFilter === "telegram") return "Пока нет диалогов Telegram.";
  if (activeFilter === "instagram") return "Пока нет диалогов Instagram.";
  if (activeFilter === "whatsapp") return "Пока нет диалогов WhatsApp.";
  if (activeFilter === "unread") return "Нет непрочитанных диалогов.";

  return "Пока нет диалогов. Подключите канал.";
}

function threadPreview(message: MessagingMessage | null) {
  if (!message) {
    return "Без текста";
  }

  const kind = message.media?.kind ?? message.contentType;

  switch (kind) {
    case "image":
      return "Фото";
    case "voice":
      return "Голос";
    case "video":
    case "video_note":
      return "Видео";
    case "text":
      return message.text ?? "Без текста";
    default:
      return "Вложение";
  }
}

function initialsForThread(thread: MessagingThread) {
  const title = threadTitle(thread);
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "EH";
}
