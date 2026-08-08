import { useFlowApprovalQueueController } from "../model/useFlowApprovalQueueController";
import { FlowApprovalQueue } from "./FlowApprovalQueue";
import { FlowWorkItemSnoozeDialog } from "./FlowWorkItemSnoozeDialog";

export type FlowApprovalQueuePanelProps = {
  readonly locale: "ru" | "en";
  readonly classNames?: Readonly<Record<string, string>>;
  /** Gallery surfaces keep a successful empty queue out of the primary workspace. */
  readonly hideWhenEmpty?: boolean;
};

export function FlowApprovalQueuePanel({
  locale,
  classNames,
  hideWhenEmpty = false
}: FlowApprovalQueuePanelProps) {
  const controller = useFlowApprovalQueueController({ locale });
  const copy = panelCopy[locale];
  const pending = controller.snoozeTarget !== null && controller.snoozePending;
  const hasPendingApproval = controller.approvals.some((approval) => approval.status === "pending");

  if (hideWhenEmpty && !controller.isLoading && !controller.isError && !hasPendingApproval) {
    return null;
  }

  return (
    <>
      <FlowApprovalQueue
        approvals={controller.approvals}
        locale={locale}
        runtimeAvailability={controller.runtimeAvailability}
        isLoading={controller.isLoading}
        isDeciding={controller.isDeciding}
        error={controller.error}
        classNames={classNames}
        onDecision={controller.decide}
        onSnooze={controller.timeZone ? controller.openSnooze : undefined}
      />
      {controller.timeZone ? (
        <FlowWorkItemSnoozeDialog
          open={controller.snoozeTarget !== null}
          locale={locale}
          timeZone={controller.timeZone}
          workItemTitle={controller.snoozeTarget?.title ?? ""}
          subjectLabel={copy.subjectLabel}
          pending={pending}
          error={controller.snoozeError}
          onClose={controller.closeSnooze}
          onConfirm={controller.confirmSnooze}
        />
      ) : null}
    </>
  );
}

const panelCopy = {
  ru: { subjectLabel: "Подтверждение" },
  en: { subjectLabel: "Approval" }
} as const;
