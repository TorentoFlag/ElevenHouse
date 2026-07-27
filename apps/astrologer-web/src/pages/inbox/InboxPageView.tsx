import type {
  MessagingChannelConnection,
  MessagingMessage,
  MessagingThread,
  MessagingThreadResponse
} from "@elevenhouse/contracts";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import type { InboxThreadFilter } from "../../features/messaging/model/inboxThreadFilters";
import styles from "./InboxPage.module.css";
import { MessageMediaBubble } from "./MessageMediaBubble";

export type { InboxThreadFilter };

export type InboxPageViewProps = {
  readonly channelConnections: MessagingChannelConnection[];
  readonly threads: MessagingThread[];
  readonly selectedThreadId: string | null;
  readonly selectedThreadResponse: MessagingThreadResponse | null;
  readonly isConnectionsLoading: boolean;
  readonly isThreadsLoading: boolean;
  readonly isThreadsError: boolean;
  readonly isThreadLoading: boolean;
  readonly isThreadError: boolean;
  readonly isSending: boolean;
  readonly sendError: string | null;
  readonly isStartingTelegramBusinessConnection: boolean;
  readonly telegramBusinessStartError: string | null;
  readonly draft: string;
  readonly search: string;
  readonly activeThreadFilter: InboxThreadFilter;
  readonly linkClientUserId: string;
  readonly linkClient: ClientSelectOption | null;
  readonly createClientDisplayName: string;
  readonly isLinkingClient: boolean;
  readonly isCreatingClient: boolean;
  readonly clientActionError: string | null;
  readonly onSearchChange: (value: string) => void;
  readonly onThreadFilterChange: (value: InboxThreadFilter) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onDraftChange: (value: string) => void;
  readonly onStartTelegramBusinessConnection: () => void;
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
  isConnectionsLoading,
  isThreadsLoading,
  isThreadsError,
  isThreadLoading,
  isThreadError,
  isSending,
  sendError,
  isStartingTelegramBusinessConnection,
  telegramBusinessStartError,
  draft,
  search,
  activeThreadFilter,
  linkClientUserId,
  linkClient,
  createClientDisplayName,
  isLinkingClient,
  isCreatingClient,
  clientActionError,
  onSearchChange,
  onThreadFilterChange,
  onSelectThread,
  onDraftChange,
  onStartTelegramBusinessConnection,
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
  const telegramBusiness = channelConnections.find(
    (connection) => connection.mode === "telegram_business_bot"
  );
  const telegramBusinessStartDisabled =
    isStartingTelegramBusinessConnection || telegramBusiness?.status === "active";
  const showTelegramBusinessSetup =
    isConnectionsLoading ||
    !telegramBusiness ||
    telegramBusiness.status !== "active" ||
    Boolean(telegramBusinessStartError);
  const canSend = telegramBusiness?.status === "active" && telegramBusiness.capabilities.canSend;
  const composerDisabled = !selectedThread || !canSend || isSending;
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const visibleMessages = selectedThreadResponse
    ? [...selectedThreadResponse.messages].sort(compareMessagesByCreatedAt)
    : [];

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
          {channelConnections.map((connection) => (
            <ChannelBadge key={connection.id} connection={connection} />
          ))}
          <button
            className={styles.connectButton}
            type="button"
            disabled={telegramBusinessStartDisabled}
            onClick={() => onStartTelegramBusinessConnection()}
          >
            {telegramBusinessStartButtonLabel(
              telegramBusiness,
              isStartingTelegramBusinessConnection
            )}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.threadListPanel} aria-label="Диалоги">
          {showTelegramBusinessSetup && (
            <div className={styles.connectionCards}>
              <article className={styles.connectionCard}>
                <div className={styles.connectionIcon}>T</div>
                <div>
                  <h2>Подключить Telegram Business</h2>
                  <p>
                    Сообщения приходят из личного Telegram Business аккаунта астролога через
                    разрешённого Secretary bot.
                  </p>
                  <ConnectionStatus
                    connection={telegramBusiness}
                    isLoading={isConnectionsLoading}
                  />
                  {telegramBusinessStartError && (
                    <p className={styles.connectionError} role="alert">
                      {telegramBusinessStartError}
                    </p>
                  )}
                  <button
                    className={styles.connectButton}
                    type="button"
                    disabled={telegramBusinessStartDisabled}
                    onClick={() => onStartTelegramBusinessConnection()}
                  >
                    {telegramBusinessStartButtonLabel(
                      telegramBusiness,
                      isStartingTelegramBusinessConnection
                    )}
                  </button>
                </div>
              </article>

              <article className={styles.connectionCardMuted}>
                <div className={styles.connectionIconMuted}>T</div>
                <div>
                  <h2>Telegram Account</h2>
                  <p>
                    MTProto вход останется равным способом подключения после этого Telegram slice.
                  </p>
                  <span className={styles.laterBadge}>Будет доступно позже</span>
                </div>
              </article>
            </div>
          )}

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
            {channelConnections.map((connection) => (
              <button
                key={connection.id}
                className={
                  activeThreadFilter === connection.provider
                    ? styles.filterChipActive
                    : styles.filterChip
                }
                type="button"
                aria-pressed={activeThreadFilter === connection.provider}
                onClick={() => onThreadFilterChange(connection.provider)}
              >
                <ProviderPill provider={connection.provider} /> {providerLabel(connection.provider)}
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
              <p className={styles.stateText}>Пока нет диалогов. Подключите Telegram Business.</p>
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
            <button className={styles.mobileThreadBack} type="button">
              Назад
            </button>
            {selectedThread ? (
              <>
                <span className={styles.avatar}>{initialsForThread(selectedThread)}</span>
                <div className={styles.threadHeaderIdentity}>
                  <h2>{threadTitle(selectedThread)}</h2>
                  <p>
                    <ProviderPill provider={selectedIdentity?.provider ?? "telegram"} /> Telegram
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
                placeholder={canSend ? "Ответить через Telegram..." : "Подключите отправку"}
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
                {selectedThread.clientUserId && (
                  <button type="button">Открыть карточку клиента</button>
                )}
              </div>
            </>
          ) : (
            <p className={styles.contextMuted}>Контекст клиента появится после выбора диалога.</p>
          )}
        </aside>
      </div>
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

function ConnectionStatus({
  connection,
  isLoading
}: {
  readonly connection?: MessagingChannelConnection;
  readonly isLoading: boolean;
}) {
  if (isLoading) {
    return <span className={styles.statusMuted}>Проверяем подключение</span>;
  }

  if (!connection) {
    return <span className={styles.statusWarning}>Не подключено</span>;
  }

  if (connection.status === "connecting") {
    return <span className={styles.statusMuted}>Ожидает подтверждения</span>;
  }

  if (connection.status === "reauth_required") {
    return <span className={styles.statusWarning}>Нужны права Telegram</span>;
  }

  if (connection.status === "revoked") {
    return <span className={styles.statusWarning}>Отключено в Telegram</span>;
  }

  if (connection.status !== "active") {
    return <span className={styles.statusWarning}>Требует внимания: {connection.status}</span>;
  }

  return <span className={styles.statusOk}>Подключено</span>;
}

function telegramBusinessStartButtonLabel(
  connection: MessagingChannelConnection | undefined,
  isStarting: boolean
) {
  if (isStarting) {
    return "Открываем Telegram";
  }

  if (connection?.status === "active") {
    return "Подключено";
  }

  if (connection?.status === "connecting") {
    return "Ожидаем Telegram";
  }

  if (connection?.status === "reauth_required" || connection?.status === "revoked") {
    return "Подключить заново";
  }

  return "Подключить Telegram";
}

function ChannelBadge({ connection }: { readonly connection: MessagingChannelConnection }) {
  return (
    <span className={styles.channelBadge} title={connection.displayName ?? connection.mode}>
      {connection.provider === "telegram" ? "T" : "I"}
    </span>
  );
}

function ProviderPill({ provider }: { readonly provider: "telegram" | "instagram" }) {
  return (
    <span className={provider === "telegram" ? styles.providerTelegram : styles.providerInstagram}>
      {provider === "telegram" ? "T" : "I"}
    </span>
  );
}

function providerLabel(provider: "telegram" | "instagram") {
  return provider === "telegram" ? "Telegram" : "Instagram";
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
  return thread.primaryIdentity?.displayName ?? thread.primaryIdentity?.username ?? "Новый клиент";
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
