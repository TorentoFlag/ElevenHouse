import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  ClientReviewDetail,
  ReviewModerationCaseDetail,
  ReviewPublicIdentityMode,
  ReviewableInstanceSummary
} from "@elevenhouse/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  createClientReviewCaseMessage,
  getClientReviewDetail,
  getClientReviewModerationCaseDetail,
  listClientReviewableInstances,
  submitClientReviewVersion
} from "../../features/reviews/api/clientReviewsApi";
import {
  canOpenClientReviewForm,
  createClientReviewFormSeed,
  describeClientReviewAction,
  describeReviewableInstanceKind,
  describeReviewableInstanceStatus,
  describeReviewVersionStatus,
  formatReviewDate
} from "../../features/reviews/model/clientReviewsPresentation";
import { clientRouteContract } from "../../router.contract";
import styles from "./ClientReviewsPage.module.css";

type LoadStatus = "loading" | "ready" | "error";
type SubmitStatus = "idle" | "saving" | "saved" | "error";

type ReviewFormState = {
  readonly rating: number;
  readonly text: string;
  readonly publicIdentityMode: ReviewPublicIdentityMode;
};

export function ClientReviewsPage() {
  const { locale } = useI18n();
  const [instances, setInstances] = useState<readonly ReviewableInstanceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientReviewDetail | null>(null);
  const [listStatus, setListStatus] = useState<LoadStatus>("loading");
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("loading");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [caseDetail, setCaseDetail] = useState<ReviewModerationCaseDetail | null>(null);
  const [caseStatus, setCaseStatus] = useState<LoadStatus>("ready");
  const [caseMessage, setCaseMessage] = useState("");
  const [caseMessageStatus, setCaseMessageStatus] = useState<SubmitStatus>("idle");
  const [form, setForm] = useState<ReviewFormState>(createClientReviewFormSeed(null));

  useDocumentTitle("Отзывы");

  const loadList = useCallback(() => {
    let cancelled = false;
    setListStatus("loading");
    void listClientReviewableInstances({ limit: 30 })
      .then((response) => {
        if (cancelled) return;
        setInstances(response.items);
        setSelectedId((current) => current ?? response.items[0]?.id ?? null);
        setListStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setListStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadList(), [loadList]);

  const loadDetail = useCallback((reviewableInstanceId: string | null) => {
    if (!reviewableInstanceId) {
      setDetail(null);
      setDetailStatus("ready");
      return () => undefined;
    }
    let cancelled = false;
    setDetailStatus("loading");
    void getClientReviewDetail(reviewableInstanceId)
      .then((nextDetail) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setForm(createClientReviewFormSeed(nextDetail));
        setSubmitStatus("idle");
        setDetailStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setDetailStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadDetail(selectedId), [loadDetail, selectedId]);

  const loadCaseDetail = useCallback((caseId: string | null) => {
    if (!caseId) {
      setCaseDetail(null);
      setCaseStatus("ready");
      return () => undefined;
    }
    let cancelled = false;
    setCaseStatus("loading");
    void getClientReviewModerationCaseDetail(caseId)
      .then((nextCase) => {
        if (cancelled) return;
        setCaseDetail(nextCase);
        setCaseMessage("");
        setCaseMessageStatus("idle");
        setCaseStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setCaseStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => loadCaseDetail(detail?.moderationCase?.caseId ?? null),
    [detail?.moderationCase?.caseId, loadCaseDetail]
  );

  const actionLabel = describeClientReviewAction(detail);
  const canSubmit = canOpenClientReviewForm(detail) && form.text.trim().length > 0;
  const idempotencyKey = useMemo(
    () => `client-review-${selectedId ?? "none"}-${Date.now().toString(36)}`,
    [selectedId, submitStatus]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !canSubmit) return;
    setSubmitStatus("saving");
    try {
      const nextDetail = await submitClientReviewVersion(
        {
          reviewableInstanceId: detail.reviewableInstance.id,
          rating: form.rating,
          text: form.text.trim(),
          publicIdentityMode: form.publicIdentityMode
        },
        idempotencyKey
      );
      setDetail(nextDetail);
      setForm(createClientReviewFormSeed(nextDetail));
      setSubmitStatus("saved");
    } catch {
      setSubmitStatus("error");
    }
  }

  async function handleCaseMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!caseDetail || caseMessage.trim().length === 0) return;
    setCaseMessageStatus("saving");
    try {
      const message = await createClientReviewCaseMessage(
        caseDetail.caseId,
        {
          body: caseMessage.trim(),
          visibility: "all_case_participants"
        },
        `client-review-case-${caseDetail.caseId}-${Date.now().toString(36)}`
      );
      setCaseDetail({
        ...caseDetail,
        messages: [...caseDetail.messages, message]
      });
      setCaseMessage("");
      setCaseMessageStatus("saved");
    } catch {
      setCaseMessageStatus("error");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.rail} aria-label="Услуги и продукты для отзывов">
          <div className={styles.topBar}>
            <div>
              <Link className={styles.backLink} to={clientRouteContract.authenticatedProfile}>
                <Icon iconName="arrowLeft" size={15} /> Кабинет
              </Link>
              <h1>Отзывы</h1>
            </div>
          </div>

          {listStatus === "loading" ? <p className={styles.empty}>Загружаем услуги.</p> : null}
          {listStatus === "error" ? (
            <button className={styles.secondaryButton} type="button" onClick={loadList}>
              <Icon iconName="refresh" size={15} /> Повторить
            </button>
          ) : null}
          {listStatus === "ready" && instances.length === 0 ? (
            <p className={styles.empty}>
              Пока нет услуг или продуктов, по которым можно показать отзыв.
            </p>
          ) : null}
          <ul className={styles.instanceList}>
            {instances.map((instance) => {
              const isActive = instance.id === selectedId;
              return (
                <li key={instance.id}>
                  <button
                    className={`${styles.instanceButton} ${isActive ? styles.instanceButtonActive : ""}`}
                    type="button"
                    onClick={() => setSelectedId(instance.id)}
                  >
                    <span className={styles.eyebrow}>
                      {describeReviewableInstanceKind(instance.kind)}
                    </span>
                    <strong>{instance.title}</strong>
                    <span className={styles.meta}>{instance.contextLabel}</span>
                    <span className={styles.meta}>
                      До {formatReviewDate(instance.reviewWindowClosesAt, locale)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detail} aria-busy={detailStatus === "loading"}>
          {detailStatus === "loading" ? <p className={styles.empty}>Загружаем отзыв.</p> : null}
          {detailStatus === "error" ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => loadDetail(selectedId)}
            >
              <Icon iconName="refresh" size={15} /> Повторить
            </button>
          ) : null}
          {detailStatus === "ready" && detail === null ? (
            <p className={styles.empty}>Выберите услугу или продукт.</p>
          ) : null}
          {detailStatus === "ready" && detail ? (
            <ReviewDetail
              actionLabel={actionLabel}
              canSubmit={canSubmit}
              detail={detail}
              form={form}
              locale={locale}
              caseDetail={caseDetail}
              caseStatus={caseStatus}
              caseMessage={caseMessage}
              caseMessageStatus={caseMessageStatus}
              submitStatus={submitStatus}
              onCaseMessageChange={setCaseMessage}
              onCaseMessageSubmit={handleCaseMessageSubmit}
              onRetryCase={() => loadCaseDetail(detail.moderationCase?.caseId ?? null)}
              onFormChange={setForm}
              onSubmit={handleSubmit}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ReviewDetail({
  actionLabel,
  canSubmit,
  detail,
  form,
  locale,
  caseDetail,
  caseStatus,
  caseMessage,
  caseMessageStatus,
  submitStatus,
  onCaseMessageChange,
  onCaseMessageSubmit,
  onRetryCase,
  onFormChange,
  onSubmit
}: {
  readonly actionLabel: string;
  readonly canSubmit: boolean;
  readonly detail: ClientReviewDetail;
  readonly form: ReviewFormState;
  readonly locale: string;
  readonly caseDetail: ReviewModerationCaseDetail | null;
  readonly caseStatus: LoadStatus;
  readonly caseMessage: string;
  readonly caseMessageStatus: SubmitStatus;
  readonly submitStatus: SubmitStatus;
  readonly onCaseMessageChange: (value: string) => void;
  readonly onCaseMessageSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onRetryCase: () => void;
  readonly onFormChange: (form: ReviewFormState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <header className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>
            {describeReviewableInstanceKind(detail.reviewableInstance.kind)}
          </p>
          <h2>{detail.reviewableInstance.title}</h2>
          <p className={styles.meta}>
            {detail.reviewableInstance.contextLabel} ·{" "}
            {describeReviewableInstanceStatus(detail.reviewableInstance.status)}
          </p>
        </div>
        <span className={styles.statusPill}>
          <Icon iconName="verified" size={15} /> {actionLabel}
        </span>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.versionHeader}>
            <h3>Опубликованная версия</h3>
            <span className={styles.meta}>
              {describeReviewVersionStatus(detail.activePublicVersion)}
            </span>
          </div>
          {detail.activePublicVersion ? (
            <ReviewVersionCard version={detail.activePublicVersion} locale={locale} />
          ) : (
            <p className={styles.empty}>
              После модерации отзыв появится у астролога и в публичном блоке.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.versionHeader}>
            <h3>Версия на проверке</h3>
            <span className={styles.meta}>
              {describeReviewVersionStatus(detail.pendingVersion)}
            </span>
          </div>
          {detail.pendingVersion ? (
            <ReviewVersionCard version={detail.pendingVersion} locale={locale} />
          ) : (
            <p className={styles.empty}>
              При редактировании старая опубликованная версия остаётся видимой до одобрения новой.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <h3>{detail.activePublicVersion ? "Редактирование" : "Новый отзыв"}</h3>
          <form className={styles.form} onSubmit={onSubmit}>
            <div>
              <p className={styles.eyebrow}>Оценка</p>
              <div className={styles.ratingGroup} role="group" aria-label="Оценка">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    className={`${styles.ratingButton} ${rating <= form.rating ? styles.ratingButtonActive : ""}`}
                    type="button"
                    aria-label={`${rating} из 5`}
                    onClick={() => onFormChange({ ...form, rating })}
                  >
                    <Icon iconName="star" size={16} />
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span className={styles.eyebrow}>Текст</span>
              <textarea
                className={styles.textarea}
                value={form.text}
                aria-label="Текст отзыва"
                onChange={(event) => onFormChange({ ...form, text: event.target.value })}
              />
            </label>
            <label className={styles.checkboxRow}>
              <input
                checked={form.publicIdentityMode === "secret_user"}
                type="checkbox"
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    publicIdentityMode: event.target.checked ? "secret_user" : "named"
                  })
                }
              />
              Опубликовать анонимно
            </label>
            <div className={styles.formActions}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={!canSubmit || submitStatus === "saving"}
              >
                <Icon iconName="check" size={16} /> Отправить на модерацию
              </button>
              {submitStatus === "saved" ? (
                <p className={styles.notice}>Отзыв отправлен на модерацию.</p>
              ) : null}
              {submitStatus === "error" ? (
                <p className={styles.notice}>Не удалось отправить отзыв. Повторите позже.</p>
              ) : null}
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <h3>Споры и уточнения</h3>
          {detail.moderationCase ? (
            <CaseThread
              caseDetail={caseDetail}
              caseStatus={caseStatus}
              message={caseMessage}
              messageStatus={caseMessageStatus}
              onMessageChange={onCaseMessageChange}
              onRetry={onRetryCase}
              onSubmit={onCaseMessageSubmit}
            />
          ) : (
            <p className={styles.hint}>
              Если модератор откроет спор или запросит уточнение, переписка появится здесь. Отзыв
              скрывается сразу после открытия спора.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function CaseThread({
  caseDetail,
  caseStatus,
  message,
  messageStatus,
  onMessageChange,
  onRetry,
  onSubmit
}: {
  readonly caseDetail: ReviewModerationCaseDetail | null;
  readonly caseStatus: LoadStatus;
  readonly message: string;
  readonly messageStatus: SubmitStatus;
  readonly onMessageChange: (value: string) => void;
  readonly onRetry: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (caseStatus === "loading") return <p className={styles.empty}>Загружаем переписку.</p>;
  if (caseStatus === "error") {
    return (
      <button className={styles.secondaryButton} type="button" onClick={onRetry}>
        <Icon iconName="refresh" size={15} /> Повторить
      </button>
    );
  }
  if (!caseDetail) return <p className={styles.empty}>Переписка пока недоступна.</p>;

  return (
    <div className={styles.caseThread}>
      <p className={styles.meta}>Статус: {describeCaseStatus(caseDetail.status)}</p>
      <ul className={styles.messageList}>
        {caseDetail.messages.map((caseMessage) => (
          <li key={caseMessage.messageId}>
            <strong>{describeCaseAuthor(caseMessage.authorRole)}</strong>
            <p>{caseMessage.body}</p>
          </li>
        ))}
      </ul>
      <form className={styles.form} onSubmit={onSubmit}>
        <label>
          <span className={styles.eyebrow}>Ответ</span>
          <textarea
            className={styles.textareaSmall}
            value={message}
            aria-label="Сообщение по спору"
            onChange={(event) => onMessageChange(event.target.value)}
          />
        </label>
        <div className={styles.formActions}>
          <button
            className={styles.secondaryButton}
            type="submit"
            disabled={message.trim().length === 0 || messageStatus === "saving"}
          >
            <Icon iconName="chat" size={16} /> Отправить
          </button>
          {messageStatus === "saved" ? (
            <p className={styles.notice}>Сообщение отправлено.</p>
          ) : null}
          {messageStatus === "error" ? (
            <p className={styles.notice}>Не удалось отправить сообщение.</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function describeCaseAuthor(role: ReviewModerationCaseDetail["messages"][number]["authorRole"]) {
  if (role === "client") return "Вы";
  if (role === "astrologer") return "Астролог";
  if (role === "moderator") return "Модератор";
  return "Система";
}

function describeCaseStatus(status: ReviewModerationCaseDetail["status"]) {
  if (status === "open") return "Открыт";
  if (status === "closed") return "Закрыт";
  if (status === "waiting_client") return "Ждём клиента";
  if (status === "waiting_astrologer") return "Ждём астролога";
  return "Консенсус найден";
}

function ReviewVersionCard({
  version,
  locale
}: {
  readonly version: NonNullable<ClientReviewDetail["activePublicVersion"]>;
  readonly locale: string;
}) {
  return (
    <>
      <div className={styles.stars} aria-label={`${version.rating} из 5`}>
        {Array.from({ length: version.rating }, (_, index) => (
          <Icon key={index} iconName="star" size={15} />
        ))}
      </div>
      <p className={styles.reviewText}>{version.text}</p>
      <p className={styles.meta}>
        {version.publicIdentityMode === "secret_user" ? "Секретный пользователь" : "Ваше имя"} ·{" "}
        {formatReviewDate(version.submittedAt, locale)}
      </p>
    </>
  );
}
