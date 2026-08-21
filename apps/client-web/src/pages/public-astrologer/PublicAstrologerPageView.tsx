import type { CreateClientJoinIntentResponse, ReviewPublicItem } from "@elevenhouse/contracts";
import styles from "./PublicAstrologerPage.module.css";

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
  if (state.status === "loading") {
    return <p className={styles.reviewsState}>Загружаем отзывы.</p>;
  }

  if (state.status === "error") {
    return <p className={styles.reviewsState}>Отзывы временно недоступны.</p>;
  }

  if (state.items.length === 0) {
    return <p className={styles.reviewsState}>Пока нет опубликованных отзывов.</p>;
  }

  return (
    <div className={styles.reviewsList}>
      {state.items.map((item) => (
        <article className={styles.reviewCard} key={item.reviewId}>
          <header className={styles.reviewCardHeader}>
            <div>
              <strong>{item.author.displayName}</strong>
              <p>{item.contextLabel}</p>
            </div>
            <span aria-label={`Оценка ${item.rating} из 5`}>{item.rating} / 5</span>
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
