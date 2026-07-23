import type {
  MessagingChannelConnection,
  MessagingMessage,
  MessagingThread,
  MessagingThreadResponse
} from "@elevenhouse/contracts";
import styles from "./InboxPage.module.css";

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
  readonly draft: string;
  readonly search: string;
  readonly linkClientUserId: string;
  readonly createClientDisplayName: string;
  readonly isLinkingClient: boolean;
  readonly isCreatingClient: boolean;
  readonly clientActionError: string | null;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onDraftChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onMarkRead: (threadId: string) => void;
  readonly onLinkClientUserIdChange: (value: string) => void;
  readonly onCreateClientDisplayNameChange: (value: string) => void;
  readonly onLinkClientSubmit: (threadId: string) => void;
  readonly onCreateClientSubmit: (threadId: string) => void;
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
  draft,
  search,
  linkClientUserId,
  createClientDisplayName,
  isLinkingClient,
  isCreatingClient,
  clientActionError,
  onSearchChange,
  onSelectThread,
  onDraftChange,
  onSend,
  onMarkRead,
  onLinkClientUserIdChange,
  onCreateClientDisplayNameChange,
  onLinkClientSubmit,
  onCreateClientSubmit
}: InboxPageViewProps) {
  const selectedThread = selectedThreadResponse?.thread ?? null;
  const selectedIdentity = selectedThread?.primaryIdentity ?? null;
  const telegramBusiness = channelConnections.find(
    (connection) => connection.mode === "telegram_business_bot"
  );
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
          {channelConnections.map((connection) => (
            <ChannelBadge key={connection.id} connection={connection} />
          ))}
          <button className={styles.connectButton} type="button">
            Подключить канал
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.threadListPanel} aria-label="Диалоги">
          <div className={styles.connectionCards}>
            <article className={styles.connectionCard}>
              <div className={styles.connectionIcon}>T</div>
              <div>
                <h2>Подключить Telegram Business</h2>
                <p>
                  Сообщения приходят из личного Telegram Business аккаунта астролога через
                  разрешённого Secretary bot.
                </p>
                <ConnectionStatus connection={telegramBusiness} isLoading={isConnectionsLoading} />
              </div>
            </article>

            <article className={styles.connectionCardMuted}>
              <div className={styles.connectionIconMuted}>T</div>
              <div>
                <h2>Telegram Account</h2>
                <p>MTProto вход останется равным способом подключения после этого Telegram slice.</p>
                <span className={styles.laterBadge}>Будет доступно позже</span>
              </div>
            </article>
          </div>

          <label className={styles.searchBox}>
            <span>Поиск по диалогам</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Имя, username или текст"
            />
          </label>

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
                  <span className={styles.threadPreview}>{thread.lastMessage?.text ?? "Без текста"}</span>
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
                <div>
                  <h2>{threadTitle(selectedThread)}</h2>
                  <p>
                    <ProviderPill provider={selectedIdentity?.provider ?? "telegram"} /> Telegram
                  </p>
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
              <MessageBubble key={message.id} message={message} />
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
              <p className={styles.composerWarning}>Нет прав на отправку через подключенный канал</p>
            )}
            {sendError && (
              <p className={styles.composerWarning} role="alert">
                {sendError}
              </p>
            )}
            <div className={styles.composerRow}>
              <input
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
              <span className={styles.avatarLarge}>{initialsForThread(selectedThread)}</span>
              <h2>{threadTitle(selectedThread)}</h2>
              <p className={styles.contextMuted}>
                {selectedThread.clientUserId
                  ? "Чат связан с CRM клиентом"
                  : "Внешний Telegram чат ещё не связан с CRM"}
              </p>
              <div className={styles.contextActions}>
                {!selectedThread.clientUserId && (
                  <>
                    {clientActionError && (
                      <p className={styles.composerWarning} role="alert">
                        {clientActionError}
                      </p>
                    )}
                    <form
                      className={styles.clientActionForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        onLinkClientSubmit(selectedThread.id);
                      }}
                    >
                      <label>
                        <span>CRM client user id</span>
                        <input
                          value={linkClientUserId}
                          onChange={(event) =>
                            onLinkClientUserIdChange(event.currentTarget.value)
                          }
                          placeholder="UUID клиента"
                        />
                      </label>
                      <button type="submit" disabled={isLinkingClient || !linkClientUserId.trim()}>
                        {isLinkingClient ? "Связываем" : "Связать клиента"}
                      </button>
                    </form>
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
                  </>
                )}
                {selectedThread.clientUserId && <button type="button">Открыть карточку клиента</button>}
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

  if (connection.status !== "active") {
    return <span className={styles.statusWarning}>Требует внимания: {connection.status}</span>;
  }

  return <span className={styles.statusOk}>Подключено</span>;
}

function ChannelBadge({ connection }: { readonly connection: MessagingChannelConnection }) {
  return (
    <span className={styles.channelBadge} title={connection.displayName ?? connection.mode}>
      {connection.provider === "telegram" ? "T" : "I"}
    </span>
  );
}

function ProviderPill({ provider }: { readonly provider: "telegram" | "instagram" }) {
  return <span className={provider === "telegram" ? styles.providerTelegram : styles.providerInstagram}>T</span>;
}

function MessageBubble({ message }: { readonly message: MessagingMessage }) {
  const outgoing = message.direction === "outbound";

  return (
    <article className={outgoing ? styles.messageOutgoing : styles.messageIncoming}>
      <p>{message.text ?? "Неподдерживаемый тип сообщения"}</p>
      <span>{messageStatusLabel(message.status)}</span>
    </article>
  );
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
