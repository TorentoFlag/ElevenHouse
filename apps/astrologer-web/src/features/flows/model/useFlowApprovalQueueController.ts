import type { FlowApproval, FlowApprovalDecision } from "@elevenhouse/contracts";
import { useRef, useState } from "react";

import { useCurrentAstrologerProfileQuery } from "../../astrologer-profile/model/useCurrentAstrologerProfileQuery";
import {
  classifyFlowApprovalCommandError,
  createFlowApprovalCommandAttemptRegistry,
  describeFlowApprovalCommandError,
  type FlowApprovalCommandOperation,
  type FlowApprovalCommandState
} from "./flowApprovalCommandModel";
import { useDecideFlowApprovalMutation } from "./useDecideFlowApprovalMutation";
import { useFlowApprovalsQuery } from "./useFlowApprovalsQuery";

export function useFlowApprovalQueueController(input: { readonly locale: "ru" | "en" }) {
  const approvalsQuery = useFlowApprovalsQuery({ status: "pending", limit: 50, offset: 0 });
  const profileQuery = useCurrentAstrologerProfileQuery();
  const decisionMutation = useDecideFlowApprovalMutation();
  const attempts = useRef(createFlowApprovalCommandAttemptRegistry()).current;
  const [commandStateByApprovalId, setCommandStateByApprovalId] = useState<
    Readonly<Record<string, FlowApprovalCommandState | undefined>>
  >({});
  const [snoozeTarget, setSnoozeTarget] = useState<FlowApproval | null>(null);

  const setCommandState = (approvalId: string, state: FlowApprovalCommandState | null) => {
    setCommandStateByApprovalId((current) => {
      if (state) return { ...current, [approvalId]: state };
      if (!(approvalId in current)) return current;
      const next = { ...current };
      delete next[approvalId];
      return next;
    });
  };

  const submit = (
    approval: FlowApproval,
    decision: FlowApprovalDecision,
    snoozedUntil?: string
  ) => {
    const operation: FlowApprovalCommandOperation =
      decision === "approved" ? "approve" : decision === "rejected" ? "reject" : "snooze";
    const body = {
      expectedRevision: approval.revision,
      decision,
      ...(snoozedUntil ? { snoozedUntil } : {})
    };
    let idempotencyKey: string;
    try {
      idempotencyKey = attempts.acquire(operation, approval, body);
    } catch {
      setCommandState(approval.id, {
        status: "error",
        operation,
        userMessage: describeFlowApprovalCommandError({ kind: "refetch_required" }, input.locale),
        refetchRequired: true
      });
      return;
    }
    setCommandState(approval.id, { status: "pending", operation });
    decisionMutation.mutate(
      { approvalId: approval.id, body, idempotencyKey },
      {
        onSuccess: () => {
          attempts.acknowledge(operation, approval.id, idempotencyKey);
          setCommandState(approval.id, null);
          if (operation === "snooze") setSnoozeTarget(null);
        },
        onError: (error) => {
          const classification = classifyFlowApprovalCommandError(error);
          const refetchRequired = classification.kind === "refetch_required";
          if (refetchRequired) attempts.markConflict(operation, approval.id, idempotencyKey);
          setCommandState(approval.id, {
            status: "error",
            operation,
            userMessage: describeFlowApprovalCommandError(classification, input.locale),
            refetchRequired
          });
          if (operation === "snooze" && refetchRequired) setSnoozeTarget(null);
        }
      }
    );
  };

  const decide = (approval: FlowApproval, decision: Exclude<FlowApprovalDecision, "snoozed">) => {
    const state = commandStateByApprovalId[approval.id];
    if (state?.status === "pending" || (state?.status === "error" && state.refetchRequired)) return;
    submit(approval, decision);
  };

  const openSnooze = (approval: FlowApproval) => {
    const state = commandStateByApprovalId[approval.id];
    if (!profileQuery.data?.profile?.timezone || state?.status === "pending" || (state?.status === "error" && state.refetchRequired)) {
      return;
    }
    setSnoozeTarget(approval);
  };

  const closeSnooze = () => {
    if (snoozeTarget && commandStateByApprovalId[snoozeTarget.id]?.status === "pending") return;
    setSnoozeTarget(null);
  };

  const retry = async () => {
    const result = await approvalsQuery.refetch();
    if (!result.isSuccess) return;
    attempts.resetAllAfterRefetch();
    setCommandStateByApprovalId({});
    setSnoozeTarget(null);
  };

  const snoozeState = snoozeTarget ? commandStateByApprovalId[snoozeTarget.id] : undefined;
  return {
    approvals: approvalsQuery.data?.approvals ?? [],
    runtimeAvailability: approvalsQuery.data?.runtime ?? null,
    isLoading: approvalsQuery.isLoading,
    isError: approvalsQuery.isError,
    error: approvalsQuery.error instanceof Error ? approvalsQuery.error : null,
    isFetching: approvalsQuery.isFetching,
    commandStateByApprovalId,
    isDeciding: decisionMutation.isPending,
    decide,
    openSnooze,
    retry,
    timeZone: profileQuery.data?.profile?.timezone ?? null,
    snoozeTarget,
    snoozePending: snoozeState?.status === "pending",
    snoozeError:
      snoozeState?.status === "error" && snoozeState.operation === "snooze"
        ? snoozeState.userMessage
        : null,
    closeSnooze,
    confirmSnooze: (snoozedUntil: string) => {
      if (snoozeTarget) submit(snoozeTarget, "snoozed", snoozedUntil);
    }
  } as const;
}
