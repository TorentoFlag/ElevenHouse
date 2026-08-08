import { describe, expect, it } from "vitest";
import * as manifestModule from "./platform-capability-manifest";
import { expectedPlatformCapabilityOperationContracts } from "./platform-capability-manifest-operation.fixture";

function guardDeclarationsForRefs() {
  const entry = manifestModule.platformCapabilityManifest.refs;
  return [
    ...entry.navigation.map((item) => ({
      kind: "navigation" as const,
      surfaceId: item.id,
      ownerModule: item.ownerModule,
      surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
      capability: "refs" as const
    })),
    ...entry.frontendRoutes.map((item) => ({
      kind: "frontend_route" as const,
      surfaceId: item.id,
      ownerModule: item.ownerModule,
      surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
      capability: "refs" as const
    })),
    ...[...entry.readOperations, ...entry.mutationOperations].map((item) => ({
      kind: "operation" as const,
      surfaceId: item.id,
      ownerModule: item.ownerModule,
      surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
      semanticKind: item.semanticKind,
      requirementFingerprint: manifestModule.platformCapabilityRequirementFingerprint(
        item.requirement
      )
    }))
  ];
}

describe("platform capability manifest round-three review contract", () => {
  it("matches an independent literal contract for every operation semantic, requirement, processor, and worker owner authority", () => {
    const operations = [
      ...Object.values(manifestModule.platformCapabilityManifest).flatMap((entry) => [
        ...entry.readOperations,
        ...entry.mutationOperations,
        ...entry.workerJobs
      ]),
      ...manifestModule.platformSharedCapabilitySurfaces
    ];
    const actual = Object.fromEntries(
      operations.map((operation) => [
        operation.id,
        {
          semanticKind: operation.semanticKind,
          requirement: operation.requirement,
          ...(operation.processor ? { processor: operation.processor } : {}),
          ...("entitlementSubjectAuthority" in operation && operation.entitlementSubjectAuthority
            ? { entitlementSubjectAuthority: operation.entitlementSubjectAuthority }
            : {})
        }
      ])
    );

    expect(operations).toHaveLength(130);
    expect(Object.keys(actual)).toHaveLength(130);
    expect(actual).toEqual(expectedPlatformCapabilityOperationContracts);
  });

  it("binds calculation and PDF resolution to persisted module plus methodCode", () => {
    const calculationRead = manifestModule.platformSharedCapabilitySurfaces.find(
      (surface) => surface.id === "calculations.resource.read"
    );
    const pdfWorker = manifestModule.platformCapabilityManifest.pdf.workerJobs.find(
      (surface) => surface.id === "pdf.render"
    );

    expect(calculationRead?.requirement).toMatchObject({
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode"
    });
    expect(pdfWorker?.requirement).toMatchObject({
      kind: "shared_with_resource_owner",
      selector: "persisted CalculationPdfJob.module + CalculationPdfJob.methodCode"
    });
  });

  it("binds pre-result chart jobs to ChartJobForProcessing.method with a chart-only map", () => {
    const chartJobRead = manifestModule.platformCapabilityManifest.engine.readOperations.find(
      (surface) => surface.id === "engine.chart-job.read"
    );
    const chartJobWorker = manifestModule.platformCapabilityManifest.engine.workerJobs.find(
      (surface) => surface.id === "engine.chart.execute"
    );
    const expectedRequirement = {
      kind: "resource_capability",
      selector: "persisted ChartJobForProcessing.method loaded by jobId",
      capabilityMap: {
        natal: ["engine", "natal"],
        synastry: ["engine", "synastry"],
        transit: ["engine", "forecast"],
        progression: ["engine", "forecast"],
        solar_return: ["engine", "solar"],
        horary: ["engine", "horar"]
      },
      unresolvedValues: ["astrocartography", "composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    };

    expect(chartJobRead?.requirement).toEqual(expectedRequirement);
    expect(chartJobWorker?.requirement).toEqual(expectedRequirement);
  });

  it("names the actual persisted owner fields for public, booking, and delivery operations", () => {
    const publicOrder = manifestModule.platformCapabilityManifest.products.mutationOperations.find(
      (surface) => surface.id === "products.public-order.create"
    );
    const publicBooking =
      manifestModule.platformCapabilityManifest.calendar.mutationOperations.find(
        (surface) => surface.id === "calendar.public-booking-intent.create"
      );
    const bookingRead = manifestModule.platformCapabilityManifest.calendar.readOperations.find(
      (surface) => surface.id === "calendar.booking.read"
    );
    const delivery = manifestModule.platformCapabilityManifest.inbox.workerJobs.find(
      (surface) => surface.id === "inbox.delivery"
    );

    expect(publicOrder?.requirement).toHaveProperty(
      "entitlementSubjectSelector",
      "persisted Product.ownerUserId resolved server-side; client input cannot select entitlement subject"
    );
    expect(publicBooking?.requirement).toHaveProperty(
      "entitlementSubjectSelector",
      "persisted Product.ownerUserId resolved server-side before booking hold; client input cannot select entitlement subject"
    );
    expect(bookingRead?.requirement).toHaveProperty(
      "ownerSelector",
      "persisted Booking.ownerUserId"
    );
    expect(delivery?.requirement).toHaveProperty(
      "ownerSelector",
      "persisted messagingThreads.astrologerUserId loaded by outboxEventId"
    );
    expect(delivery).toHaveProperty(
      "entitlementSubjectAuthority.persistedOwnerSelector",
      "persisted messagingThreads.astrologerUserId loaded by outboxEventId; MessagingDeliveryWorkItem projection not yet wired"
    );
  });

  it("requires every worker gate to reload a trusted persisted owner and distrust queue payload", () => {
    const workerJobs = Object.values(manifestModule.platformCapabilityManifest).flatMap(
      (entry) => entry.workerJobs
    );

    expect(workerJobs.map((worker) => worker.id)).toEqual([
      "engine.chart.execute",
      "pdf.render",
      "astrocal.generate",
      "funnels.booking-confirmed-enrollment-dispatch",
      "funnels.booking-lifecycle-dispatch",
      "inbox.delivery"
    ]);
    for (const worker of workerJobs) {
      expect(worker).toHaveProperty("processor");
      expect(worker).toHaveProperty("entitlementSubjectAuthority.persistedOwnerSelector");
      expect(worker).toHaveProperty(
        "entitlementSubjectAuthority.queuePayloadPolicy",
        "untrusted_reference_only"
      );
    }
  });

  it("keeps worker-backed capabilities unwired until persisted-owner authority is implemented", () => {
    const entry = manifestModule.platformCapabilityManifest.astrocal;
    const declarations = [
      ...entry.navigation.map((item) => ({
        kind: "navigation" as const,
        surfaceId: item.id,
        ownerModule: item.ownerModule,
        surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
        capability: "astrocal" as const
      })),
      ...entry.frontendRoutes.map((item) => ({
        kind: "frontend_route" as const,
        surfaceId: item.id,
        ownerModule: item.ownerModule,
        surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
        capability: "astrocal" as const
      })),
      ...[...entry.readOperations, ...entry.mutationOperations, ...entry.workerJobs].map(
        (item) => ({
          kind: "operation" as const,
          surfaceId: item.id,
          ownerModule: item.ownerModule,
          surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
          semanticKind: item.semanticKind,
          requirementFingerprint: manifestModule.platformCapabilityRequirementFingerprint(
            item.requirement
          )
        })
      )
    ];

    expect(manifestModule.derivePlatformCapabilityEnforcement(entry, declarations)).toBe("unwired");
  });

  it("fails closed when an otherwise complete guard registry has duplicates or orphans", () => {
    const entry = manifestModule.platformCapabilityManifest.refs;
    const exact = guardDeclarationsForRefs();
    const orphan = {
      ...exact[0]!,
      surfaceId: "orphan.refs.navigation",
      surfaceFingerprint: "stale-orphan-fingerprint"
    };

    expect(manifestModule.derivePlatformCapabilityEnforcement(entry, exact)).toBe("ready");
    expect(manifestModule.derivePlatformCapabilityEnforcement(entry, [...exact, exact[0]!])).toBe(
      "unwired"
    );
    expect(manifestModule.derivePlatformCapabilityEnforcement(entry, [...exact, orphan])).toBe(
      "unwired"
    );
  });

  it("fails closed when a correct shared declaration is accompanied by a stale shared declaration", () => {
    const entry = manifestModule.platformCapabilityManifest.products;
    const directDeclarations = [
      ...entry.navigation.map((item) => ({
        kind: "navigation" as const,
        surfaceId: item.id,
        ownerModule: item.ownerModule,
        surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
        capability: "products" as const
      })),
      ...entry.frontendRoutes.map((item) => ({
        kind: "frontend_route" as const,
        surfaceId: item.id,
        ownerModule: item.ownerModule,
        surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
        capability: "products" as const
      })),
      ...[...entry.readOperations, ...entry.mutationOperations].map((item) => ({
        kind: "operation" as const,
        surfaceId: item.id,
        ownerModule: item.ownerModule,
        surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
        semanticKind: item.semanticKind,
        requirementFingerprint: manifestModule.platformCapabilityRequirementFingerprint(
          item.requirement
        )
      }))
    ];
    const sharedDeclarations = entry.sharedSurfaceRefs.map((surfaceId) => {
      const item = manifestModule.platformSharedCapabilitySurfaces.find(
        (surface) => surface.id === surfaceId
      )!;
      return {
        kind: "operation" as const,
        surfaceId: item.id,
        ownerModule: item.ownerModule,
        surfaceFingerprint: manifestModule.platformCapabilitySurfaceFingerprint(item),
        semanticKind: item.semanticKind,
        requirementFingerprint: manifestModule.platformCapabilityRequirementFingerprint(
          item.requirement
        )
      };
    });
    const staleShared = {
      ...sharedDeclarations[0]!,
      requirementFingerprint: "stale-resource-selector"
    };

    expect(
      manifestModule.derivePlatformCapabilityEnforcement(entry, [
        ...directDeclarations,
        ...sharedDeclarations,
        staleShared
      ])
    ).toBe("unwired");
  });

  it("uses exact surface registries instead of broad identity, payment, or history boundaries", () => {
    expect(manifestModule.platformCapabilityBoundaryExclusions).toEqual([]);
    expect(
      (manifestModule as Record<string, unknown>).platformCapabilityContinuationExclusions
    ).toBeDefined();

    const exclusionIds = manifestModule.platformCapabilitySurfaceExclusions.map(
      (entry) => entry.surface.id
    );
    expect(exclusionIds).toContain("exclude.ui.root");
    expect(exclusionIds).toContain("exclude.ui.not-found");
    expect(exclusionIds).toContain("exclude.nav.dashboard");
    expect(exclusionIds).toContain("exclude.nav.personal-page");
    expect(exclusionIds).toContain("exclude.identity.astrologer.passwordless.request-code");
    expect(exclusionIds).toContain("exclude.identity.public.logout");

    expect(exclusionIds.filter((id) => id.startsWith("exclude.identity."))).toEqual([
      "exclude.identity.astrologer.passwordless.request-code",
      "exclude.identity.astrologer.passwordless.verify-code",
      "exclude.identity.astrologer.registration.verify-code",
      "exclude.identity.astrologer.current-account.read",
      "exclude.identity.astrologer.logout",
      "exclude.identity.public.passwordless.request-code",
      "exclude.identity.public.passwordless.verify-code",
      "exclude.identity.public.registration.verify-code",
      "exclude.identity.public.current-account.read",
      "exclude.identity.public.logout"
    ]);

    expect(
      (manifestModule as Record<string, unknown>).platformCapabilityContinuationExclusions
    ).toEqual([
      expect.objectContaining({
        id: "exclude.payment.webhook.continuation",
        surface: expect.objectContaining({ identifier: "POST /webhooks/arc-pay" }),
        processor: expect.objectContaining({
          identifier: "createPaymentWebhookProcessor#process"
        }),
        commands: expect.arrayContaining([
          expect.objectContaining({ identifier: "ingestPaymentProviderWebhook" }),
          expect.objectContaining({ identifier: "capturePaymentProviderWebhook" }),
          expect.objectContaining({ identifier: "releaseTerminalPaymentProviderWebhook" }),
          expect.objectContaining({ identifier: "recordPaymentReversalProviderWebhook" }),
          expect.objectContaining({ identifier: "recordProviderSettlementMatch" }),
          expect.objectContaining({ identifier: "recordProviderReconciliationException" })
        ])
      }),
      expect.objectContaining({
        id: "exclude.payment.settlement-reconciliation.continuation",
        surface: expect.objectContaining({
          identifier: "startSettlementLedgerReconciliationInterval"
        }),
        processor: expect.objectContaining({
          identifier: "createSettlementLedgerReconciliationProcessor#tick"
        }),
        commands: expect.arrayContaining([
          expect.objectContaining({
            identifier: "createArcPaySettlementLedgerClient#listSettlementLedger"
          }),
          expect.objectContaining({ identifier: "reconcileProviderSettlementLedgerBatch" })
        ])
      }),
      expect.objectContaining({
        id: "exclude.payment.hold-release.continuation",
        surface: expect.objectContaining({ identifier: "startHoldReleaseInterval" }),
        processor: expect.objectContaining({ identifier: "createHoldReleaseProcessor#tick" }),
        commands: [expect.objectContaining({ identifier: "releaseDueCapturedSaleHolds" })]
      })
    ]);
  });

  it("publishes an exact reviewed physical-collision multiplicity whitelist", () => {
    expect(
      (manifestModule as Record<string, unknown>).platformCapabilityPhysicalCollisionWhitelist
    ).toEqual({
      "apps/astrologer-api/src/modules/calculations/calculations.controller.ts|GET /calculations": 2,
      "apps/astrologer-api/src/modules/charts/charts.controller.ts|POST /charts/natal/jobs": 2,
      "apps/astrologer-api/src/modules/media/media.controller.ts|POST /media/upload-intents": 5,
      "apps/astrologer-api/src/modules/media/media.controller.ts|POST /media/:mediaId/complete": 5
    });
  });
});
