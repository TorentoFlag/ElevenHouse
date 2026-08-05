import {
  platformPlanFeatureCodeValues,
  type PlatformPlanFeatureCode
} from "@elevenhouse/contracts";
import {
  collectPlatformCapabilityGuardRegistryIssues,
  derivePlatformCapabilityEnforcement,
  platformCapabilityCounterFingerprint,
  platformCapabilityGuardDeclarations,
  platformCapabilityManifest,
  platformUnresolvedCapabilitySurfaces,
  type PlatformCapabilityGuardDeclaration,
  type PlatformCapabilityManifestEntry,
  type PlatformCapabilityUnresolvedOperation
} from "./platform-capability-manifest";
import type { PlatformPlan } from "./platform-billing-types";

export type PlatformPlanPublicationCandidate = Pick<
  PlatformPlan,
  "features" | "seatsLimit" | "bookingsLimit" | "aiRequestsLimit" | "automationLimit"
>;

export type PlatformPlanQuotaField =
  | "seatsLimit"
  | "bookingsLimit"
  | "aiRequestsLimit"
  | "automationLimit";
export type PlatformPlanCounterCode = "seats" | "bookings" | "ai_requests" | "automations";

export type PlatformPlanQuotaBinding =
  | {
      readonly field: "seatsLimit";
      readonly capability: "team";
      readonly counterCode: "seats";
      readonly mode: "structural_only";
      readonly maximum: 1;
    }
  | {
      readonly field: "bookingsLimit";
      readonly capability: "calendar";
      readonly counterCode: "bookings";
      readonly mode: "counter_backed";
    }
  | {
      readonly field: "aiRequestsLimit";
      readonly capability: "ai";
      readonly counterCode: "ai_requests";
      readonly mode: "counter_backed";
    }
  | {
      readonly field: "automationLimit";
      readonly capability: "funnels";
      readonly counterCode: "automations";
      readonly mode: "counter_backed";
    };

export type PlatformPlanCounterBackedQuotaBinding = Exclude<
  PlatformPlanQuotaBinding,
  { readonly mode: "structural_only" }
>;

export const platformPlanQuotaBindings = {
  seatsLimit: {
    field: "seatsLimit",
    capability: "team",
    counterCode: "seats",
    mode: "structural_only",
    maximum: 1
  },
  bookingsLimit: {
    field: "bookingsLimit",
    capability: "calendar",
    counterCode: "bookings",
    mode: "counter_backed"
  },
  aiRequestsLimit: {
    field: "aiRequestsLimit",
    capability: "ai",
    counterCode: "ai_requests",
    mode: "counter_backed"
  },
  automationLimit: {
    field: "automationLimit",
    capability: "funnels",
    counterCode: "automations",
    mode: "counter_backed"
  }
} as const satisfies Readonly<Record<PlatformPlanQuotaField, PlatformPlanQuotaBinding>>;

export type PlatformPlanPublicationIssueCode =
  | "duplicate_capability"
  | "capability_partial"
  | "capability_absent"
  | "capability_enforcement_unwired"
  | "capability_prerequisite_missing"
  | "shared_capability_owner_missing"
  | "unresolved_operation_mapping"
  | "seats_limit_exceeds_structural_max"
  | "quota_capability_missing"
  | "quota_counter_declaration_invalid"
  | "quota_counter_unavailable";

type PublicationIssue<
  Code extends PlatformPlanPublicationIssueCode,
  Path extends readonly (string | number)[]
> = {
  readonly code: Code;
  readonly path: Path;
  readonly message: string;
};

type QuotaCapabilityPath =
  | readonly ["bookingsLimit", "capability", "calendar"]
  | readonly ["aiRequestsLimit", "capability", "ai"]
  | readonly ["automationLimit", "capability", "funnels"];

type QuotaCounterPath =
  | readonly ["bookingsLimit", "counter", "bookings"]
  | readonly ["aiRequestsLimit", "counter", "ai_requests"]
  | readonly ["automationLimit", "counter", "automations"];

export type PlatformPlanPublicationIssue =
  | PublicationIssue<"duplicate_capability", readonly ["features", PlatformPlanFeatureCode]>
  | PublicationIssue<"capability_partial", readonly ["features", PlatformPlanFeatureCode]>
  | PublicationIssue<"capability_absent", readonly ["features", PlatformPlanFeatureCode]>
  | PublicationIssue<
      "capability_enforcement_unwired",
      readonly ["features", PlatformPlanFeatureCode]
    >
  | PublicationIssue<
      "capability_prerequisite_missing",
      readonly [
        "features",
        PlatformPlanFeatureCode,
        "requiredCapabilities",
        PlatformPlanFeatureCode
      ]
    >
  | PublicationIssue<
      "shared_capability_owner_missing",
      readonly ["features", PlatformPlanFeatureCode, "operationOwnership"]
    >
  | PublicationIssue<
      "unresolved_operation_mapping",
      readonly ["features", "unresolvedMappingRefs", string]
    >
  | PublicationIssue<"seats_limit_exceeds_structural_max", readonly ["seatsLimit"]>
  | PublicationIssue<"quota_capability_missing", QuotaCapabilityPath>
  | PublicationIssue<"quota_counter_declaration_invalid", QuotaCounterPath>
  | PublicationIssue<"quota_counter_unavailable", QuotaCounterPath>;

export type PlatformPlanPublicationRegistry = {
  readonly manifest: Readonly<Record<PlatformPlanFeatureCode, PlatformCapabilityManifestEntry>>;
  readonly guardDeclarations: readonly PlatformCapabilityGuardDeclaration[];
  readonly unresolvedSurfaces: readonly PlatformCapabilityUnresolvedOperation[];
};

export const platformPlanPublicationRegistry: PlatformPlanPublicationRegistry = {
  manifest: platformCapabilityManifest,
  guardDeclarations: platformCapabilityGuardDeclarations,
  unresolvedSurfaces: platformUnresolvedCapabilitySurfaces
};

const counterBackedQuotaBindings = [
  platformPlanQuotaBindings.bookingsLimit,
  platformPlanQuotaBindings.aiRequestsLimit,
  platformPlanQuotaBindings.automationLimit
] as const satisfies readonly PlatformPlanCounterBackedQuotaBinding[];

const counterReadinessIssue = (
  binding: PlatformPlanCounterBackedQuotaBinding,
  registry: PlatformPlanPublicationRegistry
): "quota_counter_declaration_invalid" | "quota_counter_unavailable" | null => {
  const counterMatches = Object.values(registry.manifest).flatMap((entry) =>
    entry.usageCounters
      .filter((counter) => counter.code === binding.counterCode)
      .map((counter) => ({ entry, counter }))
  );
  if (counterMatches.length !== 1) return "quota_counter_declaration_invalid";

  const match = counterMatches[0];
  if (!match || match.entry.code !== binding.capability) {
    return "quota_counter_declaration_invalid";
  }

  const guardRegistryIssues = collectPlatformCapabilityGuardRegistryIssues(
    registry.guardDeclarations,
    Object.values(registry.manifest)
  );
  if (guardRegistryIssues.length > 0) return "quota_counter_declaration_invalid";

  const expectedSurfaceId = `counter.${binding.capability}.${binding.counterCode}`;
  const expectedCounterFingerprint = platformCapabilityCounterFingerprint(match.counter);
  const exactDeclarations = registry.guardDeclarations.filter(
    (declaration) =>
      declaration.kind === "usage_counter" &&
      declaration.surfaceId === expectedSurfaceId &&
      declaration.ownerModule === match.entry.owner.module &&
      declaration.capability === binding.capability &&
      declaration.counterFingerprint === expectedCounterFingerprint
  );
  if (exactDeclarations.length > 1) return "quota_counter_declaration_invalid";
  if (
    exactDeclarations.length === 0 ||
    match.counter.availability === "unwired" ||
    match.counter.publicationBlocker
  ) {
    return "quota_counter_unavailable";
  }
  return null;
};

const quotaCapabilityMissingIssue = (
  binding: PlatformPlanCounterBackedQuotaBinding
): PlatformPlanPublicationIssue => {
  switch (binding.field) {
    case "bookingsLimit":
      return {
        code: "quota_capability_missing",
        path: ["bookingsLimit", "capability", "calendar"],
        message: 'bookingsLimit requires capability "calendar".'
      };
    case "aiRequestsLimit":
      return {
        code: "quota_capability_missing",
        path: ["aiRequestsLimit", "capability", "ai"],
        message: 'aiRequestsLimit requires capability "ai".'
      };
    case "automationLimit":
      return {
        code: "quota_capability_missing",
        path: ["automationLimit", "capability", "funnels"],
        message: 'automationLimit requires capability "funnels".'
      };
  }
};

const quotaCounterIssue = (
  binding: PlatformPlanCounterBackedQuotaBinding,
  code: "quota_counter_declaration_invalid" | "quota_counter_unavailable"
): PlatformPlanPublicationIssue => {
  const message =
    code === "quota_counter_declaration_invalid"
      ? `${binding.field} counter "${binding.counterCode}" has an invalid declaration.`
      : `${binding.field} counter "${binding.counterCode}" is not publication-ready.`;
  switch (binding.field) {
    case "bookingsLimit":
      return { code, path: ["bookingsLimit", "counter", "bookings"], message };
    case "aiRequestsLimit":
      return { code, path: ["aiRequestsLimit", "counter", "ai_requests"], message };
    case "automationLimit":
      return { code, path: ["automationLimit", "counter", "automations"], message };
  }
};

export function collectPlatformPlanPublicationIssues(
  candidate: PlatformPlanPublicationCandidate,
  registry: PlatformPlanPublicationRegistry = platformPlanPublicationRegistry
): readonly PlatformPlanPublicationIssue[] {
  const issues: PlatformPlanPublicationIssue[] = [];
  const occurrenceCount = new Map<PlatformPlanFeatureCode, number>();
  for (const capability of candidate.features) {
    occurrenceCount.set(capability, (occurrenceCount.get(capability) ?? 0) + 1);
  }
  const selectedCapabilities = new Set(candidate.features);

  for (const capability of platformPlanFeatureCodeValues) {
    const count = occurrenceCount.get(capability) ?? 0;
    if (count === 0) continue;
    const entry = registry.manifest[capability];

    if (count > 1) {
      issues.push({
        code: "duplicate_capability",
        path: ["features", capability],
        message: `Capability "${capability}" appears more than once.`
      });
    }

    if (entry.availability === "partial") {
      issues.push({
        code: "capability_partial",
        path: ["features", capability],
        message: `Capability "${capability}" is only partially implemented.`
      });
    } else if (entry.availability === "absent") {
      issues.push({
        code: "capability_absent",
        path: ["features", capability],
        message: `Capability "${capability}" is not implemented.`
      });
    } else if (
      derivePlatformCapabilityEnforcement(entry, registry.guardDeclarations) === "unwired"
    ) {
      issues.push({
        code: "capability_enforcement_unwired",
        path: ["features", capability],
        message: `Capability "${capability}" enforcement is not wired.`
      });
    }

    for (const prerequisite of entry.requiredCapabilities) {
      if (!selectedCapabilities.has(prerequisite)) {
        issues.push({
          code: "capability_prerequisite_missing",
          path: ["features", capability, "requiredCapabilities", prerequisite],
          message: `Capability "${capability}" requires "${prerequisite}".`
        });
      }
    }

    if (
      entry.operationOwnership.kind === "shared_with_operation_owner" &&
      !entry.operationOwnership.applicableOwnerCapabilities.some((ownerCapability) =>
        selectedCapabilities.has(ownerCapability)
      )
    ) {
      issues.push({
        code: "shared_capability_owner_missing",
        path: ["features", capability, "operationOwnership"],
        message: `Shared capability "${capability}" requires at least one selected owning capability.`
      });
    }
  }

  const selectedUnresolvedRefs = new Set<string>();
  for (const capability of platformPlanFeatureCodeValues) {
    if (!selectedCapabilities.has(capability)) continue;
    for (const reference of registry.manifest[capability].unresolvedMappingRefs) {
      selectedUnresolvedRefs.add(reference);
    }
  }
  const orderedUnresolvedRefs: string[] = [];
  for (const surface of registry.unresolvedSurfaces) {
    if (selectedUnresolvedRefs.delete(surface.id)) orderedUnresolvedRefs.push(surface.id);
  }
  orderedUnresolvedRefs.push(...[...selectedUnresolvedRefs].sort());
  for (const reference of orderedUnresolvedRefs) {
    issues.push({
      code: "unresolved_operation_mapping",
      path: ["features", "unresolvedMappingRefs", reference],
      message: `Capability operation mapping "${reference}" is unresolved.`
    });
  }

  const seatsBinding = platformPlanQuotaBindings.seatsLimit;
  if (candidate.seatsLimit === null || candidate.seatsLimit > seatsBinding.maximum) {
    issues.push({
      code: "seats_limit_exceeds_structural_max",
      path: ["seatsLimit"],
      message: `seatsLimit exceeds the current structural maximum of ${seatsBinding.maximum}.`
    });
  }

  for (const binding of counterBackedQuotaBindings) {
    const field = binding.field;
    const limit = candidate[field];
    if (limit === null) continue;

    if (!selectedCapabilities.has(binding.capability)) {
      issues.push(quotaCapabilityMissingIssue(binding));
    }

    const readinessIssue = counterReadinessIssue(binding, registry);
    if (readinessIssue) {
      issues.push(quotaCounterIssue(binding, readinessIssue));
    }
  }

  return issues;
}

export class PlatformPlanPublicationValidationError extends Error {
  readonly issues: readonly PlatformPlanPublicationIssue[];

  constructor(issues: readonly PlatformPlanPublicationIssue[]) {
    super(`Platform plan is not publishable: ${issues.length} issue(s).`);
    this.name = "PlatformPlanPublicationValidationError";
    this.issues = issues;
  }
}

export function assertPlatformPlanPublishable(candidate: PlatformPlanPublicationCandidate): void {
  const issues = collectPlatformPlanPublicationIssues(candidate);
  if (issues.length > 0) throw new PlatformPlanPublicationValidationError(issues);
}
