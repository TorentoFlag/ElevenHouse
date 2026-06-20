import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { BackLink } from "@elevenhouse/design-system/navigation";
import { authHighlights } from "./const";
import styles from "./AuthPage.module.css";

export function AuthVisualPane() {
  return (
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
        <BackLink className={styles.backLink} path="/" title="На страницу астролога" />

        <div className={styles.heroCopy}>
          <div className={styles.brandBadge}>
            <Sparkle aria-hidden="true" />
            ElevenHouse
          </div>
          <h1 className={styles.heroTitle}>
            Ваш кабинет
            <br />у астролога
          </h1>
          <div className={styles.highlightList}>
            {authHighlights.map(({ Icon, description, label }) => (
              <div className={styles.highlightItem} key={label}>
                <span className={styles.highlightIcon} aria-hidden="true">
                  <Icon />
                </span>
                <span className={styles.highlightText}>
                  <span className={styles.highlightLabel}>{label}</span>
                  <span className={styles.highlightDescription}>{description}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.joinedInfo} aria-label="Уже с астрологами 18 000+">
          <div className={styles.joinedAvatars} aria-hidden="true">
            <span>МК</span>
            <span>ДЛ</span>
            <span>ЗМ</span>
            <span>НР</span>
          </div>
          <p>
            Уже с астрологами <strong>18 000+</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
