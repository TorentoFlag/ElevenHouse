import { describe, expect, it } from "vitest";
import { advanceAstroDiaryReadCursor, unreadAstroDiaryItemCount } from "./astro-diary-read-state";

const cursor = {
  journalId: "50000000-0000-4000-8000-000000000001",
  participantUserId: "50000000-0000-4000-8000-000000000002",
  lastReadCursor: 3,
  version: 1,
  updatedAt: "2026-08-12T09:00:00Z"
} as const;

describe("AstroDiary read cursor", () => {
  it("advances monotonically under CAS", () => {
    expect(
      advanceAstroDiaryReadCursor(cursor, {
        expectedVersion: 1,
        nextReadCursor: 7,
        visibleMaxCursor: 7,
        updatedAt: "2026-08-12T10:00:00Z"
      })
    ).toEqual({
      outcome: "applied",
      cursor: { ...cursor, lastReadCursor: 7, version: 2, updatedAt: "2026-08-12T10:00:00Z" }
    });
    expect(
      advanceAstroDiaryReadCursor(cursor, {
        expectedVersion: 1,
        nextReadCursor: 2,
        visibleMaxCursor: 7,
        updatedAt: "2026-08-12T10:00:00Z"
      })
    ).toEqual({ outcome: "cursor_regression" });
    expect(
      advanceAstroDiaryReadCursor(cursor, {
        expectedVersion: 1,
        nextReadCursor: 8,
        visibleMaxCursor: 7,
        updatedAt: "2026-08-12T10:00:00Z"
      })
    ).toEqual({ outcome: "cursor_ahead_of_visible_timeline" });
  });

  it("does not use self-authored items or notification delivery as read authority", () => {
    expect(
      unreadAstroDiaryItemCount({
        participantUserId: cursor.participantUserId,
        lastReadCursor: cursor.lastReadCursor,
        items: [
          { cursor: 2, authorUserId: "50000000-0000-4000-8000-000000000003" },
          { cursor: 4, authorUserId: cursor.participantUserId },
          { cursor: 5, authorUserId: "50000000-0000-4000-8000-000000000003" }
        ]
      })
    ).toBe(1);
  });
});
