import type {
  AstroDiaryCycle,
  AstroDiaryDraft,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import {
  activeSubscription,
  runtimeId
} from "../client-subscriptions/client-subscription-test-fixtures";
import {
  createPeriodAllowance,
  reservePeriodAllowance
} from "../client-subscriptions/client-subscription-allowance";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandUnitOfWork
} from "./ports/astro-diary-command-unit-of-work";
import {
  decideAcceptAstrologerPromptCommand,
  decideCloseAwaitingClientPromptCommand,
  decideOpenAstrologerPromptCommand,
  decidePublishClientFollowUpCommand,
  decideRevokeAstroDiaryCycleCommand,
  executeAstroDiaryPromptCommand
} from "./astro-diary-prompt-commands";

const journalId = runtimeId(400);
const cycleId = runtimeId(401);
const periodId = runtimeId(10);
const promptItemId = runtimeId(402);
const clientItemId = runtimeId(403);
const obligationId = runtimeId(404);
const reservationId = runtimeId(405);

describe("AstroDiary prompt-side atomic command composers", () => {
  it("publishes a prompt and reserves the exact paid-period allowance atomically", () => {
    const authority = baseAuthority({ drafts: [draft("reflection_prompt", runtimeId(410))] });
    const decision = decideOpenAstrologerPromptCommand(authority, {
      actorUserId: authority.journal.astrologerUserId,
      promptDraftId: runtimeId(410),
      expectedPromptDraftVersion: 1,
      cycleId,
      promptItemId,
      periodId,
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "prompt-open-effect",
      reservationId,
      derivativeCommandId: runtimeId(411),
      eventIds: {
        cycleOpened: runtimeId(412),
        promptPublished: runtimeId(413),
        derivativeRequested: runtimeId(414)
      }
    });

    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [{ beforeVersion: null, after: { state: "awaiting_client_entry" } }],
        drafts: [{ beforeVersion: 1, after: null }],
        allowances: [{ after: { available: 1, reserved: 1 } }],
        timelineItems: [{ after: { id: promptItemId, kind: "reflection_prompt", cursor: 1 } }]
      }
    });
  });

  it("publishes prompt acceptance with reservation consumption, obligation, context and derivative", () => {
    const opened = promptAuthority();
    const authority = {
      ...opened,
      commandAt: "2026-02-02T10:00:00Z",
      drafts: [draft("client_entry", runtimeId(420), cycleId)],
      timelineItems: [promptItem()],
      visibleMaxCursor: 1
    };
    const decision = decideAcceptAstrologerPromptCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      cycleId,
      expectedCycleVersion: 1,
      entryDraftId: runtimeId(420),
      expectedEntryDraftVersion: 1,
      entryItemId: clientItemId,
      obligationId,
      contextId: runtimeId(421),
      derivativeCommandId: runtimeId(422),
      allowancePeriodId: periodId,
      allowanceExpectedVersion: 2,
      allowanceIdempotencyKey: "prompt-accept-effect",
      eventIds: {
        itemPublished: runtimeId(423),
        obligationCreated: runtimeId(424),
        contextRequested: runtimeId(425),
        derivativeRequested: runtimeId(426)
      }
    });

    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [{ after: { state: "awaiting_astrologer_response" } }],
        allowances: [{ after: { reserved: 0, consumed: 1 } }],
        obligations: [{ beforeVersion: null, after: { id: obligationId, state: "open" } }],
        timelineItems: [{ after: { id: clientItemId, kind: "client_entry", cursor: 2 } }],
        contextSnapshots: [{ beforeVersion: null, after: { status: "pending" } }]
      }
    });
  });

  it("rejects acceptance when the cycle-bound visible prompt is absent", () => {
    const authority = {
      ...promptAuthority(),
      commandAt: "2026-02-02T10:00:00Z",
      drafts: [draft("client_entry", runtimeId(420), cycleId)],
      timelineItems: [],
      visibleMaxCursor: 1
    };
    expect(
      decideAcceptAstrologerPromptCommand(authority, {
        actorUserId: authority.journal.clientUserId,
        cycleId,
        expectedCycleVersion: 1,
        entryDraftId: runtimeId(420),
        expectedEntryDraftVersion: 1,
        entryItemId: clientItemId,
        obligationId,
        contextId: runtimeId(421),
        derivativeCommandId: runtimeId(422),
        allowancePeriodId: periodId,
        allowanceExpectedVersion: 2,
        allowanceIdempotencyKey: "prompt-accept-effect",
        eventIds: {
          itemPublished: runtimeId(423),
          obligationCreated: runtimeId(424),
          contextRequested: runtimeId(425),
          derivativeRequested: runtimeId(426)
        }
      })
    ).toEqual({ outcome: "rejected", code: "authority_not_found" });
  });

  it("withdraws the visible prompt and releases its reservation in one transition", () => {
    const authority = { ...promptAuthority(), timelineItems: [promptItem()], visibleMaxCursor: 1 };
    const decision = decideCloseAwaitingClientPromptCommand(authority, {
      reason: "prompt_withdrawn",
      actorUserId: authority.journal.astrologerUserId,
      cycleId,
      expectedCycleVersion: 1,
      promptItemId,
      expectedPromptRevision: 1,
      allowancePeriodId: periodId,
      allowanceExpectedVersion: 2,
      allowanceIdempotencyKey: "prompt-withdraw-effect",
      cycleClosedEventId: runtimeId(430)
    });

    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [{ after: { state: "closed", closeReason: "prompt_withdrawn" } }],
        allowances: [{ after: { available: 2, reserved: 0 } }],
        timelineItems: [{ beforeRevision: 1, after: { kind: "tombstone" } }]
      }
    });
  });

  it("publishes a client follow-up and the next astrologer obligation atomically", () => {
    const cycle = liveCycle("awaiting_client_follow_up", 3);
    const authority = baseAuthority({
      commandAt: "2026-02-02T10:00:00Z",
      cycles: [cycle],
      drafts: [draft("client_entry", runtimeId(440), cycleId)],
      timelineItems: [promptItem(runtimeId(409))],
      visibleMaxCursor: 3,
      access: { hasOpenCycle: true, hasOpenResponseObligation: false }
    });
    const decision = decidePublishClientFollowUpCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      cycleId,
      expectedCycleVersion: 3,
      entryDraftId: runtimeId(440),
      expectedEntryDraftVersion: 1,
      entryItemId: runtimeId(441),
      obligationId: runtimeId(442),
      contextId: runtimeId(443),
      derivativeCommandId: runtimeId(444),
      eventIds: {
        itemPublished: runtimeId(445),
        obligationCreated: runtimeId(446),
        contextRequested: runtimeId(447),
        derivativeRequested: runtimeId(448)
      }
    });
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [{ after: { state: "awaiting_astrologer_closing_response" } }],
        obligations: [{ beforeVersion: null, after: { id: runtimeId(442) } }],
        timelineItems: [{ after: { id: runtimeId(441), cursor: 4 } }]
      }
    });
  });

  it("closes finance-revoked lifecycle and forfeits an unserved reservation atomically", () => {
    const authority = promptAuthority();
    const decision = decideRevokeAstroDiaryCycleCommand(authority, {
      cycleId,
      expectedCycleVersion: 1,
      allowanceExpectedVersion: 2,
      allowanceIdempotencyKey: "finance-forfeit-effect",
      cycleClosedEventId: runtimeId(450)
    });
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [{ after: { closeReason: "cancelled_by_finance_revocation" } }],
        allowances: [{ after: { reserved: 0, released: 1 } }]
      }
    });
  });

  it("binds prompt command versions to outer CAS and a semantic request hash", async () => {
    const authority = baseAuthority();
    let captured: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0] | undefined;
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        captured = input;
        return Promise.resolve({ outcome: "not_found" });
      }
    };
    await executeAstroDiaryPromptCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "open-prompt",
      request: {
        type: "open_prompt",
        command: {
          actorUserId: authority.journal.astrologerUserId,
          promptDraftId: runtimeId(460),
          expectedPromptDraftVersion: 3,
          cycleId,
          promptItemId,
          periodId,
          allowanceExpectedVersion: 4,
          allowanceIdempotencyKey: "effect-key",
          reservationId,
          derivativeCommandId: runtimeId(461),
          eventIds: {
            cycleOpened: runtimeId(462),
            promptPublished: runtimeId(463),
            derivativeRequested: runtimeId(464)
          }
        }
      }
    });
    expect(captured?.preconditions).toEqual([
      { aggregate: "allowance", id: periodId, expectedVersion: 4 },
      { aggregate: "draft", id: runtimeId(460), expectedVersion: 3 },
      { aggregate: "journal", id: journalId, expectedVersion: 2 }
    ]);
    expect(captured?.envelope.request).toEqual({
      type: "open_prompt",
      actorUserId: authority.journal.astrologerUserId,
      promptDraftId: runtimeId(460),
      expectedPromptDraftVersion: 3,
      periodId,
      allowanceExpectedVersion: 4
    });
  });

  it("executes response-window expiry as a system close command", async () => {
    let captured: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0] | undefined;
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        captured = input;
        return Promise.resolve({ outcome: "not_found" });
      }
    };
    await executeAstroDiaryPromptCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "expire-prompt",
      request: {
        type: "close_prompt",
        command: {
          reason: "client_response_expired",
          actorUserId: runtimeId(490),
          cycleId,
          expectedCycleVersion: 1,
          promptItemId,
          expectedPromptRevision: 1,
          allowancePeriodId: periodId,
          allowanceExpectedVersion: 2,
          allowanceIdempotencyKey: "expire-effect",
          cycleClosedEventId: runtimeId(491)
        }
      }
    });
    expect(captured?.envelope).toMatchObject({
      operation: "close",
      actorRole: "system",
      actorUserId: runtimeId(490)
    });
  });
});

function baseAuthority(
  overrides: Omit<Partial<AstroDiaryCommandAuthority>, "access"> & {
    access?: Partial<AstroDiaryCommandAuthority["access"]>;
  } = {}
): AstroDiaryCommandAuthority {
  const subscription = activeSubscription();
  return {
    access: {
      relationshipState: "active",
      entitlementState: "active",
      financeDenied: false,
      journalState: "active",
      hasOpenCycle: false,
      hasOpenResponseObligation: false,
      ...overrides.access
    },
    subscription,
    contract: subscription.contract,
    activePeriod: subscription.paidPeriods[0]!,
    commandAt: overrides.commandAt ?? "2026-02-01T10:00:00Z",
    journal: {
      id: journalId,
      relationshipId: subscription.contract.relationshipId,
      journalEpochId: subscription.journalEpochId,
      astrologerUserId: subscription.contract.astrologerUserId,
      clientUserId: subscription.contract.clientUserId,
      state: "active",
      version: 2,
      createdAt: "2026-01-31T10:00:00Z"
    },
    cycles: overrides.cycles ?? [],
    drafts: overrides.drafts ?? [],
    obligations: overrides.obligations ?? [],
    allowances: overrides.allowances ?? [
      createPeriodAllowance({ periodId, total: 2, endsAt: "2026-02-28T10:00:00Z" })
    ],
    timelineItems: overrides.timelineItems ?? [],
    visibleMaxCursor: overrides.visibleMaxCursor ?? 0,
    media: overrides.media ?? [],
    erasureAuthority: overrides.erasureAuthority ?? {
      commands: [],
      redactionReceipts: [],
      cascadeInventory: [],
      cascadeTargets: [],
      cascadeReceipts: []
    }
  };
}

function promptAuthority(): AstroDiaryCommandAuthority {
  const initial = createPeriodAllowance({ periodId, total: 2, endsAt: "2026-02-28T10:00:00Z" });
  const reserved = reservePeriodAllowance(initial, {
    expectedVersion: 1,
    idempotencyKey: "prompt-opened",
    reservationId,
    now: "2026-02-01T10:00:00Z"
  });
  if (reserved.outcome !== "applied") throw new Error("fixture reservation must apply");
  return baseAuthority({
    cycles: [liveCycle("awaiting_client_entry", 1)],
    allowances: [reserved.allowance],
    access: { hasOpenCycle: true, hasOpenResponseObligation: false }
  });
}

function liveCycle(
  state: Exclude<AstroDiaryCycle["state"], "closed">,
  version: number
): AstroDiaryCycle {
  const awaitsClient = state === "awaiting_client_entry" || state === "awaiting_client_follow_up";
  return {
    id: cycleId,
    journalId,
    openingPeriodId: periodId,
    openingAllowanceReservationId: state === "awaiting_client_entry" ? reservationId : null,
    awaitingClientPromptItemId:
      state === "awaiting_client_entry"
        ? promptItemId
        : state === "awaiting_client_follow_up"
          ? runtimeId(409)
          : null,
    clientResponseDueAt: awaitsClient ? "2026-02-06T10:00:00Z" : null,
    clientResponseWindowCalendarDays: awaitsClient ? 5 : null,
    clientResponseTimezone: awaitsClient ? "Europe/Moscow" : null,
    state,
    version,
    openedAt: "2026-02-01T10:00:00Z",
    closedAt: null,
    closeReason: null
  };
}

function draft(
  kind: AstroDiaryDraft["kind"],
  id: string,
  targetCycleId: string | null = null
): AstroDiaryDraft {
  const subscription = activeSubscription();
  const astrologer = kind !== "client_entry";
  return {
    id,
    journalId,
    cycleId: targetCycleId,
    kind,
    authorRole: astrologer ? "astrologer" : "client",
    authorUserId: astrologer
      ? subscription.contract.astrologerUserId
      : subscription.contract.clientUserId,
    version: 1,
    body: astrologer ? "Что сейчас особенно важно заметить?" : "Моя новая запись",
    attachmentIds: [],
    moodId: kind === "client_entry" ? "calm" : null,
    correctsItemId: null,
    updatedAt: "2026-02-01T09:00:00Z"
  } as AstroDiaryDraft;
}

function promptItem(id: string = promptItemId): AstroDiaryTimelineItem {
  return {
    id,
    journalId,
    cycleId,
    kind: "reflection_prompt",
    authorRole: "astrologer",
    authorUserId: activeSubscription().contract.astrologerUserId,
    revision: 1,
    body: "Что сейчас особенно важно заметить?",
    attachmentIds: [],
    moodId: null,
    contextStatus: null,
    correctsItemId: null,
    editedAt: null,
    occurredAt: "2026-02-01T10:00:00Z",
    cursor: 1
  };
}
