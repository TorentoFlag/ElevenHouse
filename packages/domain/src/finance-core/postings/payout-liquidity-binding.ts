import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readPositiveFinancePostingDecimal
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { UnverifiedPayoutBankLiquidityDecisionBinding } from "./hold-payout-posting-types";

export function readUnverifiedPayoutBankLiquidityDecisionBinding(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): UnverifiedPayoutBankLiquidityDecisionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "decisionId",
    "decisionVersion",
    "payoutRequestId",
    "bankCashPoolId",
    "amount",
    "balanceBasis",
    "snapshotId",
    "snapshotVersion",
    "snapshotDigest",
    "sourceCheckpointId",
    "expectedLiquidityRevision",
    "nextLiquidityRevision",
    "decision",
    "decidedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_payout_bank_liquidity_decision_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.balanceBasis !== "unrestricted_available" ||
    fields.decision !== "sufficient"
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const expectedLiquidityRevision = readPositiveFinancePostingDecimal(
    fields.expectedLiquidityRevision,
    envelope.maxDecimalDigits
  );
  const nextLiquidityRevision = readPositiveFinancePostingDecimal(
    fields.nextLiquidityRevision,
    envelope.maxDecimalDigits
  );
  if (BigInt(nextLiquidityRevision) !== BigInt(expectedLiquidityRevision) + 1n) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "unverified_payout_bank_liquidity_decision_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    decisionId: readFinancePostingIdentifier(fields.decisionId),
    decisionVersion: readPositiveFinancePostingDecimal(
      fields.decisionVersion,
      envelope.maxDecimalDigits
    ),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    amount: readFinancePostingMoney(fields.amount),
    balanceBasis: "unrestricted_available" as const,
    snapshotId: readFinancePostingIdentifier(fields.snapshotId),
    snapshotVersion: readPositiveFinancePostingDecimal(
      fields.snapshotVersion,
      envelope.maxDecimalDigits
    ),
    snapshotDigest: readFinancePostingDigest(fields.snapshotDigest),
    sourceCheckpointId: readFinancePostingIdentifier(fields.sourceCheckpointId),
    expectedLiquidityRevision,
    nextLiquidityRevision,
    decision: "sufficient" as const,
    decidedAt: readFinancePostingInstant(fields.decidedAt)
  });
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, bindingDigest });
}
