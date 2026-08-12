import { describe, expect, it } from "vitest";
import { astroDiaryResponseObligationSchema } from "@elevenhouse/contracts";
import {
  cancelAstroDiaryResponseObligation,
  closeAstroDiaryResponseObligationWithoutResponse,
  createAstroDiaryResponseObligation,
  markAstroDiaryResponseObligationOverdue,
  projectAstroDiaryResponseStatus,
  satisfyAstroDiaryResponseObligation
} from "./astro-diary-obligations";

const ids = {
  obligation: "40000000-0000-4000-8000-000000000001",
  journal: "40000000-0000-4000-8000-000000000002",
  cycle: "40000000-0000-4000-8000-000000000003",
  trigger: "40000000-0000-4000-8000-000000000004",
  response: "40000000-0000-4000-8000-000000000005"
} as const;

const open = () =>
  createAstroDiaryResponseObligation({
    obligationId: ids.obligation,
    journalId: ids.journal,
    cycleId: ids.cycle,
    triggerItemId: ids.trigger,
    openedAt: "2026-08-14T17:30:00Z",
    responseSlaWorkingDays: 2,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow"
  });

describe("AstroDiary response obligations", () => {
  it("creates immutable SLA evidence from the trigger publish instant", () => {
    expect(open()).toMatchObject({
      state: "open",
      version: 1,
      dueAt: "2026-08-18T17:30:00Z",
      resolvedDueLocal: "2026-08-18T20:30:00",
      resolvedDueOffset: "+03:00",
      satisfiedByItemId: null,
      closedAt: null
    });
  });

  it("preserves fractional seconds in schema-valid local SLA evidence", () => {
    const obligation = createAstroDiaryResponseObligation({
      obligationId: ids.obligation,
      journalId: ids.journal,
      cycleId: ids.cycle,
      triggerItemId: ids.trigger,
      openedAt: "2026-08-14T17:30:00.123456789Z",
      responseSlaWorkingDays: 2,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow"
    });

    expect(obligation.resolvedDueLocal).toBe("2026-08-18T20:30:00.123456789");
    expect(astroDiaryResponseObligationSchema.safeParse(obligation).success).toBe(true);
  });

  it("marks overdue exactly once without closing the obligation", () => {
    expect(
      markAstroDiaryResponseObligationOverdue(open(), {
        expectedVersion: 1,
        observedAt: "2026-08-18T17:30:00Z"
      })
    ).toMatchObject({ outcome: "applied", obligation: { state: "overdue", version: 2 } });
    expect(
      markAstroDiaryResponseObligationOverdue(
        { ...open(), state: "overdue", version: 2 },
        { expectedVersion: 2, observedAt: "2026-08-19T00:00:00Z" }
      )
    ).toEqual({ outcome: "idempotent" });
    expect(
      markAstroDiaryResponseObligationOverdue(open(), {
        expectedVersion: 1,
        observedAt: "2026-08-18T17:29:59Z"
      })
    ).toEqual({ outcome: "not_due" });
  });

  it("satisfies open or overdue obligation with the exact response item", () => {
    expect(
      satisfyAstroDiaryResponseObligation(open(), {
        expectedVersion: 1,
        responseItemId: ids.response,
        occurredAt: "2026-08-18T17:31:00Z"
      })
    ).toMatchObject({
      outcome: "applied",
      obligation: {
        state: "satisfied",
        version: 2,
        satisfiedByItemId: ids.response,
        closedAt: "2026-08-18T17:31:00Z"
      }
    });
  });

  it("separates finance cancellation from an ordinary no-response closure", () => {
    expect(
      cancelAstroDiaryResponseObligation(open(), {
        expectedVersion: 1,
        occurredAt: "2026-08-18T00:00:00Z"
      })
    ).toMatchObject({
      outcome: "applied",
      obligation: { state: "cancelled_by_finance_revocation" }
    });
    expect(
      closeAstroDiaryResponseObligationWithoutResponse(open(), {
        expectedVersion: 1,
        occurredAt: "2026-08-18T00:00:00Z"
      })
    ).toMatchObject({
      outcome: "applied",
      obligation: { state: "closed_without_response" }
    });
  });

  it("projects due-soon from local due date without persisting another state", () => {
    const obligation = open();
    expect(projectAstroDiaryResponseStatus(obligation, "2026-08-17T21:00:00Z")).toEqual("due_soon");
    expect(projectAstroDiaryResponseStatus(obligation, "2026-08-18T17:30:00Z")).toEqual("overdue");
    expect(projectAstroDiaryResponseStatus(obligation, "2026-08-17T20:59:59Z")).toEqual("open");
  });
});
