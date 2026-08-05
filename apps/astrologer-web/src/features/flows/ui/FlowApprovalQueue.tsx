import type {
  FlowApproval,
  FlowApprovalDecision,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";
import {
  buildFlowRuntimePresentation,
  canProjectLiveFlowRuntime,
  flowRuntimeExecutionUnavailableMessageRu
} from "../model/flowRuntimePresentation";

export type FlowApprovalQueueProps = {
  readonly approvals: readonly FlowApproval[];
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onDecision?: (approvalId: string, decision: FlowApprovalDecision) => void;
  readonly isLoading?: boolean;
  readonly isDeciding?: boolean;
  readonly error?: Error | null;
  readonly classNames?: Readonly<Record<string, string>>;
};

const approvalKindLabel = {
  message: "Сообщение",
  ai_output: "AI-черновик",
  delivery: "Доставка",
  payment_offer: "Оплата",
  manual_task: "Задача"
} as const;

export function FlowApprovalQueue({
  approvals,
  runtimeAvailability = null,
  onDecision,
  isLoading = false,
  isDeciding = false,
  error = null,
  classNames
}: FlowApprovalQueueProps) {
  const className = (name: string) => classNames?.[name] ?? "";
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const runtime = buildFlowRuntimePresentation(runtimeAvailability);
  const canDecide = canProjectLiveFlowRuntime(runtimeAvailability);
  const decisionUnavailableReason = runtime.unavailableReason ?? flowRuntimeExecutionUnavailableMessageRu;

  return (
    <section className={className("approvalQueue")} aria-label="Подтверждения воронок">
      <header className={className("approvalQueueHeader")}>
        <p className={className("runtimeEyebrow")}>Очередь</p>
        <h2>Ожидает подтверждения</h2>
      </header>
      {error ? <p className={className("runtimeError")} role="alert">{error.message}</p> : null}
      {!isLoading && pendingApprovals.length > 0 && !canDecide ? (
        <p className={className("runtimeNotice")} role="status">
          {decisionUnavailableReason}
        </p>
      ) : null}
      {isLoading ? (
        <p className={className("runtimeEmpty")}>Загружаем подтверждения</p>
      ) : pendingApprovals.length === 0 ? (
        <p className={className("runtimeEmpty")}>Нет задач на подтверждение</p>
      ) : (
        <ul className={className("approvalList")}>
          {pendingApprovals.map((approval) => (
            <li key={approval.id}>
              <span>{approvalKindLabel[approval.kind]}</span>
              <h3>{approval.title}</h3>
              <p>{approval.preview}</p>
              <div className={className("approvalActions")}>
                <button
                  type="button"
                  disabled={!canDecide || !onDecision || isDeciding}
                  onClick={() => {
                    if (canDecide) onDecision?.(approval.id, "approved");
                  }}
                >
                  Утвердить
                </button>
                <button
                  type="button"
                  disabled={!canDecide || !onDecision || isDeciding}
                  onClick={() => {
                    if (canDecide) onDecision?.(approval.id, "rejected");
                  }}
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  disabled={!canDecide || !onDecision || isDeciding}
                  onClick={() => {
                    if (canDecide) onDecision?.(approval.id, "snoozed");
                  }}
                >
                  Отложить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
