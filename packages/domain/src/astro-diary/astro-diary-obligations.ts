import { Temporal } from "@js-temporal/polyfill";
import {
  astroDiaryResponseObligationSchema,
  type AstroDiaryResponseObligation
} from "@elevenhouse/contracts";
import { calculateAstroDiaryResponseDue } from "./astro-diary-sla";

export type AstroDiaryResponseObligationState = AstroDiaryResponseObligation;

export function createAstroDiaryResponseObligation(input: {
  readonly obligationId: string;
  readonly journalId: string;
  readonly cycleId: string;
  readonly triggerItemId: string;
  readonly openedAt: string;
  readonly responseSlaWorkingDays: number;
  readonly workingWeekdays: readonly number[];
  readonly serviceTimezone: string;
}): AstroDiaryResponseObligationState {
  const openedAt = Temporal.Instant.from(input.openedAt).toString();
  const due = calculateAstroDiaryResponseDue({ ...input, openedAt });
  return Object.freeze(
    astroDiaryResponseObligationSchema.parse({
      id: input.obligationId,
      journalId: input.journalId,
      cycleId: input.cycleId,
      triggerItemId: input.triggerItemId,
      state: "open",
      version: 1,
      openedAt,
      ...due,
      workingWeekdays: [...due.workingWeekdays],
      satisfiedByItemId: null,
      closedAt: null
    })
  );
}

type ObligationTransitionOutcome =
  | Readonly<{ outcome: "applied"; obligation: AstroDiaryResponseObligationState }>
  | Readonly<{ outcome: "idempotent" }>
  | Readonly<{ outcome: "not_due" | "already_terminal" }>
  | Readonly<{ outcome: "version_conflict"; expectedVersion: number; currentVersion: number }>;

export function markAstroDiaryResponseObligationOverdue(
  obligation: AstroDiaryResponseObligationState,
  input: { readonly expectedVersion: number; readonly observedAt: string }
): ObligationTransitionOutcome {
  const conflict = versionConflict(obligation, input.expectedVersion);
  if (conflict) return conflict;
  if (obligation.state === "overdue") return { outcome: "idempotent" };
  if (obligation.state !== "open") return { outcome: "already_terminal" };
  if (Temporal.Instant.compare(input.observedAt, obligation.dueAt) < 0) {
    return { outcome: "not_due" };
  }
  return {
    outcome: "applied",
    obligation: Object.freeze({ ...obligation, state: "overdue", version: obligation.version + 1 })
  };
}

export function satisfyAstroDiaryResponseObligation(
  obligation: AstroDiaryResponseObligationState,
  input: {
    readonly expectedVersion: number;
    readonly responseItemId: string;
    readonly occurredAt: string;
  }
): ObligationTransitionOutcome {
  const conflict = versionConflict(obligation, input.expectedVersion);
  if (conflict) return conflict;
  if (obligation.state === "satisfied") return { outcome: "idempotent" };
  if (obligation.state !== "open" && obligation.state !== "overdue") {
    return { outcome: "already_terminal" };
  }
  return terminalTransition(obligation, {
    state: "satisfied",
    satisfiedByItemId: input.responseItemId,
    occurredAt: input.occurredAt
  });
}

export function cancelAstroDiaryResponseObligation(
  obligation: AstroDiaryResponseObligationState,
  input: { readonly expectedVersion: number; readonly occurredAt: string }
): ObligationTransitionOutcome {
  return transitionWithoutResponse(obligation, input, "cancelled_by_finance_revocation");
}

export function closeAstroDiaryResponseObligationWithoutResponse(
  obligation: AstroDiaryResponseObligationState,
  input: { readonly expectedVersion: number; readonly occurredAt: string }
): ObligationTransitionOutcome {
  return transitionWithoutResponse(obligation, input, "closed_without_response");
}

export function projectAstroDiaryResponseStatus(
  obligation: AstroDiaryResponseObligationState,
  now: string
): "open" | "due_soon" | "overdue" | AstroDiaryResponseObligationState["state"] {
  if (obligation.state !== "open") return obligation.state;
  const current = Temporal.Instant.from(now);
  const due = Temporal.Instant.from(obligation.dueAt);
  if (Temporal.Instant.compare(current, due) >= 0) return "overdue";
  const dueLocalDate = due.toZonedDateTimeISO(obligation.serviceTimezone).toPlainDate();
  const dueSoonStarts = dueLocalDate
    .toPlainDateTime(Temporal.PlainTime.from("00:00"))
    .toZonedDateTime(obligation.serviceTimezone, { disambiguation: "later" })
    .toInstant();
  return Temporal.Instant.compare(current, dueSoonStarts) >= 0 ? "due_soon" : "open";
}

function transitionWithoutResponse(
  obligation: AstroDiaryResponseObligationState,
  input: { readonly expectedVersion: number; readonly occurredAt: string },
  state: "cancelled_by_finance_revocation" | "closed_without_response"
): ObligationTransitionOutcome {
  const conflict = versionConflict(obligation, input.expectedVersion);
  if (conflict) return conflict;
  if (obligation.state === state) return { outcome: "idempotent" };
  if (obligation.state !== "open" && obligation.state !== "overdue") {
    return { outcome: "already_terminal" };
  }
  return terminalTransition(obligation, {
    state,
    satisfiedByItemId: null,
    occurredAt: input.occurredAt
  });
}

function terminalTransition(
  obligation: AstroDiaryResponseObligationState,
  input: {
    readonly state: "satisfied" | "cancelled_by_finance_revocation" | "closed_without_response";
    readonly satisfiedByItemId: string | null;
    readonly occurredAt: string;
  }
): Extract<ObligationTransitionOutcome, { outcome: "applied" }> {
  return {
    outcome: "applied",
    obligation: Object.freeze({
      ...obligation,
      state: input.state,
      version: obligation.version + 1,
      satisfiedByItemId: input.satisfiedByItemId,
      closedAt: Temporal.Instant.from(input.occurredAt).toString()
    })
  };
}

function versionConflict(
  obligation: AstroDiaryResponseObligationState,
  expectedVersion: number
): Extract<ObligationTransitionOutcome, { outcome: "version_conflict" }> | null {
  return expectedVersion === obligation.version
    ? null
    : { outcome: "version_conflict", expectedVersion, currentVersion: obligation.version };
}
