import type {
  AstroDiaryCycle,
  AstroDiaryJournal,
  AstroDiaryResponseObligation
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { completeWholeJournalErasure, requestWholeJournalErasure } from "./astro-diary-erasure";

const journalId = "40000000-0000-4000-8000-000000000001";
const clientUserId = "40000000-0000-4000-8000-000000000002";
const subscriptionId = "40000000-0000-4000-8000-000000000003";
const occurredAt = "2026-08-12T10:00:00Z";

describe("whole AstroDiary journal erasure intent", () => {
  it("immediately closes writes, open cycles and live obligations with body-free facts only", () => {
    const openCycle = cycle("40000000-0000-4000-8000-000000000010", "awaiting_client_entry");
    const closedCycle = {
      ...cycle("40000000-0000-4000-8000-000000000011", "awaiting_astrologer_response"),
      state: "closed" as const,
      version: 2,
      closedAt: "2026-08-11T10:00:00Z",
      closeReason: "completed" as const
    };
    const openObligation = obligation("40000000-0000-4000-8000-000000000020", openCycle.id, "open");
    const overdueObligation = obligation(
      "40000000-0000-4000-8000-000000000021",
      openCycle.id,
      "overdue"
    );
    const satisfiedObligation: AstroDiaryResponseObligation = {
      ...obligation("40000000-0000-4000-8000-000000000022", closedCycle.id, "open"),
      state: "satisfied",
      version: 2,
      satisfiedByItemId: "40000000-0000-4000-8000-000000000023",
      closedAt: "2026-08-11T10:00:00Z"
    };

    const decision = requestWholeJournalErasure(journal(), {
      actorUserId: clientUserId,
      expectedJournalVersion: 1,
      subscriptionId,
      erasureRequestId: "40000000-0000-4000-8000-000000000030",
      cascadeRequestId: "40000000-0000-4000-8000-000000000031",
      occurredAt,
      cycles: [openCycle, closedCycle],
      obligations: [openObligation, overdueObligation, satisfiedObligation],
      mediaIds: ["40000000-0000-4000-8000-000000000024", "40000000-0000-4000-8000-000000000025"],
      facts: {
        journalErasureRequestedFactId: "40000000-0000-4000-8000-000000000040",
        subscriptionEndRequestedFactId: "40000000-0000-4000-8000-000000000041",
        cycleClosedFactIds: [
          {
            cycleId: openCycle.id,
            factId: "40000000-0000-4000-8000-000000000042"
          }
        ],
        obligationClosedFactIds: [
          {
            obligationId: openObligation.id,
            factId: "40000000-0000-4000-8000-000000000043"
          },
          {
            obligationId: overdueObligation.id,
            factId: "40000000-0000-4000-8000-000000000044"
          }
        ]
      }
    });

    expect(decision).toMatchObject({
      outcome: "erasure_started",
      journal: { id: journalId, state: "erasing", version: 2 },
      cycles: [{ id: openCycle.id, state: "closed", closeReason: "journal_deleted" }],
      obligations: [
        { id: openObligation.id, state: "closed_without_response" },
        { id: overdueObligation.id, state: "closed_without_response" }
      ],
      subscriptionTransition: { kind: "schedule_end_no_renewal", subscriptionId },
      allowanceTransition: "none",
      refundTransition: "none",
      cascade: {
        cascadeRequestId: "40000000-0000-4000-8000-000000000031",
        journalId
      },
      erasureCommand: {
        id: "40000000-0000-4000-8000-000000000030",
        sourceJournalVersion: 1,
        state: "pending"
      },
      mediaAccessRevocations: [
        { mediaId: "40000000-0000-4000-8000-000000000024", journalId },
        { mediaId: "40000000-0000-4000-8000-000000000025", journalId }
      ]
    });
    if (decision.outcome !== "erasure_started") throw new Error("expected erasure decision");
    expect(decision.facts).toHaveLength(5);
    expect(decision.facts.every((fact) => !Object.hasOwn(fact, "body"))).toBe(true);
    expect(JSON.stringify(decision.facts)).not.toContain("Ответ");
  });

  it("reports the journal erased only after the exact stored cascade command completes", () => {
    const started = requestWholeJournalErasure(journal(), erasureInput());
    if (started.outcome !== "erasure_started") throw new Error("expected erasure start");
    expect(
      completeWholeJournalErasure(started.journal, {
        expectedJournalVersion: 2,
        erasureCommand: started.erasureCommand,
        cascadeReceipt: {
          cascadeRequestId: started.cascade.cascadeRequestId,
          journalId,
          completedAt: "2026-08-12T12:00:00Z"
        }
      })
    ).toMatchObject({
      outcome: "erasure_completed",
      journal: { state: "erased", version: 3 },
      erasureCommand: { state: "completed" }
    });
    expect(
      completeWholeJournalErasure(started.journal, {
        expectedJournalVersion: 2,
        erasureCommand: started.erasureCommand,
        cascadeReceipt: {
          cascadeRequestId: "40000000-0000-4000-8000-000000000099",
          journalId,
          completedAt: "2026-08-12T12:00:00Z"
        }
      })
    ).toEqual({ outcome: "rejected", code: "cascade_evidence_conflict" });
  });

  it("rejects non-owner, stale version and already terminal journals", () => {
    const input = erasureInput();
    expect(requestWholeJournalErasure(journal(), { ...input, actorUserId: "other" })).toEqual({
      outcome: "rejected",
      code: "actor_mismatch"
    });
    expect(requestWholeJournalErasure(journal(), { ...input, expectedJournalVersion: 2 })).toEqual({
      outcome: "rejected",
      code: "version_conflict",
      expectedVersion: 2,
      currentVersion: 1
    });
    expect(requestWholeJournalErasure({ ...journal(), state: "erased" }, input)).toEqual({
      outcome: "rejected",
      code: "journal_already_erased"
    });
  });

  it("fails closed on cross-journal cycle or obligation evidence", () => {
    const input = erasureInput();
    expect(
      requestWholeJournalErasure(journal(), {
        ...input,
        cycles: [{ ...input.cycles[0]!, journalId: "foreign-journal" }]
      })
    ).toEqual({ outcome: "rejected", code: "evidence_scope_conflict" });
    expect(
      requestWholeJournalErasure(journal(), {
        ...input,
        mediaIds: ["40000000-0000-4000-8000-000000000024", "40000000-0000-4000-8000-000000000024"]
      })
    ).toEqual({ outcome: "rejected", code: "evidence_scope_conflict" });
    expect(
      requestWholeJournalErasure(journal(), {
        ...input,
        obligations: [{ ...input.obligations[0]!, cycleId: "foreign-cycle" }]
      })
    ).toEqual({ outcome: "rejected", code: "evidence_scope_conflict" });
  });
});

function journal(): AstroDiaryJournal {
  return {
    id: journalId,
    relationshipId: "40000000-0000-4000-8000-000000000004",
    journalEpochId: "40000000-0000-4000-8000-000000000005",
    astrologerUserId: "40000000-0000-4000-8000-000000000006",
    clientUserId,
    state: "active",
    version: 1,
    createdAt: "2026-08-01T10:00:00Z"
  };
}

function cycle(id: string, state: Exclude<AstroDiaryCycle["state"], "closed">): AstroDiaryCycle {
  return {
    id,
    journalId,
    openingPeriodId: "40000000-0000-4000-8000-000000000007",
    openingAllowanceReservationId:
      state === "awaiting_client_entry" ? "40000000-0000-4000-8000-000000000008" : null,
    awaitingClientPromptItemId:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up"
        ? "40000000-0000-4000-8000-000000000009"
        : null,
    clientResponseDueAt:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up"
        ? "2026-08-15T10:00:00Z"
        : null,
    clientResponseWindowCalendarDays:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up" ? 5 : null,
    clientResponseTimezone:
      state === "awaiting_client_entry" || state === "awaiting_client_follow_up"
        ? "Europe/Moscow"
        : null,
    state,
    version: 1,
    openedAt: "2026-08-10T10:00:00Z",
    closedAt: null,
    closeReason: null
  };
}

function obligation(
  id: string,
  targetCycleId: string,
  state: "open" | "overdue"
): AstroDiaryResponseObligation {
  return {
    id,
    journalId,
    cycleId: targetCycleId,
    triggerItemId: "40000000-0000-4000-8000-000000000009",
    state,
    version: 1,
    openedAt: "2026-08-10T10:00:00Z",
    dueAt: "2026-08-12T10:00:00Z",
    responseSlaWorkingDays: 2,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow",
    resolvedDueLocal: "2026-08-12T13:00:00",
    resolvedDueOffset: "+03:00",
    satisfiedByItemId: null,
    closedAt: null
  };
}

function erasureInput() {
  const openCycle = cycle("40000000-0000-4000-8000-000000000010", "awaiting_client_entry");
  const openObligation = obligation("40000000-0000-4000-8000-000000000020", openCycle.id, "open");
  return {
    actorUserId: clientUserId,
    expectedJournalVersion: 1,
    subscriptionId,
    erasureRequestId: "40000000-0000-4000-8000-000000000030",
    cascadeRequestId: "40000000-0000-4000-8000-000000000031",
    occurredAt,
    cycles: [openCycle],
    obligations: [openObligation],
    mediaIds: [] as readonly string[],
    facts: {
      journalErasureRequestedFactId: "40000000-0000-4000-8000-000000000040",
      subscriptionEndRequestedFactId: "40000000-0000-4000-8000-000000000041",
      cycleClosedFactIds: [
        { cycleId: openCycle.id, factId: "40000000-0000-4000-8000-000000000042" }
      ],
      obligationClosedFactIds: [
        {
          obligationId: openObligation.id,
          factId: "40000000-0000-4000-8000-000000000043"
        }
      ]
    }
  } as const;
}
