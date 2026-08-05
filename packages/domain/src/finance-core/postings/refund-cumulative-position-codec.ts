import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { normalizeFinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import {
  readRefundPostingAuthorityRef,
  readRefundPostingMoney,
  readRefundProviderAccount
} from "./refund-posting-value-codec";
import type {
  RefundCumulativePositionRef,
  UnverifiedRefundCumulativePosition
} from "./refund-cumulative-position-types";

export function readRefundCumulativePositionRef(input: unknown): RefundCumulativePositionRef {
  const fields = readExactDataRecord(input, [
    "kind",
    "positionId",
    "version",
    "confirmedCumulativeRefunded",
    "confirmedCumulativePayableReversed",
    "confirmedCumulativePlatformReversed",
    "canonicalDigest"
  ]);
  if (fields.kind !== "refund_cumulative_position") mismatch();
  return Object.freeze({
    kind: "refund_cumulative_position" as const,
    positionId: readFinancePostingIdentifier(fields.positionId),
    version: nonnegativeVersion(fields.version),
    confirmedCumulativeRefunded: readRefundPostingMoney(fields.confirmedCumulativeRefunded, false),
    confirmedCumulativePayableReversed: readRefundPostingMoney(
      fields.confirmedCumulativePayableReversed,
      false
    ),
    confirmedCumulativePlatformReversed: readRefundPostingMoney(
      fields.confirmedCumulativePlatformReversed,
      false
    ),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readAndAssertRefundCumulativePosition(
  input: unknown,
  allocation: RefundPostingAllocationAuthorityV1,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedRefundCumulativePosition {
  normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "positionId",
    "providerAccount",
    "providerPaymentId",
    "currency",
    "version",
    "confirmedCumulativeRefunded",
    "confirmedCumulativePayableReversed",
    "confirmedCumulativePlatformReversed",
    "lastConfirmedAllocationRef",
    "lastConfirmedTerminalAuthorityRef",
    "updatedAt",
    "positionDigest"
  ]);
  if (
    fields.kind !== "refund_cumulative_position" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.currency !== "RUB"
  ) {
    mismatch();
  }
  const core = Object.freeze({
    kind: "refund_cumulative_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: readFinancePostingIdentifier(fields.positionId),
    providerAccount: readRefundProviderAccount(fields.providerAccount),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    currency: "RUB" as const,
    version: nonnegativeVersion(fields.version),
    confirmedCumulativeRefunded: readRefundPostingMoney(fields.confirmedCumulativeRefunded, false),
    confirmedCumulativePayableReversed: readRefundPostingMoney(
      fields.confirmedCumulativePayableReversed,
      false
    ),
    confirmedCumulativePlatformReversed: readRefundPostingMoney(
      fields.confirmedCumulativePlatformReversed,
      false
    ),
    lastConfirmedAllocationRef:
      fields.lastConfirmedAllocationRef === null
        ? null
        : readRefundPostingAuthorityRef(fields.lastConfirmedAllocationRef, [
            "refund_posting_allocation_authority"
          ]),
    lastConfirmedTerminalAuthorityRef:
      fields.lastConfirmedTerminalAuthorityRef === null
        ? null
        : readRefundPostingAuthorityRef(fields.lastConfirmedTerminalAuthorityRef, [
            "refund_confirmed"
          ]),
    updatedAt: readFinancePostingInstant(fields.updatedAt)
  });
  const positionDigest = readFinancePostingDigest(fields.positionDigest);
  if (positionDigest !== hashFinanceCommandPayload(core)) evidenceMismatch();
  const position = Object.freeze({ ...core, positionDigest });
  assertPositionIntegrity(position);
  assertRefundCumulativePositionMatchesAllocation(position, allocation);
  return position;
}

export function assertRefundCumulativePositionMatchesAllocation(
  position: UnverifiedRefundCumulativePosition,
  allocation: RefundPostingAllocationAuthorityV1
): void {
  const ref = allocation.confirmedCumulativePositionRef;
  if (
    ref.positionId !== position.positionId ||
    ref.version !== position.version ||
    ref.canonicalDigest !== position.positionDigest ||
    !sameCanonicalFinancePostingValue(
      ref.confirmedCumulativeRefunded,
      position.confirmedCumulativeRefunded
    ) ||
    !sameCanonicalFinancePostingValue(
      ref.confirmedCumulativePayableReversed,
      position.confirmedCumulativePayableReversed
    ) ||
    !sameCanonicalFinancePostingValue(
      ref.confirmedCumulativePlatformReversed,
      position.confirmedCumulativePlatformReversed
    ) ||
    !sameCanonicalFinancePostingValue(position.providerAccount, allocation.providerAccount) ||
    position.providerPaymentId !== allocation.providerPaymentId ||
    !sameCanonicalFinancePostingValue(
      position.confirmedCumulativeRefunded,
      allocation.priorCumulativeRefunded
    ) ||
    !sameCanonicalFinancePostingValue(
      position.confirmedCumulativePayableReversed,
      allocation.priorCumulativePayableReversed
    ) ||
    !sameCanonicalFinancePostingValue(
      position.confirmedCumulativePlatformReversed,
      allocation.priorCumulativePlatformReversed
    )
  ) {
    mismatch();
  }
  if (compareFinancePostingInstants(allocation.approvedAt, position.updatedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

export function refundCumulativePositionRef(
  position: UnverifiedRefundCumulativePosition
): RefundCumulativePositionRef {
  return Object.freeze({
    kind: position.kind,
    positionId: position.positionId,
    version: position.version,
    confirmedCumulativeRefunded: position.confirmedCumulativeRefunded,
    confirmedCumulativePayableReversed: position.confirmedCumulativePayableReversed,
    confirmedCumulativePlatformReversed: position.confirmedCumulativePlatformReversed,
    canonicalDigest: position.positionDigest
  });
}

function assertPositionIntegrity(position: UnverifiedRefundCumulativePosition): void {
  const noHistory =
    position.lastConfirmedAllocationRef === null &&
    position.lastConfirmedTerminalAuthorityRef === null;
  const mixedHistory =
    (position.lastConfirmedAllocationRef === null) !==
    (position.lastConfirmedTerminalAuthorityRef === null);
  if (
    position.positionId !==
      `refund-cumulative-position:${hashFinanceCommandPayload({
        providerAccount: position.providerAccount,
        providerPaymentId: position.providerPaymentId,
        currency: position.currency
      })}` ||
    BigInt(position.confirmedCumulativePayableReversed.amountMinor) +
      BigInt(position.confirmedCumulativePlatformReversed.amountMinor) !==
      BigInt(position.confirmedCumulativeRefunded.amountMinor) ||
    mixedHistory ||
    (position.version === 0) !== noHistory ||
    (position.version === 0 && position.confirmedCumulativeRefunded.amountMinor !== 0)
  ) {
    mismatch();
  }
}

function nonnegativeVersion(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0) mismatch();
  return input as number;
}
function evidenceMismatch(): never {
  throw new FinancePostingIntegrityError("evidence_mismatch");
}
function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
