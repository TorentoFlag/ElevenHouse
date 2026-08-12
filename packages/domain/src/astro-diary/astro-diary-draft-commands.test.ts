import { describe, expect, it } from "vitest";
import type { AstroDiaryClientDraftCreateRequest, AstroDiaryTimelineItem } from "@elevenhouse/contracts";

import { createPeriodAllowance } from "../client-subscriptions/client-subscription-allowance";
import {
  activeSubscription,
  runtimeId
} from "../client-subscriptions/client-subscription-test-fixtures";
import {
  decideAstroDiaryDraftCreateCommand,
  decideAstroDiaryDraftDeleteCommand,
  decideAstroDiaryDraftUpdateCommand,
  executeAstroDiaryParticipantDraftCreateCommand
} from "./astro-diary-draft-commands";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandUnitOfWork
} from "./ports/astro-diary-command-unit-of-work";

const journalId = runtimeId(700);
const draftId = runtimeId(701);
const cycleId = runtimeId(702);
const mediaId = runtimeId(703);
const sourceItemId = runtimeId(704);

describe("AstroDiary private draft commands", () => {
  it("creates an author-only client draft without allowance, events, or browser-chosen identity", async () => {
    const authority = commandAuthority();
    let captured: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0] | undefined;
    const unitOfWork: AstroDiaryCommandUnitOfWork = {
      execute(input) {
        captured = input;
        if (input.resourceAllocation === null) {
          throw new Error("Expected server draft allocation");
        }
        const allocation = { type: "draft" as const, draftId };
        const decision = input.decide(authority, input.envelope, allocation);
        if (decision.outcome !== "applied") {
          throw new Error(`Expected applied decision, received ${decision.code}`);
        }
        return Promise.resolve({ outcome: "not_found" });
      }
    };
    const request = clientRequest({ body: "  Можно сохранить даже пустой будущий цикл  " });

    await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: "client-draft-create",
      actorUserId: authority.journal.clientUserId,
      actorRole: "client",
      request
    });

    expect(captured).toMatchObject({
      journalId,
      preconditions: [{ aggregate: "journal", id: journalId, expectedVersion: 2 }],
      resourceAllocation: { type: "draft" },
      envelope: {
        operation: "start_cycle",
        actorUserId: authority.journal.clientUserId,
        actorRole: "client",
        request: {
          command: "create_draft",
          kind: "client_entry",
          body: request.body,
          attachmentIds: []
        }
      }
    });
    expect(captured?.envelope.request).not.toHaveProperty("draftId");

    const decision = decideAstroDiaryDraftCreateCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      actorRole: "client",
      request,
      draftId
    });
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        journals: [{ beforeVersion: 2, after: { id: journalId, version: 3 } }],
        drafts: [
          {
            beforeVersion: null,
            after: {
              id: draftId,
              journalId,
              authorUserId: authority.journal.clientUserId,
              authorRole: "client",
              kind: "client_entry",
              version: 1,
              body: request.body,
              attachmentIds: [],
              updatedAt: authority.commandAt
            }
          }
        ],
        allowances: [],
        obligations: [],
        events: []
      }
    });
  });

  it("fails closed for a wrong participant, expired paid access, or a duplicate draft purpose", () => {
    const authority = commandAuthority();
    const request = clientRequest();
    expect(
      decideAstroDiaryDraftCreateCommand(authority, {
        actorUserId: authority.journal.astrologerUserId,
        actorRole: "client",
        request,
        draftId
      })
    ).toEqual({ outcome: "rejected", code: "actor_mismatch" });
    expect(
      decideAstroDiaryDraftCreateCommand(
        {
          ...authority,
          commandAt: authority.activePeriod!.endsAt
        },
        {
          actorUserId: authority.journal.clientUserId,
          actorRole: "client",
          request,
          draftId
        }
      )
    ).toEqual({ outcome: "rejected", code: "paid_access_ended" });
    const applied = decideAstroDiaryDraftCreateCommand(authority, {
      actorUserId: authority.journal.clientUserId,
      actorRole: "client",
      request,
      draftId
    });
    if (applied.outcome !== "applied") throw new Error("Expected draft fixture");
    expect(
      decideAstroDiaryDraftCreateCommand(
        { ...authority, drafts: [applied.writeSet.drafts[0]!.after!] },
        {
          actorUserId: authority.journal.clientUserId,
          actorRole: "client",
          request,
          draftId: runtimeId(705)
        }
      )
    ).toEqual({ outcome: "rejected", code: "draft_already_exists" });
  });

  it("binds a cycle draft to the exact participant turn and ready unbound private media", () => {
    const authority = commandAuthority({
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
          openedAt: "2026-02-01T09:00:00Z",
          closedAt: null,
          closeReason: null
        }
      ],
      media: [
        {
          id: mediaId,
          journalId,
          ownerUserId: activeSubscription().contract.astrologerUserId,
          status: "ready",
          visibility: "private",
          purpose: "astro_diary_attachment",
          boundItemId: null
        }
      ],
      access: { hasOpenCycle: true }
    });
    const request = {
      expectedJournalVersion: 2,
      cycleId,
      kind: "astrologer_reply",
      body: "Ответ будет опубликован отдельно",
      attachmentIds: [mediaId] as string[],
      moodId: null,
      correctsItemId: null
    } satisfies Parameters<typeof decideAstroDiaryDraftCreateCommand>[1]["request"];
    expect(
      decideAstroDiaryDraftCreateCommand(authority, {
        actorUserId: authority.journal.astrologerUserId,
        actorRole: "astrologer",
        request,
        draftId
      })
    ).toMatchObject({
      outcome: "applied",
      writeSet: { drafts: [{ after: { cycleId, attachmentIds: [mediaId] } }] }
    });
    expect(
      decideAstroDiaryDraftCreateCommand(
        {
          ...authority,
          cycles: [{ ...authority.cycles[0]!, state: "awaiting_client_follow_up" }]
        },
        {
          actorUserId: authority.journal.astrologerUserId,
          actorRole: "astrologer",
          request,
          draftId
        }
      )
    ).toEqual({ outcome: "rejected", code: "cycle_turn_conflict" });
    expect(
      decideAstroDiaryDraftCreateCommand(
        {
          ...authority,
          media: [{ ...authority.media[0]!, ownerUserId: authority.journal.clientUserId }]
        },
        {
          actorUserId: authority.journal.astrologerUserId,
          actorRole: "astrologer",
          request,
          draftId
        }
      )
    ).toEqual({ outcome: "rejected", code: "media_scope_conflict" });
  });

  it("allows only the original author to prepare a correction for an exact same-cycle item", () => {
    const authority = commandAuthority({
      cycles: [closedCycle()],
      timelineItems: [sourceItem()]
    });
    const request = {
      expectedJournalVersion: 2,
      cycleId,
      kind: "correction",
      body: "Уточнение",
      attachmentIds: [] as string[],
      moodId: null,
      correctsItemId: sourceItemId
    } satisfies Parameters<typeof decideAstroDiaryDraftCreateCommand>[1]["request"];
    expect(
      decideAstroDiaryDraftCreateCommand(authority, {
        actorUserId: authority.journal.clientUserId,
        actorRole: "client",
        request,
        draftId
      })
    ).toMatchObject({ outcome: "applied", writeSet: { drafts: [{ after: { correctsItemId: sourceItemId } }] } });
    expect(
      decideAstroDiaryDraftCreateCommand(
        {
          ...authority,
          timelineItems: [
            { ...sourceItem(), authorUserId: authority.journal.astrologerUserId }
          ]
        },
        {
          actorUserId: authority.journal.clientUserId,
          actorRole: "client",
          request,
          draftId
        }
      )
    ).toEqual({ outcome: "rejected", code: "correction_source_conflict" });
  });

  it("updates an own draft with exact journal and draft CAS without changing its identity", () => {
    const initial = decideAstroDiaryDraftCreateCommand(commandAuthority(), {
      actorUserId: activeSubscription().contract.clientUserId,
      actorRole: "client",
      request: clientRequest(),
      draftId
    });
    if (initial.outcome !== "applied") throw new Error("Expected draft fixture");
    const draft = initial.writeSet.drafts[0]!.after!;
    const versionThreeAuthority = commandAuthority({ drafts: [draft] });
    const decision = decideAstroDiaryDraftUpdateCommand(
      {
        ...versionThreeAuthority,
        journal: { ...versionThreeAuthority.journal, version: 3 }
      },
      {
        actorUserId: draft.authorUserId,
        actorRole: "client",
        request: {
          expectedJournalVersion: 3,
          draftId,
          expectedDraftVersion: 1,
          body: "Изменённый приватный черновик",
          attachmentIds: [],
          moodId: "joy"
        }
      }
    );
    expect(decision).toMatchObject({
      outcome: "applied",
      writeSet: {
        journals: [{ beforeVersion: 3, after: { version: 4 } }],
        drafts: [
          {
            draftId,
            beforeVersion: 1,
            after: { id: draftId, version: 2, body: "Изменённый приватный черновик" }
          }
        ]
      }
    });
    expect(
      decideAstroDiaryDraftUpdateCommand(commandAuthority({ drafts: [draft] }), {
        actorUserId: draft.authorUserId,
        actorRole: "client",
        request: {
          expectedJournalVersion: 2,
          draftId,
          expectedDraftVersion: 2,
          body: "Stale",
          attachmentIds: [],
          moodId: null
        }
      })
    ).toEqual({ outcome: "rejected", code: "version_conflict" });
  });

  it("deletes only the owning participant draft and keeps its immutable result version", () => {
    const initial = decideAstroDiaryDraftCreateCommand(commandAuthority(), {
      actorUserId: activeSubscription().contract.clientUserId,
      actorRole: "client",
      request: clientRequest(),
      draftId
    });
    if (initial.outcome !== "applied") throw new Error("Expected draft fixture");
    const draft = initial.writeSet.drafts[0]!.after!;
    expect(
      decideAstroDiaryDraftDeleteCommand(commandAuthority({ drafts: [draft] }), {
        actorUserId: draft.authorUserId,
        actorRole: "client",
        draftId,
        request: { expectedJournalVersion: 2, expectedDraftVersion: 1 }
      })
    ).toMatchObject({
      outcome: "applied",
      writeSet: {
        drafts: [{ draftId, beforeVersion: 1, after: null }],
        events: []
      }
    });
    expect(
      decideAstroDiaryDraftDeleteCommand(commandAuthority({ drafts: [draft] }), {
        actorUserId: commandAuthority().journal.astrologerUserId,
        actorRole: "astrologer",
        draftId,
        request: { expectedJournalVersion: 2, expectedDraftVersion: 1 }
      })
    ).toEqual({ outcome: "rejected", code: "author_mismatch" });
  });
});

function clientRequest(
  overrides: Partial<Extract<AstroDiaryClientDraftCreateRequest, { kind: "client_entry" }>> = {}
): Extract<AstroDiaryClientDraftCreateRequest, { kind: "client_entry" }> {
  return {
    expectedJournalVersion: 2,
    cycleId: null,
    kind: "client_entry",
    body: "Личный черновик",
    attachmentIds: [],
    moodId: "calm",
    correctsItemId: null,
    ...overrides
  };
}

function closedCycle(): AstroDiaryCommandAuthority["cycles"][number] {
  return {
    id: cycleId,
    journalId,
    openingPeriodId: runtimeId(10),
    openingAllowanceReservationId: null,
    awaitingClientPromptItemId: null,
    clientResponseDueAt: null,
    clientResponseWindowCalendarDays: null,
    clientResponseTimezone: null,
    state: "closed",
    version: 2,
    openedAt: "2026-02-01T09:00:00Z",
    closedAt: "2026-02-02T09:00:00Z",
    closeReason: "completed"
  };
}

function sourceItem(): AstroDiaryTimelineItem {
  return {
    id: sourceItemId,
    journalId,
    cycleId,
    kind: "client_entry",
    authorRole: "client",
    authorUserId: activeSubscription().contract.clientUserId,
    revision: 1,
    body: "Исходная запись",
    attachmentIds: [],
    moodId: "calm",
    contextStatus: "personal",
    correctsItemId: null,
    editedAt: null,
    occurredAt: "2026-02-01T09:00:00Z",
    cursor: 1
  };
}

function commandAuthority(
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
      createdAt: "2026-02-01T09:00:00Z"
    },
    cycles: overrides.cycles ?? [],
    drafts: overrides.drafts ?? [],
    obligations: overrides.obligations ?? [],
    allowances: overrides.allowances ?? [
      createPeriodAllowance({
        periodId: runtimeId(10),
        total: 4,
        endsAt: "2026-02-28T07:30:00Z"
      })
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
