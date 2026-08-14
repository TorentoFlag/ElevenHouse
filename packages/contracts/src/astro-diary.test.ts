import { describe, expect, it } from "vitest";
import {
  astroDiaryCommandSchema,
  astroDiaryContextSnapshotSchema,
  astroDiaryCycleSchema,
  astroDiaryDraftSchema,
  astroDiaryEventSchema,
  astroDiaryJournalSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryMoodIdSchema,
  astroDiaryRealtimeEventSchema,
  astroDiaryResponseObligationSchema,
  astroDiaryTimelineItemSchema
} from "./astro-diary";

const id = (value: number): string =>
  `20000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

describe("AstroDiary contracts", () => {
  it("models one relationship-bound journal epoch without subscription ownership", () => {
    const journal = {
      id: id(1),
      relationshipId: id(2),
      journalEpochId: id(3),
      astrologerUserId: id(4),
      clientUserId: id(5),
      state: "active",
      version: 1,
      createdAt: "2026-08-12T09:00:00Z"
    } as const;
    expect(astroDiaryJournalSchema.parse(journal)).toEqual(journal);
    expect(astroDiaryJournalSchema.safeParse({ ...journal, subscriptionId: id(6) }).success).toBe(
      false
    );
  });

  it("returns an exact list envelope for astrologer journal summaries", () => {
    const summary = journalSummary();

    expect(
      astroDiaryJournalListResponseSchema.parse({
        journals: [summary],
        total: 1
      })
    ).toEqual({
      journals: [summary],
      total: 1
    });
    expect(
      astroDiaryJournalListResponseSchema.safeParse({
        journals: [summary],
        total: 1,
        actorUserId: id(4)
      }).success
    ).toBe(false);
  });

  it("keeps open and closed cycle shapes disjoint", () => {
    const open = {
      id: id(10),
      journalId: id(1),
      openingPeriodId: id(11),
      openingAllowanceReservationId: null,
      awaitingClientPromptItemId: null,
      clientResponseDueAt: null,
      clientResponseWindowCalendarDays: null,
      clientResponseTimezone: null,
      state: "awaiting_astrologer_response",
      version: 1,
      openedAt: "2026-08-12T09:00:00Z",
      closedAt: null,
      closeReason: null
    } as const;
    expect(astroDiaryCycleSchema.parse(open)).toEqual(open);
    expect(
      astroDiaryCycleSchema.safeParse({ ...open, state: "closed", closeReason: null }).success
    ).toBe(false);
    expect(
      astroDiaryCycleSchema.safeParse({
        ...open,
        state: "awaiting_client_entry",
        openingAllowanceReservationId: id(12)
      }).success
    ).toBe(false);

    expect(
      astroDiaryCycleSchema.safeParse({
        ...open,
        state: "awaiting_client_entry",
        openingAllowanceReservationId: id(12),
        awaitingClientPromptItemId: id(13),
        clientResponseDueAt: "2026-08-17T09:00:00Z",
        clientResponseWindowCalendarDays: 5,
        clientResponseTimezone: "Europe/Moscow"
      }).success
    ).toBe(true);

    expect(
      astroDiaryCycleSchema.safeParse({
        ...open,
        state: "closed",
        closedAt: "2026-08-13T09:00:00Z",
        closeReason: "completed"
      }).success
    ).toBe(true);
  });

  it("accepts client-visible content and body-free tombstones only", () => {
    const entry = {
      id: id(20),
      journalId: id(1),
      cycleId: id(10),
      kind: "client_entry",
      authorRole: "client",
      authorUserId: id(5),
      revision: 1,
      body: "Сегодня удалось остановиться и заметить своё состояние.",
      moodId: "calm",
      attachmentIds: [id(21)],
      contextStatus: "pending",
      correctsItemId: null,
      editedAt: null,
      occurredAt: "2026-08-12T09:00:00Z",
      cursor: 1
    } as const;
    expect(astroDiaryTimelineItemSchema.parse(entry)).toEqual(entry);
    expect(
      astroDiaryTimelineItemSchema.safeParse({ ...entry, authorRole: "astrologer" }).success
    ).toBe(false);

    const tombstone = {
      id: id(22),
      journalId: id(1),
      cycleId: id(10),
      kind: "tombstone",
      originalKind: "client_entry",
      authorRole: "client",
      authorUserId: id(5),
      revision: 2,
      reason: "hidden_by_author",
      occurredAt: "2026-08-12T10:00:00Z",
      cursor: 2
    } as const;
    expect(astroDiaryTimelineItemSchema.parse(tombstone)).toEqual(tombstone);
    expect(
      astroDiaryTimelineItemSchema.safeParse({ ...tombstone, body: "redacted body" }).success
    ).toBe(false);
  });

  it("keeps mutable drafts author-owned and CAS-versioned", () => {
    const draft = {
      id: id(30),
      journalId: id(1),
      cycleId: id(10),
      kind: "reflection_prompt",
      authorRole: "astrologer",
      authorUserId: id(4),
      version: 3,
      body: "Что в этом событии оказалось для вас самым неожиданным?",
      attachmentIds: [],
      moodId: null,
      correctsItemId: null,
      updatedAt: "2026-08-12T09:00:00Z"
    } as const;
    expect(astroDiaryDraftSchema.parse(draft)).toEqual(draft);
    expect(astroDiaryDraftSchema.safeParse({ ...draft, authorRole: "client" }).success).toBe(false);
  });

  it("models durable SLA evidence and response obligation state", () => {
    const obligation = {
      id: id(40),
      journalId: id(1),
      cycleId: id(10),
      triggerItemId: id(20),
      state: "open",
      version: 1,
      openedAt: "2026-08-12T09:00:00Z",
      dueAt: "2026-08-14T09:00:00Z",
      responseSlaWorkingDays: 2,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow",
      resolvedDueLocal: "2026-08-14T12:00:00",
      resolvedDueOffset: "+03:00",
      satisfiedByItemId: null,
      closedAt: null
    } as const;
    expect(astroDiaryResponseObligationSchema.parse(obligation)).toEqual(obligation);
    expect(
      astroDiaryResponseObligationSchema.safeParse({
        ...obligation,
        resolvedDueOffset: "+02:00"
      }).success
    ).toBe(false);
    expect(
      astroDiaryResponseObligationSchema.safeParse({
        ...obligation,
        serviceTimezone: "America/New_York"
      }).success
    ).toBe(false);
    expect(
      astroDiaryResponseObligationSchema.safeParse({
        ...obligation,
        state: "satisfied",
        satisfiedByItemId: null
      }).success
    ).toBe(false);
  });

  it("keeps mood identifiers closed and CAS/idempotency command fields strict", () => {
    for (const mood of ["inspired", "joy", "calm", "tired", "anxious", "sad"] as const) {
      expect(astroDiaryMoodIdSchema.parse(mood)).toBe(mood);
    }
    expect(astroDiaryMoodIdSchema.safeParse("streak").success).toBe(false);
    expect(
      astroDiaryCommandSchema.parse({ expectedVersion: 2, idempotencyKey: "publish-entry-1" })
    ).toEqual({ expectedVersion: 2, idempotencyKey: "publish-entry-1" });
    expect(
      astroDiaryCommandSchema.safeParse({
        expectedVersion: 2,
        idempotencyKey: "publish-entry-1",
        locale: "ru"
      }).success
    ).toBe(false);
  });

  it("accepts only versioned IDs-only Diary events", () => {
    const event = {
      eventId: id(50),
      eventType: "astro_diary.timeline_item_published.v1",
      schemaVersion: 1,
      occurredAt: "2026-08-12T09:00:00Z",
      data: {
        journalId: id(1),
        journalEpochId: id(3),
        cycleId: id(10),
        itemId: id(20)
      }
    } as const;
    expect(astroDiaryEventSchema.parse(event)).toEqual(event);
    expect(
      astroDiaryEventSchema.safeParse({
        ...event,
        data: { ...event.data, body: "must not enter outbox" }
      }).success
    ).toBe(false);
    expect(
      astroDiaryEventSchema.safeParse({
        ...event,
        eventType: "astro_diary.client_entry_published",
        schemaVersion: 0
      }).success
    ).toBe(false);
  });

  it("models visible state changes as canonical events, never as requested-event success", () => {
    const base = {
      eventId: id(51),
      schemaVersion: 1 as const,
      occurredAt: "2026-08-12T09:00:00Z",
      data: { journalId: id(1), journalEpochId: id(3) }
    };
    const events = [
      {
        ...base,
        eventType: "astro_diary.timeline_item_edited.v1",
        data: { ...base.data, cycleId: id(10), itemId: id(20) }
      },
      {
        ...base,
        eventType: "astro_diary.timeline_item_hidden.v1",
        data: { ...base.data, cycleId: id(10), itemId: id(20) }
      },
      {
        ...base,
        eventType: "astro_diary.timeline_item_erased.v1",
        data: { ...base.data, cycleId: id(10), itemId: id(20) }
      },
      {
        ...base,
        eventType: "astro_diary.context_completed.v1",
        data: { ...base.data, cycleId: id(10), itemId: id(20), contextId: id(21) }
      },
      {
        ...base,
        eventType: "astro_diary.context_failed.v1",
        data: { ...base.data, cycleId: id(10), itemId: id(20), contextId: id(21) }
      },
      {
        ...base,
        eventType: "astro_diary.ai_updated.v1",
        data: { ...base.data, cycleId: id(10), commandId: id(24) }
      },
      {
        ...base,
        eventType: "astro_diary.export_ready.v1",
        data: { ...base.data, commandId: id(22) }
      },
      {
        ...base,
        eventType: "astro_diary.export_failed.v1",
        data: { ...base.data, commandId: id(22) }
      },
      {
        ...base,
        eventType: "astro_diary.export_invalidated.v1",
        data: { ...base.data, commandId: id(22) }
      },
      {
        ...base,
        eventType: "astro_diary.erasure_completed.v1",
        data: { ...base.data, commandId: id(23) }
      },
      { ...base, eventType: "astro_diary.journal_activated.v1" }
    ] as const;
    for (const event of events) expect(astroDiaryEventSchema.parse(event)).toEqual(event);
    expect(
      astroDiaryEventSchema.safeParse({
        ...events[3],
        data: { ...events[3].data, commandId: id(99) }
      }).success
    ).toBe(false);
    expect(
      astroDiaryEventSchema.safeParse({
        ...events[6],
        data: { ...events[6].data, itemId: id(99) }
      }).success
    ).toBe(false);

    expect(
      astroDiaryRealtimeEventSchema.safeParse({
        eventId: "24",
        type: "ai.updated",
        occurredAt: base.occurredAt,
        data: { journalId: id(1), cycleId: id(10), commandId: id(24) }
      }).success
    ).toBe(true);
  });

  it("keeps astrology context source-bound and makes personal evidence exact", () => {
    const pending = {
      id: id(60),
      journalId: id(1),
      itemId: id(20),
      sourceItemRevision: 1,
      sourceItemDigest: `sha256:${"a".repeat(64)}`,
      eventAt: "2026-08-12T09:00:00Z",
      eventTimezone: "Europe/Moscow",
      status: "pending",
      version: 1,
      engineRevision: null,
      globalContextRef: null,
      birthProfileId: null,
      birthProfileRevision: null,
      personalChartRef: null,
      contextDigest: null,
      failureCode: null,
      calculatedAt: null
    } as const;
    expect(astroDiaryContextSnapshotSchema.parse(pending)).toEqual(pending);

    const personal = {
      ...pending,
      status: "personal",
      version: 2,
      engineRevision: "chart-engine@2026-08-12",
      globalContextRef: id(61),
      birthProfileId: id(62),
      birthProfileRevision: 3,
      personalChartRef: id(63),
      contextDigest: `sha256:${"b".repeat(64)}`,
      calculatedAt: "2026-08-12T09:00:10Z"
    } as const;
    expect(astroDiaryContextSnapshotSchema.parse(personal)).toEqual(personal);
    expect(
      astroDiaryContextSnapshotSchema.safeParse({ ...personal, birthProfileRevision: null }).success
    ).toBe(false);
    expect(
      astroDiaryContextSnapshotSchema.safeParse({ ...pending, status: "global_only" }).success
    ).toBe(false);
  });
});

function journalSummary() {
  return {
    journal: {
      id: id(1),
      relationshipId: id(2),
      journalEpochId: id(3),
      astrologerUserId: id(4),
      clientUserId: id(5),
      state: "active",
      version: 1,
      createdAt: "2026-08-12T09:00:00Z"
    },
    currentCycle: null,
    currentObligation: null,
    access: {
      mode: "active",
      subscriptionId: id(6),
      subscriptionState: "active",
      currentPeriod: {
        id: id(7),
        sequence: 1,
        startsAt: "2026-08-12T09:00:00Z",
        endsAt: "2026-09-12T09:00:00Z"
      },
      allowance: {
        periodId: id(7),
        total: 3,
        available: 3,
        reserved: 0,
        consumed: 0,
        released: 0
      }
    },
    unreadCount: 0,
    visibleMaxCursor: 0
  } as const;
}
