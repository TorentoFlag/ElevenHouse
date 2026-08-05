/* eslint-disable no-control-regex -- Domain validation intentionally rejects ASCII control characters. */
import {
  financeOperationKindValues,
  type FinanceOperationKind
} from "@elevenhouse/contracts";

import {
  canonicalizeFinanceCommandPayload
} from "../finance-authorization/canonical-command-payload";
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import type { FinanceDigest, ResolvedFinanceOperationEnvelope } from "./ports/finance-port-types";

const maximumPostgresInteger = 2_147_483_647;
const maximumDecimalDigits = 38;
const operationKinds = new Set<string>(financeOperationKindValues);

export type FinanceOperationResourcePolicy = Readonly<{
  policyId: string;
  version: number;
  operationKind: FinanceOperationKind;
  maximumRows: number;
  maximumDecimalDigits: number;
  maximumArtifactBytes: number;
  canonicalDigest: FinanceDigest;
}>;

export type FinanceOperationResourcePolicyLifecycle = "draft" | "published" | "retired";

export type FinanceOperationResourcePolicyVersion = Readonly<{
  policy: FinanceOperationResourcePolicy;
  draftRevision: number;
  lifecycle: FinanceOperationResourcePolicyLifecycle;
}>;

export type FinanceOperationResourcePolicyDraftInput = Omit<
  FinanceOperationResourcePolicy,
  "canonicalDigest"
>;

export class FinanceOperationResourcePolicyError extends Error {
  readonly code = "FINANCE_OPERATION_RESOURCE_POLICY_ERROR" as const;

  constructor(
    readonly reason:
      | "invalid_policy"
      | "draft_revision_conflict"
      | "lifecycle_transition_invalid"
      | "policy_not_published"
      | "operation_kind_mismatch"
  ) {
    super("Finance operation resource policy validation failed");
    this.name = "FinanceOperationResourcePolicyError";
  }
}

/** Creates a server-owned draft. No public request may provide a resolved envelope directly. */
export function createFinanceOperationResourcePolicyDraft(
  input: FinanceOperationResourcePolicyDraftInput
): FinanceOperationResourcePolicyVersion {
  return createVersion(input, 1, "draft");
}

/** The draft revision is the administrative optimistic-lock token. */
export function reviseFinanceOperationResourcePolicyDraft(input: Readonly<{
  current: FinanceOperationResourcePolicyVersion;
  expectedDraftRevision: number;
  next: FinanceOperationResourcePolicyDraftInput;
}>): FinanceOperationResourcePolicyVersion {
  const current = verifyFinanceOperationResourcePolicyVersion(input.current);
  if (
    current.lifecycle !== "draft" ||
    current.draftRevision !== input.expectedDraftRevision ||
    input.next.policyId !== current.policy.policyId ||
    input.next.version !== current.policy.version ||
    input.next.operationKind !== current.policy.operationKind
  ) {
    fail("draft_revision_conflict");
  }
  return createVersion(input.next, current.draftRevision + 1, "draft");
}

/** Published policy versions are immutable sources for persisted provider-operation envelopes. */
export function publishFinanceOperationResourcePolicyDraft(
  draft: FinanceOperationResourcePolicyVersion
): FinanceOperationResourcePolicyVersion {
  const verified = verifyFinanceOperationResourcePolicyVersion(draft);
  if (verified.lifecycle !== "draft") fail("lifecycle_transition_invalid");
  return Object.freeze({ ...verified, lifecycle: "published" as const });
}

export function retirePublishedFinanceOperationResourcePolicyVersion(
  published: FinanceOperationResourcePolicyVersion
): FinanceOperationResourcePolicyVersion {
  const verified = verifyFinanceOperationResourcePolicyVersion(published);
  if (verified.lifecycle !== "published") fail("lifecycle_transition_invalid");
  return Object.freeze({ ...verified, lifecycle: "retired" as const });
}

/**
 * This is the sole domain construction point for the nominal envelope. A caller can select only
 * a published, operation-specific policy that a trusted server-side reader loaded.
 */
export function resolveFinanceOperationEnvelope(input: Readonly<{
  policy: FinanceOperationResourcePolicyVersion;
  operationKind: FinanceOperationKind;
}>): ResolvedFinanceOperationEnvelope {
  const policy = verifyFinanceOperationResourcePolicyVersion(input.policy);
  if (policy.lifecycle !== "published") fail("policy_not_published");
  if (policy.policy.operationKind !== input.operationKind) fail("operation_kind_mismatch");
  return Object.freeze({
    kind: "resolved_finance_operation_envelope" as const,
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.version,
    policyDigest: policy.policy.canonicalDigest,
    maximumRows: policy.policy.maximumRows,
    maximumDecimalDigits: policy.policy.maximumDecimalDigits,
    maximumArtifactBytes: policy.policy.maximumArtifactBytes
  }) as ResolvedFinanceOperationEnvelope;
}

/** Rehydrates a persisted policy only when its canonical terms and lifecycle are trustworthy. */
export function verifyFinanceOperationResourcePolicyVersion(
  input: FinanceOperationResourcePolicyVersion
): FinanceOperationResourcePolicyVersion {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (input.lifecycle !== "draft" && input.lifecycle !== "published" && input.lifecycle !== "retired") ||
    !Number.isSafeInteger(input.draftRevision) ||
    input.draftRevision < 1
  ) {
    fail("invalid_policy");
  }
  const policy = normalizePolicy(input.policy);
  if (policy.canonicalDigest !== input.policy.canonicalDigest) fail("invalid_policy");
  return Object.freeze({ policy, draftRevision: input.draftRevision, lifecycle: input.lifecycle });
}

/** Exact canonical preimage stored with the digest for independently auditable rehydration. */
export function canonicalizeFinanceOperationResourcePolicy(
  input: Omit<FinanceOperationResourcePolicy, "canonicalDigest"> | FinanceOperationResourcePolicy
): string {
  return new TextDecoder().decode(
    canonicalizeFinanceCommandPayload(
      policyTerms(normalizePolicy({ ...input, canonicalDigest: "sha256:" as FinanceDigest }))
    )
  );
}

function createVersion(
  input: FinanceOperationResourcePolicyDraftInput,
  draftRevision: number,
  lifecycle: FinanceOperationResourcePolicyLifecycle
): FinanceOperationResourcePolicyVersion {
  const policy = normalizePolicy({ ...input, canonicalDigest: "sha256:" as FinanceDigest });
  return Object.freeze({ policy, draftRevision, lifecycle });
}

function normalizePolicy(input: FinanceOperationResourcePolicy): FinanceOperationResourcePolicy {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("invalid_policy");
  const policyId = normalizeIdentifier(input.policyId);
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    !operationKinds.has(input.operationKind) ||
    !positivePostgresInteger(input.maximumRows) ||
    !Number.isSafeInteger(input.maximumDecimalDigits) ||
    input.maximumDecimalDigits < 1 ||
    input.maximumDecimalDigits > maximumDecimalDigits ||
    !positivePostgresInteger(input.maximumArtifactBytes)
  ) {
    fail("invalid_policy");
  }
  const terms = policyTerms({
    policyId,
    version: input.version,
    operationKind: input.operationKind,
    maximumRows: input.maximumRows,
    maximumDecimalDigits: input.maximumDecimalDigits,
    maximumArtifactBytes: input.maximumArtifactBytes
  });
  return Object.freeze({ ...terms, canonicalDigest: digestFinanceCanonicalValueV1(terms) });
}

function policyTerms(input: Omit<FinanceOperationResourcePolicy, "canonicalDigest">) {
  return {
    policyId: input.policyId,
    version: input.version,
    operationKind: input.operationKind,
    maximumRows: input.maximumRows,
    maximumDecimalDigits: input.maximumDecimalDigits,
    maximumArtifactBytes: input.maximumArtifactBytes
  } as const;
}

function normalizeIdentifier(value: unknown): string {
  if (typeof value !== "string") fail("invalid_policy");
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail("invalid_policy");
  }
  return normalized;
}

function positivePostgresInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= maximumPostgresInteger
  );
}

function fail(reason: FinanceOperationResourcePolicyError["reason"]): never {
  throw new FinanceOperationResourcePolicyError(reason);
}
