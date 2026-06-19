import { Chat } from "@elevenhouse/design-system/icons/Chat";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { Video } from "@elevenhouse/design-system/icons/Video";
import { BackLink } from "@elevenhouse/design-system/navigation";
import type { ComponentType, SVGProps } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import styles from "./AuthPage.module.css";

type HighlightIcon = ComponentType<SVGProps<SVGSVGElement>>;

const authHighlights: Array<{ Icon: HighlightIcon; label: string; description: string }> = [
  {
    Icon: Video,
    label: "Записи и онлайн консультации",
    description: "История сессий, записи и материалы — всегда под рукой"
  },
  {
    Icon: Orbit,
    label: "Ваши натальные карты",
    description: "Карты, расчёты и разборы от вашего астролога"
  },
  {
    Icon: Chat,
    label: "Личные сообщения",
    description: "Переписка с астрологом в одном окне"
  },
  {
    Icon: Content,
    label: "Астродневник и контент",
    description: "Прогнозы, дневник и закрытый контент по подписке"
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
