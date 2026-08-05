import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import {
  confirmChargebackRestriction,
  createChargebackConfirmedAuthority,
  createChargebackLostAuthority
} from "../source-lots";
import { chargebackRestrictedState } from "../source-lot-reference-test-fixtures";
import { outcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";
import { chargebackResolutionAllocationFixture } from "./chargeback-resolution-allocation-test-fixture";
import {
  chargebackLostResolutionFixture,
  chargebackWonResolutionFixtureWithSuspense
} from "./chargeback-resolution-posting-test-fixtures";
import { rehashResolutionAuthority } from "./chargeback-resolution-test-primitives";

export function chargebackProviderAdvanceFixture() {
  const allocation = chargebackResolutionAllocationFixture();
  const firstBinding = allocation.allocationAuthority.confirmedProviderEvidenceBinding;
  const initial = chargebackRestrictedState();
  if (
    hashFinanceCommandPayload(initial.authority) !== firstBinding.sourceAuthorityDigest ||
    initial.authority.confirmationId !== firstBinding.bindingId
  ) {
    throw new Error("mismatched initial provider confirmation");
  }
  const secondAuthority = cumulativeAuthority(firstBinding.sourceAuthority, {
    authorityId: "chargeback-confirmed-authority-2",
    confirmationId: "chargeback-confirmation-2",
    version: 2,
    priorRestrictionVersion: 1,
    priorAmountMinor: 5_000,
    nextAmountMinor: 5_200,
    deltaMinor: 200,
    evidenceId: "chargeback-confirmed-evidence-2",
    confirmedAt: "2026-08-04T02:00:00Z"
  });
  const secondTransition = confirmChargebackRestriction({
    state: initial.restricted.state,
    expectedVersion: initial.restricted.nextVersion,
    authority: secondAuthority,
    operationId: "chargeback-confirmed-operation-2",
    sourceKey: {
      kind: "chargeback",
      sourceId: secondAuthority.confirmationId,
      operation: "confirmed"
    },
    occurredAt: secondAuthority.confirmedAt
  });
  const second = providerChainRow(secondAuthority, secondTransition, firstBinding);
  const thirdAuthority = cumulativeAuthority(secondAuthority, {
    authorityId: "chargeback-confirmed-authority-3",
    confirmationId: "chargeback-confirmation-3",
    version: 3,
    priorRestrictionVersion: 2,
    priorAmountMinor: 5_200,
    nextAmountMinor: 5_500,
    deltaMinor: 300,
    evidenceId: "chargeback-confirmed-evidence-3",
    confirmedAt: "2026-08-04T03:00:00Z"
  });
  const thirdTransition = confirmChargebackRestriction({
    state: secondTransition.state,
    expectedVersion: secondTransition.nextVersion,
    authority: thirdAuthority,
    operationId: "chargeback-confirmed-operation-3",
    sourceKey: {
      kind: "chargeback",
      sourceId: thirdAuthority.confirmationId,
      operation: "confirmed"
    },
    occurredAt: thirdAuthority.confirmedAt
  });
  const third = providerChainRow(thirdAuthority, thirdTransition, second.providerEvidenceBinding);
  const first = Object.freeze({
    providerEvidenceBinding: firstBinding,
    operationReceipt: allocation.base.providerConfirmationOperationReceipt,
    componentBindings: allocation.base.providerConfirmationComponentBindings
  });
  return Object.freeze({ first, second, third, chain: Object.freeze([first, second, third]) });
}

export function chargebackWonAfterProviderAdvanceFixture() {
  const base = chargebackWonResolutionFixtureWithSuspense(2_500);
  const provider = chargebackProviderAdvanceFixture();
  const latest = provider.third.providerEvidenceBinding;
  const authority = rehashResolutionAuthority({
    ...base.authority,
    latestProviderBindingRef: providerRef(latest),
    disputedPrincipal: { amountMinor: 5_500, currency: "RUB" },
    unallocatedSuspense: { amountMinor: 2_500, currency: "RUB" }
  });
  return Object.freeze({ ...base, authority, resolvedProviderConfirmationChain: provider.chain });
}

export function chargebackLostAfterProviderAdvanceFixture() {
  const base = chargebackLostResolutionFixture();
  const provider = chargebackProviderAdvanceFixture();
  const latest = provider.third.providerEvidenceBinding;
  const source = createChargebackLostAuthority({
    ...base.authority.sourceAuthority,
    unallocatedSuspense: { amountMinor: 2_500, currency: "RUB" }
  });
  const outcomeEvidence = outcome(source);
  const authority = rehashResolutionAuthority({
    ...base.authority,
    sourceAuthority: source,
    sourceAuthorityDigest: hashFinanceCommandPayload(source),
    outcomeEvidenceRef: outcomeEvidenceRef(outcomeEvidence),
    latestProviderBindingRef: providerRef(latest),
    disputedPrincipal: { amountMinor: 5_500, currency: "RUB" },
    unallocatedSuspense: { amountMinor: 2_500, currency: "RUB" }
  });
  return Object.freeze({
    ...base,
    authority,
    outcomeEvidence,
    resolvedProviderConfirmationChain: provider.chain
  });
}

function cumulativeAuthority(
  prior: ReturnType<typeof createChargebackConfirmedAuthority>,
  values: Readonly<{
    authorityId: string;
    confirmationId: string;
    version: number;
    priorRestrictionVersion: number;
    priorAmountMinor: number;
    nextAmountMinor: number;
    deltaMinor: number;
    evidenceId: string;
    confirmedAt: string;
  }>
) {
  return createChargebackConfirmedAuthority({
    kind: "chargeback_confirmed",
    authorityId: values.authorityId,
    version: values.version,
    confirmationId: values.confirmationId,
    restrictionId: prior.restrictionId,
    confirmationKind: "cumulative_update",
    amountBasis: "cumulative",
    priorRestrictionVersion: values.priorRestrictionVersion,
    chargebackCaseId: prior.chargebackCaseId,
    orderId: prior.orderId,
    astrologerUserId: prior.astrologerUserId,
    providerAccount: prior.providerAccount,
    providerPaymentId: prior.providerPaymentId,
    priorCumulativeDisputedAmount: { amountMinor: values.priorAmountMinor, currency: "RUB" },
    nextCumulativeDisputedAmount: { amountMinor: values.nextAmountMinor, currency: "RUB" },
    disputedDelta: { amountMinor: values.deltaMinor, currency: "RUB" },
    canonicalEvidenceId: values.evidenceId,
    confirmedAt: values.confirmedAt
  });
}

function providerChainRow(
  authority: ReturnType<typeof createChargebackConfirmedAuthority>,
  transition: Parameters<typeof createPayableLotOperationReceipt>[0],
  priorBinding: ReturnType<
    typeof chargebackResolutionAllocationFixture
  >["allocationAuthority"]["confirmedProviderEvidenceBinding"]
) {
  const operationReceipt = createPayableLotOperationReceipt(transition);
  const evidenceCore = Object.freeze({
    kind: "arc_payment_chargeback" as const,
    evidenceId: authority.canonicalEvidenceId,
    providerAccountId: authority.providerAccount.providerAccountId,
    providerPaymentId: authority.providerPaymentId,
    amount: authority.disputedDelta,
    observedAt: authority.confirmedAt
  });
  const providerEvidence = Object.freeze({
    ...evidenceCore,
    canonicalDigest: hashFinanceCommandPayload(evidenceCore)
  });
  const bindingCore = Object.freeze({
    kind: "unverified_chargeback_provider_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: authority.confirmationId,
    version: authority.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    principalComponentId: priorBinding.principalComponentId,
    componentRegistryAuthorityRef: priorBinding.componentRegistryAuthorityRef,
    sourceAuthority: authority,
    sourceAuthorityDigest: hashFinanceCommandPayload(authority),
    operationReceiptId: operationReceipt.receiptId,
    operationReceiptDigest: operationReceipt.canonicalDigest,
    providerEvidence
  });
  return Object.freeze({
    providerEvidenceBinding: Object.freeze({
      ...bindingCore,
      bindingDigest: hashFinanceCommandPayload(bindingCore)
    }),
    operationReceipt,
    componentBindings: Object.freeze([])
  });
}

function outcome(source: ReturnType<typeof createChargebackLostAuthority>) {
  const core = Object.freeze({
    kind: "unverified_chargeback_outcome_evidence_binding" as const,
    schemaVersion: 1 as const,
    evidenceId: source.canonicalEvidenceId,
    version: source.version,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    auditSource: "internal_case_review" as const,
    outcome: "lost" as const,
    chargebackCaseId: source.chargebackCaseId,
    sourceAuthority: source,
    sourceAuthorityDigest: hashFinanceCommandPayload(source),
    auditedByActorUserId: "finance-auditor-1",
    decidedAt: source.lostAt
  });
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}

const providerRef = (binding: {
  kind: "unverified_chargeback_provider_evidence_binding";
  bindingId: string;
  version: number;
  bindingDigest: `sha256:${string}`;
}) =>
  Object.freeze({
    kind: binding.kind,
    bindingId: binding.bindingId,
    version: binding.version,
    canonicalDigest: binding.bindingDigest
  });
