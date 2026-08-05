import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ChargebackConfirmedAuthority } from "../source-lot-types";
import { readChargebackSourceAuthority } from "./chargeback-source-authority";
import {
  assertFinancePostingInstantEqual,
  assertFinancePostingMoneyEqual,
  FinancePostingIntegrityError,
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
import type { FinancePostingAuthorityRef } from "./posting-types";

export { FinancePostingIntegrityError } from "./posting-codec";

export type UnverifiedChargebackProviderEvidenceBinding = Readonly<{
  kind: "unverified_chargeback_provider_evidence_binding";
  schemaVersion: 1;
  bindingId: string;
  version: number;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  principalComponentId: string;
  componentRegistryAuthorityRef: FinancePostingAuthorityRef & {
    readonly kind: "finance_component_registry";
  };
  sourceAuthority: ChargebackConfirmedAuthority;
  sourceAuthorityDigest: ReturnType<typeof hashFinanceCommandPayload>;
  operationReceiptId: string;
  operationReceiptDigest: ReturnType<typeof hashFinanceCommandPayload>;
  providerEvidence: Readonly<{
    kind: "arc_payment_chargeback";
    evidenceId: string;
    canonicalDigest: ReturnType<typeof hashFinanceCommandPayload>;
    providerAccountId: string;
    providerPaymentId: string;
    amount: Money;
    observedAt: string;
  }>;
  bindingDigest: ReturnType<typeof hashFinanceCommandPayload>;
}>;

export function readUnverifiedChargebackProviderEvidenceBinding(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): UnverifiedChargebackProviderEvidenceBinding;
export function readUnverifiedChargebackProviderEvidenceBinding(
  input: unknown,
  decoderEnvelopeInput: unknown
): UnverifiedChargebackProviderEvidenceBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "version",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "principalComponentId",
    "componentRegistryAuthorityRef",
    "sourceAuthority",
    "sourceAuthorityDigest",
    "operationReceiptId",
    "operationReceiptDigest",
    "providerEvidence",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_chargeback_provider_evidence_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const decodedSource = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  if (decodedSource.authority.kind !== "chargeback_confirmed") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const componentRegistryAuthorityRef = readComponentRegistryAuthorityRef(
    fields.componentRegistryAuthorityRef
  );
  const providerEvidence = readProviderEvidence(fields.providerEvidence);
  const core = Object.freeze({
    kind: "unverified_chargeback_provider_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    principalComponentId: readFinancePostingIdentifier(fields.principalComponentId),
    componentRegistryAuthorityRef,
    sourceAuthority: decodedSource.authority,
    sourceAuthorityDigest: readFinancePostingDigest(fields.sourceAuthorityDigest),
    operationReceiptId: readFinancePostingIdentifier(fields.operationReceiptId),
    operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
    providerEvidence
  });
  assertEvidenceMatchesSource(core, decodedSource.canonicalDigest);
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, bindingDigest });
}

function readComponentRegistryAuthorityRef(input: unknown) {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  if (fields.kind !== "finance_component_registry") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    kind: "finance_component_registry" as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

function readProviderEvidence(input: unknown) {
  const fields = readExactDataRecord(input, [
    "kind",
    "evidenceId",
    "canonicalDigest",
    "providerAccountId",
    "providerPaymentId",
    "amount",
    "observedAt"
  ]);
  if (fields.kind !== "arc_payment_chargeback") {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const core = Object.freeze({
    kind: "arc_payment_chargeback" as const,
    evidenceId: readFinancePostingIdentifier(fields.evidenceId),
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    amount: readFinancePostingMoney(fields.amount),
    observedAt: readFinancePostingInstant(fields.observedAt)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, canonicalDigest });
}

function assertEvidenceMatchesSource(
  binding: Omit<UnverifiedChargebackProviderEvidenceBinding, "bindingDigest">,
  expectedSourceDigest: ReturnType<typeof hashFinanceCommandPayload>
): void {
  const source = binding.sourceAuthority;
  const evidence = binding.providerEvidence;
  if (
    binding.bindingId !== source.confirmationId ||
    binding.version !== source.version ||
    binding.sourceAuthorityDigest !== expectedSourceDigest ||
    evidence.evidenceId !== source.canonicalEvidenceId ||
    evidence.providerAccountId !== source.providerAccount.providerAccountId ||
    evidence.providerPaymentId !== source.providerPaymentId
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  assertFinancePostingMoneyEqual(evidence.amount, source.disputedDelta, "evidence_mismatch");
  assertFinancePostingInstantEqual(evidence.observedAt, source.confirmedAt, "evidence_mismatch");
}
