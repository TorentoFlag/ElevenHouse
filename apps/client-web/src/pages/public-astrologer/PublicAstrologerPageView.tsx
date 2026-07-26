import type { CreateClientJoinIntentResponse } from "@elevenhouse/contracts";
import styles from "./PublicAstrologerPage.module.css";

export type PublicAstrologerJoinState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly intent: CreateClientJoinIntentResponse }
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
    </main>
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
