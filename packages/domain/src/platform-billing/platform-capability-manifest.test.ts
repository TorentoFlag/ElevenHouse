import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { chartMethodVersions, platformPlanFeatureCodeValues } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  derivePlatformCapabilityEnforcement,
  platformCapabilityBoundaryExclusions,
  platformCapabilityContinuationExclusions,
  platformCapabilityCounterFingerprint,
  platformCapabilityGuardDeclarations,
  platformCapabilityManifest,
  platformCapabilityPhysicalCollisionWhitelist,
  platformCapabilityRequirementFingerprint,
  platformCapabilitySurfaceFingerprint,
  platformCapabilitySurfaceExclusions,
  platformSharedCapabilitySurfaces,
  platformUnresolvedCapabilitySurfaces,
  type PlatformCapabilityGuardDeclaration,
  type PlatformCapabilityManifestEntry,
  type PlatformCapabilitySurface
} from "./platform-capability-manifest";
import {
  controllerTargets,
  expectedAuditedSurfaces,
  expectedBoundaryExclusions,
  expectedClassifications,
  expectedContinuationExclusions,
  expectedCounterCodes,
  expectedFeatureCodes,
  expectedImplementedOwners,
  expectedRequiredCapabilities,
  expectedSharedRefsByFeature,
  expectedSharedSurfaces,
  expectedSurfaceExclusions,
  expectedUnresolvedCapabilitySurfaces as expectedUnresolvedSurfaces,
  expectedUnresolvedRefsByFeature,
  type AuditedSurface
} from "./platform-capability-manifest-audit.fixture";

function findWorkspaceRoot(startPath: string): string {
  let candidate = resolve(startPath);
  const filesystemRoot = parse(candidate).root;
  for (;;) {
    if (
      existsSync(resolve(candidate, "AGENTS.md")) &&
      existsSync(resolve(candidate, "package.json")) &&
      existsSync(resolve(candidate, "pnpm-workspace.yaml"))
    )
      return candidate;
    if (candidate === filesystemRoot) {
      throw new Error(`Could not locate ElevenHouse workspace root from ${startPath}`);
    }
    candidate = dirname(candidate);
  }
}

const workspaceRoot = findWorkspaceRoot(__dirname);
const repoFixturePath = (sourcePath: string) => resolve(workspaceRoot, sourcePath);
const importRuntimeFixture = (sourcePath: string) => import(/* @vite-ignore */ sourcePath);

const surfaceCore = (surface: PlatformCapabilitySurface): PlatformCapabilitySurface => ({
  id: surface.id,
  ownerModule: surface.ownerModule,
  sourcePath: surface.sourcePath,
  identifier: surface.identifier
});

function manifestAuditedSurfaces(): AuditedSurface[] {
  return expectedFeatureCodes.flatMap((featureCode) => {
    const entry = platformCapabilityManifest[featureCode];
    return (
      [
        "navigation",
        "frontendRoutes",
        "readOperations",
        "mutationOperations",
        "workerJobs"
      ] as const
    ).flatMap((category) =>
      entry[category].map((item) => ({ featureCode, category, ...surfaceCore(item) }))
    );
  });
}

function guardDeclarationsFor(
  entry: PlatformCapabilityManifestEntry
): PlatformCapabilityGuardDeclaration[] {
  const uiDeclarations: PlatformCapabilityGuardDeclaration[] = [
    ...entry.navigation.map((item) => ({
      kind: "navigation" as const,
      surfaceId: item.id,
      ownerModule: item.ownerModule,
      surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
      capability: entry.code
    })),
    ...entry.frontendRoutes.map((item) => ({
      kind: "frontend_route" as const,
      surfaceId: item.id,
      ownerModule: item.ownerModule,
      surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
      capability: entry.code
    }))
  ];
  const directOperations = [
    ...entry.readOperations,
    ...entry.mutationOperations,
    ...entry.workerJobs
  ];
  const sharedOperations = entry.sharedSurfaceRefs.map(
    (surfaceId) => platformSharedCapabilitySurfaces.find((candidate) => candidate.id === surfaceId)!
  );
  const operationDeclarations = [...directOperations, ...sharedOperations].map((item) => ({
    kind: "operation" as const,
    surfaceId: item.id,
    ownerModule: item.ownerModule,
    surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
    semanticKind: item.semanticKind,
    requirementFingerprint: platformCapabilityRequirementFingerprint(item.requirement)
  }));
  const counterDeclarations = entry.usageCounters.map((counter) => ({
    kind: "usage_counter" as const,
    surfaceId: `counter.${entry.code}.${counter.code}`,
    ownerModule: entry.owner.module,
    capability: entry.code,
    counterFingerprint: platformCapabilityCounterFingerprint(counter)
  }));
  return [...uiDeclarations, ...operationDeclarations, ...counterDeclarations];
}

function normalizePhysicalIdentifier(identifier: string): string {
  const withoutBranch = identifier.replace(/ \[.*$/, "").replace(/#.*$/, "");
  const [verb, rawPath = ""] = withoutBranch.split(" ", 2);
  const normalizedVerb = verb === "SSE" ? "GET" : verb;
  return `${normalizedVerb} ${rawPath.replace(/\?.*$/, "")}`;
}

describe("platform capability manifest", () => {
  it("keeps one explicit classification, owner, fallback, prerequisite, unresolved ref, and counter policy for every contract feature code", () => {
    expect(platformPlanFeatureCodeValues).toEqual(expectedFeatureCodes);
    expect(Object.keys(platformCapabilityManifest)).toEqual(expectedFeatureCodes);

    for (const [availability, featureCodes] of Object.entries(expectedClassifications)) {
      for (const featureCode of featureCodes) {
        const entry = platformCapabilityManifest[featureCode];
        expect(entry.code).toBe(featureCode);
        expect(entry.availability).toBe(availability);
        expect(entry.expiryFallback).toBe(
          featureCode === "child" || availability === "absent" ? "unavailable" : "read_only"
        );
        expect(entry.enforcement).toBe(
          featureCode === "products" || featureCode === "funnels" ? "ready" : "unwired"
        );
        if (availability !== "live") expect(entry.unavailableReason).toMatch(/\S/);
      }
    }

    for (const featureCode of expectedFeatureCodes) {
      const entry = platformCapabilityManifest[featureCode];
      expect(entry.requiredCapabilities).toEqual(expectedRequiredCapabilities[featureCode]);
      expect(entry.sharedSurfaceRefs).toEqual(
        expectedSharedRefsByFeature[featureCode as keyof typeof expectedSharedRefsByFeature] ?? []
      );
      expect(entry.unresolvedMappingRefs).toEqual(
        expectedUnresolvedRefsByFeature[
          featureCode as keyof typeof expectedUnresolvedRefsByFeature
        ] ?? []
      );
      expect(entry.usageCounters.map((counter) => counter.code)).toEqual(
        expectedCounterCodes[featureCode as keyof typeof expectedCounterCodes] ?? []
      );
      for (const counter of entry.usageCounters) {
        expect(counter).toMatchObject(
          featureCode === "funnels" && counter.code === "automations"
            ? { availability: "wired", publicationBlocker: false }
            : { availability: "unwired", publicationBlocker: true }
        );
      }
    }

    for (const [featureCode, owner] of Object.entries(expectedImplementedOwners)) {
      expect(
        platformCapabilityManifest[featureCode as keyof typeof platformCapabilityManifest].owner
      ).toEqual(owner);
      expect(existsSync(repoFixturePath(owner.sourcePath))).toBe(true);
    }
    for (const featureCode of expectedClassifications.absent) {
      expect(platformCapabilityManifest[featureCode].owner).toEqual({
        kind: "unimplemented",
        module: featureCode
      });
    }
  });

  it("matches the complete independent literal protected-surface fixture bidirectionally", () => {
    const actual = manifestAuditedSurfaces();
    expect(actual).toEqual(expectedAuditedSurfaces);
    expect(actual.map((item) => item.id)).toHaveLength(new Set(actual.map((item) => item.id)).size);

    const actualShared = platformSharedCapabilitySurfaces.map(surfaceCore);
    expect(actualShared).toEqual(expectedSharedSurfaces);
    expect(actualShared.map((item) => item.id)).toHaveLength(
      new Set(actualShared.map((item) => item.id)).size
    );

    const allIds = [...actual.map((item) => item.id), ...actualShared.map((item) => item.id)];
    expect(allIds).toHaveLength(new Set(allIds).size);
    for (const item of [...actual, ...actualShared]) {
      expect(existsSync(repoFixturePath(item.sourcePath))).toBe(true);
    }
    for (const featureCode of expectedClassifications.absent) {
      const entry = platformCapabilityManifest[featureCode];
      expect([
        ...entry.navigation,
        ...entry.frontendRoutes,
        ...entry.readOperations,
        ...entry.mutationOperations,
        ...entry.workerJobs,
        ...entry.sharedSurfaceRefs,
        ...entry.unresolvedMappingRefs
      ]).toEqual([]);
    }
  });

  it("deep-matches the global unresolved and never-gate registries", () => {
    expect(platformUnresolvedCapabilitySurfaces).toEqual(expectedUnresolvedSurfaces);
    expect(platformCapabilitySurfaceExclusions).toEqual(expectedSurfaceExclusions);
    expect(platformCapabilityBoundaryExclusions).toEqual(expectedBoundaryExclusions);
    expect(platformCapabilityContinuationExclusions).toEqual(expectedContinuationExclusions);
    expect(platformCapabilityPhysicalCollisionWhitelist).toEqual({
      "apps/astrologer-api/src/modules/calculations/calculations.controller.ts|GET /calculations": 2,
      "apps/astrologer-api/src/modules/charts/charts.controller.ts|POST /charts/natal/jobs": 2,
      "apps/astrologer-api/src/modules/media/media.controller.ts|POST /media/upload-intents": 5,
      "apps/astrologer-api/src/modules/media/media.controller.ts|POST /media/:mediaId/complete": 5
    });

    const unresolvedIds = platformUnresolvedCapabilitySurfaces.map((item) => item.id);
    const referencedUnresolvedIds = new Set(
      Object.values(platformCapabilityManifest).flatMap((entry) => entry.unresolvedMappingRefs)
    );
    expect(unresolvedIds).toHaveLength(new Set(unresolvedIds).size);
    expect(referencedUnresolvedIds).toEqual(new Set(unresolvedIds));
    expect(
      platformUnresolvedCapabilitySurfaces.find(
        (item) => item.id === "chart.astrocartography.create"
      )?.candidateCapabilities
    ).toEqual([]);
    expect(
      platformUnresolvedCapabilitySurfaces.find((item) => item.id === "chart.composite.create")
        ?.candidateCapabilities
    ).toEqual([]);

    for (const item of platformCapabilitySurfaceExclusions) {
      expect(item.policy).toBe("never_tariff_gate");
      expect(item.reason).toMatch(/\S/);
      expect(existsSync(repoFixturePath(item.surface.sourcePath))).toBe(true);
    }
    for (const continuation of platformCapabilityContinuationExclusions) {
      expect(continuation.policy).toBe("never_tariff_gate");
      expect(continuation.reason).toMatch(/\S/);
      for (const sourcePath of [
        continuation.surface.sourcePath,
        continuation.processor.sourcePath,
        ...continuation.commands.map((command) => command.sourcePath)
      ]) {
        expect(existsSync(repoFixturePath(sourcePath))).toBe(true);
      }
    }
  });

  it("uses exact fail-closed resource maps, shared owner conjunctions, trusted public subjects, and historical obligation rules", () => {
    const calculationRead = platformSharedCapabilitySurfaces.find(
      (item) => item.id === "calculations.resource.read"
    )!;
    expect(calculationRead.requirement).toEqual({
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    });
    const knownChartKeys = Object.keys(chartMethodVersions)
      .map((method) => `chart:${method}`)
      .sort();
    expect(
      [
        ...Object.keys(
          (calculationRead.requirement as { capabilityMap: Record<string, unknown> }).capabilityMap
        ).filter((key) => key.startsWith("chart:")),
        ...(calculationRead.requirement as { unresolvedValues: readonly string[] }).unresolvedValues
      ].sort()
    ).toEqual(knownChartKeys);

    for (const sharedCode of ["pdf", "ai"] as const) {
      expect(platformCapabilityManifest[sharedCode].requiredCapabilities).toEqual([]);
      expect(platformCapabilityManifest[sharedCode].operationOwnership).toMatchObject({
        kind: "shared_with_operation_owner",
        sharedCapability: sharedCode,
        publicationOwnerRequirement: "at_least_one_applicable_owner"
      });
      for (const operation of platformCapabilityManifest[sharedCode].mutationOperations) {
        expect(operation.requirement.kind).toMatch(/^shared_with_(fixed|resource)_owner$/);
      }
    }

    const orderCreate = platformCapabilityManifest.products.mutationOperations.find(
      (item) => item.id === "products.public-order.create"
    )!;
    const bookingIntent = platformCapabilityManifest.calendar.mutationOperations.find(
      (item) => item.id === "calendar.public-booking-intent.create"
    )!;
    expect(orderCreate.requirement).toMatchObject({
      kind: "all_of",
      capabilities: ["products"],
      unknownSubjectPolicy: "deny"
    });
    expect(orderCreate.requirement).toHaveProperty(
      "entitlementSubjectSelector",
      expect.stringContaining("persisted Product.ownerUserId")
    );
    expect(bookingIntent.requirement).toMatchObject({
      kind: "all_of",
      capabilities: ["calendar", "products"],
      unknownSubjectPolicy: "deny"
    });
    expect(bookingIntent.requirement).toHaveProperty(
      "entitlementSubjectSelector",
      expect.stringContaining("persisted Product.ownerUserId")
    );

    expect(
      platformCapabilityManifest.calendar.readOperations.find(
        (item) => item.id === "calendar.booking.read"
      )?.requirement.kind
    ).toBe("capability_or_historical_obligation");
    expect(platformCapabilityManifest.inbox.workerJobs[0]?.requirement.kind).toBe(
      "capability_or_historical_obligation"
    );
    expect(
      platformCapabilityManifest.funnels.mutationOperations.find(
        (item) => item.id === "funnels.run.cancel"
      )?.requirement.kind
    ).toBe("capability_or_historical_obligation");
    expect(
      platformCapabilityManifest.matrix.mutationOperations.find(
        (item) => item.id === "matrix.projection.generate"
      )?.semanticKind
    ).toBe("generation");
    expect(
      platformCapabilityManifest.hd.mutationOperations.find(
        (item) => item.id === "hd.transits.generate"
      )?.semanticKind
    ).toBe("generation");

    for (const mediaSurface of platformSharedCapabilitySurfaces.filter((item) =>
      item.id.startsWith("media.")
    )) {
      expect(mediaSurface.requirement).toMatchObject({
        kind: "resource_capability",
        capabilityMap: { product_cover: ["products"] },
        exemptValues: [
          "profile_avatar",
          "profile_cover",
          "verification_identity_document",
          "verification_qualification_document"
        ],
        unknownValuePolicy: "deny"
      });
    }
    expect(
      platformSharedCapabilitySurfaces.find((item) => item.id === "media.upload.complete")
        ?.requirement
    ).toHaveProperty("selector", expect.stringContaining("persisted media_assets.purpose"));
  });

  it("derives readiness only from exact UI, operation-requirement, worker, and quota attestations", () => {
    const productDeclarations = guardDeclarationsFor(platformCapabilityManifest.products);
    const productDirectDeclarations = productDeclarations.filter(
      (item) =>
        item.surfaceId !== "products.public-order.create" &&
        item.surfaceId !== "media.upload-intent.create" &&
        item.surfaceId !== "media.upload.complete"
    );
    const productPublicOrderAndMediaDeclarations = productDeclarations.filter(
      (item) =>
        item.surfaceId === "products.public-order.create" ||
        item.surfaceId === "media.upload-intent.create" ||
        item.surfaceId === "media.upload.complete"
    );
    const funnelDeclarations = guardDeclarationsFor(platformCapabilityManifest.funnels);
    expect(platformCapabilityGuardDeclarations).toEqual([
      ...productDirectDeclarations,
      ...funnelDeclarations,
      ...productPublicOrderAndMediaDeclarations
    ]);
    for (const entry of Object.values(platformCapabilityManifest)) {
      expect(derivePlatformCapabilityEnforcement(entry, [])).toBe("unwired");
    }

    const refs = platformCapabilityManifest.refs;
    const exactRefsDeclarations = guardDeclarationsFor(refs);
    expect(derivePlatformCapabilityEnforcement(refs, exactRefsDeclarations)).toBe("ready");
    expect(derivePlatformCapabilityEnforcement(refs, exactRefsDeclarations.slice(1))).toBe(
      "unwired"
    );
    expect(
      derivePlatformCapabilityEnforcement(
        refs,
        exactRefsDeclarations.map((declaration) =>
          declaration.kind === "operation"
            ? { ...declaration, requirementFingerprint: "weaker-capability-only-guard" }
            : declaration
        )
      )
    ).toBe("unwired");
    expect(
      derivePlatformCapabilityEnforcement(
        refs,
        exactRefsDeclarations.map((declaration) =>
          declaration.kind === "frontend_route"
            ? {
                ...declaration,
                surfaceFingerprint: platformCapabilitySurfaceFingerprint({
                  ...refs.frontendRoutes[0]!,
                  sourcePath: "apps/astrologer-web/src/stale-router.tsx"
                })
              }
            : declaration
        )
      )
    ).toBe("unwired");
    expect(
      derivePlatformCapabilityEnforcement(
        refs,
        exactRefsDeclarations.map((declaration) =>
          declaration.kind === "frontend_route"
            ? {
                ...declaration,
                surfaceFingerprint: platformCapabilitySurfaceFingerprint({
                  ...refs.frontendRoutes[0]!,
                  identifier: "/stale-reference"
                })
              }
            : declaration
        )
      )
    ).toBe("unwired");

    const astrocal = platformCapabilityManifest.astrocal;
    const astrocalDeclarations = guardDeclarationsFor(astrocal);
    expect(derivePlatformCapabilityEnforcement(astrocal, astrocalDeclarations)).toBe("unwired");
    expect(
      derivePlatformCapabilityEnforcement(
        astrocal,
        astrocalDeclarations.map((declaration) =>
          declaration.surfaceId === "astrocal.generate"
            ? {
                ...declaration,
                surfaceFingerprint: platformCapabilitySurfaceFingerprint({
                  ...astrocal.workerJobs[0]!,
                  processor: {
                    ...astrocal.workerJobs[0]!.processor!,
                    identifier: "staleAstroCalendarProcessor"
                  }
                })
              }
            : declaration
        )
      )
    ).toBe("unwired");
    const products = platformCapabilityManifest.products;
    expect(derivePlatformCapabilityEnforcement(products, guardDeclarationsFor(products))).toBe(
      "ready"
    );
    const withoutMediaPurposeGuard = guardDeclarationsFor(products).filter(
      (item) => item.surfaceId !== "media.upload.complete"
    );
    expect(derivePlatformCapabilityEnforcement(products, withoutMediaPurposeGuard)).toBe("unwired");

    const calendar = platformCapabilityManifest.calendar;
    const calendarDeclarations = guardDeclarationsFor(calendar);
    expect(derivePlatformCapabilityEnforcement(calendar, calendarDeclarations)).toBe("unwired");
    expect(
      derivePlatformCapabilityEnforcement(
        calendar,
        calendarDeclarations.filter((item) => item.kind !== "usage_counter")
      )
    ).toBe("unwired");

    const natal = platformCapabilityManifest.natal;
    expect(derivePlatformCapabilityEnforcement(natal, guardDeclarationsFor(natal))).toBe("unwired");
    const team = platformCapabilityManifest.team;
    expect(derivePlatformCapabilityEnforcement(team, guardDeclarationsFor(team))).toBe("unwired");
  });

  it("records exact quota windows, locking, idempotency, lifecycle, and cancellation policy", () => {
    expect(platformCapabilityManifest.calendar.usageCounters).toEqual([
      {
        code: "bookings",
        scope:
          "unique confirmed bookings from public and manual sources in the versioned usage window",
        window: {
          kind: "versioned_period",
          utcAnchor: "tariff_version.utc_anchor",
          resetRule: "tariff_version.bookings_reset_rule"
        },
        reserve: "booking.intent_or_payment_hold",
        commit: "booking.confirmed",
        release: "payment.terminal_failure_or_hold_expired",
        lock: "owner_quota_row",
        idempotency: "logical_booking_id",
        postCancellationRelease: "tariff_policy_required",
        availability: "unwired",
        publicationBlocker: true
      }
    ]);
    expect(platformCapabilityManifest.ai.usageCounters).toEqual([
      {
        code: "ai_requests",
        scope:
          "every provider-backed AI generation across owning modules, keyed by logical request",
        window: {
          kind: "versioned_period",
          utcAnchor: "tariff_version.utc_anchor",
          resetRule: "tariff_version.ai_requests_reset_rule"
        },
        reserve: "validated_provider_request",
        commit: "result_persisted",
        release: "no_result",
        lock: "owner_quota_row",
        idempotency: "logical_request_id; replay_never_consumes_twice",
        availability: "unwired",
        publicationBlocker: true
      }
    ]);
    expect(platformCapabilityManifest.funnels.usageCounters).toEqual([
      {
        code: "automations",
        scope: "active flow definitions, not run count",
        window: {
          kind: "current_state",
          utcAnchor: "tariff_version.utc_anchor",
          resetRule: "release_on_pause_or_archive"
        },
        reserve: "flow.activation",
        commit: "flow.activated",
        release: "flow.paused_or_archived",
        lock: "owner_quota_row",
        idempotency: "flow_definition_id",
        availability: "wired",
        publicationBlocker: false
      }
    ]);
    expect(platformCapabilityManifest.team.usageCounters).toEqual([
      {
        code: "seats",
        scope: "workspace members including owner",
        window: {
          kind: "current_state",
          utcAnchor: "tariff_version.utc_anchor",
          resetRule: "release_on_invite_expiry_revoke_or_member_removal"
        },
        reserve: "member.invited",
        commit: "member.accepted",
        release: "invite.expired_or_member.revoked_or_removed",
        lock: "membership_quota_row",
        idempotency: "workspace_member_or_invite_id",
        availability: "unwired",
        publicationBlocker: true
      }
    ]);
  });

  it("resolves repository evidence independently of process.cwd", () => {
    expect(findWorkspaceRoot(__dirname)).toBe(workspaceRoot);
    expect(findWorkspaceRoot(repoFixturePath("packages/domain/src/platform-billing"))).toBe(
      workspaceRoot
    );
    expect(existsSync(repoFixturePath("apps/astrologer-web/src/router.tsx"))).toBe(true);
    expect(
      existsSync(repoFixturePath("apps/astrologer-api/src/modules/charts/charts.controller.ts"))
    ).toBe(true);
  });

  it("covers every current method on every reviewed Nest controller with exact RequestMethod metadata", async () => {
    const appRequire = createRequire(repoFixturePath("apps/astrologer-api/package.json"));
    const { RequestMethod } = appRequire("@nestjs/common") as {
      RequestMethod: Readonly<Record<"GET" | "POST" | "PUT" | "DELETE" | "PATCH", number>>;
    };
    const reflect = Reflect as typeof Reflect & {
      getMetadata(key: string, target: object): unknown;
    };
    const requestMethodName = (method: number): string => {
      if (method === RequestMethod.GET) return "GET";
      if (method === RequestMethod.POST) return "POST";
      if (method === RequestMethod.PUT) return "PUT";
      if (method === RequestMethod.DELETE) return "DELETE";
      if (method === RequestMethod.PATCH) return "PATCH";
      throw new Error(`Unexpected reviewed RequestMethod: ${String(method)}`);
    };
    const joinRoute = (controllerPath: unknown, handlerPath: unknown): string => {
      const pieces = [controllerPath, handlerPath]
        .filter(
          (value): value is string => typeof value === "string" && value !== "" && value !== "/"
        )
        .map((value) => value.replace(/^\/+|\/+$/g, ""));
      return `/${pieces.join("/")}`.replace(/\/{2,}/g, "/");
    };

    const actualControllerRoutes: Array<{
      readonly sourcePath: string;
      readonly exportName: string;
      readonly methodName: string;
      readonly requestMethod: number;
      readonly identifier: string;
    }> = [];
    for (const [sourcePath, exportName] of controllerTargets) {
      const module = (await importRuntimeFixture(repoFixturePath(sourcePath))) as Record<
        string,
        object
      >;
      const controller = module[exportName] as
        | { readonly prototype: Record<string, unknown> }
        | undefined;
      expect(controller, `${sourcePath}#${exportName}`).toBeDefined();
      const controllerPath = reflect.getMetadata("path", controller!);
      for (const methodName of Object.getOwnPropertyNames(controller!.prototype)) {
        if (methodName === "constructor") continue;
        const handler = controller!.prototype[methodName];
        if (typeof handler !== "function") continue;
        const requestMethod = reflect.getMetadata("method", handler) as number | undefined;
        if (requestMethod === undefined) continue;
        const handlerPath = reflect.getMetadata("path", handler);
        const verb =
          exportName === "MessagingEventsController" && methodName === "streamEvents"
            ? "SSE"
            : requestMethodName(requestMethod);
        actualControllerRoutes.push({
          sourcePath,
          exportName,
          methodName,
          requestMethod,
          identifier: `${verb} ${joinRoute(controllerPath, handlerPath)}`
        });
      }
    }

    expect(actualControllerRoutes.length).toBeGreaterThan(100);
    for (const route of actualControllerRoutes) {
      expect([
        RequestMethod.GET,
        RequestMethod.POST,
        RequestMethod.PUT,
        RequestMethod.DELETE,
        RequestMethod.PATCH
      ]).toContain(route.requestMethod);
    }

    const auditedSurfaceFixtures = [
      ...expectedAuditedSurfaces,
      ...expectedSharedSurfaces,
      ...expectedUnresolvedSurfaces,
      ...expectedSurfaceExclusions.map((item) => item.surface)
    ];
    const auditedPhysicalRouteKeys = auditedSurfaceFixtures.map(
      (item) => `${item.sourcePath}|${normalizePhysicalIdentifier(item.identifier)}`
    );
    const auditedPhysicalRouteCounts = new Map<string, number>();
    for (const key of auditedPhysicalRouteKeys) {
      auditedPhysicalRouteCounts.set(key, (auditedPhysicalRouteCounts.get(key) ?? 0) + 1);
    }
    const auditedPhysicalCollisions = Object.fromEntries(
      [...auditedPhysicalRouteCounts]
        .filter(([, count]) => count > 1)
        .sort(([left], [right]) => left.localeCompare(right))
    );
    expect(auditedPhysicalCollisions).toEqual(platformCapabilityPhysicalCollisionWhitelist);

    const auditedPhysicalRoutes = new Set(auditedPhysicalRouteKeys);
    for (const route of actualControllerRoutes) {
      expect(
        auditedPhysicalRoutes,
        `Unaudited controller method ${route.sourcePath}#${route.methodName} (${route.identifier})`
      ).toContain(`${route.sourcePath}|${normalizePhysicalIdentifier(route.identifier)}`);
    }

    const actualPhysicalRouteKeys = actualControllerRoutes.map(
      (item) => `${item.sourcePath}|${normalizePhysicalIdentifier(item.identifier)}`
    );
    const actualPhysicalRoutes = new Set(actualPhysicalRouteKeys);
    expect(actualPhysicalRouteKeys).toHaveLength(actualPhysicalRoutes.size);
    const reviewedControllerSources: ReadonlySet<string> = new Set<string>(
      controllerTargets.map(([sourcePath]) => sourcePath)
    );
    for (const item of auditedSurfaceFixtures) {
      if (!reviewedControllerSources.has(item.sourcePath)) continue;
      expect(
        actualPhysicalRoutes,
        `Stale manifest/controller fixture ${item.sourcePath} (${item.identifier})`
      ).toContain(`${item.sourcePath}|${normalizePhysicalIdentifier(item.identifier)}`);
    }
  }, 45_000);

  it("validates exact navigation IDs, hrefs, and frontend routes for both launch locales", async () => {
    const copyModule = (await importRuntimeFixture(
      repoFixturePath("apps/astrologer-web/src/common/i18n/astrologerCopy.ts")
    )) as {
      astrologerCopyByLocale: Record<
        string,
        {
          appShell: {
            navigation: {
              personalPage: { href: string };
              items: readonly { id: string; href: string }[];
              footerItems: readonly { id: string; href: string }[];
            };
          };
        }
      >;
    };
    const astrologerRouteModule = (await importRuntimeFixture(
      repoFixturePath("apps/astrologer-web/src/router.contract.ts")
    )) as {
      astrologerRouteContract: {
        root: { path: string; redirectTo: string; replace: boolean };
        auth: string;
        protected: Readonly<Record<string, string>>;
        notFound: string;
      };
      astrologerRoutePaths: readonly string[];
    };
    const clientRouteModule = (await importRuntimeFixture(
      repoFixturePath("apps/client-web/src/router.contract.ts")
    )) as {
      clientRouteContract: {
        home: string;
        auth: string;
        publicAstrologer: string;
        authenticatedProfile: string;
        notFound: string;
      };
      clientRoutePaths: readonly string[];
    };

    const expectedNavigation = [
      ["dashboard", "/dashboard"],
      ["calendar", "/calendar"],
      ["finance", "/finance"],
      ["funnels", "/flows"],
      ["products", "/products"],
      ["chartEngine", "/chart-engine"],
      ["numerology", "/numerology"],
      ["destinyMatrix", "/matrix"],
      ["humanDesign", "/human-design"],
      ["astroCalendar", "/astro-calendar"],
      ["astroDiary", "/astro-diary"],
      ["reference", "/reference"],
      ["inbox", "/inbox"],
      ["settings", "/settings"]
    ] as const;
    expect(Object.keys(copyModule.astrologerCopyByLocale).sort()).toEqual(["en", "ru"]);
    for (const copy of Object.values(copyModule.astrologerCopyByLocale)) {
      const items = [
        ...copy.appShell.navigation.items,
        ...copy.appShell.navigation.footerItems
      ].map(({ id, href }) => [id, href] as const);
      expect(items).toEqual(expectedNavigation);
      expect(copy.appShell.navigation.personalPage.href).toBe("https://elevenhouse.app/alisa-vega");
    }
    expect(astrologerRouteModule.astrologerRoutePaths).toEqual([
      "/",
      "/auth",
      "/dashboard",
      "/calendar",
      "/finance",
      "/flows",
      "/products",
      "/reference",
      "/inbox",
      "/numerology",
      "/matrix",
      "/human-design",
      "/astro-calendar",
      "/astro-diary",
      "/chart-engine",
      "/sessions/:sessionId",
      "/settings",
      "*"
    ]);
    expect(astrologerRouteModule.astrologerRouteContract.root).toEqual({
      path: "/",
      redirectTo: "/auth",
      replace: true
    });
    expect(clientRouteModule.clientRoutePaths).toEqual([
      "/",
      "/auth",
      "/a/:handle",
      "/me",
      "/sessions/:sessionId",
      "*"
    ]);
    expect(clientRouteModule.clientRouteContract.publicAstrologer).toBe("/a/:handle");
  });

  it("validates exact queue, event, and processor exports for protected and never-gated workers", async () => {
    const chartQueue = (await importRuntimeFixture(
      repoFixturePath("apps/chart-worker/src/chart-jobs.queue.ts")
    )) as Record<string, unknown>;
    expect(chartQueue).toMatchObject({
      chartCalculationQueueName: "chart.calculation",
      chartCalculationJobName: "calculate-natal-chart",
      astroCalendarGenerationJobName: "generate-astro-calendar"
    });
    const astroCalendarProcessor = (await importRuntimeFixture(
      repoFixturePath("apps/chart-worker/src/astro-calendar-jobs.processor.ts")
    )) as Record<string, unknown>;
    expect(astroCalendarProcessor.processAstroCalendarGenerationJob).toBeTypeOf("function");

    const pdfQueue = (await importRuntimeFixture(
      repoFixturePath("apps/workers/src/calculation-pdf/calculation-pdf.queue.ts")
    )) as Record<string, unknown>;
    const pdfProcessor = (await importRuntimeFixture(
      repoFixturePath("apps/workers/src/calculation-pdf/calculation-pdf.processor.ts")
    )) as Record<string, unknown>;
    expect(pdfQueue).toMatchObject({
      calculationPdfQueueName: "calculation.pdf",
      calculationPdfRenderJobName: "render-calculation-pdf",
      calculationPdfDeleteJobName: "delete-calculation-pdf"
    });
    expect(pdfProcessor.processCalculationPdfJob).toBeTypeOf("function");

    const flowDomain = (await importRuntimeFixture(
      repoFixturePath("packages/domain/src/flows/flow-runtime-outbox.ts")
    )) as Record<string, unknown>;
    const flowRelay = (await importRuntimeFixture(
      repoFixturePath("apps/workers/src/flows/flow-runtime.outbox-relay.ts")
    )) as Record<string, unknown>;
    expect(flowDomain.FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT).toBe(
      "flows.booking_confirmed.enrollment_requested.v1"
    );
    const bookingDomain = (await importRuntimeFixture(
      repoFixturePath("packages/domain/src/bookings/booking-lifecycle-events.ts")
    )) as Record<string, unknown>;
    expect(bookingDomain.BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED).toBe(
      "bookings.lifecycle_event.dispatch_requested.v1"
    );
    expect(flowRelay.relayPendingFlowRuntimeDispatchEvents).toBeTypeOf("function");

    const messagingQueue = (await importRuntimeFixture(
      repoFixturePath("apps/notification-worker/src/messaging-delivery.queue.ts")
    )) as Record<string, unknown>;
    const messagingProcessor = (await importRuntimeFixture(
      repoFixturePath("apps/notification-worker/src/messaging-delivery.processor.ts")
    )) as Record<string, unknown>;
    expect(messagingQueue).toMatchObject({
      messagingDeliveryQueueName: "messaging.delivery",
      messagingDeliveryJobName: "deliver-messaging-message"
    });
    expect(messagingProcessor.processMessagingDeliveryJob).toBeTypeOf("function");

    const mediaQueue = (await importRuntimeFixture(
      repoFixturePath("apps/notification-worker/src/messaging-media-ingestion.queue.ts")
    )) as Record<string, unknown>;
    const mediaProcessor = (await importRuntimeFixture(
      repoFixturePath("apps/notification-worker/src/messaging-media-ingestion.processor.ts")
    )) as Record<string, unknown>;
    expect(mediaQueue).toMatchObject({
      messagingMediaIngestionQueueName: "messaging.media-ingestion",
      messagingMediaIngestionJobName: "ingest-message-media"
    });
    expect(mediaProcessor.processMessagingMediaIngestionJob).toBeTypeOf("function");

    const authQueue = (await importRuntimeFixture(
      repoFixturePath("apps/notification-worker/src/auth-code-delivery.queue.ts")
    )) as Record<string, unknown>;
    const authProcessor = (await importRuntimeFixture(
      repoFixturePath("apps/notification-worker/src/auth-code-delivery.processor.ts")
    )) as Record<string, unknown>;
    expect(authQueue).toMatchObject({
      authCodeDeliveryQueueName: "notifications.auth-code-delivery",
      authCodeDeliveryJobName: "deliver-passwordless-auth-code"
    });
    expect(authProcessor.processAuthCodeDeliveryJob).toBeTypeOf("function");
  });
});
