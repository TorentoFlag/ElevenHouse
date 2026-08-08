import type {
  FlowApproval,
  FlowApprovalDecision,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";
import {
  buildFlowRuntimePresentation,
  canProjectLiveFlowRuntime
} from "../model/flowRuntimePresentation";

export type FlowApprovalQueueProps = {
  readonly approvals: readonly FlowApproval[];
  readonly locale?: "ru" | "en";
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onDecision?: (
    approval: FlowApproval,
    decision: Exclude<FlowApprovalDecision, "snoozed">
  ) => void;
  readonly onSnooze?: (approval: FlowApproval) => void;
  readonly isLoading?: boolean;
  readonly isDeciding?: boolean;
  readonly error?: Error | null;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowApprovalQueue({
  approvals,
  locale = "ru",
  runtimeAvailability = null,
  onDecision,
  onSnooze,
  isLoading = false,
  isDeciding = false,
  error = null,
  classNames
}: FlowApprovalQueueProps) {
  const className = (name: string) => classNames?.[name] ?? "";
  const copy = approvalQueueCopy[locale];
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const runtime = buildFlowRuntimePresentation(runtimeAvailability, locale);
  const canDecide = canProjectLiveFlowRuntime(runtimeAvailability);
  const decisionUnavailableReason = runtime.unavailableReason ?? copy.executionUnavailable;

  return (
    <section className={className("approvalQueue")} aria-label={copy.regionLabel}>
      <header className={className("approvalQueueHeader")}>
        <p className={className("runtimeEyebrow")}>{copy.eyebrow}</p>
        <h2>{copy.heading}</h2>
      </header>
      {error ? (
        <p className={className("runtimeError")} role="alert">
          {error.message}
        </p>
      ) : null}
      {!isLoading && pendingApprovals.length > 0 && !canDecide ? (
        <p className={className("runtimeNotice")} role="status">
          {decisionUnavailableReason}
        </p>
      ) : null}
      {isLoading ? (
        <p className={className("runtimeEmpty")}>{copy.loading}</p>
      ) : pendingApprovals.length === 0 ? (
        <p className={className("runtimeEmpty")}>{copy.empty}</p>
      ) : (
        <ul className={className("approvalList")}>
          {pendingApprovals.map((approval) => (
            <li key={approval.id}>
              <span>{copy.kind[approval.kind]}</span>
              <h3>{approval.title}</h3>
              <p>{approval.preview}</p>
              {approval.artifact ? (
                <p className={className("approvalArtifact")}>{approval.artifact.outputText}</p>
              ) : null}
              <div className={className("approvalActions")}>
                <button
                  type="button"
                  disabled={!canDecide || !onDecision || isDeciding}
                  onClick={() => {
                    if (canDecide) onDecision?.(approval, "approved");
                  }}
                >
                  {copy.approve}
                </button>
                <button
                  type="button"
                  disabled={!canDecide || !onDecision || isDeciding}
                  onClick={() => {
                    if (canDecide) onDecision?.(approval, "rejected");
                  }}
                >
                  {copy.reject}
                </button>
                <button
                  type="button"
                  disabled={!canDecide || !onSnooze || isDeciding}
                  onClick={() => {
                    if (canDecide) onSnooze?.(approval);
                  }}
                >
                  {copy.snooze}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const approvalQueueCopy = {
  ru: {
    regionLabel: "Подтверждения воронок",
    eyebrow: "Очередь",
    heading: "Ожидает подтверждения",
    loading: "Загружаем подтверждения",
    empty: "Нет задач на подтверждение",
    executionUnavailable:
      "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать.",
    approve: "Утвердить",
    reject: "Отклонить",
    snooze: "Отложить",
    kind: {
      message: "Сообщение",
      ai_output: "AI-черновик",
      delivery: "Доставка",
      payment_offer: "Оплата",
      manual_task: "Задача"
    }
  },
  en: {
    regionLabel: "Flow approvals",
    eyebrow: "Queue",
    heading: "Awaiting approval",
    loading: "Loading approvals",
    empty: "No approvals waiting",
    executionUnavailable:
      "Flow execution is not available yet. You can edit and publish the definition.",
    approve: "Approve",
    reject: "Reject",
    snooze: "Snooze",
    kind: {
      message: "Message",
      ai_output: "AI draft",
      delivery: "Delivery",
      payment_offer: "Payment",
      manual_task: "Task"
    }
  }
} as const;
