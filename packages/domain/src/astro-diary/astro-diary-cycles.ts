import type { AstroDiaryCycle, AstroDiaryResponseObligation } from "@elevenhouse/contracts";
import { Temporal } from "@js-temporal/polyfill";

import {
  consumeAvailableAllowance,
  consumeReservedAllowance,
  forfeitReservedAllowance,
  releaseReservedAllowance,
  reservePeriodAllowance,
  type ClientSubscriptionAllowanceCommandOutcome,
  type ClientSubscriptionPeriodAllowance
} from "../client-subscriptions/client-subscription-allowance";

export type AstroDiaryCycleDecisionRejection =
  | {
      readonly outcome: "rejected";
      readonly code: "journal_has_open_cycle";
      readonly openCycleId: string;
    }
  | {
      readonly outcome: "rejected";
      readonly code: "cycle_version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | {
      readonly outcome: "rejected";
      readonly code: "cycle_state_conflict";
      readonly currentState: AstroDiaryCycle["state"];
    }
  | {
      readonly outcome: "rejected";
      readonly code:
        | "allowance_exhausted"
        | "allowance_period_ended"
        | "allowance_idempotency_conflict"
        | "allowance_reservation_conflict"
        | "allowance_scope_conflict"
        | "opening_reservation_missing"
        | "client_response_not_due"
        | "client_response_window_ended"
        | "prompt_scope_conflict"
        | "obligation_scope_conflict"
        | "obligation_state_conflict";
    }
  | {
      readonly outcome: "rejected";
      readonly code: "allowance_version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | {
      readonly outcome: "rejected";
      readonly code: "obligation_version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    };

export type AstroDiaryCycleOpenedDecision =
  | {
      readonly outcome: "opened";
      readonly cycle: AstroDiaryCycle;
      readonly allowance: ClientSubscriptionPeriodAllowance;
      readonly allowanceTransition: "consume_available";
      readonly obligation: AstroDiaryResponseObligation;
    }
  | {
      readonly outcome: "opened";
      readonly cycle: AstroDiaryCycle;
      readonly allowance: ClientSubscriptionPeriodAllowance;
      readonly allowanceTransition: "reserve_opening";
      readonly obligation: null;
    }
  | AstroDiaryCycleDecisionRejection;

export type AstroDiaryCycleAppliedDecision =
  | {
      readonly outcome: "applied";
      readonly cycle: AstroDiaryCycle;
      readonly allowance: ClientSubscriptionPeriodAllowance;
      readonly allowanceTransition: "consume_opening_reservation" | "release_opening_reservation";
      readonly obligation?: AstroDiaryResponseObligation;
    }
  | {
      readonly outcome: "applied";
      readonly cycle: AstroDiaryCycle;
      readonly allowance: null;
      readonly allowanceTransition: "none";
      readonly obligation?: AstroDiaryResponseObligation;
      readonly followUpPromptItemId?: string;
    }
  | AstroDiaryCycleDecisionRejection;

export function openClientInitiatedCycle(input: {
  readonly existingOpenCycleId: string | null;
  readonly cycleId: string;
  readonly journalId: string;
  readonly openingPeriodId: string;
  readonly openingItemId: string;
  readonly openedAt: string;
  readonly allowance: ClientSubscriptionPeriodAllowance;
  readonly allowanceExpectedVersion: number;
  readonly allowanceIdempotencyKey: string;
  readonly allowanceConsumptionId: string;
  readonly obligation: AstroDiaryResponseObligation;
}): AstroDiaryCycleOpenedDecision {
  if (input.existingOpenCycleId !== null) {
    return {
      outcome: "rejected",
      code: "journal_has_open_cycle",
      openCycleId: input.existingOpenCycleId
    };
  }
  if (input.allowance.periodId !== input.openingPeriodId) {
    return { outcome: "rejected", code: "allowance_scope_conflict" };
  }
  const obligationRejection = validateNewObligation(input.obligation, {
    journalId: input.journalId,
    cycleId: input.cycleId,
    triggerItemId: input.openingItemId
  });
  if (obligationRejection) return obligationRejection;

  const allowanceOutcome = consumeAvailableAllowance(input.allowance, {
    expectedVersion: input.allowanceExpectedVersion,
    idempotencyKey: input.allowanceIdempotencyKey,
    consumptionId: input.allowanceConsumptionId,
    now: input.openedAt
  });
  if (!isAllowanceSuccess(allowanceOutcome)) {
    return rejectAllowanceFailure(allowanceOutcome);
  }

  return {
    outcome: "opened",
    cycle: newCycle(input, "awaiting_astrologer_response", null, null, null),
    allowance: allowanceOutcome.allowance,
    allowanceTransition: "consume_available",
    obligation: input.obligation
  };
}

export function openAstrologerPromptCycle(input: {
  readonly existingOpenCycleId: string | null;
  readonly cycleId: string;
  readonly journalId: string;
  readonly openingPeriodId: string;
  readonly openingPromptItemId: string;
  readonly openedAt: string;
  readonly reservationId: string;
  readonly allowance: ClientSubscriptionPeriodAllowance;
  readonly allowanceExpectedVersion: number;
  readonly allowanceIdempotencyKey: string;
  readonly clientResponseWindowCalendarDays: number;
  readonly serviceTimezone: string;
}): AstroDiaryCycleOpenedDecision {
  if (input.existingOpenCycleId !== null) {
    return {
      outcome: "rejected",
      code: "journal_has_open_cycle",
      openCycleId: input.existingOpenCycleId
    };
  }
  if (input.allowance.periodId !== input.openingPeriodId) {
    return { outcome: "rejected", code: "allowance_scope_conflict" };
  }
  const allowanceOutcome = reservePeriodAllowance(input.allowance, {
    expectedVersion: input.allowanceExpectedVersion,
    idempotencyKey: input.allowanceIdempotencyKey,
    reservationId: input.reservationId,
    now: input.openedAt
  });
  if (!isAllowanceSuccess(allowanceOutcome)) {
    return rejectAllowanceFailure(allowanceOutcome);
  }

  return {
    outcome: "opened",
    cycle: newCycle(
      input,
      "awaiting_client_entry",
      input.reservationId,
      clientResponseWindow(input.openedAt, input),
      input.openingPromptItemId
    ),
    allowance: allowanceOutcome.allowance,
    allowanceTransition: "reserve_opening",
    obligation: null
  };
}

export function acceptAstrologerPrompt(
  cycle: AstroDiaryCycle,
  input: {
    readonly expectedCycleVersion: number;
    readonly promptItemId: string;
    readonly clientEntryItemId: string;
    readonly occurredAt: string;
    readonly allowance: ClientSubscriptionPeriodAllowance;
    readonly allowanceExpectedVersion: number;
    readonly allowanceIdempotencyKey: string;
    readonly obligation: AstroDiaryResponseObligation;
  }
): AstroDiaryCycleAppliedDecision {
  const cycleRejection = requireCycle(cycle, input.expectedCycleVersion, ["awaiting_client_entry"]);
  if (cycleRejection) return cycleRejection;
  if (clientResponseWindowEnded(cycle, input.occurredAt)) {
    return { outcome: "rejected", code: "client_response_window_ended" };
  }
  if (cycle.awaitingClientPromptItemId !== input.promptItemId) {
    return { outcome: "rejected", code: "prompt_scope_conflict" };
  }
  if (cycle.openingAllowanceReservationId === null) {
    return { outcome: "rejected", code: "opening_reservation_missing" };
  }
  if (input.allowance.periodId !== cycle.openingPeriodId) {
    return { outcome: "rejected", code: "allowance_scope_conflict" };
  }
  const obligationRejection = validateNewObligation(input.obligation, {
    journalId: cycle.journalId,
    cycleId: cycle.id,
    triggerItemId: input.clientEntryItemId
  });
  if (obligationRejection) return obligationRejection;

  const allowanceOutcome = consumeReservedAllowance(input.allowance, {
    expectedVersion: input.allowanceExpectedVersion,
    idempotencyKey: input.allowanceIdempotencyKey,
    reservationId: cycle.openingAllowanceReservationId,
    now: input.occurredAt
  });
  if (!isAllowanceSuccess(allowanceOutcome)) {
    return rejectAllowanceFailure(allowanceOutcome);
  }

  return {
    outcome: "applied",
    cycle: advanceCycle(cycle, "awaiting_astrologer_response", null, null),
    allowance: allowanceOutcome.allowance,
    allowanceTransition: "consume_opening_reservation",
    obligation: input.obligation
  };
}

export function closeAwaitingClientCycle(
  cycle: AstroDiaryCycle,
  input: {
    readonly command: "client_declined" | "prompt_withdrawn" | "client_response_expired";
    readonly expectedCycleVersion: number;
    readonly promptItemId: string;
    readonly occurredAt: string;
    readonly allowance: ClientSubscriptionPeriodAllowance | null;
    readonly allowanceExpectedVersion: number | null;
    readonly allowanceIdempotencyKey: string | null;
  }
): AstroDiaryCycleAppliedDecision {
  const cycleRejection = requireCycle(cycle, input.expectedCycleVersion, [
    "awaiting_client_entry",
    "awaiting_client_follow_up"
  ]);
  if (cycleRejection) return cycleRejection;
  if (cycle.awaitingClientPromptItemId !== input.promptItemId) {
    return { outcome: "rejected", code: "prompt_scope_conflict" };
  }

  if (
    input.command === "client_response_expired" &&
    (cycle.clientResponseDueAt === null ||
      Temporal.Instant.compare(input.occurredAt, cycle.clientResponseDueAt) < 0)
  ) {
    return { outcome: "rejected", code: "client_response_not_due" };
  }

  const closedCycle = closeCycle(cycle, input.command, input.occurredAt);
  if (cycle.state === "awaiting_client_follow_up") {
    if (
      input.allowance !== null ||
      input.allowanceExpectedVersion !== null ||
      input.allowanceIdempotencyKey !== null
    ) {
      return { outcome: "rejected", code: "allowance_scope_conflict" };
    }
    return {
      outcome: "applied",
      cycle: closedCycle,
      allowance: null,
      allowanceTransition: "none"
    };
  }

  if (
    cycle.openingAllowanceReservationId === null ||
    input.allowance === null ||
    input.allowanceExpectedVersion === null ||
    input.allowanceIdempotencyKey === null
  ) {
    return { outcome: "rejected", code: "opening_reservation_missing" };
  }
  if (input.allowance.periodId !== cycle.openingPeriodId) {
    return { outcome: "rejected", code: "allowance_scope_conflict" };
  }
  const allowanceOutcome = releaseReservedAllowance(input.allowance, {
    expectedVersion: input.allowanceExpectedVersion,
    idempotencyKey: input.allowanceIdempotencyKey,
    reservationId: cycle.openingAllowanceReservationId,
    now: input.occurredAt
  });
  if (!isAllowanceSuccess(allowanceOutcome)) {
    return rejectAllowanceFailure(allowanceOutcome);
  }

  return {
    outcome: "applied",
    cycle: closedCycle,
    allowance: allowanceOutcome.allowance,
    allowanceTransition: "release_opening_reservation"
  };
}

export function publishAstrologerClosingReply(
  cycle: AstroDiaryCycle,
  input: {
    readonly expectedCycleVersion: number;
    readonly replyItemId: string;
    readonly occurredAt: string;
    readonly obligation: AstroDiaryResponseObligation;
    readonly expectedObligationVersion: number;
  }
): AstroDiaryCycleAppliedDecision {
  const cycleRejection = requireCycle(cycle, input.expectedCycleVersion, [
    "awaiting_astrologer_response",
    "awaiting_astrologer_closing_response"
  ]);
  if (cycleRejection) return cycleRejection;
  const obligation = satisfyObligation(cycle, input);
  if (obligation.outcome === "rejected") return obligation;
  return {
    outcome: "applied",
    cycle: closeCycle(cycle, "completed", input.occurredAt),
    allowance: null,
    allowanceTransition: "none",
    obligation: obligation.obligation
  };
}

export function publishAstrologerReplyWithFollowUp(
  cycle: AstroDiaryCycle,
  input: {
    readonly expectedCycleVersion: number;
    readonly replyItemId: string;
    readonly followUpPromptItemId: string;
    readonly occurredAt: string;
    readonly obligation: AstroDiaryResponseObligation;
    readonly expectedObligationVersion: number;
    readonly clientResponseWindowCalendarDays: number;
    readonly serviceTimezone: string;
  }
): AstroDiaryCycleAppliedDecision {
  const cycleRejection = requireCycle(cycle, input.expectedCycleVersion, [
    "awaiting_astrologer_response"
  ]);
  if (cycleRejection) return cycleRejection;
  const obligation = satisfyObligation(cycle, input);
  if (obligation.outcome === "rejected") return obligation;
  return {
    outcome: "applied",
    cycle: advanceCycle(
      cycle,
      "awaiting_client_follow_up",
      clientResponseWindow(input.occurredAt, input),
      input.followUpPromptItemId
    ),
    allowance: null,
    allowanceTransition: "none",
    obligation: obligation.obligation,
    followUpPromptItemId: input.followUpPromptItemId
  };
}

export function publishClientFollowUp(
  cycle: AstroDiaryCycle,
  input: {
    readonly expectedCycleVersion: number;
    readonly promptItemId: string;
    readonly clientEntryItemId: string;
    readonly occurredAt: string;
    readonly obligation: AstroDiaryResponseObligation;
  }
): AstroDiaryCycleAppliedDecision {
  const cycleRejection = requireCycle(cycle, input.expectedCycleVersion, [
    "awaiting_client_follow_up"
  ]);
  if (cycleRejection) return cycleRejection;
  if (clientResponseWindowEnded(cycle, input.occurredAt)) {
    return { outcome: "rejected", code: "client_response_window_ended" };
  }
  if (cycle.awaitingClientPromptItemId !== input.promptItemId) {
    return { outcome: "rejected", code: "prompt_scope_conflict" };
  }
  const obligationRejection = validateNewObligation(input.obligation, {
    journalId: cycle.journalId,
    cycleId: cycle.id,
    triggerItemId: input.clientEntryItemId
  });
  if (obligationRejection) return obligationRejection;
  return {
    outcome: "applied",
    cycle: advanceCycle(cycle, "awaiting_astrologer_closing_response", null, null),
    allowance: null,
    allowanceTransition: "none",
    obligation: input.obligation
  };
}

export function applyAstroDiaryFinanceRevocation(
  cycle: AstroDiaryCycle,
  input: {
    readonly expectedCycleVersion: number;
    readonly occurredAt: string;
    readonly obligations: readonly AstroDiaryResponseObligation[];
    readonly allowance: ClientSubscriptionPeriodAllowance | null;
    readonly allowanceExpectedVersion: number | null;
    readonly allowanceIdempotencyKey: string | null;
  }
):
  | Readonly<{
      outcome: "applied";
      cycle: AstroDiaryCycle;
      obligations: readonly AstroDiaryResponseObligation[];
      allowance: ClientSubscriptionPeriodAllowance | null;
      allowanceTransition: "none" | "forfeit_opening_reservation";
    }>
  | AstroDiaryCycleDecisionRejection {
  const cycleRejection = requireCycle(cycle, input.expectedCycleVersion, [
    "awaiting_client_entry",
    "awaiting_astrologer_response",
    "awaiting_client_follow_up",
    "awaiting_astrologer_closing_response"
  ]);
  if (cycleRejection) return cycleRejection;
  if (
    input.obligations.some(
      (obligation) =>
        obligation.journalId !== cycle.journalId ||
        obligation.cycleId !== cycle.id ||
        (obligation.state !== "open" && obligation.state !== "overdue")
    )
  ) {
    return { outcome: "rejected", code: "obligation_scope_conflict" };
  }
  let allowance: ClientSubscriptionPeriodAllowance | null = null;
  let allowanceTransition: "none" | "forfeit_opening_reservation" = "none";
  if (cycle.state === "awaiting_client_entry") {
    if (
      cycle.openingAllowanceReservationId === null ||
      input.allowance === null ||
      input.allowanceExpectedVersion === null ||
      input.allowanceIdempotencyKey === null ||
      input.allowance.periodId !== cycle.openingPeriodId
    ) {
      return { outcome: "rejected", code: "opening_reservation_missing" };
    }
    const forfeited = forfeitReservedAllowance(input.allowance, {
      expectedVersion: input.allowanceExpectedVersion,
      idempotencyKey: input.allowanceIdempotencyKey,
      reservationId: cycle.openingAllowanceReservationId,
      now: input.occurredAt
    });
    if (!isAllowanceSuccess(forfeited)) return rejectAllowanceFailure(forfeited);
    allowance = forfeited.allowance;
    allowanceTransition = "forfeit_opening_reservation";
  } else if (
    input.allowance !== null ||
    input.allowanceExpectedVersion !== null ||
    input.allowanceIdempotencyKey !== null
  ) {
    return { outcome: "rejected", code: "allowance_scope_conflict" };
  }
  return {
    outcome: "applied",
    cycle: closeCycle(cycle, "cancelled_by_finance_revocation", input.occurredAt),
    obligations: input.obligations.map((obligation) => ({
      ...obligation,
      state: "cancelled_by_finance_revocation" as const,
      version: obligation.version + 1,
      satisfiedByItemId: null,
      closedAt: input.occurredAt
    })),
    allowance,
    allowanceTransition
  };
}

function newCycle(
  input: {
    readonly cycleId: string;
    readonly journalId: string;
    readonly openingPeriodId: string;
    readonly openedAt: string;
  },
  state: "awaiting_client_entry" | "awaiting_astrologer_response",
  openingAllowanceReservationId: string | null,
  clientWindow: ClientResponseWindow | null,
  awaitingClientPromptItemId: string | null
): AstroDiaryCycle {
  return {
    id: input.cycleId,
    journalId: input.journalId,
    openingPeriodId: input.openingPeriodId,
    openingAllowanceReservationId,
    awaitingClientPromptItemId,
    clientResponseDueAt: clientWindow?.dueAt ?? null,
    clientResponseWindowCalendarDays: clientWindow?.calendarDays ?? null,
    clientResponseTimezone: clientWindow?.serviceTimezone ?? null,
    state,
    version: 1,
    openedAt: input.openedAt,
    closedAt: null,
    closeReason: null
  };
}

function advanceCycle(
  cycle: AstroDiaryCycle,
  state:
    | "awaiting_astrologer_response"
    | "awaiting_client_follow_up"
    | "awaiting_astrologer_closing_response",
  clientWindow: ClientResponseWindow | null,
  awaitingClientPromptItemId: string | null
): AstroDiaryCycle {
  return {
    ...cycle,
    state,
    version: cycle.version + 1,
    openingAllowanceReservationId: null,
    clientResponseDueAt: clientWindow?.dueAt ?? null,
    clientResponseWindowCalendarDays: clientWindow?.calendarDays ?? null,
    clientResponseTimezone: clientWindow?.serviceTimezone ?? null,
    awaitingClientPromptItemId,
    closedAt: null,
    closeReason: null
  };
}

function closeCycle(
  cycle: AstroDiaryCycle,
  closeReason: Exclude<AstroDiaryCycle["closeReason"], null>,
  closedAt: string
): AstroDiaryCycle {
  return {
    ...cycle,
    state: "closed",
    version: cycle.version + 1,
    openingAllowanceReservationId: null,
    awaitingClientPromptItemId: null,
    closedAt,
    closeReason
  };
}

type ClientResponseWindow = Readonly<{
  dueAt: string;
  calendarDays: number;
  serviceTimezone: string;
}>;

function clientResponseWindow(
  openedAt: string,
  input: {
    readonly clientResponseWindowCalendarDays: number;
    readonly serviceTimezone: string;
  }
): ClientResponseWindow {
  if (
    !Number.isInteger(input.clientResponseWindowCalendarDays) ||
    input.clientResponseWindowCalendarDays < 1 ||
    input.clientResponseWindowCalendarDays > 90
  ) {
    throw new TypeError("AstroDiary client response window must be 1..90 calendar days");
  }
  const start = Temporal.Instant.from(openedAt).toZonedDateTimeISO(input.serviceTimezone);
  const dueLocal = start.toPlainDateTime().add({ days: input.clientResponseWindowCalendarDays });
  return {
    dueAt: dueLocal
      .toZonedDateTime(input.serviceTimezone, { disambiguation: "later" })
      .toInstant()
      .toString(),
    calendarDays: input.clientResponseWindowCalendarDays,
    serviceTimezone: input.serviceTimezone
  };
}

function clientResponseWindowEnded(cycle: AstroDiaryCycle, occurredAt: string): boolean {
  return (
    cycle.clientResponseDueAt === null ||
    Temporal.Instant.compare(occurredAt, cycle.clientResponseDueAt) >= 0
  );
}

function requireCycle(
  cycle: AstroDiaryCycle,
  expectedVersion: number,
  states: readonly AstroDiaryCycle["state"][]
): AstroDiaryCycleDecisionRejection | null {
  if (cycle.version !== expectedVersion) {
    return {
      outcome: "rejected",
      code: "cycle_version_conflict",
      expectedVersion,
      currentVersion: cycle.version
    };
  }
  if (!states.includes(cycle.state)) {
    return { outcome: "rejected", code: "cycle_state_conflict", currentState: cycle.state };
  }
  return null;
}

function validateNewObligation(
  obligation: AstroDiaryResponseObligation,
  expected: { readonly journalId: string; readonly cycleId: string; readonly triggerItemId: string }
): AstroDiaryCycleDecisionRejection | null {
  if (
    obligation.journalId !== expected.journalId ||
    obligation.cycleId !== expected.cycleId ||
    obligation.triggerItemId !== expected.triggerItemId
  ) {
    return { outcome: "rejected", code: "obligation_scope_conflict" };
  }
  if (
    obligation.state !== "open" ||
    obligation.version !== 1 ||
    obligation.satisfiedByItemId !== null ||
    obligation.closedAt !== null
  ) {
    return { outcome: "rejected", code: "obligation_state_conflict" };
  }
  return null;
}

function satisfyObligation(
  cycle: AstroDiaryCycle,
  input: {
    readonly replyItemId: string;
    readonly occurredAt: string;
    readonly obligation: AstroDiaryResponseObligation;
    readonly expectedObligationVersion: number;
  }
):
  | { readonly outcome: "satisfied"; readonly obligation: AstroDiaryResponseObligation }
  | AstroDiaryCycleDecisionRejection {
  if (input.obligation.journalId !== cycle.journalId || input.obligation.cycleId !== cycle.id) {
    return { outcome: "rejected", code: "obligation_scope_conflict" };
  }
  if (input.obligation.version !== input.expectedObligationVersion) {
    return {
      outcome: "rejected",
      code: "obligation_version_conflict",
      expectedVersion: input.expectedObligationVersion,
      currentVersion: input.obligation.version
    };
  }
  if (input.obligation.state !== "open" && input.obligation.state !== "overdue") {
    return { outcome: "rejected", code: "obligation_state_conflict" };
  }
  return {
    outcome: "satisfied",
    obligation: {
      ...input.obligation,
      state: "satisfied",
      version: input.obligation.version + 1,
      satisfiedByItemId: input.replyItemId,
      closedAt: input.occurredAt
    }
  };
}

function rejectAllowanceFailure(
  outcome: Exclude<
    ClientSubscriptionAllowanceCommandOutcome,
    { readonly allowance: ClientSubscriptionPeriodAllowance }
  >
): AstroDiaryCycleDecisionRejection {
  switch (outcome.outcome) {
    case "version_conflict":
      return {
        outcome: "rejected",
        code: "allowance_version_conflict",
        expectedVersion: outcome.expectedVersion,
        currentVersion: outcome.currentVersion
      };
    case "allowance_exhausted":
      return { outcome: "rejected", code: "allowance_exhausted" };
    case "period_ended":
      return { outcome: "rejected", code: "allowance_period_ended" };
    case "idempotency_conflict":
      return { outcome: "rejected", code: "allowance_idempotency_conflict" };
    case "reservation_already_exists":
    case "reservation_not_found":
    case "reservation_not_active":
      return { outcome: "rejected", code: "allowance_reservation_conflict" };
    case "paid_access_not_ended":
      return { outcome: "rejected", code: "allowance_scope_conflict" };
  }
}

function isAllowanceSuccess(
  outcome: ClientSubscriptionAllowanceCommandOutcome
): outcome is Extract<
  ClientSubscriptionAllowanceCommandOutcome,
  { readonly allowance: ClientSubscriptionPeriodAllowance }
> {
  return "allowance" in outcome;
}
