import type { AstroDiaryCommandAuthority } from "./ports/astro-diary-command-unit-of-work";
import type { AstroDiaryCommandUnitOfWork } from "./ports/astro-diary-command-unit-of-work";
import { describe, expect, it } from "vitest";
import {
  activeSubscription,
  runtimeId
} from "../client-subscriptions/client-subscription-test-fixtures";
import { createPeriodAllowance } from "../client-subscriptions/client-subscription-allowance";
import {
  decideOpenClientCycleCommand,
  decidePublishAstrologerReplyCommand,
  executeOpenClientCycleCommand
} from "./astro-diary-commands";

const journalId = runtimeId(300);
const cycleId = runtimeId(301);
const entryItemId = runtimeId(302);
const obligationId = runtimeId(303);
const contextId = runtimeId(304);
const derivativeCommandId = runtimeId(305);
const allowanceConsumptionId = runtimeId(306);

describe("AstroDiary atomic command composers", () => {
  it("opens a client cycle with one complete locked-authority write-set", () => {
    const authority = commandAuthority();
    const decision = decideOpenClientCycleCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      draftId: runtimeId(307),
      expectedDraftVersion: 1,
      cycleId,
      entryItemId,
      obligationId,
      contextId,
      derivativeCommandId,
      allowancePeriodId: runtimeId(10),
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "open-client-cycle",
      allowanceConsumptionId,
      eventIds: {
        cycleOpened: runtimeId(310),
        itemPublished: runtimeId(311),
        obligationCreated: runtimeId(312),
        contextRequested: runtimeId(313),
        derivativeRequested: runtimeId(314)
      }
    });

    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        journals: [{ beforeVersion: 2, after: { id: journalId, version: 3 } }],
        cycles: [
          { beforeVersion: null, after: { id: cycleId, state: "awaiting_astrologer_response" } }
        ],
        drafts: [{ beforeVersion: 1, after: null }],
        obligations: [
          {
            beforeVersion: null,
            after: { id: obligationId, dueAt: "2026-02-03T10:00:00Z" }
          }
        ],
        allowances: [{ beforeVersion: 1, after: { available: 1, consumed: 1, version: 2 } }],
        timelineItems: [
          { beforeRevision: null, after: { id: entryItemId, contextStatus: "pending" } }
        ],
        contextSnapshots: [{ beforeVersion: null, after: { id: contextId, status: "pending" } }],
        derivativeCommands: [
          {
            commandId: derivativeCommandId,
            itemId: entryItemId,
            sourceRevision: 1,
            sourceDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            operation: "generate"
          }
        ]
      }
    });
    if (decision.outcome !== "applied") throw new Error("expected applied command");
    expect(decision.writeSet.events.map(({ eventType }) => eventType)).toEqual([
      "astro_diary.cycle_opened.v1",
      "astro_diary.timeline_item_published.v1",
      "astro_diary.response_obligation_created.v1",
      "astro_diary.context_generation_requested.v1",
      "astro_diary.derivative_generation_requested.v1"
    ]);
    expect(JSON.stringify(decision.writeSet.events)).not.toContain("Первая запись");
  });

  it("cannot spend a future or ended paid period allowance", () => {
    const base = commandAuthority();
    const command = {
      actorUserId: base.journal.clientUserId,
      draftId: runtimeId(307),
      expectedDraftVersion: 1,
      cycleId,
      entryItemId,
      obligationId,
      contextId,
      derivativeCommandId,
      allowancePeriodId: runtimeId(10),
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "future-period",
      allowanceConsumptionId,
      eventIds: {
        cycleOpened: runtimeId(310),
        itemPublished: runtimeId(311),
        obligationCreated: runtimeId(312),
        contextRequested: runtimeId(313),
        derivativeRequested: runtimeId(314)
      }
    } as const;
    expect(
      decideOpenClientCycleCommand({ ...base, commandAt: "2026-01-01T00:00:00Z" }, command)
    ).toEqual({
      outcome: "rejected",
      code: "active_period_conflict"
    });
    expect(
      decideOpenClientCycleCommand(
        {
          ...base,
          subscription: { ...base.subscription, state: "ended", endedPeriodIds: [runtimeId(10)] },
          access: { ...base.access, entitlementState: "active" }
        },
        command
      )
    ).toEqual({ outcome: "rejected", code: "authority_scope_conflict" });
  });

  it("binds every nested expected version to the outer atomic preconditions", async () => {
    const authority = commandAuthority();
    let captured: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0] | undefined;
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        captured = input;
        return Promise.resolve({
          outcome: "version_conflict",
          aggregate: "draft",
          id: runtimeId(307),
          expectedVersion: 1,
          currentVersion: 2
        });
      }
    };

    await executeOpenClientCycleCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "open-client-cycle",
      command: {
        actorUserId: authority.journal.clientUserId,
        draftId: runtimeId(307),
        expectedDraftVersion: 1,
        cycleId,
        entryItemId,
        obligationId,
        contextId,
        derivativeCommandId,
        allowancePeriodId: runtimeId(10),
        allowanceExpectedVersion: 1,
        allowanceIdempotencyKey: "open-client-cycle-allowance",
        allowanceConsumptionId,
        eventIds: {
          cycleOpened: runtimeId(310),
          itemPublished: runtimeId(311),
          obligationCreated: runtimeId(312),
          contextRequested: runtimeId(313),
          derivativeRequested: runtimeId(314)
        }
      }
    });

    expect(captured?.preconditions).toEqual([
      { aggregate: "allowance", id: runtimeId(10), expectedVersion: 1 },
      { aggregate: "draft", id: runtimeId(307), expectedVersion: 1 },
      { aggregate: "journal", id: journalId, expectedVersion: 2 }
    ]);
    expect(captured?.envelope.request).toMatchObject({
      draftId: runtimeId(307),
      expectedDraftVersion: 1,
      allowanceExpectedVersion: 1
    });
  });

  it("replays a semantic retry even when the server regenerates effect identifiers", async () => {
    const authority = commandAuthority();
    const requestHashes: string[] = [];
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        requestHashes.push(input.requestHash);
        return Promise.resolve({ outcome: "not_found" });
      }
    };
    const command = {
      actorUserId: authority.journal.clientUserId,
      draftId: runtimeId(307),
      expectedDraftVersion: 1,
      cycleId,
      entryItemId,
      obligationId,
      contextId,
      derivativeCommandId,
      allowancePeriodId: runtimeId(10),
      allowanceExpectedVersion: 1,
      allowanceIdempotencyKey: "allowance-effect-a",
      allowanceConsumptionId,
      eventIds: {
        cycleOpened: runtimeId(310),
        itemPublished: runtimeId(311),
        obligationCreated: runtimeId(312),
        contextRequested: runtimeId(313),
        derivativeRequested: runtimeId(314)
      }
    } as const;
    await executeOpenClientCycleCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "semantic-open",
      command
    });
    await executeOpenClientCycleCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "semantic-open",
      command: {
        ...command,
        cycleId: runtimeId(350),
        entryItemId: runtimeId(351),
        obligationId: runtimeId(352),
        contextId: runtimeId(353),
        derivativeCommandId: runtimeId(354),
        allowanceIdempotencyKey: "allowance-effect-b",
        allowanceConsumptionId: runtimeId(355),
        eventIds: {
          cycleOpened: runtimeId(356),
          itemPublished: runtimeId(357),
          obligationCreated: runtimeId(358),
          contextRequested: runtimeId(359),
          derivativeRequested: runtimeId(360)
        }
      }
    });

    expect(requestHashes[1]).toBe(requestHashes[0]);
  });

  it("publishes a closing reply, satisfies the exact obligation, and closes the cycle atomically", () => {
    const base = commandAuthority();
    const cycle = {
      id: cycleId,
      journalId,
      openingPeriodId: runtimeId(10),
      openingAllowanceReservationId: null,
      awaitingClientPromptItemId: null,
      clientResponseDueAt: null,
      clientResponseWindowCalendarDays: null,
      clientResponseTimezone: null,
      state: "awaiting_astrologer_response" as const,
      version: 1,
      openedAt: "2026-08-12T10:00:00Z",
      closedAt: null,
      closeReason: null
    };
    const obligation = {
      id: obligationId,
      journalId,
      cycleId,
      triggerItemId: entryItemId,
      state: "open" as const,
      version: 1,
      openedAt: "2026-08-12T10:00:00Z",
      dueAt: "2026-08-14T10:00:00Z",
      responseSlaWorkingDays: 2,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow",
      resolvedDueLocal: "2026-08-14T13:00:00",
      resolvedDueOffset: "+03:00",
      satisfiedByItemId: null,
      closedAt: null
    };
    const authority = {
      ...base,
      commandAt: "2026-08-12T11:00:00Z",
      access: { ...base.access, hasOpenCycle: true, hasOpenResponseObligation: true },
      cycles: [cycle],
      obligations: [obligation],
      visibleMaxCursor: 1,
      drafts: [
        {
          id: runtimeId(320),
          journalId,
          cycleId,
          kind: "astrologer_reply" as const,
          authorRole: "astrologer" as const,
          authorUserId: base.journal.astrologerUserId,
          version: 1,
          body: "Закрывающий ответ",
          attachmentIds: [],
          moodId: null,
          correctsItemId: null,
          updatedAt: "2026-08-12T10:30:00Z"
        }
      ]
    };
    const decision = decidePublishAstrologerReplyCommand(authority, {
      mode: "close",
      actorUserId: base.journal.astrologerUserId,
      cycleId,
      expectedCycleVersion: 1,
      obligationId,
      expectedObligationVersion: 1,
      replyDraftId: runtimeId(320),
      expectedReplyDraftVersion: 1,
      replyItemId: runtimeId(321),
      derivativeCommandId: runtimeId(322),
      eventIds: {
        itemPublished: runtimeId(323),
        obligationSatisfied: runtimeId(324),
        cycleClosed: runtimeId(325),
        derivativeRequested: runtimeId(326)
      }
    });
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [{ beforeVersion: 1, after: { state: "closed", closeReason: "completed" } }],
        obligations: [
          { beforeVersion: 1, after: { state: "satisfied", satisfiedByItemId: runtimeId(321) } }
        ],
        timelineItems: [{ beforeRevision: null, after: { id: runtimeId(321) } }]
      }
    });
  });

  it("publishes a reply and one follow-up prompt as one visible cycle transition", () => {
    const base = commandAuthority();
    const cycle = {
      id: cycleId,
      journalId,
      openingPeriodId: runtimeId(10),
      openingAllowanceReservationId: null,
      awaitingClientPromptItemId: null,
      clientResponseDueAt: null,
      clientResponseWindowCalendarDays: null,
      clientResponseTimezone: null,
      state: "awaiting_astrologer_response" as const,
      version: 1,
      openedAt: "2026-08-12T10:00:00Z",
      closedAt: null,
      closeReason: null
    };
    const obligation = {
      id: obligationId,
      journalId,
      cycleId,
      triggerItemId: entryItemId,
      state: "open" as const,
      version: 1,
      openedAt: "2026-08-12T10:00:00Z",
      dueAt: "2026-08-14T10:00:00Z",
      responseSlaWorkingDays: 2,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow",
      resolvedDueLocal: "2026-08-14T13:00:00",
      resolvedDueOffset: "+03:00",
      satisfiedByItemId: null,
      closedAt: null
    };
    const replyDraftId = runtimeId(330);
    const promptDraftId = runtimeId(331);
    const authority = {
      ...base,
      commandAt: "2026-08-12T11:00:00Z",
      access: { ...base.access, hasOpenCycle: true, hasOpenResponseObligation: true },
      cycles: [cycle],
      obligations: [obligation],
      drafts: [
        {
          id: replyDraftId,
          journalId,
          cycleId,
          kind: "astrologer_reply" as const,
          authorRole: "astrologer" as const,
          authorUserId: base.journal.astrologerUserId,
          version: 1,
          body: "Ответ",
          attachmentIds: [],
          moodId: null,
          correctsItemId: null,
          updatedAt: "2026-08-12T10:30:00Z"
        },
        {
          id: promptDraftId,
          journalId,
          cycleId,
          kind: "reflection_prompt" as const,
          authorRole: "astrologer" as const,
          authorUserId: base.journal.astrologerUserId,
          version: 1,
          body: "Что хочется заметить дальше?",
          attachmentIds: [],
          moodId: null,
          correctsItemId: null,
          updatedAt: "2026-08-12T10:31:00Z"
        }
      ],
      visibleMaxCursor: 1
    };
    const decision = decidePublishAstrologerReplyCommand(authority, {
      mode: "follow_up",
      actorUserId: base.journal.astrologerUserId,
      cycleId,
      expectedCycleVersion: 1,
      obligationId,
      expectedObligationVersion: 1,
      replyDraftId,
      expectedReplyDraftVersion: 1,
      replyItemId: runtimeId(332),
      replyDerivativeCommandId: runtimeId(333),
      promptDraftId,
      expectedPromptDraftVersion: 1,
      promptItemId: runtimeId(334),
      promptDerivativeCommandId: runtimeId(335),
      eventIds: {
        replyPublished: runtimeId(336),
        promptPublished: runtimeId(337),
        obligationSatisfied: runtimeId(338),
        replyDerivativeRequested: runtimeId(339),
        promptDerivativeRequested: runtimeId(340)
      }
    });

    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        cycles: [
          {
            after: {
              state: "awaiting_client_follow_up",
              clientResponseDueAt: "2026-08-17T11:00:00Z"
            }
          }
        ],
        drafts: [{ after: null }, { after: null }],
        obligations: [{ after: { state: "satisfied", satisfiedByItemId: runtimeId(332) } }],
        timelineItems: [
          { after: { id: runtimeId(332), kind: "astrologer_reply", cursor: 2 } },
          { after: { id: runtimeId(334), kind: "reflection_prompt", cursor: 3 } }
        ],
        derivativeCommands: [
          { sourceDigest: expect.stringMatching(/^sha256:/) },
          { sourceDigest: expect.stringMatching(/^sha256:/) }
        ]
      }
    });
  });
});

function commandAuthority(): AstroDiaryCommandAuthority {
  const subscription = activeSubscription();
  return {
    access: {
      relationshipState: "active",
      entitlementState: "active",
      financeDenied: false,
      journalState: "active",
      hasOpenCycle: false,
      hasOpenResponseObligation: false
    },
    subscription,
    contract: subscription.contract,
    activePeriod: subscription.paidPeriods[0]!,
    commandAt: "2026-02-01T10:00:00Z",
    journal: {
      id: journalId,
      relationshipId: subscription.contract.relationshipId,
      journalEpochId: subscription.journalEpochId,
      astrologerUserId: subscription.contract.astrologerUserId,
      clientUserId: subscription.contract.clientUserId,
      state: "active",
      version: 2,
      createdAt: "2026-08-01T10:00:00Z"
    },
    cycles: [],
    drafts: [
      {
        id: runtimeId(307),
        journalId,
        cycleId: null,
        kind: "client_entry",
        authorRole: "client",
        authorUserId: subscription.contract.clientUserId,
        version: 1,
        body: "Первая запись",
        attachmentIds: [],
        moodId: "calm",
        correctsItemId: null,
        updatedAt: "2026-08-12T09:30:00Z"
      }
    ],
    obligations: [],
    allowances: [
      createPeriodAllowance({
        periodId: runtimeId(10),
        total: 2,
        endsAt: "2026-08-31T10:00:00Z"
      })
    ],
    timelineItems: [],
    visibleMaxCursor: 0,
    media: [],
    erasureAuthority: {
      commands: [],
      redactionReceipts: [],
      cascadeInventory: [],
      cascadeTargets: [],
      cascadeReceipts: []
    }
  };
}
