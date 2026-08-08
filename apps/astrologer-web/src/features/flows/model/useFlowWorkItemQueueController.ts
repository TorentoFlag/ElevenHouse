import type {
  FlowWorkItem,
  FlowWorkItemBookingContext,
  FlowWorkItemManualClientContext,
  FlowWorkItemQueueEntry
} from "@elevenhouse/contracts";
import { useRef, useState } from "react";

import { useCurrentAstrologerProfileQuery } from "../../astrologer-profile/model/useCurrentAstrologerProfileQuery";
import {
  classifyFlowWorkItemCommandError,
  createFlowWorkItemCommandAttemptRegistry,
  describeFlowWorkItemCommandError,
  type FlowWorkItemCommandOperation,
  type FlowWorkItemCommandState
} from "./flowWorkItemCommandModel";
import { useCompleteFlowWorkItemMutation } from "./useCompleteFlowWorkItemMutation";
import { useFlowWorkItemsQuery } from "./useFlowWorkItemsQuery";
import { useSnoozeFlowWorkItemMutation } from "./useSnoozeFlowWorkItemMutation";
import { useStartFlowWorkItemMutation } from "./useStartFlowWorkItemMutation";

export type FlowWorkItemQueueProfileState = "loading" | "error" | "profile_required" | "ready";

type AvailableFlowWorkItemQueueEntry = FlowWorkItemQueueEntry & {
  readonly context: FlowWorkItemBookingContext | FlowWorkItemManualClientContext;
};

function hasAvailableContext(
  entry: FlowWorkItemQueueEntry
): entry is AvailableFlowWorkItemQueueEntry {
  return entry.context.status === "available";
}

function bookingLifecycleEvidence(entry: AvailableFlowWorkItemQueueEntry) {
  return entry.context.subjectType === "booking"
    ? { expectedBookingLifecycleRevision: entry.context.booking.lifecycleRevision }
    : {};
}

export function useFlowWorkItemQueueController(input: {
  readonly locale: "ru" | "en";
  readonly limit?: 5 | 50;
}) {
  const profileQuery = useCurrentAstrologerProfileQuery();
  const workItemsQuery = useFlowWorkItemsQuery({
    status: "active",
    limit: input.limit ?? 50,
    offset: 0
  });
  const startMutation = useStartFlowWorkItemMutation();
  const snoozeMutation = useSnoozeFlowWorkItemMutation();
  const completeMutation = useCompleteFlowWorkItemMutation();
  const attempts = useRef(createFlowWorkItemCommandAttemptRegistry()).current;
  const [commandStateByWorkItemId, setCommandStateByWorkItemId] = useState<
    Readonly<Record<string, FlowWorkItemCommandState | undefined>>
  >({});
  const [snoozeTarget, setSnoozeTarget] = useState<AvailableFlowWorkItemQueueEntry | null>(null);
  const [completionTarget, setCompletionTarget] = useState<AvailableFlowWorkItemQueueEntry | null>(
    null
  );

  const profile = profileQuery.data?.profile ?? null;
  const profileState: FlowWorkItemQueueProfileState = profile
    ? "ready"
    : profileQuery.isLoading
      ? "loading"
      : profileQuery.isError
        ? "error"
        : "profile_required";

  const setCommandState = (workItemId: string, state: FlowWorkItemCommandState | null) => {
    setCommandStateByWorkItemId((current) => {
      if (state) return { ...current, [workItemId]: state };
      if (!(workItemId in current)) return current;
      const next = { ...current };
      delete next[workItemId];
      return next;
    });
  };

  const beginAttempt = (
    operation: FlowWorkItemCommandOperation,
    workItem: FlowWorkItem,
    body: unknown
  ): string | null => {
    try {
      const idempotencyKey = attempts.acquire(operation, workItem.id, body);
      setCommandState(workItem.id, { status: "pending", operation });
      return idempotencyKey;
    } catch {
      setCommandState(workItem.id, {
        status: "error",
        operation,
        userMessage: describeFlowWorkItemCommandError(
          { kind: "refetch_required", rejection: null },
          input.locale
        ),
        refetchRequired: true
      });
      return null;
    }
  };

  const acknowledge = (
    operation: FlowWorkItemCommandOperation,
    workItem: FlowWorkItem,
    idempotencyKey: string
  ) => {
    attempts.acknowledge(operation, workItem.id, idempotencyKey);
    setCommandState(workItem.id, null);
    if (operation === "snooze") setSnoozeTarget(null);
    if (operation === "complete") setCompletionTarget(null);
  };

  const reject = (
    operation: FlowWorkItemCommandOperation,
    workItem: FlowWorkItem,
    idempotencyKey: string,
    error: unknown
  ) => {
    const classification = classifyFlowWorkItemCommandError(error);
    const refetchRequired = classification.kind === "refetch_required";
    if (refetchRequired) attempts.markConflict(operation, workItem.id, idempotencyKey);
    setCommandState(workItem.id, {
      status: "error",
      operation,
      userMessage: describeFlowWorkItemCommandError(classification, input.locale),
      refetchRequired
    });
    if (operation === "snooze" && refetchRequired) setSnoozeTarget(null);
    if (operation === "complete" && refetchRequired) setCompletionTarget(null);
  };

  const start = (entry: FlowWorkItemQueueEntry) => {
    if (!hasAvailableContext(entry)) return;
    const { workItem } = entry;
    const body = {
      expectedRevision: workItem.revision,
      ...bookingLifecycleEvidence(entry)
    };
    const idempotencyKey = beginAttempt("start", workItem, body);
    if (!idempotencyKey) return;
    startMutation.mutate(
      { workItemId: workItem.id, body, idempotencyKey },
      {
        onSuccess: () => acknowledge("start", workItem, idempotencyKey),
        onError: (error) => reject("start", workItem, idempotencyKey, error)
      }
    );
  };

  const openSnooze = (entry: FlowWorkItemQueueEntry) => {
    if (!hasAvailableContext(entry)) return;
    const { workItem } = entry;
    const state = commandStateByWorkItemId[workItem.id];
    if (state?.status === "pending" || (state?.status === "error" && state.refetchRequired)) {
      return;
    }
    setCompletionTarget(null);
    setSnoozeTarget(entry);
  };

  const closeSnooze = () => {
    if (snoozeTarget && commandStateByWorkItemId[snoozeTarget.workItem.id]?.status === "pending") {
      return;
    }
    setSnoozeTarget(null);
  };

  const confirmSnooze = (snoozedUntil: string) => {
    if (!snoozeTarget) return;
    const { workItem } = snoozeTarget;
    const body = {
      expectedRevision: workItem.revision,
      ...bookingLifecycleEvidence(snoozeTarget),
      snoozedUntil
    };
    const idempotencyKey = beginAttempt("snooze", workItem, body);
    if (!idempotencyKey) return;
    snoozeMutation.mutate(
      { workItemId: workItem.id, body, idempotencyKey },
      {
        onSuccess: () => acknowledge("snooze", workItem, idempotencyKey),
        onError: (error) => reject("snooze", workItem, idempotencyKey, error)
      }
    );
  };

  const openComplete = (entry: FlowWorkItemQueueEntry) => {
    const workItem = entry.workItem;
    const state = commandStateByWorkItemId[workItem.id];
    if (
      !hasAvailableContext(entry) ||
      workItem.status !== "in_progress" ||
      state?.status === "pending" ||
      (state?.status === "error" && state.refetchRequired)
    ) {
      return;
    }
    setSnoozeTarget(null);
    setCompletionTarget(entry);
  };

  const closeComplete = () => {
    if (
      completionTarget &&
      commandStateByWorkItemId[completionTarget.workItem.id]?.status === "pending"
    ) {
      return;
    }
    setCompletionTarget(null);
  };

  const confirmComplete = (resultSummary: string | undefined) => {
    if (!completionTarget) return;
    const workItem = completionTarget.workItem;
    const body = {
      expectedRevision: workItem.revision,
      ...bookingLifecycleEvidence(completionTarget),
      ...(resultSummary === undefined ? {} : { resultSummary })
    };
    const idempotencyKey = beginAttempt("complete", workItem, body);
    if (!idempotencyKey) return;
    completeMutation.mutate(
      { workItemId: workItem.id, body, idempotencyKey },
      {
        onSuccess: () => acknowledge("complete", workItem, idempotencyKey),
        onError: (error) => reject("complete", workItem, idempotencyKey, error)
      }
    );
  };

  const retry = async () => {
    const result = await workItemsQuery.refetch();
    if (!result.isSuccess) return;
    attempts.resetAllAfterRefetch();
    setCommandStateByWorkItemId({});
    setSnoozeTarget(null);
    setCompletionTarget(null);
  };

  const snoozeState = snoozeTarget ? commandStateByWorkItemId[snoozeTarget.workItem.id] : undefined;
  const completionState = completionTarget
    ? commandStateByWorkItemId[completionTarget.workItem.id]
    : undefined;

  return {
    profileState,
    timeZone: profile?.timezone ?? null,
    retryProfile: () => void profileQuery.refetch(),
    items: workItemsQuery.data?.items ?? [],
    total: workItemsQuery.data?.total ?? 0,
    asOf: workItemsQuery.data?.asOf ?? null,
    isLoading: workItemsQuery.isLoading,
    isError: workItemsQuery.isError,
    isFetching: workItemsQuery.isFetching,
    commandStateByWorkItemId,
    start,
    openSnooze,
    openComplete,
    retry,
    snoozeTarget,
    snoozePending: snoozeState?.status === "pending",
    snoozeError:
      snoozeState?.status === "error" && snoozeState.operation === "snooze"
        ? snoozeState.userMessage
        : null,
    closeSnooze,
    confirmSnooze,
    completionTarget,
    completionPending: completionState?.status === "pending",
    completionError:
      completionState?.status === "error" && completionState.operation === "complete"
        ? completionState.userMessage
        : null,
    closeComplete,
    confirmComplete
  } as const;
}
