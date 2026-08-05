import { useI18n } from "@elevenhouse/i18n";
import { Link } from "react-router";

import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { FlowWorkItemQueuePanel } from "../../features/flows/ui/FlowWorkItemQueuePanel";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();

  useDocumentTitle(dictionary.dashboard.documentTitle);

  return (
    <section className={styles.page} aria-labelledby="dashboard-title">
      <header className={styles.header}>
        <p className={styles.kicker}>{dictionary.dashboard.kicker}</p>
        <h1 id="dashboard-title" className={styles.title}>
          {dictionary.dashboard.title}
        </h1>
      </header>

      <div className={styles.flowTasks}>
        <FlowWorkItemQueuePanel
          locale={locale}
          limit={5}
          className={styles.flowTasksPanel}
          headerAction={
            <Link className={styles.sectionAction} to="/flows">
              {flowTaskCopy[locale].allFlows}
            </Link>
          }
        />
      </div>
    </section>
  );
}

const flowTaskCopy = {
  ru: { allFlows: "Все воронки" },
  en: { allFlows: "All flows" }
} as const;
