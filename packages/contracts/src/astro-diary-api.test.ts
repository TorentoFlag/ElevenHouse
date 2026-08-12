import { describe, expect, it } from "vitest";
import {
  astroDiaryAtomicReplyRequestSchema,
  astroDiaryAstrologerDraftCreateRequestSchema,
  astroDiaryAstrologerDraftUpdateRequestSchema,
  astroDiaryClientDraftCreateRequestSchema,
  astroDiaryClientDraftUpdateRequestSchema,
  astroDiaryCommandResponseSchema,
  astroDiaryContextResponseSchema,
  astroDiaryDraftDeleteRequestSchema,
  astroDiaryDraftMutationResponseSchema,
  astroDiaryExportDownloadResponseSchema,
  astroDiaryExportRequestSchema,
  astroDiaryExportResponseSchema,
  astroDiaryJournalSummaryResponseSchema,
  astroDiaryItemEditRequestSchema,
  astroDiaryItemMutationRequestSchema,
  astroDiaryItemErasureRequestSchema,
  astroDiaryJournalErasureRequestSchema,
  astroDiaryMarkReadRequestSchema,
  astroDiaryMoodTrendResponseSchema,
  astroDiaryMoodTrendQuerySchema,
  astroDiaryRealtimeEventSchema,
  astroDiaryPublishDraftRequestSchema,
  astroDiaryPromptDecisionRequestSchema,
  astroDiaryTimelinePageSchema,
  astroDiaryTimelineQuerySchema,
  astroDiaryLastEventIdSchema
} from "./astro-diary";

const id = (value: number): string =>
  `21000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const journal = {
  id: id(1),
  relationshipId: id(2),
  journalEpochId: id(3),
  astrologerUserId: id(4),
  clientUserId: id(5),
  state: "active",
  version: 7,
  createdAt: "2026-08-12T09:00:00Z"
} as const;

const item = {
  id: id(10),
  journalId: id(1),
  cycleId: id(11),
  kind: "client_entry",
  authorRole: "client",
  authorUserId: id(5),
  revision: 1,
  body: "Сегодня получилось услышать себя чуть яснее.",
  moodId: "calm",
  attachmentIds: [id(12)],
  contextStatus: "pending",
  correctsItemId: null,
  editedAt: null,
  occurredAt: "2026-08-12T09:00:00Z",
  cursor: 4
} as const;

describe("AstroDiary API contracts", () => {
  it("keeps summary access server-derived and body-free outside the timeline", () => {
    const response = {
      journal,
      currentCycle: null,
      currentObligation: null,
      access: {
        mode: "active",
        subscriptionId: id(20),
        subscriptionState: "active",
        currentPeriod: {
          id: id(21),
          sequence: 1,
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-09-01T00:00:00Z"
        },
        allowance: {
          periodId: id(21),
          total: 4,
          available: 2,
          reserved: 0,
          consumed: 2,
          released: 0
        }
      },
      unreadCount: 3,
      visibleMaxCursor: 8
    } as const;
    expect(astroDiaryJournalSummaryResponseSchema.parse(response)).toEqual(response);
    expect(
      astroDiaryJournalSummaryResponseSchema.safeParse({
        ...response,
        access: { ...response.access, clientId: id(5) }
      }).success
    ).toBe(false);
  });

  it("parses bounded cursor transport and a strictly ordered timeline page", () => {
    expect(astroDiaryTimelineQuerySchema.parse({ afterCursor: "3", limit: "50" })).toEqual({
      afterCursor: 3,
      limit: 50
    });
    expect(astroDiaryTimelineQuerySchema.parse({})).toEqual({ afterCursor: 0, limit: 50 });
    expect(
      astroDiaryTimelinePageSchema.parse({
        items: [item, { ...item, id: id(13), cursor: 5 }],
        nextCursor: 5,
        visibleMaxCursor: 8,
        hasMore: true
      }).items
    ).toHaveLength(2);
    expect(
      astroDiaryTimelinePageSchema.safeParse({
        items: [
          { ...item, cursor: 5 },
          { ...item, id: id(13), cursor: 4 }
        ],
        nextCursor: 4,
        visibleMaxCursor: 8,
        hasMore: true
      }).success
    ).toBe(false);
    expect(
      astroDiaryTimelinePageSchema.safeParse({
        items: [item],
        nextCursor: 4,
        visibleMaxCursor: 8,
        hasMore: false
      }).success
    ).toBe(false);
    expect(
      astroDiaryTimelinePageSchema.parse({
        items: [],
        nextCursor: null,
        visibleMaxCursor: 0,
        hasMore: false
      })
    ).toMatchObject({ hasMore: false });
    expect(astroDiaryTimelineQuerySchema.safeParse({ afterCursor: " " }).success).toBe(false);
  });

  it("splits server-identified draft creation from explicit CAS updates", () => {
    const createDraft = {
      expectedJournalVersion: 7,
      kind: "client_entry",
      cycleId: null,
      correctsItemId: null,
      body: "Я заметила, что стала мягче реагировать на неопределённость.",
      attachmentIds: [id(12)],
      moodId: "calm"
    } as const;
    expect(astroDiaryClientDraftCreateRequestSchema.parse(createDraft)).toEqual(createDraft);
    expect(astroDiaryAstrologerDraftCreateRequestSchema.safeParse(createDraft).success).toBe(false);
    for (const forbidden of [
      "draftId",
      "expectedVersion",
      "clientUserId",
      "allowance",
      "dueAt",
      "cursor",
      "eventIds"
    ] as const) {
      expect(
        astroDiaryClientDraftCreateRequestSchema.safeParse({
          ...createDraft,
          [forbidden]: "spoofed"
        }).success
      ).toBe(false);
    }
    expect(
      astroDiaryClientDraftCreateRequestSchema.safeParse({
        ...createDraft,
        kind: "reflection_prompt",
        moodId: "calm"
      }).success
    ).toBe(false);

    const updateDraft = {
      expectedJournalVersion: 7,
      draftId: id(31),
      expectedDraftVersion: 2,
      body: "Уточнённый вариант",
      attachmentIds: [id(12)],
      moodId: "calm"
    } as const;
    expect(astroDiaryClientDraftUpdateRequestSchema.parse(updateDraft)).toEqual(updateDraft);
    expect(astroDiaryAstrologerDraftUpdateRequestSchema.safeParse(updateDraft).success).toBe(false);
    expect(
      astroDiaryClientDraftUpdateRequestSchema.safeParse({
        ...updateDraft,
        kind: "client_entry"
      }).success
    ).toBe(false);
  });

  it("returns the stable server-owned draft identity on create and replay", () => {
    const applied = { outcome: "applied", draftId: id(31), version: 1 } as const;
    const replayed = { ...applied, outcome: "replayed" as const };
    expect(astroDiaryDraftMutationResponseSchema.parse(applied)).toEqual(applied);
    expect(astroDiaryDraftMutationResponseSchema.parse(replayed)).toEqual(replayed);
    expect(
      astroDiaryDraftMutationResponseSchema.safeParse({
        ...applied,
        body: "must never be stored in the receipt"
      }).success
    ).toBe(false);
  });

  it("keeps generated command identities and server facts out of mutation requests", () => {
    const publish = {
      expectedJournalVersion: 7,
      draftId: id(31),
      expectedDraftVersion: 2
    } as const;
    expect(astroDiaryPublishDraftRequestSchema.parse(publish)).toEqual(publish);
    expect(
      astroDiaryPublishDraftRequestSchema.safeParse({ ...publish, cycleId: id(11) }).success
    ).toBe(false);
    expect(
      astroDiaryPublishDraftRequestSchema.safeParse({ ...publish, allowancePeriodId: id(21) })
        .success
    ).toBe(false);

    const promptDecision = {
      expectedJournalVersion: 7,
      cycleId: id(11),
      expectedCycleVersion: 3,
      promptItemId: id(32),
      expectedPromptRevision: 1
    } as const;
    expect(astroDiaryPromptDecisionRequestSchema.parse(promptDecision)).toEqual(promptDecision);
    expect(
      astroDiaryPromptDecisionRequestSchema.safeParse({
        ...promptDecision,
        reason: "client_response_expired",
        occurredAt: "2026-08-12T09:00:00Z"
      }).success
    ).toBe(false);

    const edit = {
      expectedJournalVersion: 7,
      expectedItemRevision: 1,
      body: "Уточняю свою мысль без изменения авторства.",
      attachmentIds: []
    } as const;
    expect(astroDiaryItemEditRequestSchema.parse(edit)).toEqual(edit);
    expect(
      astroDiaryItemEditRequestSchema.safeParse({ ...edit, dependentItemIds: [id(33)] }).success
    ).toBe(false);
    expect(
      astroDiaryItemMutationRequestSchema.parse({
        expectedJournalVersion: 7,
        expectedItemRevision: 1
      })
    ).toEqual({ expectedJournalVersion: 7, expectedItemRevision: 1 });
    expect(
      astroDiaryDraftDeleteRequestSchema.parse({
        expectedJournalVersion: 7,
        expectedDraftVersion: 2
      })
    ).toEqual({ expectedJournalVersion: 7, expectedDraftVersion: 2 });
    expect(
      astroDiaryItemErasureRequestSchema.parse({
        expectedJournalVersion: 7,
        expectedItemRevision: 1,
        confirmation: "erase_item"
      })
    ).toMatchObject({ confirmation: "erase_item" });
    expect(
      astroDiaryJournalErasureRequestSchema.parse({
        expectedJournalVersion: 7,
        confirmation: "erase_entire_journal"
      })
    ).toMatchObject({ confirmation: "erase_entire_journal" });
  });

  it("models one atomic astrologer close or reply-with-follow-up command", () => {
    const close = {
      mode: "close",
      expectedJournalVersion: 7,
      cycleId: id(11),
      expectedCycleVersion: 3,
      obligationId: id(30),
      expectedObligationVersion: 1,
      replyDraftId: id(31),
      expectedReplyDraftVersion: 2
    } as const;
    expect(astroDiaryAtomicReplyRequestSchema.parse(close)).toEqual(close);
    expect(
      astroDiaryAtomicReplyRequestSchema.safeParse({
        ...close,
        mode: "follow_up",
        promptDraftId: id(32),
        expectedPromptDraftVersion: 1
      }).success
    ).toBe(true);
    expect(
      astroDiaryAtomicReplyRequestSchema.safeParse({ ...close, generatedReplyItemId: id(33) })
        .success
    ).toBe(false);
  });

  it("keeps mood/context projections descriptive and source-bound", () => {
    const trend = {
      enoughData: true,
      sampleSize: 4,
      distribution: {
        inspired: 1,
        joy: 0,
        calm: 2,
        tired: 1,
        anxious: 0,
        sad: 0
      },
      scoreChange: 1
    } as const;
    expect(astroDiaryMoodTrendResponseSchema.parse(trend)).toEqual(trend);
    expect(
      astroDiaryMoodTrendResponseSchema.safeParse({ ...trend, diagnosis: "improving" }).success
    ).toBe(false);
    expect(astroDiaryContextResponseSchema.parse({ context: null })).toEqual({ context: null });
    expect(
      astroDiaryContextResponseSchema.parse({
        context: {
          id: id(60),
          journalId: id(1),
          itemId: id(10),
          sourceItemRevision: 1,
          sourceItemDigest: `sha256:${"a".repeat(64)}`,
          eventAt: "2026-08-12T09:00:00Z",
          eventTimezone: "Europe/Moscow",
          status: "global_only",
          version: 2,
          engineRevision: "chart-engine@2026-08-12",
          globalContextRef: id(61),
          birthProfileId: null,
          birthProfileRevision: null,
          personalChartRef: null,
          contextDigest: `sha256:${"b".repeat(64)}`,
          failureCode: null,
          calculatedAt: "2026-08-12T09:00:10Z"
        },
        display: {
          sourceContextDigest: `sha256:${"b".repeat(64)}`,
          lunar: {
            phaseId: "waxing_gibbous",
            moonSign: "taurus"
          },
          relevantTransits: [
            {
              transitPoint: "jupiter",
              natalPoint: null,
              aspect: "trine",
              sign: "cancer",
              applying: true
            }
          ],
          personal: null
        }
      }).display
    ).toMatchObject({ lunar: { phaseId: "waxing_gibbous", moonSign: "taurus" } });
    expect(
      astroDiaryMoodTrendQuerySchema.parse({
        scope: "period",
        periodId: id(21)
      })
    ).toMatchObject({ periodId: id(21) });
    expect(
      astroDiaryMoodTrendQuerySchema.parse({
        scope: "range",
        from: "2026-08-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z"
      })
    ).toMatchObject({ scope: "range" });
  });

  it("uses IDs-only durable realtime events and server-current read cursors", () => {
    const event = {
      eventId: "42",
      type: "timeline.item.updated",
      occurredAt: "2026-08-12T09:00:00Z",
      data: { journalId: id(1), cycleId: id(11), itemId: id(10) }
    } as const;
    expect(astroDiaryRealtimeEventSchema.parse(event)).toEqual(event);
    expect(
      astroDiaryRealtimeEventSchema.safeParse({
        ...event,
        data: { ...event.data, body: item.body }
      }).success
    ).toBe(false);
    expect(
      astroDiaryRealtimeEventSchema.safeParse({
        ...event,
        type: "timeline.item.published",
        data: { journalId: id(1) }
      }).success
    ).toBe(false);
    expect(
      astroDiaryRealtimeEventSchema.safeParse({
        ...event,
        type: "journal.updated",
        data: { journalId: id(1), itemId: id(10) }
      }).success
    ).toBe(false);
    expect(astroDiaryLastEventIdSchema.parse("9223372036854775807")).toBe("9223372036854775807");
    expect(astroDiaryLastEventIdSchema.safeParse("9223372036854775808").success).toBe(false);
    expect(
      astroDiaryMarkReadRequestSchema.parse({
        expectedJournalVersion: 7,
        expectedCursorVersion: null
      })
    ).toEqual({
      expectedJournalVersion: 7,
      expectedCursorVersion: null
    });
    expect(
      astroDiaryMarkReadRequestSchema.safeParse({
        expectedJournalVersion: 7,
        expectedCursorVersion: null,
        lastReadCursor: 999
      }).success
    ).toBe(false);
  });

  it("models PDF-only export without accepting a JSON format", () => {
    expect(
      astroDiaryExportRequestSchema.parse({ expectedJournalVersion: 7, locale: "ru" })
    ).toEqual({ expectedJournalVersion: 7, locale: "ru" });
    expect(
      astroDiaryExportRequestSchema.safeParse({
        expectedJournalVersion: 7,
        locale: "ru",
        format: "json"
      }).success
    ).toBe(false);

    const command = {
      id: id(40),
      journalId: id(1),
      sourceJournalVersion: 7,
      sourceDigest: `sha256:${"a".repeat(64)}`,
      locale: "ru",
      status: "ready",
      artifactMediaId: id(41),
      failureCode: null,
      createdAt: "2026-08-12T09:00:00Z",
      updatedAt: "2026-08-12T09:00:10Z"
    } as const;
    expect(astroDiaryExportResponseSchema.parse({ command })).toEqual({ command });
    expect(
      astroDiaryExportDownloadResponseSchema.parse({
        url: "https://storage.example.test/private/export.pdf?signature=opaque",
        expiresAt: "2026-08-12T09:05:00Z"
      }).url
    ).toContain("export.pdf");
  });

  it("returns a stable body-free command outcome", () => {
    const response = { outcome: "applied", eventIds: [id(50), id(51)] } as const;
    expect(astroDiaryCommandResponseSchema.parse(response)).toEqual(response);
    expect(
      astroDiaryCommandResponseSchema.safeParse({ ...response, body: item.body }).success
    ).toBe(false);
    expect(
      astroDiaryCommandResponseSchema.safeParse({
        outcome: "applied",
        eventIds: [id(50), id(50)]
      }).success
    ).toBe(false);
    expect(
      astroDiaryCommandResponseSchema.parse({ outcome: "replayed", eventIds: [id(50)] })
    ).toEqual({ outcome: "replayed", eventIds: [id(50)] });
  });
});
