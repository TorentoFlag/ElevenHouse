import type { AstroDiaryTimelineItem } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import {
  decideAstroDiaryItemCorrection,
  decideAstroDiaryItemEdit,
  completeAstroDiaryItemErasure,
  decideAstroDiaryItemErasure,
  decideAstroDiaryItemHide
} from "./astro-diary-timeline";

const clientUserId = "30000000-0000-4000-8000-000000000001";
const astrologerUserId = "30000000-0000-4000-8000-000000000002";
const journalId = "30000000-0000-4000-8000-000000000003";
const cycleId = "30000000-0000-4000-8000-000000000004";

describe("AstroDiary timeline decisions", () => {
  it("allows only the author to CAS-edit an independent non-terminal item", () => {
    const item = { ...clientEntry(), contextStatus: "personal" as const };
    expect(
      decideAstroDiaryItemEdit(item, {
        actorUserId: clientUserId,
        expectedRevision: 1,
        dependentItemIds: [],
        causedTerminalCycleTransition: false,
        body: "Уточнённая запись",
        attachmentIds: [],
        media: [],
        editedAt: "2026-08-12T11:00:00Z"
      })
    ).toEqual({
      outcome: "edit_allowed",
      previousRevision: 1,
      item: {
        ...item,
        body: "Уточнённая запись",
        contextStatus: "pending",
        revision: 2,
        editedAt: "2026-08-12T11:00:00Z"
      },
      mediaBindings: [],
      mediaReleases: [],
      contextInvalidation: { itemId: item.id, previousRevision: 1, nextRevision: 2 }
    });
    expect(
      decideAstroDiaryItemEdit(item, {
        actorUserId: astrologerUserId,
        expectedRevision: 1,
        dependentItemIds: [],
        causedTerminalCycleTransition: false,
        body: "Чужая правка",
        attachmentIds: [],
        media: [],
        editedAt: "2026-08-12T11:00:00Z"
      })
    ).toEqual({ outcome: "rejected", code: "author_mismatch" });
  });

  it("requires a linked correction after dependency or terminal use", () => {
    const item = clientEntry();
    expect(
      decideAstroDiaryItemEdit(item, {
        actorUserId: clientUserId,
        expectedRevision: 1,
        dependentItemIds: ["30000000-0000-4000-8000-000000000010"],
        causedTerminalCycleTransition: false,
        body: "Новая версия",
        attachmentIds: [],
        media: [],
        editedAt: "2026-08-12T11:00:00Z"
      })
    ).toEqual({ outcome: "rejected", code: "dependent_item_exists" });

    expect(
      decideAstroDiaryItemCorrection(item, {
        actorUserId: clientUserId,
        dependentItemIds: ["30000000-0000-4000-8000-000000000010"],
        causedTerminalCycleTransition: false,
        correctionItemId: "30000000-0000-4000-8000-000000000011",
        body: "Уточнение к записи",
        attachmentIds: [],
        media: [],
        occurredAt: "2026-08-12T12:00:00Z",
        cursor: 4
      })
    ).toEqual({
      outcome: "correction_allowed",
      correction: {
        id: "30000000-0000-4000-8000-000000000011",
        correctsItemId: item.id,
        journalId,
        cycleId,
        kind: "correction",
        authorRole: "client",
        authorUserId: clientUserId,
        revision: 1,
        body: "Уточнение к записи",
        attachmentIds: [],
        moodId: null,
        contextStatus: null,
        editedAt: null,
        occurredAt: "2026-08-12T12:00:00Z",
        cursor: 4
      },
      mediaBindings: []
    });
  });

  it("hides an unanswered client trigger only with its atomic lifecycle closure", () => {
    const item = clientEntry();
    const result = decideAstroDiaryItemHide(item, {
      actorUserId: clientUserId,
      expectedRevision: 1,
      cycleState: "awaiting_astrologer_response",
      dependentItemIds: [],
      tombstonedAt: "2026-08-12T11:00:00Z"
    });

    expect(result).toEqual({
      outcome: "hide_allowed",
      tombstone: {
        id: item.id,
        journalId,
        cycleId,
        kind: "tombstone",
        originalKind: "client_entry",
        authorRole: "client",
        authorUserId: clientUserId,
        revision: 2,
        reason: "hidden_by_author",
        occurredAt: item.occurredAt,
        cursor: item.cursor
      },
      hiddenAt: "2026-08-12T11:00:00Z",
      cycleClosure: { cycleId, reason: "trigger_deleted" },
      obligationClosure: { cycleId, state: "closed_without_response" },
      allowanceTransition: "none"
    });
    expect(JSON.stringify(result)).not.toContain("Первичная запись");
  });

  it("withdraws an unanswered opening prompt with reservation release but never restores a served follow-up", () => {
    const item = reflectionPrompt();
    expect(
      decideAstroDiaryItemHide(item, {
        actorUserId: astrologerUserId,
        expectedRevision: 1,
        cycleState: "awaiting_client_entry",
        dependentItemIds: [],
        tombstonedAt: "2026-08-12T11:00:00Z"
      })
    ).toMatchObject({
      outcome: "hide_allowed",
      cycleClosure: { reason: "prompt_withdrawn" },
      obligationClosure: null,
      allowanceTransition: "release_opening_reservation"
    });
    expect(
      decideAstroDiaryItemHide(item, {
        actorUserId: astrologerUserId,
        expectedRevision: 1,
        cycleState: "awaiting_client_follow_up",
        dependentItemIds: [],
        tombstonedAt: "2026-08-12T11:00:00Z"
      })
    ).toMatchObject({
      outcome: "hide_allowed",
      cycleClosure: { reason: "prompt_withdrawn" },
      allowanceTransition: "none"
    });
  });

  it("forbids ordinary hide after reply satisfaction or dependency", () => {
    expect(
      decideAstroDiaryItemHide(astrologerReply(), {
        actorUserId: astrologerUserId,
        expectedRevision: 1,
        cycleState: "closed",
        dependentItemIds: [],
        tombstonedAt: "2026-08-12T11:00:00Z"
      })
    ).toEqual({ outcome: "rejected", code: "ordinary_hide_not_allowed" });
    expect(
      decideAstroDiaryItemHide(clientEntry(), {
        actorUserId: clientUserId,
        expectedRevision: 1,
        cycleState: "awaiting_astrologer_response",
        dependentItemIds: ["30000000-0000-4000-8000-000000000020"],
        tombstonedAt: "2026-08-12T11:00:00Z"
      })
    ).toEqual({ outcome: "rejected", code: "dependent_item_exists" });
  });

  it("requires exact private journal media authority for edit and correction", () => {
    const mediaId = "30000000-0000-4000-8000-000000000040";
    const media = {
      id: mediaId,
      ownerUserId: clientUserId,
      journalId,
      status: "ready",
      visibility: "private",
      purpose: "astro_diary_voice",
      boundItemId: null
    } as const;
    expect(
      decideAstroDiaryItemEdit(clientEntry(), {
        actorUserId: clientUserId,
        expectedRevision: 1,
        dependentItemIds: [],
        causedTerminalCycleTransition: false,
        body: "Запись с голосом",
        attachmentIds: [mediaId],
        media: [media],
        editedAt: "2026-08-12T11:00:00Z"
      })
    ).toMatchObject({
      outcome: "edit_allowed",
      mediaBindings: [{ mediaId, itemId: clientEntry().id }],
      mediaReleases: []
    });

    const itemWithVoice = { ...clientEntry(), attachmentIds: [mediaId] };
    expect(
      decideAstroDiaryItemEdit(itemWithVoice, {
        actorUserId: clientUserId,
        expectedRevision: 1,
        dependentItemIds: [],
        causedTerminalCycleTransition: false,
        body: "Запись без голоса",
        attachmentIds: [],
        media: [{ ...media, boundItemId: itemWithVoice.id }],
        editedAt: "2026-08-12T11:00:00Z"
      })
    ).toMatchObject({
      outcome: "edit_allowed",
      mediaBindings: [],
      mediaReleases: [{ mediaId, itemId: itemWithVoice.id }]
    });
    expect(
      decideAstroDiaryItemCorrection(clientEntry(), {
        actorUserId: clientUserId,
        dependentItemIds: ["30000000-0000-4000-8000-000000000010"],
        causedTerminalCycleTransition: false,
        correctionItemId: "30000000-0000-4000-8000-000000000041",
        body: "Уточнение",
        attachmentIds: [mediaId],
        media: [{ ...media, journalId: "30000000-0000-4000-8000-000000000099" }],
        occurredAt: "2026-08-12T12:00:00Z",
        cursor: 4
      })
    ).toEqual({ outcome: "rejected", code: "media_scope_conflict" });
  });

  it("immediately revokes item and attachment reads while cascade erasure is pending", () => {
    const item = clientEntry();
    const itemWithMedia = {
      ...item,
      attachmentIds: ["30000000-0000-4000-8000-000000000032"]
    };
    const decision = decideAstroDiaryItemErasure(itemWithMedia, {
      actorUserId: clientUserId,
      expectedRevision: 1,
      erasureCommandId: "30000000-0000-4000-8000-000000000030",
      derivativeRedactionCommandId: "30000000-0000-4000-8000-000000000031",
      occurredAt: "2026-08-12T12:00:00Z"
    });
    expect(decision).toMatchObject({
      outcome: "erasure_started",
      erasureCommand: {
        id: "30000000-0000-4000-8000-000000000030",
        itemId: item.id,
        sourceRevision: 1,
        sourceDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        state: "pending"
      },
      readAccessRevocation: { itemId: item.id, sourceRevision: 1 },
      mediaAccessRevocations: ["30000000-0000-4000-8000-000000000032"],
      derivativeRedaction: {
        commandId: "30000000-0000-4000-8000-000000000031",
        sourceItemId: item.id,
        sourceRevision: 1
      }
    });
    expect(JSON.stringify(decision)).not.toContain(item.body);
  });

  it("reports item erasure only after exact source, media, and derivative receipts exist", () => {
    const mediaId = "30000000-0000-4000-8000-000000000032";
    const item = {
      ...clientEntry(),
      attachmentIds: [mediaId]
    };
    const started = decideAstroDiaryItemErasure(item, {
      actorUserId: clientUserId,
      expectedRevision: 1,
      erasureCommandId: "30000000-0000-4000-8000-000000000030",
      derivativeRedactionCommandId: "30000000-0000-4000-8000-000000000031",
      occurredAt: "2026-08-12T12:00:00Z"
    });
    if (started.outcome !== "erasure_started") throw new Error("expected erasure start");
    const input = {
      expectedRevision: 1,
      erasureCommand: {
        commandId: started.erasureCommand.id,
        itemId: started.erasureCommand.itemId,
        sourceRevision: started.erasureCommand.sourceRevision,
        sourceDigest: started.erasureCommand.sourceDigest,
        state: started.erasureCommand.state
      },
      sourceRedactionReceiptId: "30000000-0000-4000-8000-000000000033",
      derivativeRedactionReceiptId: "30000000-0000-4000-8000-000000000034",
      mediaRedactionReceipts: [
        {
          mediaId,
          receiptId: "30000000-0000-4000-8000-000000000035"
        }
      ],
      completedAt: "2026-08-12T12:10:00Z"
    } as const;
    expect(completeAstroDiaryItemErasure(item, input)).toMatchObject({
      outcome: "erasure_completed",
      tombstone: {
        id: item.id,
        kind: "tombstone",
        reason: "content_erased",
        revision: 2,
        occurredAt: item.occurredAt,
        cursor: item.cursor
      },
      completedAt: input.completedAt
    });
    expect(completeAstroDiaryItemErasure(item, { ...input, mediaRedactionReceipts: [] })).toEqual({
      outcome: "rejected",
      code: "redaction_evidence_incomplete"
    });
    expect(
      completeAstroDiaryItemErasure({ ...item, body: "changed without a revision bump" }, input)
    ).toEqual({ outcome: "rejected", code: "source_evidence_conflict" });
  });
});

function clientEntry(): Extract<AstroDiaryTimelineItem, { kind: "client_entry" }> {
  return {
    id: "30000000-0000-4000-8000-000000000005",
    journalId,
    cycleId,
    kind: "client_entry",
    authorRole: "client",
    authorUserId: clientUserId,
    revision: 1,
    body: "Первичная запись",
    attachmentIds: [],
    moodId: "calm",
    contextStatus: "pending",
    correctsItemId: null,
    editedAt: null,
    occurredAt: "2026-08-12T10:00:00Z",
    cursor: 1
  };
}

function reflectionPrompt(): Extract<AstroDiaryTimelineItem, { kind: "reflection_prompt" }> {
  return {
    id: "30000000-0000-4000-8000-000000000006",
    journalId,
    cycleId,
    kind: "reflection_prompt",
    authorRole: "astrologer",
    authorUserId: astrologerUserId,
    revision: 1,
    body: "Что изменилось?",
    attachmentIds: [],
    moodId: null,
    contextStatus: null,
    correctsItemId: null,
    editedAt: null,
    occurredAt: "2026-08-12T10:00:00Z",
    cursor: 1
  };
}

function astrologerReply(): Extract<AstroDiaryTimelineItem, { kind: "astrologer_reply" }> {
  return {
    ...reflectionPrompt(),
    id: "30000000-0000-4000-8000-000000000007",
    kind: "astrologer_reply",
    body: "Ответ"
  };
}
