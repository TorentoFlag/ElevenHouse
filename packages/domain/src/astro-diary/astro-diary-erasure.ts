import type {
  AstroDiaryCycle,
  AstroDiaryJournal,
  AstroDiaryResponseObligation
} from "@elevenhouse/contracts";

export type AstroDiaryErasureDecisionFact =
  | {
      readonly factId: string;
      readonly type: "astro_diary.journal_erasure_requested";
      readonly journalId: string;
      readonly relationshipId: string;
      readonly journalEpochId: string;
      readonly erasureRequestId: string;
      readonly cascadeRequestId: string;
      readonly occurredAt: string;
    }
  | {
      readonly factId: string;
      readonly type: "astro_diary.subscription_end_requested";
      readonly journalId: string;
      readonly subscriptionId: string;
      readonly erasureRequestId: string;
      readonly occurredAt: string;
    }
  | {
      readonly factId: string;
      readonly type: "astro_diary.cycle_closed";
      readonly journalId: string;
      readonly cycleId: string;
      readonly closeReason: "journal_deleted";
      readonly occurredAt: string;
    }
  | {
      readonly factId: string;
      readonly type: "astro_diary.obligation_closed";
      readonly journalId: string;
      readonly cycleId: string;
      readonly obligationId: string;
      readonly state: "closed_without_response";
      readonly occurredAt: string;
    };

export type AstroDiaryErasureDecision =
  | {
      readonly outcome: "erasure_started";
      readonly journal: AstroDiaryJournal;
      readonly cycles: readonly AstroDiaryCycle[];
      readonly obligations: readonly AstroDiaryResponseObligation[];
      readonly subscriptionTransition: {
        readonly kind: "schedule_end_no_renewal";
        readonly subscriptionId: string;
      };
      readonly allowanceTransition: "none";
      readonly refundTransition: "none";
      readonly erasureCommand: AstroDiaryJournalErasureCommand;
      readonly cascade: {
        readonly cascadeRequestId: string;
        readonly journalId: string;
      };
      readonly mediaAccessRevocations: readonly Readonly<{
        mediaId: string;
        journalId: string;
      }>[];
      readonly facts: readonly AstroDiaryErasureDecisionFact[];
    }
  | { readonly outcome: "rejected"; readonly code: "actor_mismatch" }
  | {
      readonly outcome: "rejected";
      readonly code: "version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | { readonly outcome: "rejected"; readonly code: "journal_erasure_in_progress" }
  | { readonly outcome: "rejected"; readonly code: "journal_already_erased" }
  | { readonly outcome: "rejected"; readonly code: "evidence_scope_conflict" }
  | { readonly outcome: "rejected"; readonly code: "fact_binding_conflict" }
  | { readonly outcome: "rejected"; readonly code: "fact_identity_conflict" };

type JournalErasureInput = {
  readonly actorUserId: string;
  readonly expectedJournalVersion: number;
  readonly subscriptionId: string;
  readonly erasureRequestId: string;
  readonly cascadeRequestId: string;
  readonly occurredAt: string;
  readonly cycles: readonly AstroDiaryCycle[];
  readonly obligations: readonly AstroDiaryResponseObligation[];
  readonly mediaIds: readonly string[];
  readonly facts: {
    readonly journalErasureRequestedFactId: string;
    readonly subscriptionEndRequestedFactId: string;
    readonly cycleClosedFactIds: readonly {
      readonly cycleId: string;
      readonly factId: string;
    }[];
    readonly obligationClosedFactIds: readonly {
      readonly obligationId: string;
      readonly factId: string;
    }[];
  };
};

export type AstroDiaryJournalErasureCommand = Readonly<{
  id: string;
  journalId: string;
  sourceJournalVersion: number;
  cascadeRequestId: string;
  requestedAt: string;
  state: "pending" | "completed";
  completedAt: string | null;
}>;

export function requestWholeJournalErasure(
  journal: AstroDiaryJournal,
  input: JournalErasureInput
): AstroDiaryErasureDecision {
  if (journal.clientUserId !== input.actorUserId) {
    return { outcome: "rejected", code: "actor_mismatch" };
  }
  if (journal.version !== input.expectedJournalVersion) {
    return {
      outcome: "rejected",
      code: "version_conflict",
      expectedVersion: input.expectedJournalVersion,
      currentVersion: journal.version
    };
  }
  if (journal.state === "erasing") {
    return { outcome: "rejected", code: "journal_erasure_in_progress" };
  }
  if (journal.state === "erased") {
    return { outcome: "rejected", code: "journal_already_erased" };
  }

  const cycleIds = input.cycles.map((cycle) => cycle.id);
  const cycleIdSet = new Set(cycleIds);
  const obligationIds = input.obligations.map((obligation) => obligation.id);
  const mediaIds = input.mediaIds;
  if (
    cycleIdSet.size !== cycleIds.length ||
    new Set(obligationIds).size !== obligationIds.length ||
    new Set(mediaIds).size !== mediaIds.length ||
    input.cycles.some((cycle) => cycle.journalId !== journal.id) ||
    input.obligations.some(
      (obligation) => obligation.journalId !== journal.id || !cycleIdSet.has(obligation.cycleId)
    )
  ) {
    return { outcome: "rejected", code: "evidence_scope_conflict" };
  }

  const cyclesToClose = input.cycles.filter((cycle) => cycle.state !== "closed");
  const obligationsToClose = input.obligations.filter(
    (obligation) => obligation.state === "open" || obligation.state === "overdue"
  );
  const cycleFactIds = exactFactMap(
    input.facts.cycleClosedFactIds,
    cyclesToClose.map((cycle) => cycle.id),
    "cycleId"
  );
  const obligationFactIds = exactFactMap(
    input.facts.obligationClosedFactIds,
    obligationsToClose.map((obligation) => obligation.id),
    "obligationId"
  );
  if (cycleFactIds === null || obligationFactIds === null) {
    return { outcome: "rejected", code: "fact_binding_conflict" };
  }
  const allFactIds = [
    input.facts.journalErasureRequestedFactId,
    input.facts.subscriptionEndRequestedFactId,
    ...cycleFactIds.values(),
    ...obligationFactIds.values()
  ];
  if (new Set(allFactIds).size !== allFactIds.length) {
    return { outcome: "rejected", code: "fact_identity_conflict" };
  }

  const closedCycles = cyclesToClose.map<AstroDiaryCycle>((cycle) => ({
    ...cycle,
    state: "closed",
    version: cycle.version + 1,
    closedAt: input.occurredAt,
    closeReason: "journal_deleted"
  }));
  const closedObligations = obligationsToClose.map<AstroDiaryResponseObligation>((obligation) => ({
    ...obligation,
    state: "closed_without_response",
    version: obligation.version + 1,
    satisfiedByItemId: null,
    closedAt: input.occurredAt
  }));
  const facts: AstroDiaryErasureDecisionFact[] = [
    {
      factId: input.facts.journalErasureRequestedFactId,
      type: "astro_diary.journal_erasure_requested",
      journalId: journal.id,
      relationshipId: journal.relationshipId,
      journalEpochId: journal.journalEpochId,
      erasureRequestId: input.erasureRequestId,
      cascadeRequestId: input.cascadeRequestId,
      occurredAt: input.occurredAt
    },
    {
      factId: input.facts.subscriptionEndRequestedFactId,
      type: "astro_diary.subscription_end_requested",
      journalId: journal.id,
      subscriptionId: input.subscriptionId,
      erasureRequestId: input.erasureRequestId,
      occurredAt: input.occurredAt
    }
  ];
  for (const cycle of closedCycles) {
    const factId = cycleFactIds.get(cycle.id);
    if (factId === undefined) {
      return { outcome: "rejected", code: "fact_binding_conflict" };
    }
    facts.push({
      factId,
      type: "astro_diary.cycle_closed",
      journalId: journal.id,
      cycleId: cycle.id,
      closeReason: "journal_deleted",
      occurredAt: input.occurredAt
    });
  }
  for (const obligation of closedObligations) {
    const factId = obligationFactIds.get(obligation.id);
    if (factId === undefined) {
      return { outcome: "rejected", code: "fact_binding_conflict" };
    }
    facts.push({
      factId,
      type: "astro_diary.obligation_closed",
      journalId: journal.id,
      cycleId: obligation.cycleId,
      obligationId: obligation.id,
      state: "closed_without_response",
      occurredAt: input.occurredAt
    });
  }

  return {
    outcome: "erasure_started",
    journal: { ...journal, state: "erasing", version: journal.version + 1 },
    cycles: closedCycles,
    obligations: closedObligations,
    subscriptionTransition: {
      kind: "schedule_end_no_renewal",
      subscriptionId: input.subscriptionId
    },
    allowanceTransition: "none",
    refundTransition: "none",
    erasureCommand: {
      id: input.erasureRequestId,
      journalId: journal.id,
      sourceJournalVersion: journal.version,
      cascadeRequestId: input.cascadeRequestId,
      requestedAt: input.occurredAt,
      state: "pending",
      completedAt: null
    },
    cascade: { cascadeRequestId: input.cascadeRequestId, journalId: journal.id },
    mediaAccessRevocations: mediaIds.map((mediaId) => ({ mediaId, journalId: journal.id })),
    facts
  };
}

export function completeWholeJournalErasure(
  journal: AstroDiaryJournal,
  input: Readonly<{
    expectedJournalVersion: number;
    erasureCommand: AstroDiaryJournalErasureCommand;
    cascadeReceipt: Readonly<{
      cascadeRequestId: string;
      journalId: string;
      completedAt: string;
    }>;
  }>
):
  | Readonly<{
      outcome: "erasure_completed";
      journal: AstroDiaryJournal;
      erasureCommand: AstroDiaryJournalErasureCommand;
    }>
  | Readonly<{
      outcome: "rejected";
      code:
        | "version_conflict"
        | "journal_state_conflict"
        | "command_scope_conflict"
        | "cascade_evidence_conflict";
    }> {
  if (journal.version !== input.expectedJournalVersion) {
    return { outcome: "rejected", code: "version_conflict" };
  }
  if (journal.state !== "erasing") {
    return { outcome: "rejected", code: "journal_state_conflict" };
  }
  if (
    input.erasureCommand.state !== "pending" ||
    input.erasureCommand.journalId !== journal.id ||
    input.erasureCommand.sourceJournalVersion >= journal.version
  ) {
    return { outcome: "rejected", code: "command_scope_conflict" };
  }
  if (
    input.cascadeReceipt.journalId !== journal.id ||
    input.cascadeReceipt.cascadeRequestId !== input.erasureCommand.cascadeRequestId
  ) {
    return { outcome: "rejected", code: "cascade_evidence_conflict" };
  }
  return {
    outcome: "erasure_completed",
    journal: { ...journal, state: "erased", version: journal.version + 1 },
    erasureCommand: {
      ...input.erasureCommand,
      state: "completed",
      completedAt: input.cascadeReceipt.completedAt
    }
  };
}

function exactFactMap<Key extends "cycleId" | "obligationId">(
  bindings: readonly (Readonly<Record<Key, string>> & { readonly factId: string })[],
  expectedIds: readonly string[],
  key: Key
): ReadonlyMap<string, string> | null {
  if (bindings.length !== expectedIds.length) return null;
  const result = new Map<string, string>();
  for (const binding of bindings) {
    const id = binding[key];
    if (result.has(id)) return null;
    result.set(id, binding.factId);
  }
  return expectedIds.every((id) => result.has(id)) ? result : null;
}
