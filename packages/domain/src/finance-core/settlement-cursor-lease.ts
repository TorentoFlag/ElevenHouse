import { Temporal } from "@js-temporal/polyfill";
import {
  exactSettlementRecord,
  fail,
  settlementIdentifier,
  settlementInstant
} from "./settlement-codec";
import {
  advanceSettlementCursor,
  assertActiveSettlementLease,
  assertSettlementCursorVersion,
  assertSettlementDatabaseTransition,
  assertSettlementLeaseCredentialMatches,
  readSettlementCursor
} from "./settlement-cursor-codec";
import type { FinanceSettlementCursor } from "./settlement-cursor-types";

export function claimSettlementCursorLease(input: unknown): FinanceSettlementCursor {
  const fields = exactSettlementRecord(input, [
    "current",
    "expectedVersion",
    "leaseOwnerId",
    "leaseToken",
    "leaseExpiresAt",
    "databaseNow"
  ]);
  const current = readSettlementCursor(fields.current);
  assertSettlementCursorVersion(current, fields.expectedVersion);
  const databaseNow = assertSettlementDatabaseTransition(current, fields.databaseNow);
  if (current.lease !== null || !Number.isSafeInteger(current.fencingToken + 1)) fail();
  const expiresAt = settlementInstant(fields.leaseExpiresAt);
  if (Temporal.Instant.compare(expiresAt, databaseNow) <= 0) fail();
  const fencingToken = current.fencingToken + 1;
  return advanceSettlementCursor(current, databaseNow.toString(), {
    fencingToken,
    lease: Object.freeze({
      ownerId: settlementIdentifier(fields.leaseOwnerId),
      token: settlementIdentifier(fields.leaseToken, 500),
      fencingToken,
      claimedAt: databaseNow.toString(),
      expiresAt: expiresAt.toString()
    })
  });
}

export function renewSettlementCursorLease(input: unknown): FinanceSettlementCursor {
  const fields = exactSettlementRecord(input, [
    "current",
    "expectedVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken",
    "leaseExpiresAt",
    "databaseNow"
  ]);
  const current = readSettlementCursor(fields.current);
  assertSettlementCursorVersion(current, fields.expectedVersion);
  const databaseNow = assertActiveSettlementLease(current, fields);
  const lease = assertSettlementLeaseCredentialMatches(current, fields);
  const expiresAt = settlementInstant(fields.leaseExpiresAt);
  if (
    Temporal.Instant.compare(expiresAt, databaseNow) <= 0 ||
    Temporal.Instant.compare(expiresAt, settlementInstant(lease.expiresAt)) <= 0
  ) {
    fail();
  }
  return advanceSettlementCursor(current, databaseNow.toString(), {
    lease: Object.freeze({ ...lease, expiresAt: expiresAt.toString() })
  });
}

export function releaseSettlementCursorLease(input: unknown): FinanceSettlementCursor {
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
  const databaseNow = assertActiveSettlementLease(current, fields);
  return advanceSettlementCursor(current, databaseNow.toString(), { lease: null });
}

export function expireSettlementCursorLease(input: unknown): FinanceSettlementCursor {
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
  const databaseNow = assertSettlementDatabaseTransition(current, fields.databaseNow);
  const lease = assertSettlementLeaseCredentialMatches(current, fields);
  if (Temporal.Instant.compare(databaseNow, settlementInstant(lease.expiresAt)) < 0) fail();
  return advanceSettlementCursor(current, databaseNow.toString(), { lease: null });
}
