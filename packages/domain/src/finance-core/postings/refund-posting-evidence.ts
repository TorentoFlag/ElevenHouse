import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readPositiveFinancePostingDecimal,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import {
  assertOutcomeMatchesTerminal,
  readRefundEvidenceRef,
  readRefundProviderIntent,
  readRefundTerminalAuthority,
  readRefundTerminalOutcome
} from "./refund-posting-evidence-codec";
import type { UnverifiedRefundTerminalEvidenceBindingV1 } from "./refund-posting-types";
import { readRefundPostingAuthorityRef } from "./refund-posting-value-codec";

const bindingKeys = [
  "kind",
  "schemaVersion",
  "bindingId",
  "version",
  "authorizationStatus",
  "digestPurpose",
  "allocationAuthorityRef",
  "operationReceiptRef",
  "terminalAuthorityRef",
  "providerIntent",
  "outcome",
  "bindingDigest"
] as const;

export function readUnverifiedRefundTerminalEvidenceBinding(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedRefundTerminalEvidenceBindingV1 {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, bindingKeys);
  if (
    fields.kind !== "refund_terminal_evidence_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  )
    fail("evidence_mismatch");
  const providerIntent = readRefundProviderIntent(fields.providerIntent);
  const outcome = readRefundTerminalOutcome(fields.outcome);
  const terminalKind = outcome.kind === "succeeded" ? "refund_confirmed" : "refund_failed";
  if (providerIntent.status !== outcome.kind) fail("evidence_mismatch");
  const core = Object.freeze({
    kind: "refund_terminal_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    version: readPositiveFinancePostingDecimal(fields.version, envelope.maxDecimalDigits),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    allocationAuthorityRef: readRefundPostingAuthorityRef(fields.allocationAuthorityRef, [
      "refund_posting_allocation_authority"
    ]),
    operationReceiptRef: readRefundEvidenceRef(fields.operationReceiptRef),
    terminalAuthorityRef: readRefundPostingAuthorityRef(fields.terminalAuthorityRef, [
      terminalKind
    ]),
    providerIntent,
    outcome
  });
  if (
    compareFinancePostingInstants(providerIntent.canonicalEvidence.observedAt, outcome.recordedAt) >
    0
  ) {
    fail("invalid_chronology");
  }
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) fail("evidence_mismatch");
  return Object.freeze({ ...core, bindingDigest });
}

export function assertRefundTerminalEvidenceMatchesAllocation(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): void {
  const fields = readExactDataRecord(input, ["allocation", "binding", "terminalAuthority"]);
  const allocation = readRefundPostingAllocationAuthority(fields.allocation, envelopeInput);
  const binding = readUnverifiedRefundTerminalEvidenceBinding(fields.binding, envelopeInput);
  const terminal = readRefundTerminalAuthority(fields.terminalAuthority);
  const allocationRef = binding.allocationAuthorityRef;
  if (
    allocationRef.authorityId !== allocation.authorityId ||
    allocationRef.version !== allocation.version ||
    allocationRef.canonicalDigest !== allocation.allocationDigest
  )
    fail("authority_mismatch");
  const intent = binding.providerIntent;
  if (
    !sameCanonicalFinancePostingValue(intent.providerAccount, allocation.providerAccount) ||
    intent.providerPaymentId !== allocation.providerPaymentId
  )
    fail("scope_mismatch");
  if (
    intent.intentId !== allocation.providerIntentId ||
    intent.canonicalRequestDigest !== allocation.providerRequestDigest ||
    intent.source.id !== allocation.refundId
  )
    fail("authority_mismatch");
  const terminalDigest = hashFinanceCommandPayload(terminal);
  if (
    binding.terminalAuthorityRef.kind !== terminal.kind ||
    binding.terminalAuthorityRef.authorityId !== terminal.authorityId ||
    binding.terminalAuthorityRef.version !== terminal.version ||
    binding.terminalAuthorityRef.canonicalDigest !== terminalDigest ||
    terminal.refundId !== allocation.refundId ||
    terminal.providerRefundId !== binding.outcome.providerRefundId
  )
    fail("evidence_mismatch");
  if (
    terminal.providerAccountId !== allocation.providerAccount.providerAccountId ||
    terminal.providerPaymentId !== allocation.providerPaymentId
  )
    fail("scope_mismatch");
  if (
    terminal.accountingAllocationId !== allocation.authorityId ||
    terminal.accountingAllocationVersion !== allocation.version
  )
    fail("authority_mismatch");
  if (
    !sameCanonicalFinancePostingValue(terminal.providerRefundAmount, allocation.refundAmount) ||
    !sameCanonicalFinancePostingValue(
      terminal.providerRefundAmount,
      binding.outcome.refundAmount
    ) ||
    !sameCanonicalFinancePostingValue(terminal.payableAmount, allocation.payableLotAmount)
  )
    fail("amount_mismatch");
  assertOutcomeMatchesTerminal(binding.outcome, terminal);
  if (
    terminal.canonicalEvidenceId !== intent.canonicalEvidence.reference ||
    compareFinancePostingInstants(allocation.approvedAt, intent.canonicalEvidence.observedAt) > 0
  )
    fail("evidence_mismatch");
}
function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
