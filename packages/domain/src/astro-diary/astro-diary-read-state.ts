import { Temporal } from "@js-temporal/polyfill";

export type AstroDiaryReadCursor = Readonly<{
  journalId: string;
  participantUserId: string;
  lastReadCursor: number;
  version: number;
  updatedAt: string;
}>;

export type AdvanceAstroDiaryReadCursorOutcome =
  | Readonly<{ outcome: "applied"; cursor: AstroDiaryReadCursor }>
  | Readonly<{
      outcome: "idempotent" | "cursor_regression" | "cursor_ahead_of_visible_timeline";
    }>
  | Readonly<{ outcome: "version_conflict"; expectedVersion: number; currentVersion: number }>;

export function advanceAstroDiaryReadCursor(
  cursor: AstroDiaryReadCursor,
  input: {
    readonly expectedVersion: number;
    readonly nextReadCursor: number;
    readonly visibleMaxCursor: number;
    readonly updatedAt: string;
  }
): AdvanceAstroDiaryReadCursorOutcome {
  if (input.expectedVersion !== cursor.version) {
    return {
      outcome: "version_conflict",
      expectedVersion: input.expectedVersion,
      currentVersion: cursor.version
    };
  }
  if (!Number.isSafeInteger(input.nextReadCursor) || input.nextReadCursor < 0) {
    throw new TypeError("Read cursor must be a nonnegative safe integer");
  }
  if (input.nextReadCursor < cursor.lastReadCursor) return { outcome: "cursor_regression" };
  if (input.nextReadCursor > input.visibleMaxCursor) {
    return { outcome: "cursor_ahead_of_visible_timeline" };
  }
  if (input.nextReadCursor === cursor.lastReadCursor) return { outcome: "idempotent" };
  return {
    outcome: "applied",
    cursor: Object.freeze({
      ...cursor,
      lastReadCursor: input.nextReadCursor,
      version: cursor.version + 1,
      updatedAt: Temporal.Instant.from(input.updatedAt).toString()
    })
  };
}

export function unreadAstroDiaryItemCount(input: {
  readonly participantUserId: string;
  readonly lastReadCursor: number;
  readonly items: readonly Readonly<{ cursor: number; authorUserId: string }>[];
}): number {
  return input.items.filter(
    (item) => item.cursor > input.lastReadCursor && item.authorUserId !== input.participantUserId
  ).length;
}
