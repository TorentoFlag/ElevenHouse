import type { AstroDiaryCycle, AstroDiaryResponseObligation } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { createPeriodAllowance } from "../client-subscriptions/client-subscription-allowance";
import {
  acceptAstrologerPrompt,
  applyAstroDiaryFinanceRevocation,
  closeAwaitingClientCycle,
  openAstrologerPromptCycle,
  openClientInitiatedCycle,
  publishAstrologerClosingReply,
  publishAstrologerReplyWithFollowUp,
  publishClientFollowUp
} from "./astro-diary-cycles";

const journalId = "10000000-0000-4000-8000-000000000001";
const periodId = "10000000-0000-4000-8000-000000000002";
const cycleId = "10000000-0000-4000-8000-000000000003";
const openingItemId = "10000000-0000-4000-8000-000000000004";
const responseItemId = "10000000-0000-4000-8000-000000000005";
const reservationId = "10000000-0000-4000-8000-000000000006";
const now = "2026-08-12T10:00:00Z";

describe("AstroDiary reflection-cycle decisions", () => {
  it("opens a client cycle by atomically consuming one available allowance unit", () => {
    const allowance = createPeriodAllowance({
      periodId,
      total: 2,
      endsAt: "2026-09-12T10:00:00Z"
    });
    const obligation = responseObligation(cycleId, openingItemId);

    const decision = openClientInitiatedCycle({
      existingOpenCycleId: null,
      cycleId,
      journalId,
      openingPeriodId: periodId,
      openingItemId,
      openedAt: now,
      allowance,
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "client-open-1",
      allowanceConsumptionId: "10000000-0000-4000-8000-000000000007",
      obligation
    });

    expect(decision).toMatchObject({
      outcome: "opened",
      cycle: {
        id: cycleId,
        state: "awaiting_astrologer_response",
        openingAllowanceReservationId: null,
        version: 1
      },
      allowance: { available: 1, consumed: 1, version: 2 },
      obligation: { id: obligation.id, state: "open" }
    });
    expect(JSON.stringify(decision)).not.toContain("body");
  });

  it("rejects a second open cycle before touching allowance", () => {
    const allowance = createPeriodAllowance({
      periodId,
      total: 1,
      endsAt: "2026-09-12T10:00:00Z"
    });

    expect(
      openClientInitiatedCycle({
        existingOpenCycleId: "10000000-0000-4000-8000-000000000099",
        cycleId,
        journalId,
        openingPeriodId: periodId,
        openingItemId,
        openedAt: now,
        allowance,
        allowanceExpectedVersion: 1,
        allowanceIdempotencyKey: "client-open-2",
        allowanceConsumptionId: "10000000-0000-4000-8000-000000000008",
        obligation: responseObligation(cycleId, openingItemId)
      })
    ).toEqual({
      outcome: "rejected",
      code: "journal_has_open_cycle",
      openCycleId: "10000000-0000-4000-8000-000000000099"
    });
    expect(allowance).toMatchObject({ available: 1, consumed: 0, version: 1 });
  });

  it("reserves on astrologer prompt and consumes that exact reservation on client acceptance", () => {
    const allowance = createPeriodAllowance({
      periodId,
      total: 1,
      endsAt: "2026-09-12T10:00:00Z"
    });
    const opened = openAstrologerPromptCycle({
      existingOpenCycleId: null,
      cycleId,
      journalId,
      openingPeriodId: periodId,
      openingPromptItemId: openingItemId,
      openedAt: now,
      reservationId,
      allowance,
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "prompt-open-1",
      clientResponseWindowCalendarDays: 5,
      serviceTimezone: "Europe/Moscow"
    });
    expect(opened).toMatchObject({
      outcome: "opened",
      cycle: { state: "awaiting_client_entry", openingAllowanceReservationId: reservationId },
      allowance: { available: 0, reserved: 1, consumed: 0 }
    });
    if (opened.outcome !== "opened") throw new Error("expected opened prompt cycle");

    const obligation = responseObligation(cycleId, responseItemId);
    const accepted = acceptAstrologerPrompt(opened.cycle, {
      expectedCycleVersion: 1,
      promptItemId: openingItemId,
      clientEntryItemId: responseItemId,
      occurredAt: "2026-08-12T11:00:00Z",
      allowance: opened.allowance,
      allowanceExpectedVersion: 2,
      allowanceIdempotencyKey: "prompt-accept-1",
      obligation
    });

    expect(accepted).toMatchObject({
      outcome: "applied",
      cycle: { state: "awaiting_astrologer_response", version: 2 },
      allowance: {
        available: 0,
        reserved: 0,
        consumed: 1,
        reservations: [{ reservationId, state: "consumed" }]
      },
      obligation: { id: obligation.id, triggerItemId: responseItemId }
    });
  });

  it("lets the snapshotted client deadline win at the exact boundary", () => {
    const allowance = createPeriodAllowance({
      periodId,
      total: 1,
      endsAt: "2026-09-12T10:00:00Z"
    });
    const opened = openAstrologerPromptCycle({
      existingOpenCycleId: null,
      cycleId,
      journalId,
      openingPeriodId: periodId,
      openingPromptItemId: openingItemId,
      openedAt: now,
      reservationId,
      allowance,
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "prompt-deadline",
      clientResponseWindowCalendarDays: 5,
      serviceTimezone: "Europe/Moscow"
    });
    if (opened.outcome !== "opened") throw new Error("expected opened prompt cycle");
    const obligation = responseObligation(cycleId, responseItemId);

    expect(
      acceptAstrologerPrompt(opened.cycle, {
        expectedCycleVersion: 1,
        promptItemId: openingItemId,
        clientEntryItemId: responseItemId,
        occurredAt: "2026-08-17T09:59:59.999999999Z",
        allowance: opened.allowance,
        allowanceExpectedVersion: 2,
        allowanceIdempotencyKey: "accept-before-deadline",
        obligation
      })
    ).toMatchObject({ outcome: "applied" });
    for (const occurredAt of ["2026-08-17T10:00:00Z", "2026-08-17T10:00:00.000000001Z"]) {
      expect(
        acceptAstrologerPrompt(opened.cycle, {
          expectedCycleVersion: 1,
          promptItemId: openingItemId,
          clientEntryItemId: responseItemId,
          occurredAt,
          allowance: opened.allowance,
          allowanceExpectedVersion: 2,
          allowanceIdempotencyKey: `accept-${occurredAt}`,
          obligation
        })
      ).toEqual({ outcome: "rejected", code: "client_response_window_ended" });
    }

    const followUpCycle = openCycle("awaiting_client_follow_up", 4, null);
    expect(
      publishClientFollowUp(followUpCycle, {
        expectedCycleVersion: 4,
        promptItemId: followUpCycle.awaitingClientPromptItemId!,
        clientEntryItemId: responseItemId,
        occurredAt: followUpCycle.clientResponseDueAt!,
        obligation
      })
    ).toEqual({ outcome: "rejected", code: "client_response_window_ended" });
  });

  it("releases only an unaccepted opening reservation on decline, withdrawal, or expiry", () => {
    for (const command of [
      "client_declined",
      "prompt_withdrawn",
      "client_response_expired"
    ] as const) {
      const opened = openAstrologerPromptCycle({
        existingOpenCycleId: null,
        cycleId,
        journalId,
        openingPeriodId: periodId,
        openingPromptItemId: openingItemId,
        openedAt: now,
        reservationId,
        allowance: createPeriodAllowance({
          periodId,
          total: 1,
          endsAt: "2026-09-12T10:00:00Z"
        }),
        allowanceExpectedVersion: 1,
        allowanceIdempotencyKey: `prompt-open-${command}`,
        clientResponseWindowCalendarDays: 5,
        serviceTimezone: "Europe/Moscow"
      });
      if (opened.outcome !== "opened") throw new Error("expected opened prompt cycle");

      const closed = closeAwaitingClientCycle(opened.cycle, {
        command,
        expectedCycleVersion: 1,
        promptItemId: openingItemId,
        occurredAt:
          command === "client_response_expired" ? "2026-08-17T10:00:00Z" : "2026-08-13T10:00:00Z",
        allowance: opened.allowance,
        allowanceExpectedVersion: 2,
        allowanceIdempotencyKey: `prompt-close-${command}`
      });
      expect(closed).toMatchObject({
        outcome: "applied",
        cycle: { state: "closed", closeReason: command },
        allowance: {
          available: 1,
          reserved: 0,
          consumed: 0,
          reservations: [{ reservationId, state: "released" }]
        }
      });
    }
  });

  it("rejects client-response expiry before the snapshotted calendar deadline", () => {
    const opened = openAstrologerPromptCycle({
      existingOpenCycleId: null,
      cycleId,
      journalId,
      openingPeriodId: periodId,
      openingPromptItemId: openingItemId,
      openedAt: now,
      reservationId,
      allowance: createPeriodAllowance({
        periodId,
        total: 1,
        endsAt: "2026-09-12T10:00:00Z"
      }),
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "prompt-window",
      clientResponseWindowCalendarDays: 5,
      serviceTimezone: "Europe/Moscow"
    });
    if (opened.outcome !== "opened") throw new Error("expected opened prompt cycle");
    expect(opened.cycle).toMatchObject({
      clientResponseDueAt: "2026-08-17T10:00:00Z",
      clientResponseWindowCalendarDays: 5,
      clientResponseTimezone: "Europe/Moscow"
    });
    expect(
      closeAwaitingClientCycle(opened.cycle, {
        command: "client_response_expired",
        expectedCycleVersion: 1,
        promptItemId: openingItemId,
        occurredAt: "2026-08-17T09:59:59Z",
        allowance: opened.allowance,
        allowanceExpectedVersion: 2,
        allowanceIdempotencyKey: "prompt-window-expire"
      })
    ).toEqual({ outcome: "rejected", code: "client_response_not_due" });
  });

  it("uses the later instant for a client-window DST fold", () => {
    const opened = openAstrologerPromptCycle({
      existingOpenCycleId: null,
      cycleId,
      journalId,
      openingPeriodId: periodId,
      openingPromptItemId: openingItemId,
      openedAt: "2026-10-24T00:30:00Z",
      reservationId,
      allowance: createPeriodAllowance({
        periodId,
        total: 1,
        endsAt: "2026-11-12T10:00:00Z"
      }),
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "prompt-dst-fold",
      clientResponseWindowCalendarDays: 1,
      serviceTimezone: "Europe/Berlin"
    });

    expect(opened).toMatchObject({
      outcome: "opened",
      cycle: {
        clientResponseDueAt: "2026-10-25T01:30:00Z",
        clientResponseTimezone: "Europe/Berlin"
      }
    });
  });

  it("closes an already-consumed follow-up without restoring allowance", () => {
    const cycle = openCycle("awaiting_client_follow_up", 4, null);

    expect(
      closeAwaitingClientCycle(cycle, {
        command: "client_declined",
        expectedCycleVersion: 4,
        promptItemId: cycle.awaitingClientPromptItemId!,
        occurredAt: now,
        allowance: null,
        allowanceExpectedVersion: null,
        allowanceIdempotencyKey: null
      })
    ).toEqual({
      outcome: "applied",
      cycle: {
        ...cycle,
        awaitingClientPromptItemId: null,
        state: "closed",
        version: 5,
        closedAt: now,
        closeReason: "client_declined"
      },
      allowance: null,
      allowanceTransition: "none"
    });
  });

  it("publishes either an atomic closing reply or one follow-up, never both", () => {
    const cycle = openCycle("awaiting_astrologer_response", 2, null);
    const obligation = responseObligation(cycle.id, openingItemId);

    const closing = publishAstrologerClosingReply(cycle, {
      expectedCycleVersion: 2,
      replyItemId: responseItemId,
      occurredAt: now,
      obligation,
      expectedObligationVersion: 1
    });
    expect(closing).toMatchObject({
      outcome: "applied",
      cycle: { state: "closed", closeReason: "completed", version: 3 },
      obligation: { state: "satisfied", satisfiedByItemId: responseItemId, version: 2 }
    });

    const followUp = publishAstrologerReplyWithFollowUp(cycle, {
      expectedCycleVersion: 2,
      replyItemId: responseItemId,
      followUpPromptItemId: "10000000-0000-4000-8000-000000000010",
      clientResponseWindowCalendarDays: 5,
      serviceTimezone: "Europe/Moscow",
      occurredAt: now,
      obligation,
      expectedObligationVersion: 1
    });
    expect(followUp).toMatchObject({
      outcome: "applied",
      cycle: { state: "awaiting_client_follow_up", version: 3, closedAt: null },
      obligation: { state: "satisfied", satisfiedByItemId: responseItemId },
      followUpPromptItemId: "10000000-0000-4000-8000-000000000010"
    });

    const clientFollowUp = publishClientFollowUp(
      followUp.outcome === "applied" ? followUp.cycle : cycle,
      {
        expectedCycleVersion: 3,
        promptItemId: "10000000-0000-4000-8000-000000000010",
        clientEntryItemId: "10000000-0000-4000-8000-000000000011",
        occurredAt: "2026-08-12T12:00:00Z",
        obligation: responseObligation(
          cycle.id,
          "10000000-0000-4000-8000-000000000011",
          "10000000-0000-4000-8000-000000000012"
        )
      }
    );
    expect(clientFollowUp).toMatchObject({
      outcome: "applied",
      cycle: { state: "awaiting_astrologer_closing_response", version: 4 },
      obligation: { state: "open" }
    });

    expect(
      publishAstrologerReplyWithFollowUp(
        openCycle("awaiting_astrologer_closing_response", 4, null),
        {
          expectedCycleVersion: 4,
          replyItemId: responseItemId,
          followUpPromptItemId: "10000000-0000-4000-8000-000000000013",
          clientResponseWindowCalendarDays: 5,
          serviceTimezone: "Europe/Moscow",
          occurredAt: now,
          obligation: responseObligation(cycle.id, openingItemId),
          expectedObligationVersion: 1
        }
      )
    ).toEqual({
      outcome: "rejected",
      code: "cycle_state_conflict",
      currentState: "awaiting_astrologer_closing_response"
    });
  });

  it("atomically closes a live cycle and cancels every live obligation on finance revocation", () => {
    const cycle = openCycle("awaiting_astrologer_response", 2, null);
    const open = responseObligation(cycle.id, openingItemId);
    const overdue = {
      ...responseObligation(cycle.id, openingItemId, "10000000-0000-4000-8000-000000000020"),
      state: "overdue" as const
    };
    expect(
      applyAstroDiaryFinanceRevocation(cycle, {
        expectedCycleVersion: 2,
        occurredAt: now,
        obligations: [open, overdue],
        allowance: null,
        allowanceExpectedVersion: null,
        allowanceIdempotencyKey: null
      })
    ).toMatchObject({
      outcome: "applied",
      cycle: { state: "closed", closeReason: "cancelled_by_finance_revocation", version: 3 },
      obligations: [
        { id: open.id, state: "cancelled_by_finance_revocation", version: 2 },
        { id: overdue.id, state: "cancelled_by_finance_revocation", version: 2 }
      ],
      allowanceTransition: "none"
    });
  });

  it("forfeits an unserved opening reservation on permanent finance revocation", () => {
    const opened = openAstrologerPromptCycle({
      existingOpenCycleId: null,
      cycleId,
      journalId,
      openingPeriodId: periodId,
      openingPromptItemId: openingItemId,
      openedAt: now,
      reservationId,
      allowance: createPeriodAllowance({
        periodId,
        total: 2,
        endsAt: "2026-09-12T10:00:00Z"
      }),
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "revoked-prompt-open",
      clientResponseWindowCalendarDays: 5,
      serviceTimezone: "Europe/Moscow"
    });
    if (opened.outcome !== "opened") throw new Error("expected opened prompt cycle");

    expect(
      applyAstroDiaryFinanceRevocation(opened.cycle, {
        expectedCycleVersion: 1,
        occurredAt: "2026-08-13T10:00:00Z",
        obligations: [],
        allowance: opened.allowance,
        allowanceExpectedVersion: 2,
        allowanceIdempotencyKey: "revoked-prompt-forfeit"
      })
    ).toMatchObject({
      outcome: "applied",
      cycle: { state: "closed", closeReason: "cancelled_by_finance_revocation" },
      allowanceTransition: "forfeit_opening_reservation",
      allowance: { available: 1, reserved: 0, released: 1 }
    });
  });
});

function openCycle(
  state: Exclude<AstroDiaryCycle["state"], "closed">,
  version: number,
  openingAllowanceReservationId: string | null
): AstroDiaryCycle {
  return {
    id: cycleId,
    journalId,
    openingPeriodId: periodId,
    openingAllowanceReservationId,
    awaitingClientPromptItemId:
      state === "awaiting_client_entry"
        ? openingItemId
        : state === "awaiting_client_follow_up"
          ? "10000000-0000-4000-8000-000000000010"
          : null,
    clientResponseDueAt:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up"
        ? "2026-08-17T10:00:00Z"
        : null,
    clientResponseWindowCalendarDays:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up" ? 5 : null,
    clientResponseTimezone:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up"
        ? "Europe/Moscow"
        : null,
    state,
    version,
    openedAt: now,
    closedAt: null,
    closeReason: null
  };
}

function responseObligation(
  targetCycleId: string,
  triggerItemId: string,
  id = "20000000-0000-4000-8000-000000000001"
): AstroDiaryResponseObligation {
  return {
    id,
    journalId,
    cycleId: targetCycleId,
    triggerItemId,
    state: "open",
    version: 1,
    openedAt: now,
    dueAt: "2026-08-14T10:00:00Z",
    responseSlaWorkingDays: 2,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow",
    resolvedDueLocal: "2026-08-14T13:00:00",
    resolvedDueOffset: "+03:00",
    satisfiedByItemId: null,
    closedAt: null
  };
}
