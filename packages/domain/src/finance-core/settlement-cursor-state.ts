import { Temporal } from "@js-temporal/polyfill";
import {
  exactSettlementRecord,
  fail,
  positiveSafeInteger,
  settlementInstant
} from "./settlement-codec";
import {
  advanceSettlementCursor,
  assertActiveSettlementLease,
  assertSettlementCursorVersion,
  readMaximumSettlementPageCount,
  readSettlementCursor,
  readSettlementPageCursor
} from "./settlement-cursor-codec";
import type {
  FinanceSettlementCursor,
  SettlementCursorPageFetchPlan
} from "./settlement-cursor-types";
import {
  createSettlementCursorKey,
  createSettlementPageCheckpointKey,
  serializeSettlementCursorKey
} from "./settlement-identity";

export function createSettlementCursor(input: unknown): FinanceSettlementCursor {
  const fields = exactSettlementRecord(input, [
    "key",
    "initialBackfillStart",
    "overlapSeconds",
    "databaseNow"
  ]);
  const key = createSettlementCursorKey(fields.key);
  const initial = settlementInstant(fields.initialBackfillStart);
  const updatedAt = settlementInstant(fields.databaseNow);
  const overlapSeconds = positiveSafeInteger(fields.overlapSeconds, Number.MAX_SAFE_INTEGER);
  subtractOverlap(initial, overlapSeconds);
  if (Temporal.Instant.compare(initial, updatedAt) > 0) fail();
  return readSettlementCursor({
    key,
    serializedKey: serializeSettlementCursorKey(key),
    initialBackfillStart: initial.toString(),
    overlapSeconds,
    highWaterMark: initial.toString(),
    activeWindow: null,
    lease: null,
    fencingToken: 0,
    windowGeneration: 0,
    version: 1,
    updatedAt: updatedAt.toString()
  });
}

export function beginSettlementCursorWindow(input: unknown): FinanceSettlementCursor {
  const fields = exactSettlementRecord(input, [
    "current",
    "expectedVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken",
    "windowEnd",
    "maxPageCount",
    "databaseNow"
  ]);
  const current = readSettlementCursor(fields.current);
  assertSettlementCursorVersion(current, fields.expectedVersion);
  const databaseNow = assertActiveSettlementLease(current, fields);
  if (current.activeWindow !== null) fail();
  const end = settlementInstant(fields.windowEnd);
  const highWater = settlementInstant(current.highWaterMark);
  if (
    Temporal.Instant.compare(end, highWater) <= 0 ||
    Temporal.Instant.compare(end, databaseNow) > 0
  ) {
    fail();
  }
  const initial = settlementInstant(current.initialBackfillStart);
  const start = maximumInstant(initial, subtractOverlap(highWater, current.overlapSeconds));
  if (!Number.isSafeInteger(current.windowGeneration + 1)) fail();
  const windowGeneration = current.windowGeneration + 1;
  return advanceSettlementCursor(current, databaseNow.toString(), {
    windowGeneration,
    activeWindow: Object.freeze({
      startAt: start.toString(),
      endAt: end.toString(),
      nextPageCursor: null,
      checkpointedPageCount: 0,
      maxPageCount: readMaximumSettlementPageCount(fields.maxPageCount)
    })
  });
}

export function planSettlementCursorPageFetch(input: unknown): SettlementCursorPageFetchPlan {
  const fields = exactSettlementRecord(input, [
    "current",
    "expectedVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken",
    "databaseNow"
  ]);
  const current = readSettlementCursor(fields.current);
  assertSettlementCursorVersion(current, fields.expectedVersion);
  assertActiveSettlementLease(current, fields);
  const window = current.activeWindow;
  if (window === null) fail();
  return Object.freeze({
    cursorKey: current.key,
    expectedCursorVersion: current.version,
    fencingToken: current.fencingToken,
    checkpointKey: createSettlementPageCheckpointKey({
      cursorKey: current.key,
      windowGeneration: current.windowGeneration,
      providerPageCursor: window.nextPageCursor
    }),
    windowStart: window.startAt,
    windowEnd: window.endAt,
    pageCursor: window.nextPageCursor
  });
}

export function checkpointSettlementCursorPage(input: unknown): FinanceSettlementCursor {
  const fields = exactSettlementRecord(input, [
    "current",
    "expectedVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken",
    "pageCursorUsed",
    "nextPageCursor",
    "databaseNow"
  ]);
  const current = readSettlementCursor(fields.current);
  assertSettlementCursorVersion(current, fields.expectedVersion);
  const databaseNow = assertActiveSettlementLease(current, fields);
  const window = current.activeWindow;
  const pageCursorUsed = readSettlementPageCursor(fields.pageCursorUsed);
  const nextPageCursor = readSettlementPageCursor(fields.nextPageCursor);
  if (window === null || pageCursorUsed !== window.nextPageCursor) fail();
  if (nextPageCursor !== null && nextPageCursor === pageCursorUsed) fail();
  const checkpointedPageCount = window.checkpointedPageCount + 1;
  if (!Number.isSafeInteger(checkpointedPageCount) || checkpointedPageCount > window.maxPageCount) {
    fail();
  }
  if (nextPageCursor !== null) {
    if (checkpointedPageCount >= window.maxPageCount) fail();
    return advanceSettlementCursor(current, databaseNow.toString(), {
      activeWindow: Object.freeze({ ...window, nextPageCursor, checkpointedPageCount })
    });
  }
  return advanceSettlementCursor(current, databaseNow.toString(), {
    highWaterMark: window.endAt,
    activeWindow: null
  });
}

function subtractOverlap(instant: Temporal.Instant, seconds: number): Temporal.Instant {
  try {
    return instant.subtract({ seconds });
  } catch {
    fail();
  }
}

function maximumInstant(left: Temporal.Instant, right: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(left, right) >= 0 ? left : right;
}
