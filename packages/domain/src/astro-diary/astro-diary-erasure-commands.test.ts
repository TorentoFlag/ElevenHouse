import { describe, expect, it } from "vitest";

import {
  activeSubscription,
  runtimeId
} from "../client-subscriptions/client-subscription-test-fixtures";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandUnitOfWork
} from "./ports/astro-diary-command-unit-of-work";
import {
  decideCompleteItemErasureCommand,
  decideCompleteWholeJournalErasureCommand,
  decideStartItemErasureCommand,
  decideStartWholeJournalErasureCommand,
  executeAstroDiaryErasureCommand
} from "./astro-diary-erasure-commands";

const journalId = runtimeId(500);
const cycleId = runtimeId(501);
const itemId = runtimeId(502);

describe("AstroDiary erasure atomic command composers", () => {
  it("starts item erasure with immediate read/media revocation and source-bound cascade", () => {
    const authority = erasureAuthority();
    const decision = decideStartItemErasureCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      actorRole: "client",
      itemId,
      expectedRevision: 1,
      erasureCommandId: runtimeId(503),
      derivativeRedactionCommandId: runtimeId(504),
      erasureRequestedEventId: runtimeId(509)
    });
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        itemReadAccessRevocations: [{ itemId, sourceRevision: 1 }],
        mediaAccessRevocations: [{ mediaId: runtimeId(505), itemId }],
        erasureCommands: [
          {
            commandId: runtimeId(503),
            targetType: "item",
            targetId: itemId,
            state: "pending",
            sourceVersion: 1,
            sourceDigest: expect.stringMatching(/^sha256:/)
          }
        ],
        derivativeCommands: [
          {
            commandId: runtimeId(504),
            operation: "redact",
            sourceDigest: expect.stringMatching(/^sha256:/)
          }
        ]
      }
    });
  });

  it("starts whole-journal erasure with all live closures, subscription end and cascade atomically", () => {
    const authority = erasureAuthority();
    const decision = decideStartWholeJournalErasureCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      expectedJournalVersion: 2,
      subscriptionId: authority.subscription.id,
      erasureRequestId: runtimeId(510),
      cascadeRequestId: runtimeId(511),
      erasureRequestedEventId: runtimeId(516),
      factIds: {
        journalErasureRequested: runtimeId(512),
        subscriptionEndRequested: runtimeId(513),
        cycleClosed: [{ cycleId, factId: runtimeId(514) }],
        obligationClosed: [{ obligationId: runtimeId(506), factId: runtimeId(515) }]
      }
    });
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        journals: [{ after: { state: "erasing", version: 3 } }],
        cycles: [{ after: { state: "closed", closeReason: "journal_deleted" } }],
        obligations: [{ after: { state: "closed_without_response" } }],
        journalMediaAccessRevocations: expect.arrayContaining([
          { mediaId: runtimeId(505), journalId },
          { mediaId: runtimeId(507), journalId }
        ]),
        subscriptionTransitions: [
          { subscriptionId: authority.subscription.id, kind: "schedule_end_no_renewal" }
        ],
        cascadeCommands: [{ cascadeRequestId: runtimeId(511), journalId, state: "pending" }],
        erasureFacts: expect.arrayContaining([
          expect.objectContaining({ type: "astro_diary.journal_erasure_requested" })
        ]),
        events: [{ eventId: runtimeId(516) }]
      }
    });
  });

  it("completes item and journal erasure only from locked stored receipts", () => {
    const base = erasureAuthority();
    const itemStart = decideStartItemErasureCommand(base, {
      actorUserId: base.journal.clientUserId,
      actorRole: "client",
      itemId,
      expectedRevision: 1,
      erasureCommandId: runtimeId(520),
      derivativeRedactionCommandId: runtimeId(521),
      erasureRequestedEventId: runtimeId(529)
    });
    if (itemStart.outcome !== "applied") throw new Error("expected item erasure start");
    const itemCommand = itemStart.writeSet.erasureCommands[0]!;
    expect(
      decideCompleteItemErasureCommand(
        {
          ...base,
          erasureAuthority: {
            ...base.erasureAuthority,
            commands: [itemCommand],
            redactionReceipts: [
              {
                receiptId: runtimeId(522),
                commandId: itemCommand.commandId,
                target: "source",
                mediaId: null
              },
              {
                receiptId: runtimeId(523),
                commandId: itemCommand.commandId,
                target: "derivative",
                mediaId: null
              },
              {
                receiptId: runtimeId(524),
                commandId: itemCommand.commandId,
                target: "media",
                mediaId: runtimeId(505)
              }
            ],
            cascadeReceipts: []
          }
        },
        { commandId: itemCommand.commandId, expectedRevision: 1 }
      )
    ).toMatchObject({
      outcome: "applied",
      writeSet: {
        timelineItems: [{ after: { kind: "tombstone", reason: "content_erased" } }],
        erasureCommands: [{ state: "completed" }]
      }
    });

    const journalStart = decideStartWholeJournalErasureCommand(base, {
      actorUserId: base.journal.clientUserId,
      expectedJournalVersion: 2,
      subscriptionId: base.subscription.id,
      erasureRequestId: runtimeId(530),
      cascadeRequestId: runtimeId(531),
      erasureRequestedEventId: runtimeId(536),
      factIds: {
        journalErasureRequested: runtimeId(532),
        subscriptionEndRequested: runtimeId(533),
        cycleClosed: [{ cycleId, factId: runtimeId(534) }],
        obligationClosed: [{ obligationId: runtimeId(506), factId: runtimeId(535) }]
      }
    });
    if (journalStart.outcome !== "applied") throw new Error("expected journal erasure start");
    const journalCommand = journalStart.writeSet.erasureCommands[0]!;
    const erasingJournal = { ...journalStart.writeSet.journals[0]!.after!, version: 5 };
    expect(
      decideCompleteWholeJournalErasureCommand(
        {
          ...base,
          journal: erasingJournal,
          erasureAuthority: {
            ...base.erasureAuthority,
            commands: [journalCommand],
            redactionReceipts: [],
            cascadeTargets: journalStart.writeSet.cascadeTargets,
            cascadeReceipts: cascadeReceipts(journalStart.writeSet.cascadeTargets)
          }
        },
        { commandId: journalCommand.commandId, expectedJournalVersion: 5 }
      )
    ).toMatchObject({
      outcome: "applied",
      writeSet: {
        journals: [{ after: { state: "erased", version: 6 } }],
        erasureCommands: [{ state: "completed" }],
        cascadeCommands: [{ state: "completed" }]
      }
    });
  });

  it("rejects duplicate redaction receipt roles instead of choosing one arbitrarily", () => {
    const base = erasureAuthority();
    const started = decideStartItemErasureCommand(base, {
      actorUserId: base.journal.clientUserId,
      actorRole: "client",
      itemId,
      expectedRevision: 1,
      erasureCommandId: runtimeId(540),
      derivativeRedactionCommandId: runtimeId(541),
      erasureRequestedEventId: runtimeId(549)
    });
    if (started.outcome !== "applied") throw new Error("expected item erasure start");
    const command = started.writeSet.erasureCommands[0]!;
    expect(
      decideCompleteItemErasureCommand(
        {
          ...base,
          erasureAuthority: {
            ...base.erasureAuthority,
            commands: [command],
            redactionReceipts: [
              {
                receiptId: runtimeId(542),
                commandId: command.commandId,
                target: "source",
                mediaId: null
              },
              {
                receiptId: runtimeId(543),
                commandId: command.commandId,
                target: "source",
                mediaId: null
              },
              {
                receiptId: runtimeId(544),
                commandId: command.commandId,
                target: "derivative",
                mediaId: null
              },
              {
                receiptId: runtimeId(545),
                commandId: command.commandId,
                target: "media",
                mediaId: runtimeId(505)
              }
            ],
            cascadeReceipts: []
          }
        },
        { commandId: command.commandId, expectedRevision: 1 }
      )
    ).toEqual({ outcome: "rejected", code: "redaction_evidence_conflict" });
  });

  it("binds erasure semantics to the generic locked command unit of work", async () => {
    const authority = erasureAuthority();
    let captured: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0] | undefined;
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        captured = input;
        return Promise.resolve({ outcome: "not_found" });
      }
    };
    await executeAstroDiaryErasureCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "erase-item",
      request: {
        type: "start_item",
        command: {
          actorUserId: authority.journal.clientUserId,
          actorRole: "client",
          itemId,
          expectedRevision: 1,
          erasureCommandId: runtimeId(550),
          derivativeRedactionCommandId: runtimeId(551),
          erasureRequestedEventId: runtimeId(552)
        }
      }
    });
    expect(captured).toMatchObject({
      preconditions: [
        { aggregate: "journal", id: journalId, expectedVersion: 2 },
        { aggregate: "timeline_item", id: itemId, expectedVersion: 1 }
      ],
      envelope: {
        operation: "erase",
        actorRole: "client",
        actorUserId: authority.journal.clientUserId,
        request: { type: "start_item", itemId, expectedRevision: 1 }
      }
    });
  });

  it("attributes item erasure to its exact author role", async () => {
    const authority = erasureAuthority();
    let captured: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0] | undefined;
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        captured = input;
        return Promise.resolve({ outcome: "not_found" });
      }
    };
    await executeAstroDiaryErasureCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: "erase-astrologer-item",
      request: {
        type: "start_item",
        command: {
          actorUserId: authority.journal.astrologerUserId,
          actorRole: "astrologer",
          itemId,
          expectedRevision: 1,
          erasureCommandId: runtimeId(560),
          derivativeRedactionCommandId: runtimeId(561),
          erasureRequestedEventId: runtimeId(562)
        }
      }
    });
    expect(captured?.envelope).toMatchObject({
      actorUserId: authority.journal.astrologerUserId,
      actorRole: "astrologer"
    });
    expect(
      decideStartItemErasureCommand(authority, {
        actorUserId: authority.journal.clientUserId,
        actorRole: "astrologer",
        itemId,
        expectedRevision: 1,
        erasureCommandId: runtimeId(563),
        derivativeRedactionCommandId: runtimeId(564),
        erasureRequestedEventId: runtimeId(565)
      })
    ).toEqual({ outcome: "rejected", code: "actor_role_mismatch" });
  });

  it("completes whole-journal erasure after an item redaction advances the journal CAS", () => {
    const base = erasureAuthority();
    const journalStart = decideStartWholeJournalErasureCommand(base, {
      actorUserId: base.journal.clientUserId,
      expectedJournalVersion: 2,
      subscriptionId: base.subscription.id,
      erasureRequestId: runtimeId(570),
      cascadeRequestId: runtimeId(571),
      erasureRequestedEventId: runtimeId(572),
      factIds: {
        journalErasureRequested: runtimeId(573),
        subscriptionEndRequested: runtimeId(574),
        cycleClosed: [{ cycleId, factId: runtimeId(575) }],
        obligationClosed: [{ obligationId: runtimeId(506), factId: runtimeId(576) }]
      }
    });
    if (journalStart.outcome !== "applied") throw new Error("expected journal erasure start");
    const wholeCommand = journalStart.writeSet.erasureCommands[0]!;
    const erasingAuthority = {
      ...base,
      access: { ...base.access, journalState: "erasing" as const },
      journal: journalStart.writeSet.journals[0]!.after!
    };
    const itemStart = decideStartItemErasureCommand(erasingAuthority, {
      actorUserId: base.journal.clientUserId,
      actorRole: "client",
      itemId,
      expectedRevision: 1,
      erasureCommandId: runtimeId(577),
      derivativeRedactionCommandId: runtimeId(578),
      erasureRequestedEventId: runtimeId(579)
    });
    if (itemStart.outcome !== "applied") throw new Error("expected item erasure start");
    const itemCommand = itemStart.writeSet.erasureCommands[0]!;
    const itemCompletingAuthority = {
      ...erasingAuthority,
      journal: itemStart.writeSet.journals[0]!.after!,
      erasureAuthority: {
        ...erasingAuthority.erasureAuthority,
        commands: [wholeCommand, itemCommand],
        redactionReceipts: [
          {
            receiptId: runtimeId(580),
            commandId: itemCommand.commandId,
            target: "source" as const,
            mediaId: null
          },
          {
            receiptId: runtimeId(581),
            commandId: itemCommand.commandId,
            target: "derivative" as const,
            mediaId: null
          },
          {
            receiptId: runtimeId(582),
            commandId: itemCommand.commandId,
            target: "media" as const,
            mediaId: runtimeId(505)
          }
        ],
        cascadeReceipts: []
      }
    };
    const itemComplete = decideCompleteItemErasureCommand(itemCompletingAuthority, {
      commandId: itemCommand.commandId,
      expectedRevision: 1
    });
    if (itemComplete.outcome !== "applied") throw new Error("expected item erasure completion");
    const journalAfterItem = itemComplete.writeSet.journals[0]!.after!;
    expect(
      decideCompleteWholeJournalErasureCommand(
        {
          ...itemCompletingAuthority,
          journal: journalAfterItem,
          timelineItems: [itemComplete.writeSet.timelineItems[0]!.after],
          erasureAuthority: {
            ...itemCompletingAuthority.erasureAuthority,
            commands: [wholeCommand, itemComplete.writeSet.erasureCommands[0]!],
            redactionReceipts: itemCompletingAuthority.erasureAuthority.redactionReceipts,
            cascadeTargets: journalStart.writeSet.cascadeTargets,
            cascadeReceipts: cascadeReceipts(journalStart.writeSet.cascadeTargets)
          }
        },
        { commandId: wholeCommand.commandId, expectedJournalVersion: journalAfterItem.version }
      )
    ).toMatchObject({
      outcome: "applied",
      writeSet: { journals: [{ after: { state: "erased", version: 6 } }] }
    });
  });

  it("requires an exact source-bound cascade target receipt set", () => {
    const base = erasureAuthority();
    const started = decideStartWholeJournalErasureCommand(base, {
      actorUserId: base.journal.clientUserId,
      expectedJournalVersion: 2,
      subscriptionId: base.subscription.id,
      erasureRequestId: runtimeId(590),
      cascadeRequestId: runtimeId(591),
      erasureRequestedEventId: runtimeId(592),
      factIds: {
        journalErasureRequested: runtimeId(593),
        subscriptionEndRequested: runtimeId(594),
        cycleClosed: [{ cycleId, factId: runtimeId(595) }],
        obligationClosed: [{ obligationId: runtimeId(506), factId: runtimeId(596) }]
      }
    });
    if (started.outcome !== "applied") throw new Error("expected journal erasure start");
    expect(started.writeSet.cascadeTargets).toEqual(
      base.erasureAuthority.cascadeInventory.map((target) => ({
        ...target,
        cascadeRequestId: runtimeId(591),
        journalId
      }))
    );
    const command = started.writeSet.erasureCommands[0]!;
    const erasingJournal = started.writeSet.journals[0]!.after!;
    const exactReceipts = started.writeSet.cascadeTargets.map((target, index) => ({
      ...target,
      receiptId: runtimeId(600 + index),
      completedAt: "2026-08-12T13:00:00Z"
    }));
    const complete = (receipts: typeof exactReceipts) =>
      decideCompleteWholeJournalErasureCommand(
        {
          ...base,
          journal: erasingJournal,
          erasureAuthority: {
            ...base.erasureAuthority,
            commands: [command],
            cascadeTargets: started.writeSet.cascadeTargets,
            cascadeReceipts: receipts
          }
        },
        { commandId: command.commandId, expectedJournalVersion: erasingJournal.version }
      );

    expect(complete(exactReceipts)).toMatchObject({ outcome: "applied" });
    expect(complete(exactReceipts.slice(1))).toEqual({
      outcome: "rejected",
      code: "cascade_evidence_incomplete"
    });
    expect(
      complete([
        ...exactReceipts,
        { ...exactReceipts[0]!, receiptId: runtimeId(699), targetId: runtimeId(698) }
      ])
    ).toEqual({ outcome: "rejected", code: "cascade_evidence_conflict" });
    expect(complete([...exactReceipts, exactReceipts[0]!])).toEqual({
      outcome: "rejected",
      code: "cascade_evidence_conflict"
    });
    expect(
      complete([
        { ...exactReceipts[0]!, sourceDigest: `sha256:${"f".repeat(64)}` },
        ...exactReceipts.slice(1)
      ])
    ).toEqual({ outcome: "rejected", code: "cascade_evidence_conflict" });
    expect(
      complete([{ ...exactReceipts[0]!, sourceVersion: 999 }, ...exactReceipts.slice(1)])
    ).toEqual({ outcome: "rejected", code: "cascade_evidence_conflict" });
  });
});

function erasureAuthority(): AstroDiaryCommandAuthority {
  const subscription = activeSubscription();
  return {
    access: {
      relationshipState: "blocked",
      entitlementState: "active",
      financeDenied: false,
      journalState: "active",
      hasOpenCycle: true,
      hasOpenResponseObligation: true
    },
    subscription,
    contract: subscription.contract,
    activePeriod: subscription.paidPeriods[0]!,
    commandAt: "2026-08-12T12:00:00Z",
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
    cycles: [
      {
        id: cycleId,
        journalId,
        openingPeriodId: runtimeId(10),
        openingAllowanceReservationId: null,
        awaitingClientPromptItemId: null,
        clientResponseDueAt: null,
        clientResponseWindowCalendarDays: null,
        clientResponseTimezone: null,
        state: "awaiting_astrologer_response",
        version: 1,
        openedAt: "2026-08-12T10:00:00Z",
        closedAt: null,
        closeReason: null
      }
    ],
    drafts: [],
    obligations: [
      {
        id: runtimeId(506),
        journalId,
        cycleId,
        triggerItemId: itemId,
        state: "open",
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
      }
    ],
    allowances: [],
    timelineItems: [
      {
        id: itemId,
        journalId,
        cycleId,
        kind: "client_entry",
        authorRole: "client",
        authorUserId: subscription.contract.clientUserId,
        revision: 1,
        body: "Запись",
        attachmentIds: [runtimeId(505)],
        moodId: "calm",
        contextStatus: "personal",
        correctsItemId: null,
        editedAt: null,
        occurredAt: "2026-08-12T10:00:00Z",
        cursor: 1
      }
    ],
    visibleMaxCursor: 1,
    media: [
      {
        id: runtimeId(505),
        ownerUserId: subscription.contract.clientUserId,
        journalId,
        status: "ready",
        visibility: "private",
        purpose: "astro_diary_attachment",
        boundItemId: itemId
      },
      {
        id: runtimeId(507),
        ownerUserId: subscription.contract.clientUserId,
        journalId,
        status: "ready",
        visibility: "private",
        purpose: "astro_diary_voice",
        boundItemId: null
      }
    ],
    erasureAuthority: {
      commands: [],
      redactionReceipts: [],
      cascadeInventory: ([
        "timeline_revision",
        "derivative",
        "transcript",
        "extraction",
        "embedding",
        "ai_draft",
        "export",
        "media"
      ] as const).map((subsystem, index) => ({
        subsystem,
        targetId: subsystem === "timeline_revision" ? itemId : runtimeId(650 + index),
        sourceVersion: 1,
        sourceDigest: `sha256:${(index + 1).toString(16).repeat(64)}`
      })),
      cascadeTargets: [],
      cascadeReceipts: []
    }
  };
}

function cascadeReceipts(
  targets: AstroDiaryCommandAuthority["erasureAuthority"]["cascadeTargets"]
): AstroDiaryCommandAuthority["erasureAuthority"]["cascadeReceipts"] {
  return targets.map((target, index) => ({
    ...target,
    receiptId: runtimeId(700 + index),
    completedAt: "2026-08-12T13:00:00Z"
  }));
}
