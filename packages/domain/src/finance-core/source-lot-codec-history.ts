import { Temporal } from "@js-temporal/polyfill";
import {
  type ChargebackRestriction,
  type ChargebackRestrictionHistoryRecord
} from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  instant,
  money,
  positiveVersion
} from "./source-lot-validation";

import { createChargebackLostAuthority } from "./source-lot-codec-authority";
import {
  chargebackRestrictionHistoryKeys,
  chargebackRestrictionKeys
} from "./source-lot-codec-shapes";
export function hydrateChargebackRestriction(input: unknown): ChargebackRestriction {
  const fields = exactDataRecord(input, chargebackRestrictionKeys);
  if (
    fields.status !== "active" &&
    fields.status !== "allocation_blocked" &&
    fields.status !== "closed_won" &&
    fields.status !== "closed_lost"
  ) {
    fail("invalid_field");
  }
  const confirmedAt = instant(fields.confirmedAt);
  const closedAt = fields.closedAt === null ? null : instant(fields.closedAt);
  if (
    (fields.status === "active" || fields.status === "allocation_blocked") !==
      (closedAt === null) ||
    (closedAt !== null && Temporal.Instant.compare(closedAt, confirmedAt) < 0)
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    restrictionId: identifier(fields.restrictionId),
    version: positiveVersion(fields.version, "invalid_field"),
    chargebackCaseId: identifier(fields.chargebackCaseId),
    orderId: identifier(fields.orderId),
    astrologerUserId: identifier(fields.astrologerUserId),
    providerAccountId: identifier(fields.providerAccountId),
    providerPaymentId: identifier(fields.providerPaymentId),
    disputedAmount: money(fields.disputedAmount, true, "invalid_field"),
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    status: fields.status,
    confirmedAt,
    closedAt
  });
}

export function chargebackRestrictionArray(input: unknown): readonly ChargebackRestriction[] {
  return Object.freeze(exactDataArray(input).map(hydrateChargebackRestriction));
}

export function chargebackRestrictionHistoryArray(
  input: unknown
): readonly ChargebackRestrictionHistoryRecord[] {
  return Object.freeze(
    exactDataArray(input).map((entry) => {
      const fields = exactDataRecord(entry, chargebackRestrictionHistoryKeys);
      if (
        fields.kind !== "chargeback_lost_closed" &&
        fields.kind !== "chargeback_lost_blocked" &&
        fields.kind !== "chargeback_lost_allocation_closed"
      ) {
        fail("invalid_field");
      }
      const operationKey = exactDataRecord(fields.operationKey, [
        "kind",
        "restrictionId",
        "operation"
      ]);
      if (
        operationKey.kind !== "chargeback_restriction" ||
        (operationKey.operation !== "lost_final" &&
          operationKey.operation !== "lost_allocation_closed")
      ) {
        fail("invalid_field");
      }
      const authority = createChargebackLostAuthority(fields.authority);
      const occurredAt = instant(fields.occurredAt);
      if (authority.lostAt !== occurredAt) {
        fail("invalid_field");
      }
      return Object.freeze({
        kind: fields.kind,
        operationId: identifier(fields.operationId),
        operationKey: Object.freeze({
          kind: "chargeback_restriction" as const,
          restrictionId: identifier(operationKey.restrictionId),
          operation: operationKey.operation
        }),
        previousVersion: positiveVersion(fields.previousVersion, "invalid_field"),
        nextVersion: positiveVersion(fields.nextVersion, "invalid_field"),
        occurredAt,
        authority
      });
    })
  );
}

export { payableLotHistoryKeys, payableLotStateKeys } from "./source-lot-codec-shapes";
