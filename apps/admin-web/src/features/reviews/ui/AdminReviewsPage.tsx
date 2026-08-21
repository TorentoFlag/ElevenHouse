import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  ReviewAdminDetail,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessageVisibility,
  ReviewModerationQueueItem,
  ReviewModerationReasonCode
} from "@elevenhouse/contracts";
import {
  AdminReviewsApiError,
  createAdminReviewsApi,
  type AdminReviewsApi
} from "../api/adminReviewsApi";
import {
  auditActionLabel,
  caseMessageVisibilityOptions,
  caseMessageAuthorLabel,
  caseMessageVisibilityLabel,
  caseStatusOptions,
  disputeLabel,
  moderationStatusLabel,
  pendingReplyVersion,
  pendingReviewVersion,
  queueItemLabel,
  reviewModerationReasonOptions,
  summarizeModerationQueue,
  visibilityLabel
} from "../model/reviewsModerationPresentation";
import "./AdminReviewsPage.css";

export type AdminReviewsPageProps = {
  readonly api?: AdminReviewsApi;
};

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly queue: readonly ReviewModerationQueueItem[];
      readonly selected: ReviewAdminDetail | null;
      readonly caseDetail: ReviewModerationCaseDetail | null;
    };

type EditableCaseStatus = (typeof caseStatusOptions)[number]["value"];

export function AdminReviewsPage({ api: providedApi }: AdminReviewsPageProps) {
  const defaultApi = useMemo(() => createAdminReviewsApi(), []);
  const api = providedApi ?? defaultApi;
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reasonCode, setReasonCode] = useState<ReviewModerationReasonCode>("off_topic");
  const [decisionNote, setDecisionNote] = useState("");
  const [messageVisibility, setMessageVisibility] =
    useState<ReviewModerationCaseMessageVisibility>("all_case_participants");
  const [messageBody, setMessageBody] = useState("");
  const [caseStatus, setCaseStatus] = useState<EditableCaseStatus>("open");

  const refresh = useCallback(
    async (selectedReviewId?: string | null) => {
      setLoadState((current) =>
        current.status === "ready"
          ? {
              ...current,
              queue: current.queue,
              selected: current.selected,
              caseDetail: current.caseDetail
            }
          : { status: "loading" }
      );
      try {
        const queue = await api.listModerationQueue({ limit: 50 });
        const nextSelectedReviewId = selectedReviewId ?? queue.items[0]?.reviewId ?? null;
        const selected = nextSelectedReviewId
          ? await api.getReviewDetail(nextSelectedReviewId)
          : null;
        const caseDetail = selected?.moderationCase
          ? await api.getModerationCaseDetail(selected.moderationCase.caseId)
          : null;
        setSelectedQueueItemId(
          queue.items.find((item) => item.reviewId === selected?.reviewId)?.queueItemId ?? null
        );
        setCaseStatus(toEditableCaseStatus(caseDetail?.status));
        setLoadState({ status: "ready", queue: queue.items, selected, caseDetail });
      } catch (error) {
        setLoadState({ status: "error", message: errorMessage(error) });
      }
    },
    [api]
  );

  useEffect(() => {
    void refresh(null);
  }, [refresh]);

  const queue = loadState.status === "ready" ? loadState.queue : [];
  const selected = loadState.status === "ready" ? loadState.selected : null;
  const caseDetail = loadState.status === "ready" ? loadState.caseDetail : null;
  const summary = summarizeModerationQueue(queue);
  const pendingReview = selected ? pendingReviewVersion(selected) : null;
  const pendingReply = selected ? pendingReplyVersion(selected) : null;

  const selectQueueItem = async (item: ReviewModerationQueueItem) => {
    setSubmitError(null);
    setNotice(null);
    setSelectedQueueItemId(item.queueItemId);
    setSaving(true);
    try {
      const detail = await api.getReviewDetail(item.reviewId);
      const nextCaseDetail = detail.moderationCase
        ? await api.getModerationCaseDetail(detail.moderationCase.caseId)
        : null;
      setCaseStatus(toEditableCaseStatus(nextCaseDetail?.status));
      setLoadState((current) =>
        current.status === "ready"
          ? { ...current, selected: detail, caseDetail: nextCaseDetail }
          : current
      );
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const runDecision = async (
    label: string,
    action: (idempotencyKey: string) => Promise<ReviewAdminDetail>
  ) => {
    if (!selected) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const detail = await action(newAdminReviewCommandKey());
      setNotice(label);
      await refresh(detail.reviewId);
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const sendCaseMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!caseDetail || !messageBody.trim()) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await api.createModerationCaseMessage(
        caseDetail.caseId,
        { visibility: messageVisibility, body: messageBody },
        newAdminReviewCommandKey()
      );
      setMessageBody("");
      setNotice("Сообщение добавлено в спор.");
      await refresh(caseDetail.reviewId);
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const updateCaseStatus = async () => {
    if (!caseDetail) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await api.updateModerationCaseStatus(
        caseDetail.caseId,
        { status: caseStatus },
        newAdminReviewCommandKey()
      );
      setNotice("Статус спора обновлён.");
      await refresh(caseDetail.reviewId);
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="adminReviewsShell">
      <header className="adminReviewsHeader">
        <div>
          <p>TRUST & MODERATION</p>
          <h1>Отзывы</h1>
          <span>Очередь модерации, спорные отзывы и переписка с участниками услуги.</span>
        </div>
        <nav aria-label="Admin sections">
          <a href="?section=finance">Финансы</a>
          <a href="?section=tariffs">Тарифы</a>
        </nav>
      </header>

      <section className="adminReviewsSummary" aria-label="Сводка модерации">
        <Metric label="Всего в очереди" value={summary.total} />
        <Metric label="Отзывы" value={summary.reviewVersions} />
        <Metric label="Ответы" value={summary.replyVersions} />
        <Metric label="Споры" value={summary.moderationCases} />
        <Metric label="Со статусом спора" value={summary.disputed} />
      </section>

      {notice ? <div className="adminReviewsNotice">{notice}</div> : null}
      {submitError ? (
        <div className="adminReviewsError" role="alert">
          {submitError}
        </div>
      ) : null}

      {loadState.status === "loading" ? (
        <p className="adminReviewsState">Загружаем очередь модерации…</p>
      ) : null}
      {loadState.status === "error" ? (
        <section className="adminReviewsState" role="alert">
          <p>{loadState.message}</p>
          <button type="button" onClick={() => void refresh(null)}>
            Повторить
          </button>
        </section>
      ) : null}

      {loadState.status === "ready" ? (
        <section className="adminReviewsWorkspace">
          <aside className="adminReviewsQueue" aria-label="Очередь отзывов">
            <h2>Очередь</h2>
            {queue.length === 0 ? <p>Нет pending отзывов или ответов.</p> : null}
            {queue.map((item) => (
              <button
                key={item.queueItemId}
                type="button"
                className="adminReviewsQueueItem"
                data-active={item.queueItemId === selectedQueueItemId ? "true" : undefined}
                onClick={() => void selectQueueItem(item)}
              >
                <span>{queueItemLabel(item)}</span>
                <strong>{item.client.displayName}</strong>
                <small>
                  {item.reviewableInstance.title} · {item.rating ? `${item.rating}/5` : "ответ"}
                </small>
              </button>
            ))}
          </aside>

          <section className="adminReviewsDetail" aria-label="Контекст отзыва">
            {!selected ? <p className="adminReviewsState">Выберите элемент очереди.</p> : null}
            {selected ? (
              <>
                <div className="adminReviewsDetailHead">
                  <div>
                    <p>{selected.reviewableInstance.title}</p>
                    <h2>{selected.client.displayName}</h2>
                    <span>{selected.reviewableInstance.contextLabel}</span>
                  </div>
                  <div className="adminReviewsBadges">
                    <span>{visibilityLabel(selected.visibilityStatus)}</span>
                    <span>{disputeLabel(selected.disputeStatus)}</span>
                    <span>
                      {selected.publicIdentityMode === "secret_user" ? "Анонимно" : "С именем"}
                    </span>
                  </div>
                </div>

                <div className="adminReviewsColumns">
                  <section className="adminReviewsPanel">
                    <h3>Версии отзыва</h3>
                    {selected.versions.map((version) => (
                      <article key={version.id} className="adminReviewsVersion">
                        <header>
                          <strong>
                            v{version.versionNumber} · {version.rating}/5
                          </strong>
                          <span>{moderationStatusLabel(version.moderationStatus)}</span>
                        </header>
                        <p>{version.text}</p>
                      </article>
                    ))}
                    {pendingReview ? (
                      <DecisionActions
                        saving={saving}
                        approveLabel="Одобрить отзыв"
                        rejectLabel="Отклонить отзыв"
                        reasonCode={reasonCode}
                        note={decisionNote}
                        onReasonChange={setReasonCode}
                        onNoteChange={setDecisionNote}
                        onApprove={() =>
                          void runDecision("Отзыв одобрен.", (key) =>
                            api.approveReviewVersion(selected.reviewId, pendingReview.id, key)
                          )
                        }
                        onReject={() =>
                          void runDecision("Отзыв отклонён.", (key) =>
                            api.rejectReviewVersion(
                              selected.reviewId,
                              pendingReview.id,
                              normalizedDecision(reasonCode, decisionNote),
                              key
                            )
                          )
                        }
                      />
                    ) : null}
                  </section>

                  <section className="adminReviewsPanel">
                    <h3>Ответы астролога</h3>
                    {selected.replyVersions.length === 0 ? <p>Ответов пока нет.</p> : null}
                    {selected.replyVersions.map((version) => (
                      <article key={version.id} className="adminReviewsVersion">
                        <header>
                          <strong>v{version.versionNumber}</strong>
                          <span>{moderationStatusLabel(version.moderationStatus)}</span>
                        </header>
                        <p>{version.text}</p>
                      </article>
                    ))}
                    {pendingReply ? (
                      <DecisionActions
                        saving={saving}
                        approveLabel="Одобрить ответ"
                        rejectLabel="Отклонить ответ"
                        reasonCode={reasonCode}
                        note={decisionNote}
                        onReasonChange={setReasonCode}
                        onNoteChange={setDecisionNote}
                        onApprove={() =>
                          void runDecision("Ответ одобрен.", (key) =>
                            api.approveReviewReplyVersion(selected.reviewId, pendingReply.id, key)
                          )
                        }
                        onReject={() =>
                          void runDecision("Ответ отклонён.", (key) =>
                            api.rejectReviewReplyVersion(
                              selected.reviewId,
                              pendingReply.id,
                              normalizedDecision(reasonCode, decisionNote),
                              key
                            )
                          )
                        }
                      />
                    ) : null}
                  </section>
                </div>

                <section className="adminReviewsPanel adminReviewsAudit">
                  <h3>Аудит</h3>
                  {selected.auditTrail.length === 0 ? <p>Действий пока нет.</p> : null}
                  {selected.auditTrail.map((entry) => (
                    <article key={entry.id} className="adminReviewsVersion">
                      <header>
                        <strong>{auditActionLabel(entry.action)}</strong>
                        <span>{formatDateTime(entry.occurredAt)}</span>
                      </header>
                      <p>
                        {entry.actorUserId
                          ? `Автор действия: ${entry.actorUserId}`
                          : "Системное действие"}
                      </p>
                    </article>
                  ))}
                </section>

                {caseDetail ? (
                  <section className="adminReviewsCase">
                    <header>
                      <div>
                        <p>Спор</p>
                        <h3>{caseDetail.serviceContext.title}</h3>
                        <span>{caseDetail.serviceContext.contextLabel}</span>
                      </div>
                      <div>
                        <select
                          aria-label="Статус спора"
                          value={caseStatus}
                          onChange={(event) =>
                            setCaseStatus(event.target.value as EditableCaseStatus)
                          }
                        >
                          {caseStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void updateCaseStatus()}
                        >
                          Обновить статус
                        </button>
                      </div>
                    </header>
                    <div className="adminReviewsMessages">
                      {caseDetail.messages.map((message) => (
                        <article key={message.messageId}>
                          <strong>{caseMessageAuthorLabel(message.authorRole)}</strong>
                          <span>{caseMessageVisibilityLabel(message.visibility)}</span>
                          <p>{message.body}</p>
                        </article>
                      ))}
                    </div>
                    <form className="adminReviewsMessageForm" onSubmit={sendCaseMessage}>
                      <select
                        aria-label="Кому видно сообщение"
                        value={messageVisibility}
                        onChange={(event) =>
                          setMessageVisibility(
                            event.target.value as ReviewModerationCaseMessageVisibility
                          )
                        }
                      >
                        {caseMessageVisibilityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        aria-label="Сообщение по спору"
                        value={messageBody}
                        placeholder="Сообщение участникам или внутренняя заметка"
                        onChange={(event) => setMessageBody(event.target.value)}
                      />
                      <button type="submit" disabled={saving || !messageBody.trim()}>
                        Отправить
                      </button>
                    </form>
                    <div className="adminReviewsCaseActions">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void runDecision("Отзыв восстановлен после спора.", (key) =>
                            api.restoreReviewAfterDispute(selected.reviewId, caseDetail.caseId, key)
                          )
                        }
                      >
                        Вернуть публикацию
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void runDecision("Отзыв скрыт модерацией.", (key) =>
                            api.hideReviewByModeration(
                              selected.reviewId,
                              caseDetail.caseId,
                              normalizedDecision(reasonCode, decisionNote),
                              key
                            )
                          )
                        }
                      >
                        Скрыть модерацией
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="adminReviewsCase adminReviewsCase--empty">
                    <h3>Спор не открыт</h3>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void runDecision("Отзыв скрыт модерацией.", (key) =>
                          api.hideReviewByModeration(
                            selected.reviewId,
                            null,
                            normalizedDecision(reasonCode, decisionNote),
                            key
                          )
                        )
                      }
                    >
                      Скрыть отзыв модерацией
                    </button>
                  </section>
                )}
              </>
            ) : null}
          </section>
        </section>
      ) : null}
    </main>
  );
}

function Metric(props: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function DecisionActions(props: {
  readonly saving: boolean;
  readonly approveLabel: string;
  readonly rejectLabel: string;
  readonly reasonCode: ReviewModerationReasonCode;
  readonly note: string;
  readonly onReasonChange: (value: ReviewModerationReasonCode) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}) {
  return (
    <div className="adminReviewsDecision">
      <select
        value={props.reasonCode}
        onChange={(event) => props.onReasonChange(event.target.value as ReviewModerationReasonCode)}
      >
        {reviewModerationReasonOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <textarea
        value={props.note}
        placeholder="Причина решения или уточнение для аудита"
        onChange={(event) => props.onNoteChange(event.target.value)}
      />
      <div>
        <button type="button" disabled={props.saving} onClick={props.onApprove}>
          {props.approveLabel}
        </button>
        <button type="button" disabled={props.saving} onClick={props.onReject}>
          {props.rejectLabel}
        </button>
      </div>
    </div>
  );
}

function normalizedDecision(reasonCode: ReviewModerationReasonCode, note: string) {
  const normalizedNote = note.trim();
  return { reasonCode, note: normalizedNote ? normalizedNote : null };
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function toEditableCaseStatus(status: ReviewModerationCaseDetail["status"] | undefined) {
  return caseStatusOptions.some((option) => option.value === status)
    ? (status as EditableCaseStatus)
    : "open";
}

function newAdminReviewCommandKey(): string {
  return `admin-reviews:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminReviewsApiError) {
    return `Admin reviews API error ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return "Не удалось выполнить действие с отзывами";
}
