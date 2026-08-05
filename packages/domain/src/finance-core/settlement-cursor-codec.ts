import { Temporal } from "@js-temporal/polyfill";
import {
  assertSettlementExpectedVersion,
  exactSettlementRecord,
  fail,
  nonNegativeSafeInteger,
  positiveSafeInteger,
  settlementIdentifier,
  settlementInstant
} from "./settlement-codec";
import type {
  FinanceSettlementCursor,
  FinanceSettlementCursorLease,
  FinanceSettlementCursorWindow
} from "./settlement-cursor-types";
import { createSettlementCursorKey, serializeSettlementCursorKey } from "./settlement-identity";

const maximumPageCount = 10_000;

export function readSettlementCursor(input: unknown): FinanceSettlementCursor {
  const fields = exactSettlementRecord(input, [
    "key",
    "serializedKey",
    "initialBackfillStart",
    "overlapSeconds",
    "highWaterMark",
    "activeWindow",
    "lease",
    "fencingToken",
    "windowGeneration",
    "version",
    "updatedAt"
  ]);
  const key = createSettlementCursorKey(fields.key);
  const serializedKey = serializeSettlementCursorKey(key);
  if (fields.serializedKey !== serializedKey) fail();
  const initial = settlementInstant(fields.initialBackfillStart);
  const highWater = settlementInstant(fields.highWaterMark);
  const updatedAt = settlementInstant(fields.updatedAt);
  const overlapSeconds = positiveSafeInteger(fields.overlapSeconds, Number.MAX_SAFE_INTEGER);
  const version = positiveSafeInteger(fields.version, Number.MAX_SAFE_INTEGER);
  const fencingToken = nonNegativeSafeInteger(fields.fencingToken);
  const windowGeneration = nonNegativeSafeInteger(fields.windowGeneration);
  if (
    Temporal.Instant.compare(highWater, initial) < 0 ||
    Temporal.Instant.compare(initial, updatedAt) > 0 ||
    Temporal.Instant.compare(highWater, updatedAt) > 0
  ) {
    fail();
  }
  const activeWindow = readActiveWindow(
    fields.activeWindow,
    initial,
    highWater,
    updatedAt,
    overlapSeconds
  );
  if (activeWindow !== null && windowGeneration < 1) fail();
  const lease = readLease(fields.lease, fencingToken, updatedAt);
  return Object.freeze({
    key,
    serializedKey,
    initialBackfillStart: initial.toString(),
    overlapSeconds,
    highWaterMark: highWater.toString(),
    activeWindow,
    lease,
    fencingToken,
    windowGeneration,
    version,
    updatedAt: updatedAt.toString()
  });
}

export function advanceSettlementCursor(
  input: FinanceSettlementCursor,
  databaseNowInput: unknown,
  patch: Partial<
    Pick<
      FinanceSettlementCursor,
      "highWaterMark" | "activeWindow" | "lease" | "fencingToken" | "windowGeneration"
    >
  >
): FinanceSettlementCursor {
  const current = readSettlementCursor(input);
  const databaseNow = assertSettlementDatabaseTransition(current, databaseNowInput);
  if (!Number.isSafeInteger(current.version + 1)) fail();
  return readSettlementCursor({
    ...current,
    ...patch,
    version: current.version + 1,
    updatedAt: databaseNow.toString()
  });
}

export function assertSettlementCursorVersion(
  current: FinanceSettlementCursor,
  expectedVersion: unknown
): void {
  assertSettlementExpectedVersion(current.version, expectedVersion);
}

export function assertSettlementDatabaseTransition(
  current: FinanceSettlementCursor,
  value: unknown
): Temporal.Instant {
  const databaseNow = settlementInstant(value);
  if (Temporal.Instant.compare(databaseNow, settlementInstant(current.updatedAt)) < 0) fail();
  return databaseNow;
}

export function assertSettlementLeaseCredentialMatches(
  current: FinanceSettlementCursor,
  input: {
    readonly leaseOwnerId: unknown;
    readonly leaseToken: unknown;
    readonly fencingToken: unknown;
  }
): FinanceSettlementCursorLease {
  const ownerId = settlementIdentifier(input.leaseOwnerId);
  const token = settlementIdentifier(input.leaseToken, 500);
  const fencingToken = positiveSafeInteger(input.fencingToken, Number.MAX_SAFE_INTEGER);
  const lease = current.lease;
  if (
    lease === null ||
    lease.ownerId !== ownerId ||
    lease.token !== token ||
    lease.fencingToken !== fencingToken ||
    current.fencingToken !== fencingToken
  ) {
    fail();
  }
  return lease;
}

export function assertActiveSettlementLease(
  current: FinanceSettlementCursor,
  input: {
    readonly leaseOwnerId: unknown;
    readonly leaseToken: unknown;
    readonly fencingToken: unknown;
    readonly databaseNow: unknown;
  }
): Temporal.Instant {
  const databaseNow = assertSettlementDatabaseTransition(current, input.databaseNow);
  const lease = assertSettlementLeaseCredentialMatches(current, input);
  if (Temporal.Instant.compare(databaseNow, settlementInstant(lease.expiresAt)) >= 0) fail();
  return databaseNow;
}

export function readSettlementPageCursor(value: unknown): string | null {
  return value === null ? null : settlementIdentifier(value, 1_000);
}

export function readMaximumSettlementPageCount(value: unknown): number {
  return positiveSafeInteger(value, maximumPageCount);
}

function readActiveWindow(
  input: unknown,
  initial: Temporal.Instant,
  highWater: Temporal.Instant,
  updatedAt: Temporal.Instant,
  overlapSeconds: number
): FinanceSettlementCursorWindow | null {
  if (input === null) return null;
  const fields = exactSettlementRecord(input, [
    "startAt",
    "endAt",
    "nextPageCursor",
    "checkpointedPageCount",
    "maxPageCount"
  ]);
  const start = settlementInstant(fields.startAt);
  const end = settlementInstant(fields.endAt);
  const expectedStart = maximumInstant(initial, subtractOverlap(highWater, overlapSeconds));
  const nextPageCursor = readSettlementPageCursor(fields.nextPageCursor);
  const checkpointedPageCount = nonNegativeSafeInteger(fields.checkpointedPageCount);
  const maxPageCount = readMaximumSettlementPageCount(fields.maxPageCount);
  if (
    Temporal.Instant.compare(start, expectedStart) !== 0 ||
    Temporal.Instant.compare(end, highWater) <= 0 ||
    Temporal.Instant.compare(end, start) <= 0 ||
    Temporal.Instant.compare(end, updatedAt) > 0 ||
    checkpointedPageCount > maxPageCount ||
    (nextPageCursor === null && checkpointedPageCount !== 0) ||
    (nextPageCursor !== null &&
      (checkpointedPageCount < 1 || checkpointedPageCount >= maxPageCount))
  ) {
    fail();
  }
  return Object.freeze({
    startAt: start.toString(),
    endAt: end.toString(),
    nextPageCursor,
    checkpointedPageCount,
    maxPageCount
  });
}

function readLease(
  input: unknown,
  cursorFencingToken: number,
  updatedAt: Temporal.Instant
): FinanceSettlementCursorLease | null {
  if (input === null) return null;
  const fields = exactSettlementRecord(input, [
    "ownerId",
    "token",
    "fencingToken",
    "claimedAt",
    "expiresAt"
  ]);
  const claimedAt = settlementInstant(fields.claimedAt);
  const expiresAt = settlementInstant(fields.expiresAt);
  const fencingToken = positiveSafeInteger(fields.fencingToken, Number.MAX_SAFE_INTEGER);
  if (
    fencingToken !== cursorFencingToken ||
    Temporal.Instant.compare(claimedAt, updatedAt) > 0 ||
    Temporal.Instant.compare(updatedAt, expiresAt) >= 0
  ) {
    fail();
  }
  return Object.freeze({
    ownerId: settlementIdentifier(fields.ownerId),
    token: settlementIdentifier(fields.token, 500),
    fencingToken,
    claimedAt: claimedAt.toString(),
    expiresAt: expiresAt.toString()
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
