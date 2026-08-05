import type { PlatformPlanFeatureCode } from "@elevenhouse/contracts";
import {
  canonicalFingerprint,
  platformCapabilityCounterFingerprint,
  platformCapabilityRequirementFingerprint,
  platformCapabilitySurfaceFingerprint,
  type PlatformCapabilityEnforcement,
  type PlatformCapabilityGuardDeclaration,
  type PlatformCapabilityGuardRegistryIssue,
  type PlatformCapabilityOperationSurface,
  type PlatformCapabilitySurface,
  type PlatformCapabilityUsageCounter,
  type RawPlatformCapabilityManifestEntry
} from "./platform-capability-manifest-model";
import {
  platformCapabilityGuardDeclarations,
  platformSharedCapabilitySurfaces,
  rawPlatformCapabilityManifest
} from "./platform-capability-manifest-registry";

const toNavigationDeclaration = (
  item: PlatformCapabilitySurface,
  capability: PlatformPlanFeatureCode,
  kind: "navigation" | "frontend_route"
): PlatformCapabilityGuardDeclaration => ({
  kind,
  surfaceId: item.id,
  ownerModule: item.ownerModule,
  surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
  capability
});

const toOperationDeclaration = (
  item: PlatformCapabilityOperationSurface
): PlatformCapabilityGuardDeclaration => ({
  kind: "operation",
  surfaceId: item.id,
  ownerModule: item.ownerModule,
  surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
  semanticKind: item.semanticKind,
  requirementFingerprint: platformCapabilityRequirementFingerprint(item.requirement)
});

const toCounterDeclaration = (
  entry: Pick<RawPlatformCapabilityManifestEntry, "code" | "owner">,
  counter: PlatformCapabilityUsageCounter
): PlatformCapabilityGuardDeclaration => ({
  kind: "usage_counter",
  surfaceId: ["counter", entry.code, counter.code].join("."),
  ownerModule: entry.owner.module,
  capability: entry.code,
  counterFingerprint: platformCapabilityCounterFingerprint(counter)
});

const declarationFingerprint = (declaration: PlatformCapabilityGuardDeclaration): string =>
  canonicalFingerprint(declaration);

export function collectPlatformCapabilityGuardRegistryIssues(
  declarations: readonly PlatformCapabilityGuardDeclaration[],
  entries: readonly RawPlatformCapabilityManifestEntry[] = Object.values(
    rawPlatformCapabilityManifest
  ),
  sharedSurfaces: readonly PlatformCapabilityOperationSurface[] = platformSharedCapabilitySurfaces
): readonly PlatformCapabilityGuardRegistryIssue[] {
  const expectedDeclarations: PlatformCapabilityGuardDeclaration[] = [];
  const referencedSharedSurfaceIds = new Set<string>();

  for (const entry of entries) {
    expectedDeclarations.push(
      ...entry.navigation.map((item) => toNavigationDeclaration(item, entry.code, "navigation")),
      ...entry.frontendRoutes.map((item) =>
        toNavigationDeclaration(item, entry.code, "frontend_route")
      ),
      ...[...entry.readOperations, ...entry.mutationOperations, ...entry.workerJobs].map(
        toOperationDeclaration
      ),
      ...entry.usageCounters.map((counter) => toCounterDeclaration(entry, counter))
    );
    for (const surfaceId of entry.sharedSurfaceRefs) referencedSharedSurfaceIds.add(surfaceId);
  }

  for (const surface of sharedSurfaces) {
    if (referencedSharedSurfaceIds.has(surface.id)) {
      expectedDeclarations.push(toOperationDeclaration(surface));
    }
  }

  const expectedFingerprints = new Set(expectedDeclarations.map(declarationFingerprint));
  const declarationCounts = new Map<string, number>();
  for (const declaration of declarations) {
    const fingerprint = declarationFingerprint(declaration);
    declarationCounts.set(fingerprint, (declarationCounts.get(fingerprint) ?? 0) + 1);
  }

  const issues: PlatformCapabilityGuardRegistryIssue[] = [];
  for (const [fingerprint, count] of declarationCounts) {
    if (count > 1) {
      issues.push({ code: "duplicate_declaration", declarationFingerprint: fingerprint });
    }
    if (!expectedFingerprints.has(fingerprint)) {
      issues.push({ code: "orphan_declaration", declarationFingerprint: fingerprint });
    }
  }
  return issues;
}

export function derivePlatformCapabilityEnforcement(
  entry: Pick<
    RawPlatformCapabilityManifestEntry,
    | "code"
    | "owner"
    | "availability"
    | "navigation"
    | "frontendRoutes"
    | "readOperations"
    | "mutationOperations"
    | "workerJobs"
    | "sharedSurfaceRefs"
    | "unresolvedMappingRefs"
    | "usageCounters"
  >,
  declarations: readonly PlatformCapabilityGuardDeclaration[] = platformCapabilityGuardDeclarations,
  sharedSurfaces: readonly PlatformCapabilityOperationSurface[] = platformSharedCapabilitySurfaces
): PlatformCapabilityEnforcement {
  if (entry.availability === "absent") return "unwired";
  if (
    collectPlatformCapabilityGuardRegistryIssues(declarations, undefined, sharedSurfaces).length
  ) {
    return "unwired";
  }
  const directOperations = [
    ...entry.readOperations,
    ...entry.mutationOperations,
    ...entry.workerJobs
  ];
  const referencedOperations = entry.sharedSurfaceRefs.map((surfaceId) => {
    const operation = sharedSurfaces.find((candidate) => candidate.id === surfaceId);
    if (!operation) throw new Error(`Unknown shared capability surface: ${surfaceId}`);
    return operation;
  });
  if (entry.unresolvedMappingRefs.length > 0) return "unwired";
  if (
    entry.usageCounters.some(
      (counter) => counter.availability === "unwired" || counter.publicationBlocker
    )
  ) {
    return "unwired";
  }
  if (
    [...entry.workerJobs, ...referencedOperations].some(
      (operation) =>
        operation.semanticKind === "worker" &&
        (operation.entitlementSubjectAuthority.availability === "unwired" ||
          operation.entitlementSubjectAuthority.publicationBlocker)
    )
  ) {
    return "unwired";
  }
  const requiredDeclarations = [
    ...entry.navigation.map((item) => ({ kind: "navigation" as const, item })),
    ...entry.frontendRoutes.map((item) => ({ kind: "frontend_route" as const, item })),
    ...[...directOperations, ...referencedOperations].map((item) => ({
      kind: "operation" as const,
      item
    })),
    ...entry.usageCounters.map((item) => ({ kind: "usage_counter" as const, item }))
  ];
  if (requiredDeclarations.length === 0) return "unwired";
  const covered = requiredDeclarations.every(
    (required) =>
      declarations.filter((declaration) => {
        if (required.kind === "navigation" || required.kind === "frontend_route") {
          if (declaration.kind !== required.kind) return false;
          return (
            declaration.surfaceId === required.item.id &&
            declaration.ownerModule === required.item.ownerModule &&
            declaration.surfaceFingerprint ===
              platformCapabilitySurfaceFingerprint(required.item) &&
            declaration.capability === entry.code
          );
        }
        if (required.kind === "operation") {
          if (declaration.kind !== "operation") return false;
          return (
            declaration.surfaceId === required.item.id &&
            declaration.ownerModule === required.item.ownerModule &&
            declaration.surfaceFingerprint ===
              platformCapabilitySurfaceFingerprint(required.item) &&
            declaration.semanticKind === required.item.semanticKind &&
            declaration.requirementFingerprint ===
              platformCapabilityRequirementFingerprint(required.item.requirement)
          );
        }
        if (declaration.kind !== "usage_counter") return false;
        return (
          declaration.surfaceId === `counter.${entry.code}.${required.item.code}` &&
          declaration.ownerModule === entry.owner.module &&
          declaration.capability === entry.code &&
          declaration.counterFingerprint === platformCapabilityCounterFingerprint(required.item)
        );
      }).length === 1
  );
  return covered ? "ready" : "unwired";
}
