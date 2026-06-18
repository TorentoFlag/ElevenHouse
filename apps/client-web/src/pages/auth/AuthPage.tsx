import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { BackLink } from "@elevenhouse/design-system/navigation";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import styles from "./AuthPage.module.css";

const authHighlights = [
  {
    icon: "orbit",
    label: "Движок карт и все системы"
  },
  {
    icon: "flow",
    label: "Воронки и AI-автоматизация"
  },
  {
    icon: "wallet",
    label: "Оплаты, продукты, контент"
  }
];

export function AuthPage() {
  useDocumentTitle("Auth");

  return (
    <main className={styles.page}>
      <section className={styles.visualPane}>
        <div className={`${styles.planet} ${styles.planetGold}`}>
          <span className={styles.orbit} />
        </div>
        <div className={`${styles.planet} ${styles.planetTeal}`} />
        <div className={`${styles.planet} ${styles.planetAmber}`} />
        <div className={`${styles.planet} ${styles.planetViolet}`}>
          <span className={styles.orbit} />
        </div>
        <div className={`${styles.planet} ${styles.planetBlue}`} />
        <div className={styles.stars} />

        <div className={styles.visualContent}>
          <BackLink
            className={styles.backLink}
            path="/"
            title="На главную"
          />

          <div className={styles.heroCopy}>
            <div className={styles.brandBadge}>
              <Sparkle aria-hidden="true" />
              ElevenHouse
            </div>
            <h1 className={styles.heroTitle}>
              Кабинет, который
              <br />
              продаёт за вас
            </h1>
            <div className={styles.highlightList}>
              {authHighlights.map((highlight) => (
                <div className={styles.highlightItem} key={highlight.label}>
                  <span className={styles.highlightIcon} aria-hidden="true">
                    {highlight.icon === "orbit" ? "⌁" : highlight.icon === "flow" ? "⌘" : "▭"}
                  </span>
                  <span>{highlight.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.joinedInfo} aria-label="Уже с нами 1 200+ астрологов">
            <div className={styles.joinedAvatars} aria-hidden="true">
              <span>МК</span>
              <span>ДЛ</span>
              <span>ЗМ</span>
              <span>НР</span>
            </div>
            <p>
              Уже с нами <strong>1 200+ астрологов</strong>
            </p>
          </div>
        </div>
      </section>
      <section className={styles.formPane} aria-label="Authentication" />
    </main>
  );
}
