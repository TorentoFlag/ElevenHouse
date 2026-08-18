import type {
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelinePage
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  collectAstroDiaryTimelineItems,
  isAstroDiaryReplyActionable,
  resolveAstroDiarySelection
} from "./astroDiaryWorkspaceModel";

describe("astroDiaryWorkspaceModel", () => {
  it("selects the first server journal and preserves an existing selection", () => {
    const journals = [activeSummary, secondSummary];

    expect(resolveAstroDiarySelection(undefined, journals)).toBe(activeSummary.journal.id);
    expect(resolveAstroDiarySelection(secondSummary.journal.id, journals)).toBe(
      secondSummary.journal.id
    );
    expect(resolveAstroDiarySelection("99999999-9999-4999-8999-999999999999", journals)).toBe(
      activeSummary.journal.id
    );
    expect(resolveAstroDiarySelection(undefined, [])).toBeUndefined();
  });

  it("uses only server cursors when collecting paged timeline items", () => {
    const firstPage = timelinePage({ cursor: 1, nextCursor: 1, visibleMaxCursor: 2 });
    const secondPage = timelinePage({ cursor: 2, nextCursor: 2, visibleMaxCursor: 2 });

    expect(collectAstroDiaryTimelineItems([firstPage, secondPage]).map(({ cursor }) => cursor)).toEqual([
      1,
      2
    ]);
  });

  it("opens replies only for an active journal with an actionable server obligation", () => {
    expect(isAstroDiaryReplyActionable(activeSummary)).toBe(true);
    expect(
      isAstroDiaryReplyActionable({
        ...activeSummary,
        access: {
          mode: "read_only",
          subscriptionId: activeSummary.access.subscriptionId,
          subscriptionState: "ended",
          currentPeriod: null,
          allowance: null
        }
      })
    ).toBe(false);
    expect(isAstroDiaryReplyActionable({ ...activeSummary, currentObligation: null })).toBe(false);
  });
});

const activeSummary = {
  journal: {
    id: "11111111-1111-4111-8111-111111111111",
    relationshipId: "21111111-1111-4111-8111-111111111111",
    journalEpochId: "31111111-1111-4111-8111-111111111111",
    astrologerUserId: "41111111-1111-4111-8111-111111111111",
    clientUserId: "51111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: {
    id: "61111111-1111-4111-8111-111111111111",
    journalId: "11111111-1111-4111-8111-111111111111",
    openingPeriodId: "71111111-1111-4111-8111-111111111111",
    openingAllowanceReservationId: null,
    awaitingClientPromptItemId: null,
    clientResponseDueAt: null,
    clientResponseWindowCalendarDays: null,
    clientResponseTimezone: null,
    state: "awaiting_astrologer_response",
    version: 2,
    openedAt: "2026-08-18T10:00:00.000Z",
    closedAt: null,
    closeReason: null
  },
  currentObligation: {
    id: "81111111-1111-4111-8111-111111111111",
    journalId: "11111111-1111-4111-8111-111111111111",
    cycleId: "61111111-1111-4111-8111-111111111111",
    triggerItemId: "91111111-1111-4111-8111-111111111111",
    state: "open",
    version: 1,
    openedAt: "2026-08-18T10:00:00.000Z",
    dueAt: "2026-08-20T10:00:00.000Z",
    responseSlaWorkingDays: 2,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow",
    resolvedDueLocal: "2026-08-20T13:00:00",
    resolvedDueOffset: "+03:00",
    satisfiedByItemId: null,
    closedAt: null
  },
  access: {
    mode: "active",
    subscriptionId: "a1111111-1111-4111-8111-111111111111",
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
  unreadCount: 1,
  visibleMaxCursor: 2
} satisfies AstroDiaryJournalSummaryResponse;

const secondSummary = {
  ...activeSummary,
  journal: {
    ...activeSummary.journal,
    id: "12222222-2222-4222-8222-222222222222",
    clientUserId: "52222222-2222-4222-8222-222222222222"
  },
  currentCycle: null,
  currentObligation: null,
  unreadCount: 0,
  visibleMaxCursor: 0
} satisfies AstroDiaryJournalSummaryResponse;

function timelinePage(input: {
  cursor: number;
  nextCursor: number;
  visibleMaxCursor: number;
}): AstroDiaryTimelinePage {
  return {
    items: [
      {
        id: `${input.cursor}2222222-2222-4222-8222-222222222222`,
        journalId: activeSummary.journal.id,
        cycleId: activeSummary.currentCycle.id,
        authorUserId: activeSummary.journal.clientUserId,
        revision: 1,
        occurredAt: "2026-08-18T10:00:00.000Z",
        cursor: input.cursor,
        kind: "client_entry",
        authorRole: "client",
        body: `Entry ${input.cursor}`,
        attachmentIds: [],
        editedAt: null,
        moodId: "calm",
        contextStatus: "pending",
        correctsItemId: null
      }
    ],
    nextCursor: input.nextCursor,
    visibleMaxCursor: input.visibleMaxCursor,
    hasMore: input.nextCursor < input.visibleMaxCursor
  };
}
