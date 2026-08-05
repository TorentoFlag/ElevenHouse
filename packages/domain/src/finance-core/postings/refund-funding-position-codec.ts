import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import {
  readRefundFundingReservationAuthorityRef,
  readRefundFundingSource
} from "./refund-funding-source-codec";
import type {
  RefundFundingActiveReservation,
  RefundFundingPositionRef,
  UnverifiedRefundFundingPosition
} from "./refund-funding-position-types";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import {
  readRefundPostingAuthorityRef,
  readRefundPostingMoney,
  readRefundProviderAccount
} from "./refund-posting-value-codec";

export function readUnverifiedRefundFundingPosition(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): UnverifiedRefundFundingPosition {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "positionId",
    "source",
    "providerAccount",
    "providerPaymentId",
    "currency",
    "version",
    "capacity",
    "freeAmount",
    "reservedAmount",
    "consumedAmount",
    "activeReservation",
    "updatedAt",
    "positionDigest"
  ]);
  if (
    fields.kind !== "unverified_refund_funding_position" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.currency !== "RUB"
  ) {
    mismatch();
  }
  const core = Object.freeze({
    kind: "unverified_refund_funding_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: readFinancePostingIdentifier(fields.positionId),
    source: readRefundFundingSource(fields.source),
    providerAccount: readRefundProviderAccount(fields.providerAccount),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    currency: "RUB" as const,
    version: nonnegativeVersion(fields.version),
    capacity: readRefundPostingMoney(fields.capacity, false),
    freeAmount: readRefundPostingMoney(fields.freeAmount, false),
    reservedAmount: readRefundPostingMoney(fields.reservedAmount, false),
    consumedAmount: readRefundPostingMoney(fields.consumedAmount, false),
    activeReservation:
      fields.activeReservation === null
        ? null
        : readActiveReservation(fields.activeReservation, envelope),
    updatedAt: readFinancePostingInstant(fields.updatedAt)
  });
  const positionDigest = readFinancePostingDigest(fields.positionDigest);
  if (positionDigest !== hashFinanceCommandPayload(core)) evidenceMismatch();
  const position = Object.freeze({ ...core, positionDigest });
  assertPositionIntegrity(position);
  return position;
}

export function refundFundingPositionRef(
  position: UnverifiedRefundFundingPosition
): RefundFundingPositionRef {
  return Object.freeze({
    kind: position.kind,
    positionId: position.positionId,
    version: position.version,
    canonicalDigest: position.positionDigest
  });
}

export function assertRefundFundingPositionScope(
  position: UnverifiedRefundFundingPosition,
  allocation: RefundPostingAllocationAuthorityV1
): void {
  if (
    !sameCanonicalFinancePostingValue(position.providerAccount, allocation.providerAccount) ||
    position.providerPaymentId !== allocation.providerPaymentId ||
    position.currency !== allocation.refundAmount.currency
  ) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
}

export function buildRefundFundingNextPosition(
  position: UnverifiedRefundFundingPosition,
  amounts: Readonly<{ free: Money; reserved: Money; consumed: Money }>,
  activeReservation: RefundFundingActiveReservation | null,
  occurredAt: string
): UnverifiedRefundFundingPosition {
  const { positionDigest: priorDigest, ...priorCore } = position;
  void priorDigest;
  const core = Object.freeze({
    ...priorCore,
    version: position.version + 1,
    freeAmount: amounts.free,
    reservedAmount: amounts.reserved,
    consumedAmount: amounts.consumed,
    activeReservation,
    updatedAt: occurredAt
  });
  return Object.freeze({ ...core, positionDigest: hashFinanceCommandPayload(core) });
}

function readActiveReservation(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): RefundFundingActiveReservation {
  const fields = readExactDataRecord(input, [
    "allocationAuthorityRef",
    "components",
    "totalAmount",
    "reservedAt"
  ]);
  const components = Object.freeze(
    readExactDataArray(fields.components, 1, envelope.maxAllocations).map((inputComponent) => {
      const component = readExactDataRecord(inputComponent, [
        "componentId",
        "reservationAuthorityRef",
        "amount"
      ]);
      return Object.freeze({
        componentId: readFinancePostingIdentifier(component.componentId),
        reservationAuthorityRef: readRefundFundingReservationAuthorityRef(
          component.reservationAuthorityRef
        ),
        amount: readRefundPostingMoney(component.amount, true)
      });
    })
  );
  return Object.freeze({
    allocationAuthorityRef: readRefundPostingAuthorityRef(fields.allocationAuthorityRef, [
      "refund_posting_allocation_authority"
    ]),
    components,
    totalAmount: readRefundPostingMoney(fields.totalAmount, true),
    reservedAt: readFinancePostingInstant(fields.reservedAt)
  });
}

function assertPositionIntegrity(position: UnverifiedRefundFundingPosition): void {
  const total =
    BigInt(position.freeAmount.amountMinor) +
    BigInt(position.reservedAmount.amountMinor) +
    BigInt(position.consumedAmount.amountMinor);
  if (
    position.positionId !==
      `refund-funding-position:${hashFinanceCommandPayload(position.source)}` ||
    total !== BigInt(position.capacity.amountMinor) ||
    (position.activeReservation === null) !== (position.reservedAmount.amountMinor === 0) ||
    (position.activeReservation !== null &&
      (position.activeReservation.totalAmount.amountMinor !== position.reservedAmount.amountMinor ||
        position.activeReservation.components.reduce(
          (sum, component) => sum + BigInt(component.amount.amountMinor),
          0n
        ) !== BigInt(position.reservedAmount.amountMinor)))
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
