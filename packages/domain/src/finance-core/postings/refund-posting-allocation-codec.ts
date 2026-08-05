import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  assertRefundPostingAllocationIntegrity,
  assertRefundPostingAllocationMatchesApproval
} from "./refund-posting-allocation-integrity";
import {
  readAlreadyPaidComponent,
  readInFlightComponent,
  readPayableComponent,
  readPlatformComponent
} from "./refund-posting-allocation-components";
import {
  readOrderEconomics,
  readRefundPostingAuthorityRef,
  readRefundPostingMoney,
  readRefundProviderAccount
} from "./refund-posting-value-codec";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import { readRefundPostingPriorAllocationAuthorityRef } from "./refund-posting-prior-allocation";
import { readRefundCumulativePositionRef } from "./refund-cumulative-position";

const allocationKeys = [
  "kind",
  "schemaVersion",
  "authorizationStatus",
  "digestPurpose",
  "authorityId",
  "version",
  "refundId",
  "orderId",
  "astrologerUserId",
  "providerAccount",
  "providerPaymentId",
  "providerIntentId",
  "providerRequestDigest",
  "approvedAt",
  "allocationStatus",
  "fundingStatus",
  "priorAllocationAuthorityRef",
  "confirmedCumulativePositionRef",
  "refundApprovalAuthorityRef",
  "orderEconomics",
  "orderEconomicsDigest",
  "capturedGross",
  "capturedPayable",
  "capturedPlatformCommission",
  "priorCumulativeRefunded",
  "nextCumulativeRefunded",
  "priorCumulativePayableReversed",
  "nextCumulativePayableReversed",
  "priorCumulativePlatformReversed",
  "nextCumulativePlatformReversed",
  "refundAmount",
  "payableLotAmount",
  "alreadyPaidAmount",
  "inFlightPayoutAmount",
  "platformCommissionAmount",
  "payableComponents",
  "alreadyPaidComponents",
  "inFlightPayoutComponents",
  "platformCommissionComponents",
  "providerClearingComponentId",
  "allocationDigest"
] as const;

export function readRefundPostingAllocationAuthority(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): RefundPostingAllocationAuthorityV1 {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, allocationKeys);
  if (
    fields.kind !== "refund_posting_allocation_authority" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.allocationStatus !== "approved" ||
    fields.fundingStatus !== "fully_funded"
  )
    fail("authority_mismatch");
  const rawArrays = [
    readExactDataArray(fields.payableComponents, 0, envelope.maxAllocations),
    readExactDataArray(fields.alreadyPaidComponents, 0, envelope.maxAllocations),
    readExactDataArray(fields.inFlightPayoutComponents, 0, envelope.maxAllocations),
    readExactDataArray(fields.platformCommissionComponents, 0, envelope.maxAllocations)
  ] as const;
  if (rawArrays.reduce((total, rows) => total + rows.length, 0) > envelope.maxAllocations) {
    fail("decoder_envelope_exceeded");
  }
  const orderEconomics = readOrderEconomics(fields.orderEconomics);
  const core = Object.freeze({
    kind: "refund_posting_allocation_authority" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    refundId: readFinancePostingIdentifier(fields.refundId),
    orderId: readFinancePostingIdentifier(fields.orderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    providerAccount: readRefundProviderAccount(fields.providerAccount),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    providerIntentId: readFinancePostingIdentifier(fields.providerIntentId),
    providerRequestDigest: readFinancePostingDigest(fields.providerRequestDigest),
    approvedAt: readFinancePostingInstant(fields.approvedAt),
    allocationStatus: "approved" as const,
    fundingStatus: "fully_funded" as const,
    priorAllocationAuthorityRef: readRefundPostingPriorAllocationAuthorityRef(
      fields.priorAllocationAuthorityRef
    ),
    confirmedCumulativePositionRef: readRefundCumulativePositionRef(
      fields.confirmedCumulativePositionRef
    ),
    refundApprovalAuthorityRef: readRefundPostingAuthorityRef(fields.refundApprovalAuthorityRef, [
      "refund_approval"
    ]),
    orderEconomics,
    orderEconomicsDigest: readFinancePostingDigest(fields.orderEconomicsDigest),
    capturedGross: readRefundPostingMoney(fields.capturedGross, false),
    capturedPayable: readRefundPostingMoney(fields.capturedPayable, false),
    capturedPlatformCommission: readRefundPostingMoney(fields.capturedPlatformCommission, false),
    priorCumulativeRefunded: readRefundPostingMoney(fields.priorCumulativeRefunded, false),
    nextCumulativeRefunded: readRefundPostingMoney(fields.nextCumulativeRefunded, false),
    priorCumulativePayableReversed: readRefundPostingMoney(
      fields.priorCumulativePayableReversed,
      false
    ),
    nextCumulativePayableReversed: readRefundPostingMoney(
      fields.nextCumulativePayableReversed,
      false
    ),
    priorCumulativePlatformReversed: readRefundPostingMoney(
      fields.priorCumulativePlatformReversed,
      false
    ),
    nextCumulativePlatformReversed: readRefundPostingMoney(
      fields.nextCumulativePlatformReversed,
      false
    ),
    refundAmount: readFinancePostingMoney(fields.refundAmount),
    payableLotAmount: readRefundPostingMoney(fields.payableLotAmount, false),
    alreadyPaidAmount: readRefundPostingMoney(fields.alreadyPaidAmount, false),
    inFlightPayoutAmount: readRefundPostingMoney(fields.inFlightPayoutAmount, false),
    platformCommissionAmount: readRefundPostingMoney(fields.platformCommissionAmount, false),
    payableComponents: Object.freeze(rawArrays[0].map(readPayableComponent)),
    alreadyPaidComponents: Object.freeze(rawArrays[1].map(readAlreadyPaidComponent)),
    inFlightPayoutComponents: Object.freeze(rawArrays[2].map(readInFlightComponent)),
    platformCommissionComponents: Object.freeze(rawArrays[3].map(readPlatformComponent)),
    providerClearingComponentId: readFinancePostingIdentifier(fields.providerClearingComponentId)
  });
  const allocationDigest = readFinancePostingDigest(fields.allocationDigest);
  if (allocationDigest !== hashFinanceCommandPayload(core)) fail("authority_mismatch");
  const allocation = Object.freeze({ ...core, allocationDigest });
  assertRefundPostingAllocationIntegrity(allocation);
  return allocation;
}

export function assertRefundPostingAllocationMatchesApprovalAuthority(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): void {
  const fields = readExactDataRecord(input, ["allocation", "approvalAuthority"]);
  const allocation = readRefundPostingAllocationAuthority(fields.allocation, envelopeInput);
  assertRefundPostingAllocationMatchesApproval(allocation, fields.approvalAuthority);
}
function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
