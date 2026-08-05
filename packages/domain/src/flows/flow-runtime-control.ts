import {
  flowCapabilityManifestSchema,
  flowCapabilityManifestV2Schema,
  flowTriggerNodeKindV2Schema,
  type FlowActivationBlocker,
  type FlowCapabilityManifest,
  type FlowCapabilityManifestV2
} from "@elevenhouse/contracts";

import {
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson
} from "../calculations/canonical-json";
import type { FlowActivationTransactionalReadiness } from "./flow-enrollment-control";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUIREMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const MAX_CANARY_OWNERS = 100;
const MAX_REQUIREMENTS = 256;
const MAX_REQUIREMENT_KEY_LENGTH = 240;
const MAX_POLICY_CANONICAL_PREIMAGE_LENGTH = 300_000;
export const FLOW_EXECUTION_SEMANTICS_VERSION = "flow-interpreter.v1" as const;

export type FlowRuntimeMode = "definition_only" | "canary" | "enabled";
export type FlowRuntimeWorkerRole = "enrollment" | "executor" | "external_dispatcher";

export type FlowWorkerRegistration = {
  readonly schemaVersion: "flow-worker-registration.v2";
  readonly sessionId: string;
  readonly instanceId: string;
  readonly roles: readonly FlowRuntimeWorkerRole[];
  readonly maxRuntimeMode: FlowRuntimeMode;
  readonly maxCanaryOwnerSubjectIds: readonly string[];
  readonly requirementKeys: readonly string[];
  readonly deploymentId: string;
  readonly buildId: string;
};

export type FlowWorkerReadinessAuthority = {
  readonly schemaVersion: "flow-worker-readiness-authority.v1";
  readonly instanceId: string;
  readonly sessionId: string;
  readonly state: "ready" | "draining";
  readonly policyRevision: number;
  readonly heartbeatSequence: number;
  readonly heartbeatAt: string;
  readonly readyUntil: string;
  readonly drainingAt: string | null;
};

export type FlowWorkerReadinessStore = {
  readonly register: (
    registration: FlowWorkerRegistration
  ) => Promise<FlowWorkerReadinessAuthority>;
  readonly heartbeat: (identity: {
    readonly instanceId: string;
    readonly sessionId: string;
  }) => Promise<FlowWorkerReadinessAuthority>;
  readonly beginDrain: (identity: {
    readonly instanceId: string;
    readonly sessionId: string;
  }) => Promise<FlowWorkerReadinessAuthority>;
};

export type FlowRuntimeKillSwitchSnapshot = {
  readonly global: boolean;
  readonly ownerSubjectIds: readonly string[];
  readonly capabilityKeys: readonly string[];
};

export type FlowRuntimeRolloutPolicy = {
  readonly schemaVersion: "flow-runtime-rollout-policy.v2";
  readonly revision: number;
  readonly mode: FlowRuntimeMode;
  readonly canaryOwnerSubjectIds: readonly string[];
  readonly allowedRequirementKeys: readonly string[];
  readonly killSwitches: {
    readonly enrollment: FlowRuntimeKillSwitchSnapshot;
    readonly claim: FlowRuntimeKillSwitchSnapshot;
    readonly externalDispatch: FlowRuntimeKillSwitchSnapshot;
  };
  readonly readinessLeaseTtlMs: number;
  readonly tokenLeaseDurationMs: number;
};

export type FlowRuntimeRolloutPolicyEvidence = {
  readonly policy: FlowRuntimeRolloutPolicy;
  readonly canonicalPreimage: string;
  readonly policyDigest: `sha256:${string}`;
};

export type FlowRuntimeControlReader = {
  readonly readCurrent: () => Promise<FlowRuntimeRolloutPolicy>;
};

export type FlowRuntimeOwnerSubject = {
  readonly ownerUserId: string;
  readonly ownerSubjectId: string;
};

export type FlowRuntimeOwnerSubjectStore = {
  readonly resolveOrCreateActive: (input: {
    readonly ownerUserIds: readonly string[];
  }) => Promise<readonly FlowRuntimeOwnerSubject[]>;
};

export type FlowWorkerReadinessLease = {
  readonly schemaVersion: "flow-worker-readiness-lease.v1";
  readonly instanceId: string;
  readonly state: "ready" | "draining";
  readonly policyRevision: number;
  readonly roles: readonly FlowRuntimeWorkerRole[];
  readonly maxRuntimeMode: FlowRuntimeMode;
  readonly maxCanaryOwnerSubjectIds: readonly string[];
  readonly requirementKeys: readonly string[];
  readonly readyUntil: string;
};

export type FlowAutomationQuotaReadiness =
  | {
      readonly kind: "ready";
      readonly limit: number | null;
      readonly activeAllocations: number;
    }
  | { readonly kind: "not_ready" }
  | { readonly kind: "entitlement_unavailable" }
  | {
      readonly kind: "exceeded";
      readonly limit: number;
      readonly activeAllocations: number;
    };

export class FlowRuntimeControlIntegrityError extends Error {
  override readonly name = "FlowRuntimeControlIntegrityError";
  readonly code = "FLOW_RUNTIME_CONTROL_INTEGRITY_ERROR";

  constructor() {
    super("Persisted flow runtime control authority is inconsistent");
  }
}

export class FlowWorkerReadinessLeaseLostError extends Error {
  override readonly name = "FlowWorkerReadinessLeaseLostError";
  readonly code = "FLOW_WORKER_READINESS_LEASE_LOST";

  constructor() {
    super("Flow worker readiness lease is no longer owned by this session");
  }
}

export class FlowWorkerReadinessSessionBusyError extends Error {
  override readonly name = "FlowWorkerReadinessSessionBusyError";
  readonly code = "FLOW_WORKER_READINESS_SESSION_BUSY";

  constructor() {
    super("Another live Flow worker session owns this instance identity");
  }
}

export class FlowWorkerRuntimeModeCeilingError extends Error {
  override readonly name = "FlowWorkerRuntimeModeCeilingError";
  readonly code = "FLOW_WORKER_RUNTIME_MODE_CEILING_EXCEEDED";

  constructor() {
    super("Persisted Flow runtime policy exceeds this worker deployment ceiling");
  }
}

export function createFlowRuntimeRequirementKeys(
  rawManifest: FlowCapabilityManifestV2
): readonly string[] {
  const manifest = flowCapabilityManifestV2Schema.parse(rawManifest);
  return [
    `runtime:${manifest.executionSemanticsVersion}`,
    `trigger:${manifest.triggerMatcher.kind}:${manifest.triggerMatcher.configSchemaVersion}:${manifest.triggerMatcher.matcherContractVersion}:${manifest.triggerMatcher.eventSchemaVersion}`,
    ...manifest.nodeExecutors.map(
      (executor) =>
        `executor:${executor.kind}:${executor.configSchemaVersion}:${executor.executorContractVersion}`
    ),
    ...manifest.requiredCapabilities.map((capability) => `capability:${capability}`)
  ].sort(compareStableText);
}

export function createFlowExecutionRequirementKeys(
  rawManifest: FlowCapabilityManifest
): readonly string[] {
  const manifest = flowCapabilityManifestSchema.parse(rawManifest);
  return [
    `runtime:${manifest.executionSemanticsVersion}`,
    ...manifest.nodeExecutors
      .filter((executor) => !flowTriggerNodeKindV2Schema.safeParse(executor.kind).success)
      .map(
        (executor) =>
          `executor:${executor.kind}:${executor.configSchemaVersion}:${executor.executorContractVersion}`
      ),
    ...manifest.requiredCapabilities.map((capability) => `capability:${capability}`)
  ].sort(compareStableText);
}

export function createFlowExecutionWorkerRequirementKeys(
  executorKeys: readonly string[]
): readonly string[] {
  if (
    executorKeys.length < 1 ||
    executorKeys.length > 200 ||
    new Set(executorKeys).size !== executorKeys.length ||
    executorKeys.some(
      (executorKey) => !/^[a-z][a-z0-9_]*:[1-9][0-9]*:[1-9][0-9]*$/.test(executorKey)
    )
  ) {
    failIntegrity();
  }
  return [
    `runtime:${FLOW_EXECUTION_SEMANTICS_VERSION}`,
    ...executorKeys.map((executorKey) => `executor:${executorKey}`)
  ].sort(compareStableText);
}

export function createFlowBookingEnrollmentWorkerRequirementKeys(): readonly string[] {
  return [
    `runtime:${FLOW_EXECUTION_SEMANTICS_VERSION}`,
    "trigger:booking_confirmed:1:1:1"
  ];
}

export function createFlowRuntimeRolloutPolicyEvidence(
  input: FlowRuntimeRolloutPolicy
): FlowRuntimeRolloutPolicyEvidence {
  const policy = normalizeFlowRuntimeRolloutPolicy(input);
  const payload = flowRuntimeRolloutPolicyPayload(policy);
  const canonicalPreimage = stableJson(payload);
  if (canonicalPreimage.length > MAX_POLICY_CANONICAL_PREIMAGE_LENGTH) {
    failIntegrity();
  }
  return {
    policy,
    canonicalPreimage,
    policyDigest: sha256CanonicalJson(payload)
  };
}

export function verifyFlowRuntimeRolloutPolicyEvidence(
  input: FlowRuntimeRolloutPolicyEvidence
): FlowRuntimeRolloutPolicy {
  const normalizedPolicy = normalizeFlowRuntimeRolloutPolicy(input.policy);
  if (!hasCanonicalPolicyArrays(input.policy, normalizedPolicy)) {
    failIntegrity();
  }
  const expected = createFlowRuntimeRolloutPolicyEvidence(normalizedPolicy);
  if (
    input.canonicalPreimage !== expected.canonicalPreimage ||
    input.policyDigest !== expected.policyDigest
  ) {
    failIntegrity();
  }
  return expected.policy;
}

function normalizeFlowRuntimeRolloutPolicy(
  input: FlowRuntimeRolloutPolicy
): FlowRuntimeRolloutPolicy {
  assertPolicy(input);
  return {
    ...input,
    canaryOwnerSubjectIds: normalizeUuidList(input.canaryOwnerSubjectIds),
    allowedRequirementKeys: [...input.allowedRequirementKeys].sort(compareStableText),
    killSwitches: {
      enrollment: normalizeKillSwitchSnapshot(input.killSwitches.enrollment),
      claim: normalizeKillSwitchSnapshot(input.killSwitches.claim),
      externalDispatch: normalizeKillSwitchSnapshot(input.killSwitches.externalDispatch)
    }
  };
}

function normalizeKillSwitchSnapshot(
  input: FlowRuntimeKillSwitchSnapshot
): FlowRuntimeKillSwitchSnapshot {
  return {
    global: input.global,
    ownerSubjectIds: normalizeUuidList(input.ownerSubjectIds),
    capabilityKeys: [...input.capabilityKeys].sort(compareStableText)
  };
}

function hasCanonicalPolicyArrays(
  input: FlowRuntimeRolloutPolicy,
  normalized: FlowRuntimeRolloutPolicy
): boolean {
  return (
    sameTextList(input.canaryOwnerSubjectIds, normalized.canaryOwnerSubjectIds) &&
    sameTextList(input.allowedRequirementKeys, normalized.allowedRequirementKeys) &&
    sameTextList(
      input.killSwitches.enrollment.ownerSubjectIds,
      normalized.killSwitches.enrollment.ownerSubjectIds
    ) &&
    sameTextList(
      input.killSwitches.enrollment.capabilityKeys,
      normalized.killSwitches.enrollment.capabilityKeys
    ) &&
    sameTextList(
      input.killSwitches.claim.ownerSubjectIds,
      normalized.killSwitches.claim.ownerSubjectIds
    ) &&
    sameTextList(
      input.killSwitches.claim.capabilityKeys,
      normalized.killSwitches.claim.capabilityKeys
    ) &&
    sameTextList(
      input.killSwitches.externalDispatch.ownerSubjectIds,
      normalized.killSwitches.externalDispatch.ownerSubjectIds
    ) &&
    sameTextList(
      input.killSwitches.externalDispatch.capabilityKeys,
      normalized.killSwitches.externalDispatch.capabilityKeys
    )
  );
}

function normalizeUuidList(values: readonly string[]): readonly string[] {
  return values.map((value) => value.toLowerCase()).sort(compareStableText);
}

function sameTextList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function flowRuntimeRolloutPolicyPayload(policy: FlowRuntimeRolloutPolicy): CanonicalJson {
  return {
    schemaVersion: policy.schemaVersion,
    mode: policy.mode,
    canaryOwnerSubjectIds: policy.canaryOwnerSubjectIds,
    allowedRequirementKeys: policy.allowedRequirementKeys,
    killSwitches: {
      enrollment: policy.killSwitches.enrollment,
      claim: policy.killSwitches.claim,
      externalDispatch: policy.killSwitches.externalDispatch
    },
    readinessLeaseTtlMs: policy.readinessLeaseTtlMs,
    tokenLeaseDurationMs: policy.tokenLeaseDurationMs
  } as CanonicalJson;
}

export function createFlowWorkerRegistration(
  input: FlowWorkerRegistration
): FlowWorkerRegistration {
  if (
    input.schemaVersion !== "flow-worker-registration.v2" ||
    !isUuid(input.sessionId) ||
    !isBoundedRuntimeIdentifier(input.instanceId) ||
    input.roles.length < 1 ||
    input.roles.length > 3 ||
    new Set(input.roles).size !== input.roles.length ||
    input.roles.some((role) => !isWorkerRole(role)) ||
    !isRuntimeMode(input.maxRuntimeMode) ||
    !isUniqueUuidList(input.maxCanaryOwnerSubjectIds, MAX_CANARY_OWNERS) ||
    (input.maxRuntimeMode === "canary" && input.maxCanaryOwnerSubjectIds.length === 0) ||
    (input.maxRuntimeMode !== "canary" && input.maxCanaryOwnerSubjectIds.length !== 0) ||
    !isUniqueRequirementList(input.requirementKeys, true) ||
    !isBoundedRuntimeIdentifier(input.deploymentId) ||
    !isBoundedRuntimeIdentifier(input.buildId)
  ) {
    failIntegrity();
  }
  return {
    ...input,
    sessionId: input.sessionId.toLowerCase(),
    roles: [...input.roles].sort(compareStableText),
    maxCanaryOwnerSubjectIds: normalizeUuidList(input.maxCanaryOwnerSubjectIds),
    requirementKeys: [...input.requirementKeys].sort(compareStableText)
  };
}

export function createFlowWorkerRegistrationDigest(
  input: FlowWorkerRegistration
): `sha256:${string}` {
  const registration = createFlowWorkerRegistration(input);
  return sha256CanonicalJson({
    schemaVersion: registration.schemaVersion,
    sessionId: registration.sessionId,
    instanceId: registration.instanceId,
    roles: registration.roles,
    maxRuntimeMode: registration.maxRuntimeMode,
    maxCanaryOwnerSubjectIds: registration.maxCanaryOwnerSubjectIds,
    requirementKeys: registration.requirementKeys,
    deploymentId: registration.deploymentId,
    buildId: registration.buildId
  } as CanonicalJson);
}

export function parseFlowWorkerReadinessAuthority(
  input: FlowWorkerReadinessAuthority
): FlowWorkerReadinessAuthority {
  if (
    input.schemaVersion !== "flow-worker-readiness-authority.v1" ||
    !isBoundedRuntimeIdentifier(input.instanceId) ||
    !isUuid(input.sessionId) ||
    (input.state !== "ready" && input.state !== "draining") ||
    !isPositiveInteger(input.policyRevision) ||
    !isPositiveInteger(input.heartbeatSequence) ||
    !isInstant(input.heartbeatAt) ||
    !isInstant(input.readyUntil) ||
    (input.drainingAt !== null && !isInstant(input.drainingAt)) ||
    (input.state === "ready" &&
      (input.drainingAt !== null ||
        Date.parse(input.readyUntil) <= Date.parse(input.heartbeatAt))) ||
    (input.state === "draining" &&
      (input.drainingAt === null ||
        input.readyUntil !== input.drainingAt ||
        input.heartbeatAt !== input.drainingAt))
  ) {
    failIntegrity();
  }
  return input;
}

export type FlowRuntimeEnrollmentAdmission =
  | {
      readonly kind: "allowed";
      readonly policyRevision: number;
    }
  | {
      readonly kind: "deferred";
      readonly policyRevision: number;
      readonly reasonCode:
        | "FLOW_RUNTIME_ROLLOUT_DISABLED"
        | "FLOW_RUNTIME_OWNER_NOT_IN_CANARY"
        | "FLOW_RUNTIME_REQUIREMENT_NOT_ALLOWED"
        | "FLOW_RUNTIME_ENROLLMENT_KILL_SWITCH_ENGAGED"
        | "FLOW_RUNTIME_ENROLLMENT_WORKER_NOT_READY";
    };

export function evaluateFlowRuntimeEnrollmentAdmission(input: {
  readonly policy: FlowRuntimeRolloutPolicy;
  readonly ownerSubjectId: string;
  readonly requirementKeys: readonly string[];
  readonly workerLease: FlowWorkerReadinessLease;
  readonly checkedAt: string;
}): FlowRuntimeEnrollmentAdmission {
  if (
    !isUuid(input.ownerSubjectId) ||
    !isUniqueRequirementList(input.requirementKeys, true) ||
    !isInstant(input.checkedAt)
  ) {
    failIntegrity();
  }
  assertPolicy(input.policy);
  assertWorkerLease(input.workerLease);
  const deferred = (
    reasonCode: Extract<FlowRuntimeEnrollmentAdmission, { readonly kind: "deferred" }>["reasonCode"]
  ): FlowRuntimeEnrollmentAdmission => ({
    kind: "deferred",
    policyRevision: input.policy.revision,
    reasonCode
  });

  if (input.policy.mode === "definition_only") {
    return deferred("FLOW_RUNTIME_ROLLOUT_DISABLED");
  }
  if (
    input.policy.mode === "canary" &&
    !input.policy.canaryOwnerSubjectIds.includes(input.ownerSubjectId)
  ) {
    return deferred("FLOW_RUNTIME_OWNER_NOT_IN_CANARY");
  }
  if (
    input.requirementKeys.some(
      (requirementKey) => !input.policy.allowedRequirementKeys.includes(requirementKey)
    )
  ) {
    return deferred("FLOW_RUNTIME_REQUIREMENT_NOT_ALLOWED");
  }

  const enrollmentKillSwitch = input.policy.killSwitches.enrollment;
  if (
    enrollmentKillSwitch.global ||
    enrollmentKillSwitch.ownerSubjectIds.includes(input.ownerSubjectId) ||
    enrollmentKillSwitch.capabilityKeys.some((requirementKey) =>
      input.requirementKeys.includes(requirementKey)
    )
  ) {
    return deferred("FLOW_RUNTIME_ENROLLMENT_KILL_SWITCH_ENGAGED");
  }

  const enrollmentRequirementKeys = input.requirementKeys.filter(
    (requirementKey) =>
      requirementKey.startsWith("runtime:") || requirementKey.startsWith("trigger:")
  );
  const workerAdmitsPolicyMode =
    input.policy.mode === "enabled"
      ? input.workerLease.maxRuntimeMode === "enabled"
      : input.workerLease.maxRuntimeMode !== "definition_only";
  if (
    input.workerLease.state !== "ready" ||
    input.workerLease.policyRevision !== input.policy.revision ||
    Date.parse(input.workerLease.readyUntil) <= Date.parse(input.checkedAt) ||
    !input.workerLease.roles.includes("enrollment") ||
    !workerAdmitsPolicyMode ||
    !deploymentAdmitsOwner(input.workerLease, input.ownerSubjectId) ||
    enrollmentRequirementKeys.some(
      (requirementKey) => !input.workerLease.requirementKeys.includes(requirementKey)
    )
  ) {
    return deferred("FLOW_RUNTIME_ENROLLMENT_WORKER_NOT_READY");
  }

  return { kind: "allowed", policyRevision: input.policy.revision };
}

export function evaluateFlowActivationRuntimeControl(input: {
  readonly flowId: string;
  readonly ownerUserId: string;
  readonly ownerSubjectId: string;
  readonly versionId: string;
  readonly definitionRevision: number;
  readonly enrollmentRevision: number;
  readonly expectedActiveVersionId: string | null;
  readonly manifest: FlowCapabilityManifestV2;
  readonly policy: FlowRuntimeRolloutPolicy;
  readonly workerLeases: readonly FlowWorkerReadinessLease[];
  readonly quota: FlowAutomationQuotaReadiness;
  readonly checkedAt: string;
}): FlowActivationTransactionalReadiness {
  assertAuthorityInput(input);
  const requirementKeys = createFlowRuntimeRequirementKeys(input.manifest);
  const rolloutBlockers = policyBlockers(input.policy, input.ownerSubjectId, requirementKeys);
  if (rolloutBlockers.length > 0) return readiness(input, rolloutBlockers);

  const blockers = [
    ...killSwitchBlockers(input.policy.killSwitches, input.ownerSubjectId, requirementKeys),
    ...workerReadinessBlockers({
      leases: input.workerLeases,
      ownerSubjectId: input.ownerSubjectId,
      policyRevision: input.policy.revision,
      requirementKeys,
      checkedAt: input.checkedAt
    }),
    ...quotaBlockers(input.quota)
  ];
  return readiness(input, uniqueSortedBlockers(blockers));
}

function readiness(
  input: Parameters<typeof evaluateFlowActivationRuntimeControl>[0],
  blockers: readonly FlowActivationBlocker[]
): FlowActivationTransactionalReadiness {
  return {
    schemaVersion: "flow-activation-transaction-readiness.v1",
    flowId: input.flowId,
    versionId: input.versionId,
    definitionRevision: input.definitionRevision,
    enrollmentRevision: input.enrollmentRevision,
    expectedActiveVersionId: input.expectedActiveVersionId,
    runtimeMode: input.policy.mode,
    rolloutPolicyRevision: input.policy.revision,
    checkedAt: input.checkedAt,
    decision: blockers.length === 0 ? "ready" : "blocked",
    blockers
  };
}

function policyBlockers(
  policy: FlowRuntimeRolloutPolicy,
  ownerSubjectId: string,
  requirementKeys: readonly string[]
): readonly FlowActivationBlocker[] {
  if (policy.mode === "definition_only") {
    return [blocker("FLOW_RUNTIME_ROLLOUT_DISABLED", "runtime.rollout.mode")];
  }
  if (policy.mode === "canary" && !policy.canaryOwnerSubjectIds.includes(ownerSubjectId)) {
    return [blocker("FLOW_RUNTIME_OWNER_NOT_IN_CANARY", "runtime.rollout.canaryOwnerSubjects")];
  }
  return requirementKeys
    .filter((requirementKey) => !policy.allowedRequirementKeys.includes(requirementKey))
    .map((requirementKey) =>
      blocker(
        requirementBlockerCode(requirementKey),
        `runtime.rollout.allowedRequirements.${requirementKey}`,
        requirementKey
      )
    );
}

function killSwitchBlockers(
  switches: FlowRuntimeRolloutPolicy["killSwitches"],
  ownerSubjectId: string,
  requirementKeys: readonly string[]
): readonly FlowActivationBlocker[] {
  return (["enrollment", "claim"] as const).flatMap((action) => {
    const control = switches[action];
    if (control.global) {
      return [blocker("FLOW_RUNTIME_KILL_SWITCH_ENGAGED", `runtime.killSwitches.${action}.global`)];
    }
    if (control.ownerSubjectIds.includes(ownerSubjectId)) {
      return [blocker("FLOW_RUNTIME_KILL_SWITCH_ENGAGED", `runtime.killSwitches.${action}.owner`)];
    }
    return control.capabilityKeys
      .filter((capabilityKey) => requirementKeys.includes(capabilityKey))
      .map((capabilityKey) =>
        blocker(
          "FLOW_RUNTIME_KILL_SWITCH_ENGAGED",
          `runtime.killSwitches.${action}.capability`,
          capabilityKey
        )
      );
  });
}

function workerReadinessBlockers(input: {
  readonly leases: readonly FlowWorkerReadinessLease[];
  readonly ownerSubjectId: string;
  readonly policyRevision: number;
  readonly requirementKeys: readonly string[];
  readonly checkedAt: string;
}): readonly FlowActivationBlocker[] {
  const checkedAt = Date.parse(input.checkedAt);
  const eligible = input.leases.filter(
    (lease) =>
      lease.state === "ready" &&
      lease.policyRevision === input.policyRevision &&
      Date.parse(lease.readyUntil) > checkedAt &&
      deploymentAdmitsOwner(lease, input.ownerSubjectId)
  );
  const enrollmentRequirements = input.requirementKeys.filter(
    (requirement) => requirement.startsWith("runtime:") || requirement.startsWith("trigger:")
  );
  const executorRequirements = input.requirementKeys.filter(
    (requirement) => !requirement.startsWith("trigger:")
  );

  return [
    ...roleReadinessBlockers({
      role: "enrollment",
      eligible,
      requirementKeys: enrollmentRequirements
    }),
    ...roleReadinessBlockers({
      role: "executor",
      eligible,
      requirementKeys: executorRequirements
    })
  ];
}

function roleReadinessBlockers(input: {
  readonly role: "enrollment" | "executor";
  readonly eligible: readonly FlowWorkerReadinessLease[];
  readonly requirementKeys: readonly string[];
}): readonly FlowActivationBlocker[] {
  const roleLeases = input.eligible.filter((lease) => lease.roles.includes(input.role));
  if (
    roleLeases.some((lease) =>
      input.requirementKeys.every((requirement) => lease.requirementKeys.includes(requirement))
    )
  ) {
    return [];
  }

  const missingEverywhere = input.requirementKeys.filter(
    (requirement) => !roleLeases.some((lease) => lease.requirementKeys.includes(requirement))
  );
  return [
    blocker(
      "FLOW_EXECUTION_WORKER_NOT_READY",
      `runtime.workers.${input.role}.singleWorkerCoverage`
    ),
    ...missingEverywhere.map((requirement) =>
      blocker(
        requirementBlockerCode(requirement),
        `runtime.workers.${input.role}.requirements.${requirement}`,
        requirement
      )
    )
  ];
}

function deploymentAdmitsOwner(lease: FlowWorkerReadinessLease, ownerSubjectId: string): boolean {
  if (lease.maxRuntimeMode === "definition_only") return false;
  if (lease.maxRuntimeMode === "enabled") return true;
  return lease.maxCanaryOwnerSubjectIds.includes(ownerSubjectId);
}

function requirementBlockerCode(requirementKey: string): FlowActivationBlocker["code"] {
  if (requirementKey.startsWith("trigger:")) return "FLOW_TRIGGER_MATCHER_NOT_READY";
  if (requirementKey.startsWith("executor:")) return "FLOW_NODE_EXECUTOR_NOT_READY";
  if (requirementKey.startsWith("capability:")) return "FLOW_REQUIRED_CAPABILITY_NOT_READY";
  return "FLOW_EXECUTION_WORKER_NOT_READY";
}

function quotaBlockers(quota: FlowAutomationQuotaReadiness): readonly FlowActivationBlocker[] {
  if (quota.kind === "ready") return [];
  if (quota.kind === "not_ready") {
    return [blocker("FLOW_AUTOMATION_QUOTA_NOT_READY", "runtime.quota")];
  }
  if (quota.kind === "entitlement_unavailable") {
    return [blocker("FLOW_ENTITLEMENT_UNAVAILABLE", "runtime.quota")];
  }
  return [blocker("FLOW_AUTOMATION_QUOTA_EXCEEDED", "runtime.quota")];
}

function blocker(
  code: FlowActivationBlocker["code"],
  path: string,
  capabilityKey: string | null = null
): FlowActivationBlocker {
  return { code, path, capabilityKey };
}

function uniqueSortedBlockers(
  blockers: readonly FlowActivationBlocker[]
): readonly FlowActivationBlocker[] {
  const unique = new Map<string, FlowActivationBlocker>();
  for (const candidate of blockers) {
    unique.set(
      `${candidate.path}\u0000${candidate.code}\u0000${candidate.capabilityKey ?? ""}`,
      candidate
    );
  }
  return [...unique.values()].sort((left, right) =>
    compareStableText(
      `${left.path}:${left.code}:${left.capabilityKey ?? ""}`,
      `${right.path}:${right.code}:${right.capabilityKey ?? ""}`
    )
  );
}

function assertAuthorityInput(
  input: Parameters<typeof evaluateFlowActivationRuntimeControl>[0]
): void {
  if (
    !isUuid(input.flowId) ||
    !isUuid(input.ownerUserId) ||
    !isUuid(input.ownerSubjectId) ||
    !isUuid(input.versionId) ||
    !isPositiveInteger(input.definitionRevision) ||
    !isNonNegativeInteger(input.enrollmentRevision) ||
    (input.expectedActiveVersionId !== null && !isUuid(input.expectedActiveVersionId)) ||
    !isInstant(input.checkedAt)
  ) {
    failIntegrity();
  }
  assertPolicy(input.policy);
  input.workerLeases.forEach(assertWorkerLease);
  assertQuota(input.quota);
}

function assertPolicy(policy: FlowRuntimeRolloutPolicy): void {
  if (
    policy.schemaVersion !== "flow-runtime-rollout-policy.v2" ||
    !isPositiveInteger(policy.revision) ||
    !isRuntimeMode(policy.mode) ||
    !isUniqueUuidList(policy.canaryOwnerSubjectIds, MAX_CANARY_OWNERS) ||
    (policy.mode === "canary" && policy.canaryOwnerSubjectIds.length === 0) ||
    (policy.mode !== "canary" && policy.canaryOwnerSubjectIds.length !== 0) ||
    !isUniqueRequirementList(policy.allowedRequirementKeys, policy.mode !== "definition_only") ||
    !Number.isInteger(policy.readinessLeaseTtlMs) ||
    policy.readinessLeaseTtlMs < 5_000 ||
    policy.readinessLeaseTtlMs > 60_000 ||
    !Number.isInteger(policy.tokenLeaseDurationMs) ||
    policy.tokenLeaseDurationMs < 5_000 ||
    policy.tokenLeaseDurationMs > 300_000
  ) {
    failIntegrity();
  }
  assertKillSwitchSnapshot(policy.killSwitches.enrollment);
  assertKillSwitchSnapshot(policy.killSwitches.claim);
  assertKillSwitchSnapshot(policy.killSwitches.externalDispatch);
}

function assertKillSwitchSnapshot(control: FlowRuntimeKillSwitchSnapshot): void {
  if (
    typeof control?.global !== "boolean" ||
    !isUniqueUuidList(control.ownerSubjectIds, MAX_CANARY_OWNERS) ||
    !isUniqueRequirementList(control.capabilityKeys, false)
  ) {
    failIntegrity();
  }
}

function assertWorkerLease(lease: FlowWorkerReadinessLease): void {
  if (
    lease.schemaVersion !== "flow-worker-readiness-lease.v1" ||
    typeof lease.instanceId !== "string" ||
    lease.instanceId.length < 1 ||
    lease.instanceId.length > 180 ||
    !INSTANCE_ID_PATTERN.test(lease.instanceId) ||
    (lease.state !== "ready" && lease.state !== "draining") ||
    !isPositiveInteger(lease.policyRevision) ||
    lease.roles.length < 1 ||
    lease.roles.length > 3 ||
    new Set(lease.roles).size !== lease.roles.length ||
    lease.roles.some((role) => !isWorkerRole(role)) ||
    !isRuntimeMode(lease.maxRuntimeMode) ||
    !isUniqueUuidList(lease.maxCanaryOwnerSubjectIds, MAX_CANARY_OWNERS) ||
    (lease.maxRuntimeMode === "canary" && lease.maxCanaryOwnerSubjectIds.length === 0) ||
    (lease.maxRuntimeMode !== "canary" && lease.maxCanaryOwnerSubjectIds.length !== 0) ||
    !isUniqueRequirementList(lease.requirementKeys, true) ||
    !isInstant(lease.readyUntil)
  ) {
    failIntegrity();
  }
}

function assertQuota(quota: FlowAutomationQuotaReadiness): void {
  if (quota.kind === "not_ready" || quota.kind === "entitlement_unavailable") return;
  if (
    quota.kind === "ready" &&
    (quota.limit === null || isPositiveInteger(quota.limit)) &&
    isNonNegativeInteger(quota.activeAllocations)
  ) {
    return;
  }
  if (
    quota.kind === "exceeded" &&
    isPositiveInteger(quota.limit) &&
    isNonNegativeInteger(quota.activeAllocations) &&
    quota.activeAllocations >= quota.limit
  ) {
    return;
  }
  failIntegrity();
}

function isRuntimeMode(value: unknown): value is FlowRuntimeMode {
  return value === "definition_only" || value === "canary" || value === "enabled";
}

function isWorkerRole(value: unknown): value is FlowRuntimeWorkerRole {
  return value === "enrollment" || value === "executor" || value === "external_dispatcher";
}

function isBoundedRuntimeIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 180 &&
    INSTANCE_ID_PATTERN.test(value)
  );
}

function isUniqueRequirementList(value: readonly string[], requireNonEmpty: boolean): boolean {
  return (
    Array.isArray(value) &&
    (!requireNonEmpty || value.length > 0) &&
    value.length <= MAX_REQUIREMENTS &&
    new Set(value).size === value.length &&
    value.every(isRequirementKey)
  );
}

function isRequirementKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MAX_REQUIREMENT_KEY_LENGTH &&
    REQUIREMENT_KEY_PATTERN.test(value)
  );
}

function isUniqueUuidList(value: readonly string[], maximum: number): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    new Set(value.map((candidate) => candidate.toLowerCase())).size === value.length &&
    value.every(isUuid)
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function failIntegrity(): never {
  throw new FlowRuntimeControlIntegrityError();
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
