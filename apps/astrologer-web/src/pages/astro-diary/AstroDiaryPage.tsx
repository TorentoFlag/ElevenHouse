import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import styles from "./AstroDiaryPage.module.css";

export function AstroDiaryPage() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const copy = dictionary.astroDiary;

  useDocumentTitle(copy.documentTitle);

  return (
    <section className={styles.page} aria-labelledby="astro-diary-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon} aria-hidden="true">
            ◌
          </span>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id="astro-diary-title" className={styles.title}>
              {copy.title}
            </h1>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <article className={styles.connectionCard} aria-labelledby="astro-diary-connection-title">
          <p className={styles.badge}>AstroDiary</p>
          <h2 id="astro-diary-connection-title" className={styles.connectionTitle}>
            {copy.connectionTitle}
          </h2>
          <p className={styles.connectionDescription}>{copy.connectionDescription}</p>
        </article>

        <div className={styles.sectionGrid}>
          {copy.sections.map((section) => (
            <article className={styles.sectionCard} key={section.title}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <p className={styles.sectionDescription}>{section.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
