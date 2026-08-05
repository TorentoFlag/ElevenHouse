import {
  platformCapabilityCounterFingerprint,
  platformCapabilityRequirementFingerprint,
  platformCapabilitySurfaceFingerprint,
  type PlatformCapabilityExpiryFallback,
  PlatformCapabilityGuardDeclaration,
  PlatformCapabilityNonWorkerOperationSurface,
  PlatformCapabilityOperationOwnership,
  PlatformCapabilityOperationSurface,
  PlatformCapabilityOwner,
  PlatformCapabilityRequirement,
  PlatformCapabilitySurface,
  PlatformCapabilityUnresolvedOperation,
  PlatformCapabilityUsageCounter,
  PlatformCapabilityWorkerOperationSurface,
  RawPlatformCapabilityManifestEntry
} from "./platform-capability-manifest-model";

type PlatformPlanFeatureCode = RawPlatformCapabilityManifestEntry["code"];

export const navigationSource = "apps/astrologer-web/src/common/i18n/astrologerCopy.ts";
export const routerSource = "apps/astrologer-web/src/router.tsx";
const chartsController = "apps/astrologer-api/src/modules/charts/charts.controller.ts";
const calculationsController =
  "apps/astrologer-api/src/modules/calculations/calculations.controller.ts";

export const owners = {
  navigation: "astrologer-web.astrologerCopyByLocale",
  router: "astrologer-web.astrologerRoutes",
  charts: "astrologer-api.ChartsModule",
  calculations: "astrologer-api.CalculationsModule",
  chartsPdf: "astrologer-api.ChartsModule",
  matrix: "astrologer-api.MatrixModule",
  numerology: "astrologer-api.NumerologyModule",
  humanDesign: "astrologer-api.HumanDesignModule",
  astroCalendar: "astrologer-api.AstroCalendarModule",
  dictionary: "astrologer-api.DictionaryModule",
  dictionaryAi: "astrologer-api.DictionaryAiModule",
  products: "astrologer-api.ProductsModule",
  calendar: "astrologer-api.CalendarModule",
  availability: "astrologer-api.AvailabilityModule",
  bookings: "astrologer-api.BookingsModule",
  clients: "astrologer-api.ClientsModule",
  flows: "astrologer-api.FlowsModule",
  messaging: "astrologer-api.MessagingModule",
  media: "astrologer-api.MediaModule",
  publicOrders: "public-api.OrdersModule",
  publicClientCommerce: "public-api.ClientCommerceModule",
  publicBooking: "public-api.BookingModule",
  chartWorker: "chart-worker.chart-calculation",
  pdfWorker: "workers.calculation-pdf",
  flowWorker: "workers.flows",
  messagingWorker: "notification-worker.messaging"
} as const;

const direct = (...capabilities: PlatformPlanFeatureCode[]): PlatformCapabilityRequirement => ({
  kind: "all_of",
  capabilities
});

const trustedOwner = (
  capabilities: readonly PlatformPlanFeatureCode[],
  entitlementSubjectSelector: string
): PlatformCapabilityRequirement => ({
  kind: "all_of",
  capabilities,
  entitlementSubjectSelector,
  unknownSubjectPolicy: "deny"
});

const historical = (
  capabilities: readonly PlatformPlanFeatureCode[],
  ownerSelector: string,
  historicalEvidenceSelector: string,
  collectionMode: "not_applicable" | "filter_each_resource" = "not_applicable"
): PlatformCapabilityRequirement => ({
  kind: "capability_or_historical_obligation",
  capabilities,
  ownerSelector,
  historicalEvidenceSelector,
  collectionMode,
  unknownValuePolicy: "deny"
});

const chartCapabilityMap = {
  "chart:natal": ["engine", "natal"],
  "chart:synastry": ["engine", "synastry"],
  "chart:transit": ["engine", "forecast"],
  "chart:progression": ["engine", "forecast"],
  "chart:solar_return": ["engine", "solar"],
  "chart:horary": ["engine", "horar"]
} as const satisfies Readonly<Record<string, readonly PlatformPlanFeatureCode[]>>;

const chartJobCapabilityMap = {
  natal: ["engine", "natal"],
  synastry: ["engine", "synastry"],
  transit: ["engine", "forecast"],
  progression: ["engine", "forecast"],
  solar_return: ["engine", "solar"],
  horary: ["engine", "horar"]
} as const satisfies Readonly<Record<string, readonly PlatformPlanFeatureCode[]>>;

const calculationCapabilityMap = {
  ...chartCapabilityMap,
  "matrix:ladini_22": ["matrix"],
  "numerology:pythagorean": ["numerology"],
  "human_design:human_design_classic": ["hd"]
} as const satisfies Readonly<Record<string, readonly PlatformPlanFeatureCode[]>>;

const chartResourceRequirement: PlatformCapabilityRequirement = {
  kind: "resource_capability",
  selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
  capabilityMap: calculationCapabilityMap,
  unresolvedValues: ["chart:astrocartography", "chart:composite"],
  exemptValues: [],
  unknownValuePolicy: "deny",
  collectionMode: "not_applicable"
};

const chartJobResourceRequirement: PlatformCapabilityRequirement = {
  kind: "resource_capability",
  selector: "persisted ChartJobForProcessing.method loaded by jobId",
  capabilityMap: chartJobCapabilityMap,
  unresolvedValues: ["astrocartography", "composite"],
  exemptValues: [],
  unknownValuePolicy: "deny",
  collectionMode: "not_applicable"
};

const calculationCollectionRequirement: PlatformCapabilityRequirement = {
  ...chartResourceRequirement,
  selector: "each persisted CalculationRecord.module + CalculationRecord.methodCode",
  collectionMode: "filter_each_resource"
};

const mediaPurposeCapabilityMap = {
  product_cover: ["products"]
} as const satisfies Readonly<Record<string, readonly PlatformPlanFeatureCode[]>>;

export const mediaPurposeExemptValues = [
  "profile_avatar",
  "profile_cover",
  "verification_identity_document",
  "verification_qualification_document"
] as const;

export const surface = (
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string
): PlatformCapabilitySurface => ({ id, ownerModule, sourcePath, identifier });

const operation = (
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string,
  semanticKind: PlatformCapabilityNonWorkerOperationSurface["semanticKind"],
  requirement: PlatformCapabilityRequirement
): PlatformCapabilityNonWorkerOperationSurface => ({
  ...surface(id, ownerModule, sourcePath, identifier),
  semanticKind,
  requirement
});

const nav = (id: string, itemId: string, href: string): PlatformCapabilitySurface =>
  surface(id, owners.navigation, navigationSource, `navigation.items[id=${itemId},href=${href}]`);

const route = (id: string, path: string): PlatformCapabilitySurface =>
  surface(id, owners.router, routerSource, path);

const api = (
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string,
  semanticKind: PlatformCapabilityNonWorkerOperationSurface["semanticKind"],
  requirement: PlatformCapabilityRequirement
): PlatformCapabilityNonWorkerOperationSurface =>
  operation(id, ownerModule, sourcePath, identifier, semanticKind, requirement);

const job = (
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string,
  requirement: PlatformCapabilityRequirement,
  processor: PlatformCapabilityWorkerOperationSurface["processor"],
  persistedOwnerSelector: string
): PlatformCapabilityWorkerOperationSurface => ({
  ...surface(id, ownerModule, sourcePath, identifier),
  semanticKind: "worker",
  requirement,
  processor,
  entitlementSubjectAuthority: {
    persistedOwnerSelector,
    queuePayloadPolicy: "untrusted_reference_only",
    availability: "unwired",
    publicationBlocker: true
  }
});

const implementedOwner = (module: string, sourcePath: string): PlatformCapabilityOwner => ({
  kind: "implemented",
  module,
  sourcePath
});

const unimplementedOwner = (module: string): PlatformCapabilityOwner => ({
  kind: "unimplemented",
  module
});

const directOwnership: PlatformCapabilityOperationOwnership = { kind: "direct" };

const baseEntry = (
  code: PlatformPlanFeatureCode,
  owner: PlatformCapabilityOwner,
  expiryFallback: PlatformCapabilityExpiryFallback,
  requiredCapabilities: readonly PlatformPlanFeatureCode[] = []
) => ({
  code,
  owner,
  navigation: [],
  frontendRoutes: [],
  readOperations: [],
  mutationOperations: [],
  workerJobs: [],
  sharedSurfaceRefs: [],
  expiryFallback,
  requiredCapabilities,
  operationOwnership: directOwnership,
  unresolvedMappingRefs: [],
  usageCounters: []
});

const absent = (
  code: PlatformPlanFeatureCode,
  reason: string
): RawPlatformCapabilityManifestEntry => ({
  ...baseEntry(code, unimplementedOwner(code), "unavailable"),
  availability: "absent",
  unavailableReason: reason
});

const bookingCounter: PlatformCapabilityUsageCounter = {
  code: "bookings",
  scope: "unique confirmed bookings from public and manual sources in the versioned usage window",
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
};

const aiCounter: PlatformCapabilityUsageCounter = {
  code: "ai_requests",
  scope: "every provider-backed AI generation across owning modules, keyed by logical request",
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
};

const automationCounter: PlatformCapabilityUsageCounter = {
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
};

const seatCounter: PlatformCapabilityUsageCounter = {
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
};

export const platformSharedCapabilitySurfaces = [
  // `calculations.resource.*` is the stable physical-surface namespace. Feature
  // entries reference it; the runtime resolver applies the exact persisted
  // module+method map instead of inventing module-specific Nest routes.
  api(
    "calculations.resource.list",
    owners.calculations,
    calculationsController,
    "GET /calculations?module=<explicit module>",
    "read",
    calculationCollectionRequirement
  ),
  api(
    "calculations.resource.read",
    owners.calculations,
    calculationsController,
    "GET /calculations/:calculationId",
    "read",
    chartResourceRequirement
  ),
  api(
    "calculations.resource.link-client",
    owners.calculations,
    calculationsController,
    "POST /calculations/:calculationId/link-client",
    "mutation",
    chartResourceRequirement
  ),
  api(
    "calculations.resource.publish",
    owners.calculations,
    calculationsController,
    "POST /calculations/:calculationId/publish",
    "mutation",
    chartResourceRequirement
  ),
  api(
    "calculations.resource.interpretation.create",
    owners.calculations,
    calculationsController,
    "POST /calculations/:calculationId/interpretations",
    "mutation",
    chartResourceRequirement
  ),
  api(
    "calculations.resource.interpretation.approve",
    owners.calculations,
    calculationsController,
    "POST /calculations/:calculationId/interpretations/:interpretationId/approve",
    "mutation",
    chartResourceRequirement
  ),
  api(
    "calculations.resource.archive",
    owners.calculations,
    calculationsController,
    "POST /calculations/:calculationId/archive",
    "mutation",
    chartResourceRequirement
  ),
  api(
    "media.upload-intent.create",
    owners.media,
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/upload-intents",
    "mutation",
    {
      kind: "resource_capability",
      selector:
        "validated upload purpose from request; authenticated astrologer is entitlement subject",
      capabilityMap: mediaPurposeCapabilityMap,
      unresolvedValues: [],
      exemptValues: mediaPurposeExemptValues,
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  ),
  api(
    "media.upload.complete",
    owners.media,
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/:mediaId/complete",
    "mutation",
    {
      kind: "resource_capability",
      selector: "persisted media_assets.purpose; request body is not entitlement authority",
      capabilityMap: mediaPurposeCapabilityMap,
      unresolvedValues: [],
      exemptValues: mediaPurposeExemptValues,
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  )
] as const satisfies readonly PlatformCapabilityOperationSurface[];

const calculationSharedSurfaceRefs = platformSharedCapabilitySurfaces
  .filter((item) => item.id.startsWith("calculations.resource."))
  .map((item) => item.id);
const productMediaSharedSurfaceRefs = [
  "media.upload-intent.create",
  "media.upload.complete"
] as const;

export const platformUnresolvedCapabilitySurfaces = [
  {
    ...surface(
      "chart.astrocartography.create",
      owners.charts,
      chartsController,
      "POST /charts/astrocartography/jobs"
    ),
    reason:
      "Astrocartography has no approved tariff feature code and must not inherit forecast access.",
    publicationBlocker: true,
    candidateCapabilities: []
  },
  {
    ...surface(
      "chart.composite.create",
      owners.charts,
      chartsController,
      "POST /charts/composite/jobs"
    ),
    reason: "Composite has no approved tariff feature code and must not inherit synastry access.",
    publicationBlocker: true,
    candidateCapabilities: []
  },
  {
    ...surface(
      "chart.child-purpose",
      owners.charts,
      chartsController,
      "POST /charts/natal/jobs [server-visible child purpose missing]"
    ),
    reason:
      "Frontend child mode calls the ordinary natal command, so a tariff guard cannot distinguish child work.",
    publicationBlocker: true,
    candidateCapabilities: ["child", "natal"]
  },
  {
    ...surface(
      "calculations.list-all.entitlement-projection",
      owners.calculations,
      calculationsController,
      "GET /calculations?module=all"
    ),
    reason:
      "The default mixed collection needs per-row entitlement or historical-access projection before it can avoid cross-capability leakage.",
    publicationBlocker: true,
    candidateCapabilities: ["engine", "matrix", "numerology", "hd"]
  },
  {
    ...surface(
      "inbox.paid-obligation-allow-rule",
      owners.messaging,
      "packages/domain/src/messaging/index.ts",
      "accepted queued message or already-paid obligation thread"
    ),
    reason:
      "Expiry must not prevent fulfillment of accepted delivery or an already-paid client obligation, but the persisted evidence policy is not wired.",
    publicationBlocker: true,
    candidateCapabilities: ["inbox"]
  }
] as const satisfies readonly PlatformCapabilityUnresolvedOperation[];

export const rawPlatformCapabilityManifest = {
  engine: {
    ...baseEntry(
      "engine",
      implementedOwner(owners.calculations, calculationsController),
      "read_only"
    ),
    availability: "live",
    navigation: [nav("nav.engine", "chartEngine", "/chart-engine")],
    frontendRoutes: [route("route.engine", "/chart-engine")],
    readOperations: [
      api(
        "engine.chart-job.read",
        owners.charts,
        chartsController,
        "GET /charts/jobs/:jobId",
        "read",
        chartJobResourceRequirement
      ),
      api(
        "engine.chart-result.read",
        owners.charts,
        chartsController,
        "GET /charts/calculations/:calculationId",
        "read",
        chartResourceRequirement
      ),
      api(
        "engine.dictionary.by-codes.read",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "GET /dictionary/entries/by-codes",
        "read",
        direct("engine")
      )
    ],
    mutationOperations: [
      api(
        "engine.chart.recalculate",
        owners.charts,
        chartsController,
        "POST /charts/calculations/:calculationId/recalculate",
        "generation",
        chartResourceRequirement
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    workerJobs: [
      job(
        "engine.chart.execute",
        owners.chartWorker,
        "apps/chart-worker/src/chart-jobs.queue.ts",
        "chart.calculation/calculate-natal-chart",
        chartJobResourceRequirement,
        {
          sourcePath: "apps/chart-worker/src/chart-jobs.processor.ts",
          identifier: "processChartCalculationJob"
        },
        "persisted ChartJobForProcessing.ownerUserId loaded by jobId"
      )
    ],
    unresolvedMappingRefs: [
      "chart.astrocartography.create",
      "chart.composite.create",
      "calculations.list-all.entitlement-projection"
    ]
  },
  pdf: {
    ...baseEntry(
      "pdf",
      implementedOwner(
        owners.pdfWorker,
        "apps/workers/src/calculation-pdf/calculation-pdf.queue.ts"
      ),
      "read_only"
    ),
    availability: "partial",
    unavailableReason:
      "Chart PDF supports natal only; every operation also requires its selected owning capability.",
    operationOwnership: {
      kind: "shared_with_operation_owner",
      sharedCapability: "pdf",
      applicableOwnerCapabilities: ["natal", "matrix", "numerology", "hd"],
      publicationOwnerRequirement: "at_least_one_applicable_owner"
    },
    readOperations: [
      api(
        "pdf.chart.latest",
        owners.chartsPdf,
        "apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts",
        "GET /charts/calculations/:calculationId/report/pdf",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "natal" }
      ),
      api(
        "pdf.chart.download",
        owners.chartsPdf,
        "apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts",
        "GET /charts/calculations/:calculationId/report/pdf/:jobId/download",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "natal" }
      ),
      api(
        "pdf.matrix.latest",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts",
        "GET /matrix/calculations/:calculationId/report/pdf",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "matrix" }
      ),
      api(
        "pdf.matrix.download",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts",
        "GET /matrix/calculations/:calculationId/report/pdf/:jobId/download",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "matrix" }
      ),
      api(
        "pdf.numerology.latest",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
        "GET /numerology/calculations/:calculationId/report/pdf",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "numerology" }
      ),
      api(
        "pdf.numerology.download",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
        "GET /numerology/calculations/:calculationId/report/pdf/:jobId/download",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "numerology" }
      ),
      api(
        "pdf.hd.latest",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
        "GET /human-design/calculations/:calculationId/report/pdf",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "hd" }
      ),
      api(
        "pdf.hd.download",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
        "GET /human-design/calculations/:calculationId/report/pdf/:jobId/download",
        "read",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "hd" }
      )
    ],
    mutationOperations: [
      api(
        "pdf.chart.enqueue",
        owners.chartsPdf,
        "apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts",
        "POST /charts/calculations/:calculationId/report/pdf",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "natal" }
      ),
      api(
        "pdf.matrix.enqueue",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts",
        "POST /matrix/calculations/:calculationId/report/pdf",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "matrix" }
      ),
      api(
        "pdf.numerology.enqueue",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
        "POST /numerology/calculations/:calculationId/report/pdf",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "numerology" }
      ),
      api(
        "pdf.hd.enqueue",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
        "POST /human-design/calculations/:calculationId/report/pdf",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "hd" }
      )
    ],
    workerJobs: [
      job(
        "pdf.render",
        owners.pdfWorker,
        "apps/workers/src/calculation-pdf/calculation-pdf.queue.ts",
        "calculation.pdf/render-calculation-pdf",
        {
          kind: "shared_with_resource_owner",
          sharedCapability: "pdf",
          selector: "persisted CalculationPdfJob.module + CalculationPdfJob.methodCode",
          capabilityMap: {
            "chart:natal": ["natal"],
            "matrix:ladini_22": ["matrix"],
            "numerology:pythagorean": ["numerology"],
            "human_design:human_design_classic": ["hd"]
          },
          unresolvedValues: [],
          unknownValuePolicy: "deny"
        },
        {
          sourcePath: "apps/workers/src/calculation-pdf/calculation-pdf.processor.ts",
          identifier: "processCalculationPdfJob"
        },
        "persisted CalculationPdfJob.ownerUserId loaded by jobId"
      )
    ]
  },
  natal: {
    ...baseEntry("natal", implementedOwner(owners.charts, chartsController), "read_only", [
      "engine"
    ]),
    availability: "live",
    mutationOperations: [
      api(
        "natal.job.create",
        owners.charts,
        chartsController,
        "POST /charts/natal/jobs",
        "generation",
        direct("engine", "natal")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["chart.child-purpose", "calculations.list-all.entitlement-projection"]
  },
  synastry: {
    ...baseEntry("synastry", implementedOwner(owners.charts, chartsController), "read_only", [
      "engine"
    ]),
    availability: "live",
    mutationOperations: [
      api(
        "synastry.job.create",
        owners.charts,
        chartsController,
        "POST /charts/synastry/jobs",
        "generation",
        direct("engine", "synastry")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  forecast: {
    ...baseEntry("forecast", implementedOwner(owners.charts, chartsController), "read_only", [
      "engine"
    ]),
    availability: "live",
    mutationOperations: [
      api(
        "forecast.transit.create",
        owners.charts,
        chartsController,
        "POST /charts/transits/jobs",
        "generation",
        direct("engine", "forecast")
      ),
      api(
        "forecast.progression.create",
        owners.charts,
        chartsController,
        "POST /charts/progressions/jobs",
        "generation",
        direct("engine", "forecast")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  solar: {
    ...baseEntry("solar", implementedOwner(owners.charts, chartsController), "read_only", [
      "engine"
    ]),
    availability: "live",
    mutationOperations: [
      api(
        "solar.return.create",
        owners.charts,
        chartsController,
        "POST /charts/solar-return/jobs",
        "generation",
        direct("engine", "solar")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  matrix: {
    ...baseEntry(
      "matrix",
      implementedOwner(
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix.controller.ts"
      ),
      "read_only"
    ),
    availability: "live",
    navigation: [nav("nav.matrix", "destinyMatrix", "/matrix")],
    frontendRoutes: [route("route.matrix", "/matrix")],
    readOperations: [
      api(
        "matrix.notes.list",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
        "GET /matrix/calculations/:calculationId/notes",
        "read",
        direct("matrix")
      ),
      api(
        "matrix.interpretations.read",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
        "GET /matrix/interpretations",
        "read",
        direct("matrix")
      ),
      api(
        "matrix.report.read",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts",
        "GET /matrix/calculations/:calculationId/report",
        "read",
        direct("matrix")
      )
    ],
    mutationOperations: [
      api(
        "matrix.preview",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
        "POST /matrix/preview",
        "generation",
        direct("matrix")
      ),
      api(
        "matrix.calculation.create",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
        "POST /matrix/calculations",
        "generation",
        direct("matrix")
      ),
      api(
        "matrix.calculation.recalculate",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
        "POST /matrix/calculations/:calculationId/recalculate",
        "generation",
        direct("matrix")
      ),
      api(
        "matrix.projection.generate",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
        "GET /matrix/calculations/:calculationId/projection",
        "generation",
        direct("matrix")
      ),
      api(
        "matrix.note.create",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
        "POST /matrix/calculations/:calculationId/notes",
        "mutation",
        direct("matrix")
      ),
      api(
        "matrix.note.update",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
        "PUT /matrix/calculations/:calculationId/notes/:noteId",
        "mutation",
        direct("matrix")
      ),
      api(
        "matrix.note.delete",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
        "DELETE /matrix/calculations/:calculationId/notes/:noteId",
        "mutation",
        direct("matrix")
      ),
      api(
        "matrix.report.save",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts",
        "PUT /matrix/calculations/:calculationId/report",
        "mutation",
        direct("matrix")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  numerology: {
    ...baseEntry(
      "numerology",
      implementedOwner(
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology.controller.ts"
      ),
      "read_only"
    ),
    availability: "live",
    navigation: [nav("nav.numerology", "numerology", "/numerology")],
    frontendRoutes: [route("route.numerology", "/numerology")],
    mutationOperations: [
      api(
        "numerology.preview",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
        "POST /numerology/preview",
        "generation",
        direct("numerology")
      ),
      api(
        "numerology.calculation.create",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
        "POST /numerology/calculations",
        "generation",
        direct("numerology")
      ),
      api(
        "numerology.calculation.recalculate",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
        "POST /numerology/calculations/:calculationId/recalculate",
        "generation",
        direct("numerology")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  hd: {
    ...baseEntry(
      "hd",
      implementedOwner(
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design.controller.ts"
      ),
      "read_only"
    ),
    availability: "live",
    navigation: [nav("nav.hd", "humanDesign", "/human-design")],
    frontendRoutes: [route("route.hd", "/human-design")],
    mutationOperations: [
      api(
        "hd.preview",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
        "POST /human-design/preview",
        "generation",
        direct("hd")
      ),
      api(
        "hd.calculation.create",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
        "POST /human-design/calculations",
        "generation",
        direct("hd")
      ),
      api(
        "hd.calculation.recalculate",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
        "POST /human-design/calculations/:calculationId/recalculate",
        "generation",
        direct("hd")
      ),
      api(
        "hd.transits.generate",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
        "GET /human-design/calculations/:calculationId/transits",
        "generation",
        direct("hd")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  horar: {
    ...baseEntry("horar", implementedOwner(owners.charts, chartsController), "read_only", [
      "engine"
    ]),
    availability: "live",
    mutationOperations: [
      api(
        "horar.job.create",
        owners.charts,
        chartsController,
        "POST /charts/horary/jobs",
        "generation",
        direct("engine", "horar")
      )
    ],
    sharedSurfaceRefs: calculationSharedSurfaceRefs,
    unresolvedMappingRefs: ["calculations.list-all.entitlement-projection"]
  },
  vedic: absent("vedic", "No canonical Jyotish module, route, API command, or worker job exists."),
  astrocal: {
    ...baseEntry(
      "astrocal",
      implementedOwner(
        owners.astroCalendar,
        "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts"
      ),
      "read_only",
      ["engine"]
    ),
    availability: "live",
    navigation: [nav("nav.astrocal", "astroCalendar", "/astro-calendar")],
    frontendRoutes: [route("route.astrocal", "/astro-calendar")],
    readOperations: [
      api(
        "astrocal.range.read",
        owners.astroCalendar,
        "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
        "GET /astro-calendar/range",
        "read",
        direct("engine", "astrocal")
      )
    ],
    mutationOperations: [
      api(
        "astrocal.generation.create",
        owners.astroCalendar,
        "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
        "POST /astro-calendar/generations",
        "generation",
        direct("engine", "astrocal")
      ),
      api(
        "astrocal.generation.retry",
        owners.astroCalendar,
        "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
        "POST /astro-calendar/generations/:generationId/retry",
        "generation",
        direct("engine", "astrocal")
      )
    ],
    workerJobs: [
      job(
        "astrocal.generate",
        owners.chartWorker,
        "apps/chart-worker/src/chart-jobs.queue.ts",
        "chart.calculation/generate-astro-calendar",
        direct("engine", "astrocal"),
        {
          sourcePath: "apps/chart-worker/src/astro-calendar-jobs.processor.ts",
          identifier: "processAstroCalendarGenerationJob"
        },
        "persisted AstroCalendarGeneration.ownerUserId loaded by generationId"
      )
    ]
  },
  child: {
    ...baseEntry("child", implementedOwner(owners.charts, chartsController), "unavailable", [
      "natal"
    ]),
    availability: "partial",
    unavailableReason:
      "Child mode calls ordinary natal operations without a server-visible purpose.",
    unresolvedMappingRefs: ["chart.child-purpose"]
  },
  page: absent(
    "page",
    "No astrologer PublicPage editor exists; /a/:handle is direct-link join foundation and must not become a tariff surface."
  ),
  products: {
    ...baseEntry(
      "products",
      implementedOwner(
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts"
      ),
      "read_only"
    ),
    availability: "live",
    navigation: [nav("nav.products", "products", "/products")],
    frontendRoutes: [route("route.products", "/products")],
    readOperations: [
      api(
        "products.list",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "GET /products",
        "read",
        direct("products")
      ),
      api(
        "products.summary",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "GET /products/summary",
        "read",
        direct("products")
      ),
      api(
        "products.templates",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "GET /products/templates",
        "read",
        direct("products")
      ),
      api(
        "products.read",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "GET /products/:productId",
        "read",
        direct("products")
      ),
      api(
        "products.public-purchase-options.read",
        owners.publicClientCommerce,
        "apps/public-api/src/modules/client-commerce/client-commerce.controller.ts",
        "GET /me/astrologers/:astrologerUserId/purchase-options",
        "read",
        trustedOwner(
          ["products"],
          "persisted Product.ownerUserId resolved server-side after the explicit client-astrologer relationship"
        )
      ),
      api(
        "products.public-available-slots.read",
        owners.publicClientCommerce,
        "apps/public-api/src/modules/client-commerce/client-commerce.controller.ts",
        "GET /me/astrologers/:astrologerUserId/available-slots",
        "read",
        trustedOwner(
          ["products"],
          "persisted live Product.ownerUserId resolved server-side after the explicit client-astrologer relationship"
        )
      )
    ],
    mutationOperations: [
      api(
        "products.template-draft.create",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "POST /products/templates/:templateCode/drafts",
        "mutation",
        direct("products")
      ),
      api(
        "products.create",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "POST /products",
        "mutation",
        direct("products")
      ),
      api(
        "products.update",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "PUT /products/:productId",
        "mutation",
        direct("products")
      ),
      api(
        "products.publish",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "POST /products/:productId/publish",
        "mutation",
        direct("products")
      ),
      api(
        "products.move-to-draft",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "POST /products/:productId/move-to-draft",
        "mutation",
        direct("products")
      ),
      api(
        "products.archive",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "POST /products/:productId/archive",
        "mutation",
        direct("products")
      ),
      api(
        "products.duplicate",
        owners.products,
        "apps/astrologer-api/src/modules/products/products.controller.ts",
        "POST /products/:productId/duplicate",
        "mutation",
        direct("products")
      ),
      api(
        "products.public-order.create",
        owners.publicOrders,
        "apps/public-api/src/modules/orders/orders.controller.ts",
        "POST /orders",
        "mutation",
        trustedOwner(
          ["products"],
          "persisted Product.ownerUserId resolved server-side; client input cannot select entitlement subject"
        )
      )
    ],
    sharedSurfaceRefs: productMediaSharedSurfaceRefs
  },
  calendar: {
    ...baseEntry(
      "calendar",
      implementedOwner(
        owners.calendar,
        "apps/astrologer-api/src/modules/calendar/calendar.controller.ts"
      ),
      "read_only"
    ),
    availability: "partial",
    unavailableReason:
      "Internal calendar exists, but promised public online booking is incomplete.",
    navigation: [nav("nav.calendar", "calendar", "/calendar")],
    frontendRoutes: [route("route.calendar", "/calendar")],
    readOperations: [
      api(
        "calendar.range.read",
        owners.calendar,
        "apps/astrologer-api/src/modules/calendar/calendar.controller.ts",
        "GET /calendar/range",
        "read",
        direct("calendar")
      ),
      api(
        "calendar.availability.read",
        owners.availability,
        "apps/astrologer-api/src/modules/availability/availability.controller.ts",
        "GET /availability/schedules/default",
        "read",
        direct("calendar")
      ),
      api(
        "calendar.booking-slots.read",
        owners.bookings,
        "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
        "GET /bookings/available-slots",
        "read",
        direct("calendar")
      ),
      api(
        "calendar.booking.read",
        owners.bookings,
        "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
        "GET /bookings/:bookingId",
        "read",
        historical(
          ["calendar"],
          "persisted Booking.ownerUserId",
          "persisted booking/order entitlement snapshot permits historical fulfillment"
        )
      )
    ],
    mutationOperations: [
      api(
        "calendar.block.create",
        owners.calendar,
        "apps/astrologer-api/src/modules/calendar/calendar.controller.ts",
        "POST /calendar/blocks",
        "mutation",
        direct("calendar")
      ),
      api(
        "calendar.block.delete",
        owners.calendar,
        "apps/astrologer-api/src/modules/calendar/calendar.controller.ts",
        "DELETE /calendar/blocks/:blockId",
        "mutation",
        direct("calendar")
      ),
      api(
        "calendar.availability.update",
        owners.availability,
        "apps/astrologer-api/src/modules/availability/availability.controller.ts",
        "PUT /availability/schedules/default",
        "mutation",
        direct("calendar")
      ),
      api(
        "calendar.manual-booking.create",
        owners.bookings,
        "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
        "POST /bookings/manual",
        "mutation",
        direct("calendar")
      ),
      api(
        "calendar.public-booking-intent.create",
        owners.publicBooking,
        "apps/public-api/src/modules/booking/booking.controller.ts",
        "POST /booking/intent",
        "mutation",
        trustedOwner(
          ["calendar", "products"],
          "persisted Product.ownerUserId resolved server-side before booking hold; client input cannot select entitlement subject"
        )
      )
    ],
    usageCounters: [bookingCounter]
  },
  crm: {
    ...baseEntry(
      "crm",
      implementedOwner(
        owners.clients,
        "apps/astrologer-api/src/modules/clients/clients.controller.ts"
      ),
      "read_only"
    ),
    availability: "partial",
    unavailableReason:
      "Clients and birth-data APIs are shared foundations, not the promised CRM workspace; they are explicitly tariff-exempt below."
  },
  funnels: {
    ...baseEntry(
      "funnels",
      implementedOwner(owners.flows, "apps/astrologer-api/src/modules/flows/flows.controller.ts"),
      "read_only"
    ),
    availability: "partial",
    unavailableReason:
      "Flow runtime is definition_only; execution operations are present but unavailable.",
    navigation: [nav("nav.funnels", "funnels", "/flows")],
    frontendRoutes: [route("route.funnels", "/flows")],
    readOperations: [
      api(
        "funnels.templates.read",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "GET /flow-templates",
        "read",
        direct("funnels")
      ),
      api(
        "funnels.list",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "GET /flows",
        "read",
        direct("funnels")
      ),
      api(
        "funnels.read",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "GET /flows/:flowId",
        "read",
        direct("funnels")
      ),
      api(
        "funnels.enrollment.read",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
        "GET /flows/:flowId/enrollment",
        "read",
        historical(
          ["funnels"],
          "persisted flow enrollment owner",
          "current enrollment belongs to a previously entitled flow"
        )
      ),
      api(
        "funnels.activation-review",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-activation-review.controller.ts",
        "GET /flows/:flowId/activation-review",
        "read",
        historical(
          ["funnels"],
          "persisted flow.ownerUserId",
          "target flow version was published before entitlement expiry"
        )
      ),
      api(
        "funnels.runs.list",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "GET /flows/:flowId/runs",
        "read",
        historical(
          ["funnels"],
          "persisted flow.ownerUserId",
          "persisted flow run created before entitlement expiry",
          "filter_each_resource"
        )
      ),
      api(
        "funnels.run.read",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-runs.controller.ts",
        "GET /flow-runs/:runId",
        "read",
        historical(
          ["funnels"],
          "persisted flow run owner",
          "persisted flow run created before entitlement expiry"
        )
      ),
      api(
        "funnels.approvals.list",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts",
        "GET /flow-approvals",
        "read",
        historical(
          ["funnels"],
          "persisted approval owner",
          "pending approval belongs to an accepted flow run",
          "filter_each_resource"
        )
      ),
      api(
        "funnels.work-items.list",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
        "GET /flow-work-items",
        "read",
        historical(
          ["funnels"],
          "persisted work item owner",
          "work item belongs to an accepted flow run",
          "filter_each_resource"
        )
      )
    ],
    mutationOperations: [
      api(
        "funnels.create",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "POST /flows",
        "mutation",
        direct("funnels")
      ),
      api(
        "funnels.validate",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "POST /flows/:flowId/validate",
        "mutation",
        direct("funnels")
      ),
      api(
        "funnels.draft.update",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "PATCH /flows/:flowId/draft",
        "mutation",
        direct("funnels")
      ),
      api(
        "funnels.publish",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "POST /flows/:flowId/publish",
        "mutation",
        direct("funnels")
      ),
      api(
        "funnels.next-draft.create",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flows.controller.ts",
        "POST /flows/:flowId/next-draft",
        "mutation",
        direct("funnels")
      ),
      api(
        "funnels.activate",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
        "POST /flows/:flowId/activate",
        "mutation",
        direct("funnels")
      ),
      api(
        "funnels.pause",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
        "POST /flows/:flowId/pause-enrollment",
        "mutation",
        historical(
          ["funnels"],
          "persisted flow enrollment owner",
          "safety pause of an enrollment accepted before entitlement expiry"
        )
      ),
      api(
        "funnels.run.cancel",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-runs.controller.ts",
        "POST /flow-runs/:runId/cancel",
        "mutation",
        historical(
          ["funnels"],
          "persisted flow run owner",
          "safety cancellation of a run accepted before entitlement expiry"
        )
      ),
      api(
        "funnels.approval.decide",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts",
        "POST /flow-approvals/:approvalId/decision",
        "mutation",
        historical(
          ["funnels"],
          "persisted approval owner",
          "pending approval belongs to an accepted flow run"
        )
      ),
      api(
        "funnels.work-items.start",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
        "POST /flow-work-items/:workItemId/start",
        "mutation",
        historical(
          ["funnels"],
          "persisted work item owner",
          "work item belongs to an accepted flow run"
        )
      ),
      api(
        "funnels.work-items.snooze",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
        "POST /flow-work-items/:workItemId/snooze",
        "mutation",
        historical(
          ["funnels"],
          "persisted work item owner",
          "work item belongs to an accepted flow run"
        )
      ),
      api(
        "funnels.work-items.complete",
        owners.flows,
        "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
        "POST /flow-work-items/:workItemId/complete",
        "mutation",
        historical(
          ["funnels"],
          "persisted work item owner",
          "work item belongs to an accepted flow run"
        )
      )
    ],
    workerJobs: [
      job(
        "funnels.booking-confirmed-enrollment-dispatch",
        owners.flowWorker,
        "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
        "flows.booking_confirmed.enrollment_requested.v1",
        historical(
          ["funnels"],
          "persisted booking owner resolved from the claimed enrollment event",
          "accepted booking-confirmed enrollment event was committed before entitlement expiry"
        ),
        {
          sourcePath: "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
          identifier: "relayPendingFlowRuntimeDispatchEvents"
        },
        "persisted Booking.ownerUserId resolved server-side from the claimed booking-confirmed enrollment event"
      ),
      job(
        "funnels.booking-lifecycle-dispatch",
        owners.flowWorker,
        "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
        "bookings.lifecycle_event.dispatch_requested.v1",
        historical(
          ["funnels"],
          "persisted booking owner resolved from the claimed lifecycle event",
          "accepted booking lifecycle event was committed before entitlement expiry"
        ),
        {
          sourcePath: "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
          identifier: "relayPendingFlowRuntimeDispatchEvents"
        },
        "persisted BookingLifecycleEvent.ownerUserId resolved server-side from the claimed lifecycle event"
      )
    ],
    usageCounters: [automationCounter]
  },
  group: absent("group", "Booking accepts solo only; no group-session or webinar contour exists."),
  ai: {
    ...baseEntry("ai", implementedOwner("packages.ai", "packages/ai/src/index.ts"), "read_only"),
    availability: "partial",
    unavailableReason:
      "Provider-backed drafts exist, but promised AI nodes do not; every operation also requires its selected owning capability.",
    operationOwnership: {
      kind: "shared_with_operation_owner",
      sharedCapability: "ai",
      applicableOwnerCapabilities: [
        "natal",
        "synastry",
        "forecast",
        "solar",
        "matrix",
        "numerology",
        "hd",
        "refs",
        "horar"
      ],
      publicationOwnerRequirement: "at_least_one_applicable_owner"
    },
    mutationOperations: [
      api(
        "ai.chart.draft",
        owners.charts,
        chartsController,
        "POST /charts/calculations/:calculationId/ai-draft",
        "generation",
        {
          kind: "shared_with_resource_owner",
          sharedCapability: "ai",
          selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
          capabilityMap: chartCapabilityMap,
          unresolvedValues: ["chart:astrocartography", "chart:composite"],
          unknownValuePolicy: "deny"
        }
      ),
      api(
        "ai.matrix.draft",
        owners.matrix,
        "apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts",
        "POST /matrix/calculations/:calculationId/report/ai-draft",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "ai", ownerCapability: "matrix" }
      ),
      api(
        "ai.numerology.draft",
        owners.numerology,
        "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
        "POST /numerology/calculations/:calculationId/ai-draft",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "ai", ownerCapability: "numerology" }
      ),
      api(
        "ai.hd.draft",
        owners.humanDesign,
        "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
        "POST /human-design/calculations/:calculationId/ai-draft",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "ai", ownerCapability: "hd" }
      ),
      api(
        "ai.refs.draft",
        owners.dictionaryAi,
        "apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.controller.ts",
        "POST /dictionary/ai-draft",
        "generation",
        { kind: "shared_with_fixed_owner", sharedCapability: "ai", ownerCapability: "refs" }
      )
    ],
    usageCounters: [aiCounter]
  },
  aicontent: absent("aicontent", "No content or AI-content route, API command, or worker exists."),
  triggers: absent(
    "triggers",
    "AstroCalendar and Flows exist separately; no executable transit trigger exists."
  ),
  content: absent(
    "content",
    "Only product access-grant metadata exists; no content subscription workflow exists."
  ),
  autopost: absent("autopost", "No social publishing provider contour exists."),
  journal: absent("journal", "No Journal, consent, or sharing contour exists."),
  video: absent("video", "No Sessions/video-provider/consent contour exists."),
  recordings: absent("recordings", "No Recordings/session/media-retention contour exists."),
  inbox: {
    ...baseEntry(
      "inbox",
      implementedOwner(
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts"
      ),
      "read_only"
    ),
    availability: "partial",
    unavailableReason:
      "Only named adapters exist; all-channels promise and the paid-obligation allow-rule remain unresolved.",
    navigation: [nav("nav.inbox", "inbox", "/inbox")],
    frontendRoutes: [route("route.inbox", "/inbox")],
    readOperations: [
      api(
        "inbox.connections.list",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "GET /messaging/channel-connections",
        "read",
        direct("inbox")
      ),
      api(
        "inbox.threads.list",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "GET /messaging/threads",
        "read",
        historical(
          ["inbox"],
          "authenticated astrologer owner",
          "persisted paid-obligation thread",
          "filter_each_resource"
        )
      ),
      api(
        "inbox.thread.read",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "GET /messaging/threads/:threadId",
        "read",
        historical(["inbox"], "persisted thread owner", "persisted paid-obligation thread")
      ),
      api(
        "inbox.message-media.read",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "GET /messaging/messages/:messageId/media/source",
        "read",
        historical(["inbox"], "persisted message thread owner", "persisted paid-obligation thread")
      ),
      api(
        "inbox.events.stream",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging-events.controller.ts",
        "SSE /messaging/events",
        "read",
        historical(
          ["inbox"],
          "authenticated astrologer owner",
          "stream filters accepted delivery and paid-obligation thread events",
          "filter_each_resource"
        )
      )
    ],
    mutationOperations: [
      api(
        "inbox.telegram-business.start",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/channel-connections/telegram/business/start",
        "mutation",
        direct("inbox")
      ),
      api(
        "inbox.instagram-graph.start",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/channel-connections/instagram/graph/start",
        "mutation",
        direct("inbox")
      ),
      api(
        "inbox.telegram-mtproto.start",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/channel-connections/telegram/mtproto/start",
        "mutation",
        direct("inbox")
      ),
      api(
        "inbox.telegram-mtproto.code",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/channel-connections/telegram/mtproto/code",
        "mutation",
        direct("inbox")
      ),
      api(
        "inbox.telegram-mtproto.password",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/channel-connections/telegram/mtproto/password",
        "mutation",
        direct("inbox")
      ),
      api(
        "inbox.message.send",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/threads/:threadId/messages",
        "mutation",
        historical(["inbox"], "persisted thread owner", "persisted paid-obligation thread")
      ),
      api(
        "inbox.thread.link-client",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/threads/:threadId/link-client",
        "mutation",
        historical(["inbox"], "persisted thread owner", "persisted paid-obligation thread")
      ),
      api(
        "inbox.thread.create-client",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/threads/:threadId/create-client",
        "mutation",
        historical(["inbox"], "persisted thread owner", "persisted paid-obligation thread")
      ),
      api(
        "inbox.thread.mark-read",
        owners.messaging,
        "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
        "POST /messaging/threads/:threadId/read",
        "mutation",
        historical(["inbox"], "persisted thread owner", "persisted paid-obligation thread")
      )
    ],
    workerJobs: [
      job(
        "inbox.delivery",
        owners.messagingWorker,
        "apps/notification-worker/src/messaging-delivery.queue.ts",
        "messaging.delivery/deliver-messaging-message",
        historical(
          ["inbox"],
          "persisted messagingThreads.astrologerUserId loaded by outboxEventId",
          "accepted queued delivery or paid-obligation thread"
        ),
        {
          sourcePath: "apps/notification-worker/src/messaging-delivery.processor.ts",
          identifier: "processMessagingDeliveryJob"
        },
        "persisted messagingThreads.astrologerUserId loaded by outboxEventId; MessagingDeliveryWorkItem projection not yet wired"
      )
    ],
    unresolvedMappingRefs: ["inbox.paid-obligation-allow-rule"]
  },
  analytics: absent(
    "analytics",
    "No /analytics exists; product analytics uses an explicit unavailable adapter."
  ),
  refs: {
    ...baseEntry(
      "refs",
      implementedOwner(
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts"
      ),
      "read_only"
    ),
    availability: "live",
    navigation: [nav("nav.refs", "reference", "/reference")],
    frontendRoutes: [route("route.refs", "/reference")],
    readOperations: [
      api(
        "refs.categories.list",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "GET /dictionary/categories",
        "read",
        direct("refs")
      ),
      api(
        "refs.entries.list",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "GET /dictionary/entries",
        "read",
        direct("refs")
      )
    ],
    mutationOperations: [
      api(
        "refs.custom-entry.create",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "POST /dictionary/custom-entries",
        "mutation",
        direct("refs")
      ),
      api(
        "refs.custom-entry.update",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "PUT /dictionary/custom-entries/:entryId",
        "mutation",
        direct("refs")
      ),
      api(
        "refs.platform-entry.override",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "PUT /dictionary/platform-entries/:platformEntryId/override",
        "mutation",
        direct("refs")
      ),
      api(
        "refs.entry.delete",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "DELETE /dictionary/entries/:entryId",
        "mutation",
        direct("refs")
      ),
      api(
        "refs.entries.reset",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "DELETE /dictionary/entries",
        "mutation",
        direct("refs")
      ),
      api(
        "refs.platform-entry.override-delete",
        owners.dictionary,
        "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
        "DELETE /dictionary/platform-entries/:platformEntryId/override",
        "mutation",
        direct("refs")
      )
    ]
  },
  team: {
    ...absent(
      "team",
      "Only seatsLimit exists; no workspace membership, invite, or RBAC contour exists."
    ),
    usageCounters: [seatCounter]
  },
  whitelabel: absent("whitelabel", "No PublicPage or branding contour exists."),
  api: absent("api", "No customer developer credential, scope, or rate-limit surface exists."),
  priority: absent("priority", "No support queue, SLA policy, routing, or evidence exists.")
} satisfies Record<PlatformPlanFeatureCode, RawPlatformCapabilityManifestEntry>;

const persistedAutomationCounter = rawPlatformCapabilityManifest.funnels.usageCounters[0]!;

export const platformTariffGuardedOperationSurfaceIds = [
  "products.list",
  "products.summary",
  "products.templates",
  "products.read",
  "products.public-purchase-options.read",
  "products.public-available-slots.read",
  "products.template-draft.create",
  "products.create",
  "products.update",
  "products.publish",
  "products.move-to-draft",
  "products.archive",
  "products.duplicate",
  "funnels.templates.read",
  "funnels.list",
  "funnels.read",
  "funnels.create",
  "funnels.validate",
  "funnels.draft.update",
  "funnels.publish",
  "funnels.next-draft.create",
  "funnels.activate"
] as const;

const platformTariffGuardedOperationSurfaceIdSet = new Set<string>(
  platformTariffGuardedOperationSurfaceIds
);
const platformTariffGuardedOperations = [
  ...rawPlatformCapabilityManifest.products.readOperations,
  ...rawPlatformCapabilityManifest.products.mutationOperations,
  ...rawPlatformCapabilityManifest.funnels.readOperations,
  ...rawPlatformCapabilityManifest.funnels.mutationOperations
].filter((operation) => platformTariffGuardedOperationSurfaceIdSet.has(operation.id));

export const platformCapabilityGuardDeclarations = [
  ...rawPlatformCapabilityManifest.products.navigation.map((item) => ({
    kind: "navigation" as const,
    surfaceId: item.id,
    ownerModule: item.ownerModule,
    surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
    capability: "products" as const
  })),
  ...rawPlatformCapabilityManifest.products.frontendRoutes.map((item) => ({
    kind: "frontend_route" as const,
    surfaceId: item.id,
    ownerModule: item.ownerModule,
    surfaceFingerprint: platformCapabilitySurfaceFingerprint(item),
    capability: "products" as const
  })),
  ...platformTariffGuardedOperations.map((operation) => ({
    kind: "operation" as const,
    surfaceId: operation.id,
    ownerModule: operation.ownerModule,
    surfaceFingerprint: platformCapabilitySurfaceFingerprint(operation),
    semanticKind: operation.semanticKind,
    requirementFingerprint: platformCapabilityRequirementFingerprint(operation.requirement)
  })),
  ...rawPlatformCapabilityManifest.products.mutationOperations
    .filter((operation) => operation.id === "products.public-order.create")
    .map((operation) => ({
      kind: "operation" as const,
      surfaceId: operation.id,
      ownerModule: operation.ownerModule,
      surfaceFingerprint: platformCapabilitySurfaceFingerprint(operation),
      semanticKind: operation.semanticKind,
      requirementFingerprint: platformCapabilityRequirementFingerprint(operation.requirement)
    })),
  ...platformSharedCapabilitySurfaces
    .filter((operation) => productMediaSharedSurfaceRefs.includes(operation.id as never))
    .map((operation) => ({
      kind: "operation" as const,
      surfaceId: operation.id,
      ownerModule: operation.ownerModule,
      surfaceFingerprint: platformCapabilitySurfaceFingerprint(operation),
      semanticKind: operation.semanticKind,
      requirementFingerprint: platformCapabilityRequirementFingerprint(operation.requirement)
    })),
  {
    kind: "usage_counter",
    surfaceId: "counter.funnels.automations",
    ownerModule: rawPlatformCapabilityManifest.funnels.owner.module,
    capability: "funnels",
    counterFingerprint: platformCapabilityCounterFingerprint(persistedAutomationCounter)
  }
] as const satisfies readonly PlatformCapabilityGuardDeclaration[];
