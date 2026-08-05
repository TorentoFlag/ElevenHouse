import type { PlatformPlanFeatureCode } from "@elevenhouse/contracts";
import { derivePlatformCapabilityEnforcement } from "./platform-capability-manifest-enforcement";
import type { PlatformCapabilityManifestEntry } from "./platform-capability-manifest-model";
import { rawPlatformCapabilityManifest } from "./platform-capability-manifest-registry";

export type {
  PlatformCapabilityAvailability,
  PlatformCapabilityBoundaryExclusion,
  PlatformCapabilityContinuationCommand,
  PlatformCapabilityContinuationExclusion,
  PlatformCapabilityEnforcement,
  PlatformCapabilityExpiryFallback,
  PlatformCapabilityGuardDeclaration,
  PlatformCapabilityGuardRegistryIssue,
  PlatformCapabilityManifestEntry,
  PlatformCapabilityNonWorkerOperationSurface,
  PlatformCapabilityOperationOwnership,
  PlatformCapabilityOperationSurface,
  PlatformCapabilityOwner,
  PlatformCapabilityRequirement,
  PlatformCapabilitySurface,
  PlatformCapabilitySurfaceExclusion,
  PlatformCapabilityUnresolvedOperation,
  PlatformCapabilityUsageCounter,
  PlatformCapabilityWorkerEntitlementSubjectAuthority,
  PlatformCapabilityWorkerOperationSurface
} from "./platform-capability-manifest-model";
export {
  platformCapabilityCounterFingerprint,
  platformCapabilityRequirementFingerprint,
  platformCapabilitySurfaceFingerprint
} from "./platform-capability-manifest-model";
export {
  collectPlatformCapabilityGuardRegistryIssues,
  derivePlatformCapabilityEnforcement
} from "./platform-capability-manifest-enforcement";
export {
  platformCapabilityGuardDeclarations,
  platformSharedCapabilitySurfaces,
  platformTariffGuardedOperationSurfaceIds,
  platformUnresolvedCapabilitySurfaces
} from "./platform-capability-manifest-registry";
export {
  platformCapabilityBoundaryExclusions,
  platformCapabilityContinuationExclusions,
  platformCapabilityPhysicalCollisionWhitelist,
  platformCapabilitySurfaceExclusions
} from "./platform-capability-manifest-exclusions";

export const platformCapabilityManifest = Object.fromEntries(
  Object.entries(rawPlatformCapabilityManifest).map(([code, entry]) => [
    code,
    { ...entry, enforcement: derivePlatformCapabilityEnforcement(entry) }
  ])
) as Readonly<Record<PlatformPlanFeatureCode, PlatformCapabilityManifestEntry>>;
