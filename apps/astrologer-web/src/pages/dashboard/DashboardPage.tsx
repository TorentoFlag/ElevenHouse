import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { dictionary } = useI18n<AstrologerCopy>();

  useDocumentTitle(dictionary.dashboard.documentTitle);

  return (
    <section className={styles.placeholder} aria-labelledby="dashboard-title">
      <p className={styles.kicker}>{dictionary.dashboard.kicker}</p>
      <h1 id="dashboard-title" className={styles.title}>
        {dictionary.dashboard.title}
      </h1>
    </section>
  );
}
