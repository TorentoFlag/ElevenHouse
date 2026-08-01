import type { FlowApprovalKind } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useFlowApprovalsQuery } from "../../features/flows/model/useFlowApprovalsQuery";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const flowApprovalsQuery = useFlowApprovalsQuery({
    status: "pending",
    limit: 5,
    offset: 0
  });
  const pendingApprovals = flowApprovalsQuery.data?.approvals ?? [];

  useDocumentTitle(dictionary.dashboard.documentTitle);

  return (
    <section className={styles.page} aria-labelledby="dashboard-title">
      <header className={styles.header}>
        <p className={styles.kicker}>{dictionary.dashboard.kicker}</p>
        <h1 id="dashboard-title" className={styles.title}>
          {dictionary.dashboard.title}
        </h1>
      </header>

      <section className={styles.flowTasks} aria-labelledby="dashboard-flow-tasks-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Runtime</p>
            <h2 id="dashboard-flow-tasks-title">Задачи из воронок</h2>
          </div>
          <a className={styles.sectionAction} href="/flows">
            Открыть воронки
          </a>
        </div>

        {flowApprovalsQuery.isLoading ? (
          <p className={styles.stateText}>Загружаем подтверждения</p>
        ) : flowApprovalsQuery.isError ? (
          <p className={styles.errorText} role="alert">
            Не удалось загрузить задачи из воронок
          </p>
        ) : pendingApprovals.length > 0 ? (
          <div className={styles.approvalList}>
            {pendingApprovals.map((approval) => (
              <article key={approval.id} className={styles.approvalCard}>
                <div>
                  <h3>{approval.title}</h3>
                  <p>{approval.preview}</p>
                </div>
                <span>{flowApprovalKindLabel(approval.kind)}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.stateText}>Нет pending-подтверждений из опубликованных воронок.</p>
        )}
      </section>
    </section>
  );
}

function flowApprovalKindLabel(kind: FlowApprovalKind) {
  if (kind === "ai_output") return "AI";
  if (kind === "message") return "Сообщение";
  if (kind === "manual_task") return "Задача";
  if (kind === "delivery") return "Выдача";
  return "Оплата";
}
