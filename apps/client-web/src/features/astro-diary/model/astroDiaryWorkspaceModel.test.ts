import type { AstroDiaryJournalSummaryResponse, AstroDiaryTimelinePage } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  collectAstroDiaryTimelineItems,
  isClientEntryActionable,
  resolveRelationshipJournalSelection
} from "./astroDiaryWorkspaceModel";

describe("client AstroDiary workspace model", () => {
  it("selects only journals whose server-owned astrologer matches the relationship route", () => {
    const otherAstrologer = {
      ...activeSummary,
      journal: {
        ...activeSummary.journal,
        id: "12222222-2222-4222-8222-222222222222",
        astrologerUserId: "52222222-2222-4222-8222-222222222222"
      }
    } satisfies AstroDiaryJournalSummaryResponse;

    expect(
      resolveRelationshipJournalSelection({
        astrologerId,
        requestedJournalId: otherAstrologer.journal.id,
        journals: [otherAstrologer, activeSummary]
      })
    ).toEqual({ journals: [activeSummary], selectedJournalId: activeSummary.journal.id });
    expect(
      resolveRelationshipJournalSelection({
        astrologerId: otherAstrologer.journal.astrologerUserId,
        requestedJournalId: undefined,
        journals: [activeSummary]
      })
    ).toEqual({ journals: [], selectedJournalId: undefined });
  });

  it("allows a new client entry only from active server allowance with no open cycle", () => {
    expect(isClientEntryActionable(activeSummary)).toBe(true);
    expect(
      isClientEntryActionable({
        ...activeSummary,
        access: {
          ...activeSummary.access,
          allowance: { ...activeSummary.access.allowance, available: 0, consumed: 2 }
        }
      })
    ).toBe(false);
    expect(isClientEntryActionable({ ...activeSummary, currentCycle: openCycle })).toBe(false);
    expect(isClientEntryActionable(readOnlySummary)).toBe(false);
  });

  it("flattens timeline pages without manufacturing a cursor", () => {
    const pages: AstroDiaryTimelinePage[] = [
      timelinePage(1, 1, 2),
      timelinePage(2, 2, 2)
    ];
    expect(collectAstroDiaryTimelineItems(pages).map(({ cursor }) => cursor)).toEqual([1, 2]);
  });
});

const astrologerId = "41111111-1111-4111-8111-111111111111";
const journalId = "11111111-1111-4111-8111-111111111111";

const activeSummary = {
  journal: {
    id: journalId,
    relationshipId: "21111111-1111-4111-8111-111111111111",
    journalEpochId: "31111111-1111-4111-8111-111111111111",
    astrologerUserId: astrologerId,
    clientUserId: "51111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: null,
  currentObligation: null,
  access: {
    mode: "active",
    subscriptionId: "61111111-1111-4111-8111-111111111111",
    subscriptionState: "active",
    currentPeriod: {
      id: "71111111-1111-4111-8111-111111111111",
      sequence: 1,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z"
    },
    allowance: {
      periodId: "71111111-1111-4111-8111-111111111111",
      total: 2,
      available: 1,
      reserved: 0,
      consumed: 1,
      released: 0
    }
  },
  unreadCount: 0,
  visibleMaxCursor: 0
} satisfies AstroDiaryJournalSummaryResponse;

const openCycle = {
  id: "81111111-1111-4111-8111-111111111111",
  journalId,
  openingPeriodId: "71111111-1111-4111-8111-111111111111",
  openingAllowanceReservationId: null,
  awaitingClientPromptItemId: null,
  clientResponseDueAt: null,
  clientResponseWindowCalendarDays: null,
  clientResponseTimezone: null,
  state: "awaiting_astrologer_response",
  version: 1,
  openedAt: "2026-08-18T10:00:00.000Z",
  closedAt: null,
  closeReason: null
} as const;

const readOnlySummary = {
  ...activeSummary,
  access: {
    mode: "read_only",
    subscriptionId: activeSummary.access.subscriptionId,
    subscriptionState: "ended",
    currentPeriod: null,
    allowance: null
  }
} satisfies AstroDiaryJournalSummaryResponse;

function timelinePage(cursor: number, nextCursor: number, visibleMaxCursor: number): AstroDiaryTimelinePage {
  return {
    items: [
      {
        id: `${cursor}2222222-2222-4222-8222-222222222222`,
        journalId,
        cycleId: openCycle.id,
        authorUserId: activeSummary.journal.clientUserId,
        revision: 1,
        occurredAt: "2026-08-18T10:00:00.000Z",
        cursor,
        kind: "client_entry",
        authorRole: "client",
        body: `Entry ${cursor}`,
        attachmentIds: [],
        editedAt: null,
        moodId: "calm",
        contextStatus: "pending",
        correctsItemId: null
      }
    ],
    nextCursor,
    visibleMaxCursor,
    hasMore: nextCursor < visibleMaxCursor
  };
}
