import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  ClientReviewDetail,
  ReviewModerationCaseDetail,
  ReviewPublicIdentityMode,
  ReviewableInstanceSummary
} from "@elevenhouse/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useI18n, type SupportedLocale } from "@elevenhouse/i18n";
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
  const copy = clientReviewsCopyByLocale[locale];
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

  useDocumentTitle(copy.documentTitle);

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

  const actionLabel = describeClientReviewAction(detail, locale);
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
    if (!caseDetail || caseDetail.status === "closed" || caseMessage.trim().length === 0) return;
    setCaseMessageStatus("saving");
    try {
      const message = await createClientReviewCaseMessage(
        caseDetail.caseId,
        {
          body: caseMessage.trim(),
          visibility: "client_and_moderators"
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
        <aside className={styles.rail} aria-label={copy.railAriaLabel}>
          <div className={styles.topBar}>
            <div>
              <Link className={styles.backLink} to={clientRouteContract.authenticatedProfile}>
                <Icon iconName="arrowLeft" size={15} /> {copy.backLabel}
              </Link>
              <h1>{copy.title}</h1>
            </div>
          </div>

          {listStatus === "loading" ? (
            <p className={styles.empty}>{copy.loadingServicesLabel}</p>
          ) : null}
          {listStatus === "error" ? (
            <button className={styles.secondaryButton} type="button" onClick={loadList}>
              <Icon iconName="refresh" size={15} /> {copy.retryLabel}
            </button>
          ) : null}
          {listStatus === "ready" && instances.length === 0 ? (
            <p className={styles.empty}>{copy.emptyServicesLabel}</p>
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
                      {describeReviewableInstanceKind(instance.kind, locale)}
                    </span>
                    <strong>{instance.title}</strong>
                    <span className={styles.meta}>{instance.contextLabel}</span>
                    <span className={styles.meta}>
                      {copy.reviewWindowUntilLabel(
                        formatReviewDate(instance.reviewWindowClosesAt, locale)
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detail} aria-busy={detailStatus === "loading"}>
          {detailStatus === "loading" ? (
            <p className={styles.empty}>{copy.loadingReviewLabel}</p>
          ) : null}
          {detailStatus === "error" ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => loadDetail(selectedId)}
            >
              <Icon iconName="refresh" size={15} /> {copy.retryLabel}
            </button>
          ) : null}
          {detailStatus === "ready" && detail === null ? (
            <p className={styles.empty}>{copy.selectServiceLabel}</p>
          ) : null}
          {detailStatus === "ready" && detail ? (
            <ReviewDetail
              actionLabel={actionLabel}
              canSubmit={canSubmit}
              copy={copy}
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
  copy,
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
  readonly copy: ClientReviewsCopy;
  readonly detail: ClientReviewDetail;
  readonly form: ReviewFormState;
  readonly locale: SupportedLocale;
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
            {describeReviewableInstanceKind(detail.reviewableInstance.kind, locale)}
          </p>
          <h2>{detail.reviewableInstance.title}</h2>
          <p className={styles.meta}>
            {detail.reviewableInstance.contextLabel} ·{" "}
            {describeReviewableInstanceStatus(detail.reviewableInstance.status, locale)}
          </p>
        </div>
        <span className={styles.statusPill}>
          <Icon iconName="verified" size={15} /> {actionLabel}
        </span>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.versionHeader}>
            <h3>{copy.activeVersionTitle}</h3>
            <span className={styles.meta}>
              {describeReviewVersionStatus(detail.activePublicVersion, locale)}
            </span>
          </div>
          {detail.activePublicVersion ? (
            <ReviewVersionCard copy={copy} version={detail.activePublicVersion} locale={locale} />
          ) : (
            <p className={styles.empty}>{copy.activeVersionEmptyLabel}</p>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.versionHeader}>
            <h3>{copy.pendingVersionTitle}</h3>
            <span className={styles.meta}>
              {describeReviewVersionStatus(detail.pendingVersion, locale)}
            </span>
          </div>
          {detail.pendingVersion ? (
            <ReviewVersionCard copy={copy} version={detail.pendingVersion} locale={locale} />
          ) : (
            <p className={styles.empty}>{copy.pendingVersionEmptyLabel}</p>
          )}
        </section>

        <section className={styles.card}>
          <h3>{detail.activePublicVersion ? copy.editTitle : copy.newReviewTitle}</h3>
          <form className={styles.form} onSubmit={onSubmit}>
            <div>
              <p className={styles.eyebrow}>{copy.ratingLabel}</p>
              <div className={styles.ratingGroup} role="group" aria-label={copy.ratingLabel}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    className={`${styles.ratingButton} ${rating <= form.rating ? styles.ratingButtonActive : ""}`}
                    type="button"
                    aria-label={copy.ratingOptionLabel(rating)}
                    onClick={() => onFormChange({ ...form, rating })}
                  >
                    <Icon iconName="star" size={16} />
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span className={styles.eyebrow}>{copy.textLabel}</span>
              <textarea
                className={styles.textarea}
                value={form.text}
                aria-label={copy.textAriaLabel}
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
              <span>
                {copy.anonymousLabel}
                <small>{copy.anonymousHint}</small>
              </span>
            </label>
            <div className={styles.formActions}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={!canSubmit || submitStatus === "saving"}
              >
                <Icon iconName="check" size={16} /> {copy.submitLabel}
              </button>
              {submitStatus === "saved" ? (
                <p className={styles.notice}>{copy.submitSuccessLabel}</p>
              ) : null}
              {submitStatus === "error" ? (
                <p className={styles.notice}>{copy.submitErrorLabel}</p>
              ) : null}
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <h3>{copy.caseTitle}</h3>
          {detail.moderationCase ? (
            <CaseThread
              caseDetail={caseDetail}
              caseStatus={caseStatus}
              copy={copy}
              message={caseMessage}
              messageStatus={caseMessageStatus}
              onMessageChange={onCaseMessageChange}
              onRetry={onRetryCase}
              onSubmit={onCaseMessageSubmit}
            />
          ) : (
            <p className={styles.hint}>{copy.caseEmptyHint}</p>
          )}
        </section>
      </div>
    </>
  );
}

function CaseThread({
  caseDetail,
  caseStatus,
  copy,
  message,
  messageStatus,
  onMessageChange,
  onRetry,
  onSubmit
}: {
  readonly caseDetail: ReviewModerationCaseDetail | null;
  readonly caseStatus: LoadStatus;
  readonly copy: ClientReviewsCopy;
  readonly message: string;
  readonly messageStatus: SubmitStatus;
  readonly onMessageChange: (value: string) => void;
  readonly onRetry: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (caseStatus === "loading") return <p className={styles.empty}>{copy.caseLoadingLabel}</p>;
  if (caseStatus === "error") {
    return (
      <button className={styles.secondaryButton} type="button" onClick={onRetry}>
        <Icon iconName="refresh" size={15} /> {copy.retryLabel}
      </button>
    );
  }
  if (!caseDetail) return <p className={styles.empty}>{copy.caseUnavailableLabel}</p>;

  return (
    <div className={styles.caseThread}>
      <p className={styles.meta}>
        {copy.caseStatusLabel}: {describeCaseStatus(caseDetail.status, copy)}
      </p>
      <ul className={styles.messageList}>
        {caseDetail.messages.map((caseMessage) => (
          <li key={caseMessage.messageId}>
            <strong>{describeCaseAuthor(caseMessage.authorRole, copy)}</strong>
            <p>{caseMessage.body}</p>
          </li>
        ))}
      </ul>
      {caseDetail.status === "closed" ? null : (
        <form className={styles.form} onSubmit={onSubmit}>
          <label>
            <span className={styles.eyebrow}>{copy.caseReplyLabel}</span>
            <textarea
              className={styles.textareaSmall}
              value={message}
              aria-label={copy.caseMessageAriaLabel}
              onChange={(event) => onMessageChange(event.target.value)}
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={styles.secondaryButton}
              type="submit"
              disabled={message.trim().length === 0 || messageStatus === "saving"}
            >
              <Icon iconName="chat" size={16} /> {copy.caseSendLabel}
            </button>
            {messageStatus === "saved" ? (
              <p className={styles.notice}>{copy.caseMessageSuccessLabel}</p>
            ) : null}
            {messageStatus === "error" ? (
              <p className={styles.notice}>{copy.caseMessageErrorLabel}</p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

function describeCaseAuthor(
  role: ReviewModerationCaseDetail["messages"][number]["authorRole"],
  copy: ClientReviewsCopy
) {
  return copy.caseAuthorLabels[role];
}

function describeCaseStatus(
  status: ReviewModerationCaseDetail["status"],
  copy: ClientReviewsCopy
) {
  return copy.caseStatusLabels[status];
}

function ReviewVersionCard({
  copy,
  version,
  locale
}: {
  readonly copy: ClientReviewsCopy;
  readonly version: NonNullable<ClientReviewDetail["activePublicVersion"]>;
  readonly locale: SupportedLocale;
}) {
  return (
    <>
      <div className={styles.stars} aria-label={copy.ratingValueLabel(version.rating)}>
        {Array.from({ length: version.rating }, (_, index) => (
          <Icon key={index} iconName="star" size={15} />
        ))}
      </div>
      <p className={styles.reviewText}>{version.text}</p>
      <p className={styles.meta}>
        {version.publicIdentityMode === "secret_user"
          ? copy.secretUserLabel
          : copy.namedUserLabel}{" "}
        ·{" "}
        {formatReviewDate(version.submittedAt, locale)}
      </p>
    </>
  );
}

type ClientReviewsCopy = {
  readonly documentTitle: string;
  readonly title: string;
  readonly backLabel: string;
  readonly railAriaLabel: string;
  readonly loadingServicesLabel: string;
  readonly loadingReviewLabel: string;
  readonly emptyServicesLabel: string;
  readonly selectServiceLabel: string;
  readonly retryLabel: string;
  readonly reviewWindowUntilLabel: (dateLabel: string) => string;
  readonly activeVersionTitle: string;
  readonly pendingVersionTitle: string;
  readonly activeVersionEmptyLabel: string;
  readonly pendingVersionEmptyLabel: string;
  readonly editTitle: string;
  readonly newReviewTitle: string;
  readonly ratingLabel: string;
  readonly ratingOptionLabel: (rating: number) => string;
  readonly ratingValueLabel: (rating: number) => string;
  readonly textLabel: string;
  readonly textAriaLabel: string;
  readonly anonymousLabel: string;
  readonly anonymousHint: string;
  readonly secretUserLabel: string;
  readonly namedUserLabel: string;
  readonly submitLabel: string;
  readonly submitSuccessLabel: string;
  readonly submitErrorLabel: string;
  readonly caseTitle: string;
  readonly caseEmptyHint: string;
  readonly caseLoadingLabel: string;
  readonly caseUnavailableLabel: string;
  readonly caseStatusLabel: string;
  readonly caseReplyLabel: string;
  readonly caseMessageAriaLabel: string;
  readonly caseSendLabel: string;
  readonly caseMessageSuccessLabel: string;
  readonly caseMessageErrorLabel: string;
  readonly caseAuthorLabels: Record<
    ReviewModerationCaseDetail["messages"][number]["authorRole"],
    string
  >;
  readonly caseStatusLabels: Record<ReviewModerationCaseDetail["status"], string>;
};

const clientReviewsCopyByLocale: Record<SupportedLocale, ClientReviewsCopy> = {
  ru: {
    documentTitle: "ElevenHouse | Отзывы",
    title: "Отзывы",
    backLabel: "Кабинет",
    railAriaLabel: "Услуги и продукты для отзывов",
    loadingServicesLabel: "Загружаем услуги.",
    loadingReviewLabel: "Загружаем отзыв.",
    emptyServicesLabel: "Пока нет услуг или продуктов, по которым можно показать отзыв.",
    selectServiceLabel: "Выберите услугу или продукт.",
    retryLabel: "Повторить",
    reviewWindowUntilLabel: (dateLabel) => `До ${dateLabel}`,
    activeVersionTitle: "Опубликованная версия",
    pendingVersionTitle: "Версия на проверке",
    activeVersionEmptyLabel: "После модерации отзыв появится у астролога и в публичном блоке.",
    pendingVersionEmptyLabel:
      "При редактировании старая опубликованная версия остаётся видимой до одобрения новой.",
    editTitle: "Редактирование",
    newReviewTitle: "Новый отзыв",
    ratingLabel: "Оценка",
    ratingOptionLabel: (rating) => `${rating} из 5`,
    ratingValueLabel: (rating) => `${rating} из 5`,
    textLabel: "Текст",
    textAriaLabel: "Текст отзыва",
    anonymousLabel: "Опубликовать анонимно",
    anonymousHint:
      "Астролог и публичная страница увидят “Секретный пользователь”. Модераторы ElevenHouse всё равно видят автора для проверки и споров.",
    secretUserLabel: "Секретный пользователь",
    namedUserLabel: "Ваше имя",
    submitLabel: "Отправить на модерацию",
    submitSuccessLabel: "Отзыв отправлен на модерацию.",
    submitErrorLabel: "Не удалось отправить отзыв. Повторите позже.",
    caseTitle: "Споры и уточнения",
    caseEmptyHint:
      "Если модератор откроет спор или запросит уточнение, переписка появится здесь. Отзыв скрывается сразу после открытия спора.",
    caseLoadingLabel: "Загружаем переписку.",
    caseUnavailableLabel: "Переписка пока недоступна.",
    caseStatusLabel: "Статус",
    caseReplyLabel: "Ответ",
    caseMessageAriaLabel: "Сообщение по спору",
    caseSendLabel: "Отправить",
    caseMessageSuccessLabel: "Сообщение отправлено.",
    caseMessageErrorLabel: "Не удалось отправить сообщение.",
    caseAuthorLabels: {
      client: "Вы",
      astrologer: "Астролог",
      moderator: "Модератор",
      system: "Система"
    },
    caseStatusLabels: {
      open: "Открыт",
      waiting_client: "Ждём клиента",
      waiting_astrologer: "Ждём астролога",
      consensus_reached: "Консенсус найден",
      closed: "Закрыт"
    }
  },
  en: {
    documentTitle: "ElevenHouse | Reviews",
    title: "Reviews",
    backLabel: "Cabinet",
    railAriaLabel: "Services and products for reviews",
    loadingServicesLabel: "Loading services.",
    loadingReviewLabel: "Loading review.",
    emptyServicesLabel: "There are no services or products with review details yet.",
    selectServiceLabel: "Choose a service or product.",
    retryLabel: "Retry",
    reviewWindowUntilLabel: (dateLabel) => `Until ${dateLabel}`,
    activeVersionTitle: "Published version",
    pendingVersionTitle: "Version in review",
    activeVersionEmptyLabel:
      "After moderation, the review will appear for the astrologer and in the public block.",
    pendingVersionEmptyLabel:
      "When you edit a review, the old published version stays visible until the new one is approved.",
    editTitle: "Edit review",
    newReviewTitle: "New review",
    ratingLabel: "Rating",
    ratingOptionLabel: (rating) => `${rating} of 5`,
    ratingValueLabel: (rating) => `${rating} of 5`,
    textLabel: "Text",
    textAriaLabel: "Review text",
    anonymousLabel: "Publish anonymously",
    anonymousHint:
      "The astrologer and public page will see “Secret user”. ElevenHouse moderators still see the author for checks and disputes.",
    secretUserLabel: "Secret user",
    namedUserLabel: "Your name",
    submitLabel: "Submit for moderation",
    submitSuccessLabel: "Review submitted for moderation.",
    submitErrorLabel: "Could not submit the review. Try again later.",
    caseTitle: "Disputes and clarifications",
    caseEmptyHint:
      "If a moderator opens a dispute or asks for clarification, the thread will appear here. The review is hidden immediately after a dispute opens.",
    caseLoadingLabel: "Loading thread.",
    caseUnavailableLabel: "Thread is not available yet.",
    caseStatusLabel: "Status",
    caseReplyLabel: "Reply",
    caseMessageAriaLabel: "Dispute message",
    caseSendLabel: "Send",
    caseMessageSuccessLabel: "Message sent.",
    caseMessageErrorLabel: "Could not send the message.",
    caseAuthorLabels: {
      client: "You",
      astrologer: "Astrologer",
      moderator: "Moderator",
      system: "System"
    },
    caseStatusLabels: {
      open: "Open",
      waiting_client: "Waiting for client",
      waiting_astrologer: "Waiting for astrologer",
      consensus_reached: "Consensus reached",
      closed: "Closed"
    }
  }
};
