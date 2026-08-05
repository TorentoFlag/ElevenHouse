import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type {
  ChargebackLostAllocationClosureAuthority,
  ChargebackLostClosureTransitionRef,
  ChargebackLostResolutionAuthorityRef
} from "./chargeback-lost-closure-types";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import { readChargebackSourceAuthority } from "./chargeback-source-authority";
import {
  assertResolutionCanonicalRefs,
  readResolutionAllocationRef,
  readResolutionOutcomeRef,
  readResolutionProviderRef,
  readResolutionRecoveryRef
} from "./chargeback-resolution-authority-refs";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";

export function readChargebackLostAllocationClosureAuthority(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): ChargebackLostAllocationClosureAuthority {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorityId",
    "version",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "chargebackCaseId",
    "originalOrderId",
    "astrologerUserId",
    "arcProviderAccountId",
    "providerPaymentId",
    "sourceAuthority",
    "sourceAuthorityDigest",
    "initialLostOutcomeRef",
    "priorLostResolutionRef",
    "restrictionTransitionRef",
    "latestProviderBindingRef",
    "allocationRefs",
    "recoveryRefs",
    "disputedPrincipal",
    "unallocatedSuspense",
    "decidedAt",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "chargeback_lost_allocation_closure_no_posting" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    mismatch("authority_mismatch");
  }
  const source = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  if (source.authority.kind !== "chargeback_lost") mismatch("authority_mismatch");
  const allocationRefs = Object.freeze(
    readExactDataArray(fields.allocationRefs, 1, envelope.maxAllocations).map(
      readResolutionAllocationRef
    )
  );
  const recoveryRefs = Object.freeze(
    readExactDataArray(fields.recoveryRefs, 0, envelope.maxAllocations).map(
      readResolutionRecoveryRef
    )
  );
  assertResolutionCanonicalRefs(allocationRefs);
  assertResolutionCanonicalRefs(recoveryRefs);
  const core = Object.freeze({
    kind: "chargeback_lost_allocation_closure_no_posting" as const,
    schemaVersion: 1 as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    originalOrderId: readFinancePostingIdentifier(fields.originalOrderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    arcProviderAccountId: readFinancePostingIdentifier(fields.arcProviderAccountId),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    sourceAuthority: source.authority,
    sourceAuthorityDigest: readFinancePostingDigest(fields.sourceAuthorityDigest),
    initialLostOutcomeRef: readResolutionOutcomeRef(fields.initialLostOutcomeRef),
    priorLostResolutionRef: readPriorLostResolutionRef(fields.priorLostResolutionRef),
    restrictionTransitionRef: readLostClosureTransitionRef(fields.restrictionTransitionRef),
    latestProviderBindingRef: readResolutionProviderRef(fields.latestProviderBindingRef),
    allocationRefs,
    recoveryRefs,
    disputedPrincipal: readChargebackUnsignedMoney(fields.disputedPrincipal),
    unallocatedSuspense: readChargebackUnsignedMoney(fields.unallocatedSuspense),
    decidedAt: readFinancePostingInstant(fields.decidedAt)
  });
  if (
    core.authorityId !== source.authority.authorityId ||
    core.version !== source.authority.version ||
    core.chargebackCaseId !== source.authority.chargebackCaseId ||
    core.decidedAt !== source.authority.lostAt ||
    core.sourceAuthorityDigest !== source.canonicalDigest ||
    core.unallocatedSuspense.amountMinor !== 0 ||
    source.authority.unallocatedSuspense.amountMinor !== 0
  ) {
    mismatch("authority_mismatch");
  }
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) mismatch("evidence_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

function readPriorLostResolutionRef(input: unknown): ChargebackLostResolutionAuthorityRef {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  if (fields.kind !== "chargeback_lost_resolution_no_posting") {
    mismatch("authority_mismatch");
  }
  return Object.freeze({
    kind: fields.kind,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

function readLostClosureTransitionRef(input: unknown): ChargebackLostClosureTransitionRef {
  const fields = readExactDataRecord(input, [
    "kind",
    "operationId",
    "restrictionId",
    "previousVersion",
    "nextVersion",
    "previousStateDigest",
    "nextStateDigest",
    "sourceAuthorityDigest",
    "occurredAt",
    "canonicalDigest"
  ]);
  if (fields.kind !== "chargeback_lost_allocation_closure_transition") {
    mismatch("authority_mismatch");
  }
  const core = Object.freeze({
    kind: fields.kind,
    operationId: readFinancePostingIdentifier(fields.operationId),
    restrictionId: readFinancePostingIdentifier(fields.restrictionId),
    previousVersion: readFinancePostingVersion(fields.previousVersion),
    nextVersion: readFinancePostingVersion(fields.nextVersion),
    previousStateDigest: readFinancePostingDigest(fields.previousStateDigest),
    nextStateDigest: readFinancePostingDigest(fields.nextStateDigest),
    sourceAuthorityDigest: readFinancePostingDigest(fields.sourceAuthorityDigest),
    occurredAt: readFinancePostingInstant(fields.occurredAt)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) mismatch("evidence_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
