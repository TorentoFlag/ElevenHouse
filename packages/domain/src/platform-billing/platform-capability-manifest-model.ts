import type { PlatformPlanFeatureCode } from "@elevenhouse/contracts";

export type PlatformCapabilityAvailability = "live" | "partial" | "absent";
export type PlatformCapabilityEnforcement = "unwired" | "ready";
export type PlatformCapabilityExpiryFallback = "read_only" | "unavailable";

export type PlatformCapabilitySurface = {
  readonly id: string;
  readonly ownerModule: string;
  readonly sourcePath: string;
  readonly identifier: string;
};

export type PlatformCapabilityRequirement =
  | {
      readonly kind: "all_of";
      readonly capabilities: readonly PlatformPlanFeatureCode[];
      readonly entitlementSubjectSelector?: string;
      readonly unknownSubjectPolicy?: "deny";
    }
  | {
      readonly kind: "resource_capability";
      readonly selector: string;
      readonly capabilityMap: Readonly<Record<string, readonly PlatformPlanFeatureCode[]>>;
      readonly unresolvedValues: readonly string[];
      readonly exemptValues: readonly string[];
      readonly unknownValuePolicy: "deny";
      readonly collectionMode: "not_applicable" | "filter_each_resource";
    }
  | {
      readonly kind: "shared_with_fixed_owner";
      readonly sharedCapability: "pdf" | "ai";
      readonly ownerCapability: PlatformPlanFeatureCode;
    }
  | {
      readonly kind: "shared_with_resource_owner";
      readonly sharedCapability: "pdf" | "ai";
      readonly selector: string;
      readonly capabilityMap: Readonly<Record<string, readonly PlatformPlanFeatureCode[]>>;
      readonly unresolvedValues: readonly string[];
      readonly unknownValuePolicy: "deny";
    }
  | {
      readonly kind: "capability_or_historical_obligation";
      readonly capabilities: readonly PlatformPlanFeatureCode[];
      readonly ownerSelector: string;
      readonly historicalEvidenceSelector: string;
      readonly collectionMode: "not_applicable" | "filter_each_resource";
      readonly unknownValuePolicy: "deny";
    };

type PlatformCapabilityOperationSurfaceBase = PlatformCapabilitySurface & {
  readonly requirement: PlatformCapabilityRequirement;
};

export type PlatformCapabilityWorkerEntitlementSubjectAuthority = {
  readonly persistedOwnerSelector: string;
  readonly queuePayloadPolicy: "untrusted_reference_only";
} & (
  | {
      readonly availability: "unwired";
      readonly publicationBlocker: true;
    }
  | {
      readonly availability: "ready";
      readonly publicationBlocker: false;
    }
);

export type PlatformCapabilityNonWorkerOperationSurface = PlatformCapabilityOperationSurfaceBase & {
  readonly semanticKind: "read" | "mutation" | "generation";
  readonly processor?: never;
  readonly entitlementSubjectAuthority?: never;
};

export type PlatformCapabilityWorkerOperationSurface = PlatformCapabilityOperationSurfaceBase & {
  readonly semanticKind: "worker";
  readonly processor: {
    readonly sourcePath: string;
    readonly identifier: string;
  };
  readonly entitlementSubjectAuthority: PlatformCapabilityWorkerEntitlementSubjectAuthority;
};

export type PlatformCapabilityOperationSurface =
  | PlatformCapabilityNonWorkerOperationSurface
  | PlatformCapabilityWorkerOperationSurface;

export type PlatformCapabilityUnresolvedOperation = PlatformCapabilitySurface & {
  readonly reason: string;
  readonly publicationBlocker: true;
  readonly candidateCapabilities: readonly PlatformPlanFeatureCode[];
};

export type PlatformCapabilityOwner =
  | {
      readonly kind: "implemented";
      readonly module: string;
      readonly sourcePath: string;
    }
  | {
      readonly kind: "unimplemented";
      readonly module: string;
    };

export type PlatformCapabilityOperationOwnership =
  | { readonly kind: "direct" }
  | {
      readonly kind: "shared_with_operation_owner";
      readonly sharedCapability: "pdf" | "ai";
      readonly applicableOwnerCapabilities: readonly PlatformPlanFeatureCode[];
      readonly publicationOwnerRequirement: "at_least_one_applicable_owner";
    };

export type PlatformCapabilityUsageCounter = {
  readonly code: "seats" | "bookings" | "ai_requests" | "automations";
  readonly scope: string;
  readonly window: {
    readonly kind: "versioned_period" | "current_state";
    readonly utcAnchor: string;
    readonly resetRule: string;
  };
  readonly reserve: string;
  readonly commit: string;
  readonly release: string;
  readonly lock: string;
  readonly idempotency: string;
  readonly postCancellationRelease?: "tariff_policy_required";
} & (
  | {
      readonly availability: "unwired";
      readonly publicationBlocker: true;
    }
  | {
      readonly availability: "wired";
      readonly publicationBlocker: false;
    }
);

type PlatformCapabilityManifestEntryBase = {
  readonly code: PlatformPlanFeatureCode;
  readonly owner: PlatformCapabilityOwner;
  readonly enforcement: PlatformCapabilityEnforcement;
  readonly navigation: readonly PlatformCapabilitySurface[];
  readonly frontendRoutes: readonly PlatformCapabilitySurface[];
  readonly readOperations: readonly PlatformCapabilityOperationSurface[];
  readonly mutationOperations: readonly PlatformCapabilityOperationSurface[];
  readonly workerJobs: readonly PlatformCapabilityOperationSurface[];
  readonly sharedSurfaceRefs: readonly string[];
  readonly expiryFallback: PlatformCapabilityExpiryFallback;
  readonly requiredCapabilities: readonly PlatformPlanFeatureCode[];
  readonly operationOwnership: PlatformCapabilityOperationOwnership;
  readonly unresolvedMappingRefs: readonly string[];
  readonly usageCounters: readonly PlatformCapabilityUsageCounter[];
};

export type PlatformCapabilityManifestEntry =
  | (PlatformCapabilityManifestEntryBase & {
      readonly availability: "live";
      readonly unavailableReason?: never;
    })
  | (PlatformCapabilityManifestEntryBase & {
      readonly availability: "partial" | "absent";
      readonly unavailableReason: string;
    });

export type RawPlatformCapabilityManifestEntry = Omit<
  PlatformCapabilityManifestEntry,
  "enforcement"
>;

export type PlatformCapabilityGuardDeclaration =
  | {
      readonly kind: "navigation" | "frontend_route";
      readonly surfaceId: string;
      readonly ownerModule: string;
      readonly surfaceFingerprint: string;
      readonly capability: PlatformPlanFeatureCode;
    }
  | {
      readonly kind: "operation";
      readonly surfaceId: string;
      readonly ownerModule: string;
      readonly surfaceFingerprint: string;
      readonly semanticKind: PlatformCapabilityOperationSurface["semanticKind"];
      readonly requirementFingerprint: string;
    }
  | {
      readonly kind: "usage_counter";
      readonly surfaceId: string;
      readonly ownerModule: string;
      readonly capability: PlatformPlanFeatureCode;
      readonly counterFingerprint: string;
    };

export const canonicalFingerprint = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalFingerprint).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalFingerprint(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const platformCapabilityRequirementFingerprint = (
  requirement: PlatformCapabilityRequirement
): string => canonicalFingerprint(requirement);

export const platformCapabilitySurfaceFingerprint = (
  surface: PlatformCapabilitySurface | PlatformCapabilityOperationSurface
): string =>
  canonicalFingerprint({
    id: surface.id,
    ownerModule: surface.ownerModule,
    sourcePath: surface.sourcePath,
    identifier: surface.identifier,
    ...("processor" in surface && surface.processor ? { processor: surface.processor } : {}),
    ...("entitlementSubjectAuthority" in surface && surface.entitlementSubjectAuthority
      ? { entitlementSubjectAuthority: surface.entitlementSubjectAuthority }
      : {})
  });

export const platformCapabilityCounterFingerprint = (
  counter: PlatformCapabilityUsageCounter
): string => canonicalFingerprint(counter);

export type PlatformCapabilityGuardRegistryIssue =
  | {
      readonly code: "duplicate_declaration";
      readonly declarationFingerprint: string;
    }
  | {
      readonly code: "orphan_declaration";
      readonly declarationFingerprint: string;
    };

export type PlatformCapabilitySurfaceExclusion = {
  readonly surface: PlatformCapabilitySurface;
  readonly policy: "never_tariff_gate";
  readonly reason: string;
};

export type PlatformCapabilityBoundaryExclusion = {
  readonly id: string;
  readonly ownerModule: string;
  readonly sourcePaths: readonly string[];
  readonly identifiers: readonly string[];
  readonly policy: "never_tariff_gate";
  readonly reason: string;
};

export type PlatformCapabilityContinuationCommand = {
  readonly ownerModule: string;
  readonly sourcePath: string;
  readonly identifier: string;
};

export type PlatformCapabilityContinuationExclusion = {
  readonly id: string;
  readonly surface: PlatformCapabilitySurface;
  readonly processor: PlatformCapabilityContinuationCommand;
  readonly commands: readonly PlatformCapabilityContinuationCommand[];
  readonly policy: "never_tariff_gate";
  readonly reason: string;
};
