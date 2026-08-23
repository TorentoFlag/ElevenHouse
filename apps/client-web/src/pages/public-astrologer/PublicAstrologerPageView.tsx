import { useMemo, useState } from "react";
import type { CreateClientJoinIntentResponse, ReviewPublicItem } from "@elevenhouse/contracts";
import styles from "./PublicAstrologerPage.module.css";

type StarRating = 1 | 2 | 3 | 4 | 5;
const starRatings: readonly StarRating[] = [5, 4, 3, 2, 1];

export type PublicAstrologerReviewsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly items: readonly ReviewPublicItem[] }
  | { readonly status: "error" };

export type PublicAstrologerJoinState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly intent: CreateClientJoinIntentResponse;
      readonly reviews: PublicAstrologerReviewsState;
    }
  | { readonly status: "error" };

export function PublicAstrologerPageView({
  state
}: {
  readonly state: PublicAstrologerJoinState;
}) {
  if (state.status === "loading") {
    return (
      <main className={styles.page} aria-busy="true">
        <section className={styles.stateCard}>
          <h1>Подготавливаем приглашение</h1>
          <p className={styles.stateText}>Проверяем личную ссылку астролога.</p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className={styles.page}>
        <section className={styles.stateCard}>
          <h1>Профиль недоступен</h1>
          <p className={styles.stateText}>Проверьте ссылку, которую отправил астролог.</p>
        </section>
      </main>
    );
  }

  const astrologer = state.intent.astrologer;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.handle}>@{astrologer.publicHandle}</p>
          <h1>{astrologer.publicName}</h1>
          <p>
            Вы открыли кабинет по личной ссылке астролога. Войдите или
            зарегистрируйтесь, чтобы привязать кабинет и видеть материалы,
            консультации и сообщения только от связанных астрологов.
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryLink} href="/auth">
              Войти и привязать кабинет
            </a>
            <a className={styles.secondaryLink} href="/">
              На главную
            </a>
          </div>
        </section>

        <aside className={styles.sidePanel} aria-label="Привязка кабинета">
          <span>{getInitials(astrologer.publicName)}</span>
          <strong>Связь создаётся после входа</strong>
          <p>
            ElevenHouse не показывает каталог астрологов. Эта ссылка привяжет
            кабинет только к @{astrologer.publicHandle}.
          </p>
        </aside>
      </div>

      <section className={styles.reviewsSection} aria-labelledby="public-astrologer-reviews-title">
        <div className={styles.reviewsHeader}>
          <p className={styles.handle}>Отзывы клиентов</p>
          <h2 id="public-astrologer-reviews-title">Опубликованные отзывы</h2>
        </div>
        <PublicReviewsList state={state.reviews} />
      </section>
    </main>
  );
}

function PublicReviewsList({ state }: { readonly state: PublicAstrologerReviewsState }) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const summary = useMemo(
    () => (state.status === "ready" ? buildReviewsSummary(state.items) : null),
    [state]
  );

  if (state.status === "loading") {
    return <p className={styles.reviewsState}>Загружаем отзывы.</p>;
  }

  if (state.status === "error") {
    return <p className={styles.reviewsState}>Отзывы временно недоступны.</p>;
  }

  if (state.items.length === 0) {
    return <p className={styles.reviewsState}>Пока нет опубликованных отзывов.</p>;
  }

  const visibleItems = selectedRating
    ? state.items.filter((item) => item.rating === selectedRating)
    : state.items;

  return (
    <>
      {summary ? (
        <section className={styles.reviewsSummary} aria-label="Сводка отзывов">
          <div className={styles.ratingScore}>
            <strong>{formatAverageRating(summary.averageRating)}</strong>
            <span>{formatReviewsCount(summary.total)}</span>
          </div>
          <div className={styles.starBreakdown} aria-label="Распределение оценок">
            {starRatings.map((rating) => (
              <button
                className={rating === selectedRating ? styles.starFilterActive : styles.starFilter}
                key={rating}
                type="button"
                aria-pressed={rating === selectedRating}
                aria-label={`Показать отзывы с оценкой ${rating}`}
                onClick={() => setSelectedRating(rating === selectedRating ? null : rating)}
              >
                <span>{formatStarLabel(rating)}</span>
                <span className={styles.starBar} aria-hidden="true">
                  <span
                    style={{
                      width: `${getRatingShare(summary.counts[rating], summary.total)}%`
                    }}
                  />
                </span>
                <strong>{summary.counts[rating]}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.reviewsToolbar}>
        <button
          className={selectedRating === null ? styles.filterButtonActive : styles.filterButton}
          type="button"
          aria-pressed={selectedRating === null}
          onClick={() => setSelectedRating(null)}
        >
          Все отзывы
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          aria-label="Открыть модальное окно всех отзывов"
          onClick={() => setDialogOpen(true)}
        >
          Открыть все отзывы
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <p className={styles.reviewsState}>Нет опубликованных отзывов с такой оценкой.</p>
      ) : (
        <ReviewCards items={visibleItems} />
      )}

      {isDialogOpen ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            className={styles.reviewsDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-all-reviews-title"
          >
            <header className={styles.dialogHeader}>
              <div>
                <p className={styles.handle}>Отзывы клиентов</p>
                <h3 id="public-all-reviews-title">Все отзывы клиентов</h3>
              </div>
              <button
                className={styles.iconButton}
                type="button"
                aria-label="Закрыть все отзывы"
                onClick={() => setDialogOpen(false)}
              >
                ×
              </button>
            </header>
            <div
              className={styles.dialogFilters}
              role="group"
              aria-label="Фильтр отзывов в модальном окне"
            >
              <button
                className={
                  selectedRating === null ? styles.filterButtonActive : styles.filterButton
                }
                type="button"
                aria-pressed={selectedRating === null}
                onClick={() => setSelectedRating(null)}
              >
                Все отзывы
              </button>
              {starRatings.map((rating) => (
                <button
                  className={
                    selectedRating === rating ? styles.filterButtonActive : styles.filterButton
                  }
                  key={rating}
                  type="button"
                  aria-pressed={selectedRating === rating}
                  onClick={() => setSelectedRating(rating === selectedRating ? null : rating)}
                >
                  {formatStarLabel(rating)}
                </button>
              ))}
            </div>
            {visibleItems.length === 0 ? (
              <p className={styles.reviewsState}>Нет опубликованных отзывов с такой оценкой.</p>
            ) : (
              <ReviewCards items={visibleItems} compact />
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function ReviewCards({
  items,
  compact = false
}: {
  readonly items: readonly ReviewPublicItem[];
  readonly compact?: boolean;
}) {
  return (
    <div className={compact ? styles.reviewsListCompact : styles.reviewsList}>
      {items.map((item) => (
        <article className={styles.reviewCard} key={item.reviewId}>
          <header className={styles.reviewCardHeader}>
            <div className={styles.reviewAuthor}>
              <ReviewAuthorAvatar item={item} />
              <div>
                <strong>{item.author.displayName}</strong>
                <p>{item.contextLabel}</p>
              </div>
            </div>
            <StarRow rating={item.rating} />
          </header>
          <h3>{item.title}</h3>
          <p className={styles.reviewText}>{item.text}</p>
          <time dateTime={item.publishedAt}>{formatPublishedDate(item.publishedAt)}</time>
          {item.astrologerReply ? (
            <aside className={styles.reply} aria-label="Ответ астролога">
              <strong>Ответ астролога</strong>
              <p>{item.astrologerReply.text}</p>
            </aside>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ReviewAuthorAvatar({ item }: { readonly item: ReviewPublicItem }) {
  if (item.author.avatarUrl) {
    return (
      <img
        className={styles.reviewAvatar}
        src={item.author.avatarUrl}
        alt=""
        aria-hidden="true"
      />
    );
  }
  return (
    <span className={styles.reviewAvatar} aria-hidden="true">
      {item.author.initials ?? "СП"}
    </span>
  );
}

function StarRow({ rating }: { readonly rating: number }) {
  return (
    <span className={styles.reviewStars} aria-label={`Оценка ${rating} из 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} aria-hidden="true">
          {star <= rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function buildReviewsSummary(items: readonly ReviewPublicItem[]): {
  readonly total: number;
  readonly averageRating: number;
  readonly counts: Record<StarRating, number>;
} {
  const counts: Record<StarRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  for (const item of items) {
    counts[item.rating as StarRating] += 1;
    ratingSum += item.rating;
  }
  return {
    total: items.length,
    averageRating: items.length > 0 ? ratingSum / items.length : 0,
    counts
  };
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatPublishedDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatAverageRating(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

function formatReviewsCount(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} отзыв`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} отзыва`;
  return `${value} отзывов`;
}

function formatStarLabel(value: number): string {
  if (value === 1) return "1 звезда";
  if (value >= 2 && value <= 4) return `${value} звезды`;
  return `${value} звезд`;
}

function getRatingShare(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}
