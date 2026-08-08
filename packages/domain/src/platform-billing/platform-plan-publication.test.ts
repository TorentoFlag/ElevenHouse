import { describe, expect, it } from "vitest";
import {
  PlatformPlanPublicationValidationError,
  assertPlatformPlanPublishable,
  collectPlatformPlanPublicationIssues,
  platformCapabilityManifest,
  platformPlanPublicationRegistry,
  platformPlanSeedData,
  type PlatformPlanPublicationCandidate,
  type PlatformPlanPublicationIssue,
  type PlatformPlanPublicationRegistry
} from "./index";

type IssueProjection = readonly [
  PlatformPlanPublicationIssue["code"],
  PlatformPlanPublicationIssue["path"]
];

const candidate = (
  overrides: Partial<PlatformPlanPublicationCandidate> = {}
): PlatformPlanPublicationCandidate => ({
  features: [],
  seatsLimit: 1,
  bookingsLimit: null,
  aiRequestsLimit: null,
  automationLimit: null,
  ...overrides
});

const projectIssues = (
  value: PlatformPlanPublicationCandidate,
  registry?: PlatformPlanPublicationRegistry
): readonly IssueProjection[] =>
  collectPlatformPlanPublicationIssues(value, registry).map((issue) => [issue.code, issue.path]);

const proIssues = [
  ["capability_enforcement_unwired", ["features", "engine"]],
  ["capability_partial", ["features", "pdf"]],
  ["capability_enforcement_unwired", ["features", "natal"]],
  ["capability_enforcement_unwired", ["features", "synastry"]],
  ["capability_enforcement_unwired", ["features", "forecast"]],
  ["capability_enforcement_unwired", ["features", "solar"]],
  ["capability_enforcement_unwired", ["features", "matrix"]],
  ["capability_enforcement_unwired", ["features", "numerology"]],
  ["capability_enforcement_unwired", ["features", "hd"]],
  ["capability_enforcement_unwired", ["features", "horar"]],
  ["capability_absent", ["features", "vedic"]],
  ["capability_enforcement_unwired", ["features", "astrocal"]],
  ["capability_partial", ["features", "child"]],
  ["capability_absent", ["features", "page"]],
  ["capability_partial", ["features", "calendar"]],
  ["capability_partial", ["features", "crm"]],
  ["capability_absent", ["features", "group"]],
  ["capability_partial", ["features", "ai"]],
  ["capability_absent", ["features", "aicontent"]],
  ["capability_absent", ["features", "triggers"]],
  ["capability_absent", ["features", "content"]],
  ["capability_absent", ["features", "autopost"]],
  ["capability_absent", ["features", "journal"]],
  ["capability_absent", ["features", "video"]],
  ["capability_absent", ["features", "recordings"]],
  ["capability_partial", ["features", "inbox"]],
  ["capability_absent", ["features", "analytics"]],
  ["capability_enforcement_unwired", ["features", "refs"]],
  [
    "unresolved_operation_mapping",
    ["features", "unresolvedMappingRefs", "chart.astrocartography.create"]
  ],
  ["unresolved_operation_mapping", ["features", "unresolvedMappingRefs", "chart.composite.create"]],
  ["unresolved_operation_mapping", ["features", "unresolvedMappingRefs", "chart.child-purpose"]],
  [
    "unresolved_operation_mapping",
    ["features", "unresolvedMappingRefs", "calculations.list-all.entitlement-projection"]
  ],
  [
    "unresolved_operation_mapping",
    ["features", "unresolvedMappingRefs", "inbox.paid-obligation-allow-rule"]
  ]
] as const satisfies readonly IssueProjection[];

const studioIssues = [
  ["capability_enforcement_unwired", ["features", "engine"]],
  ["capability_partial", ["features", "pdf"]],
  ["capability_enforcement_unwired", ["features", "natal"]],
  ["capability_enforcement_unwired", ["features", "synastry"]],
  ["capability_enforcement_unwired", ["features", "forecast"]],
  ["capability_enforcement_unwired", ["features", "solar"]],
  ["capability_enforcement_unwired", ["features", "matrix"]],
  ["capability_enforcement_unwired", ["features", "numerology"]],
  ["capability_enforcement_unwired", ["features", "hd"]],
  ["capability_enforcement_unwired", ["features", "horar"]],
  ["capability_absent", ["features", "vedic"]],
  ["capability_enforcement_unwired", ["features", "astrocal"]],
  ["capability_partial", ["features", "child"]],
  ["capability_absent", ["features", "page"]],
  ["capability_partial", ["features", "calendar"]],
  ["capability_partial", ["features", "crm"]],
  ["capability_absent", ["features", "group"]],
  ["capability_partial", ["features", "ai"]],
  ["capability_absent", ["features", "aicontent"]],
  ["capability_absent", ["features", "triggers"]],
  ["capability_absent", ["features", "content"]],
  ["capability_absent", ["features", "autopost"]],
  ["capability_absent", ["features", "journal"]],
  ["capability_absent", ["features", "video"]],
  ["capability_absent", ["features", "recordings"]],
  ["capability_partial", ["features", "inbox"]],
  ["capability_absent", ["features", "analytics"]],
  ["capability_enforcement_unwired", ["features", "refs"]],
  ["capability_absent", ["features", "team"]],
  ["capability_absent", ["features", "whitelabel"]],
  ["capability_absent", ["features", "api"]],
  ["capability_absent", ["features", "priority"]],
  [
    "unresolved_operation_mapping",
    ["features", "unresolvedMappingRefs", "chart.astrocartography.create"]
  ],
  ["unresolved_operation_mapping", ["features", "unresolvedMappingRefs", "chart.composite.create"]],
  ["unresolved_operation_mapping", ["features", "unresolvedMappingRefs", "chart.child-purpose"]],
  [
    "unresolved_operation_mapping",
    ["features", "unresolvedMappingRefs", "calculations.list-all.entitlement-projection"]
  ],
  [
    "unresolved_operation_mapping",
    ["features", "unresolvedMappingRefs", "inbox.paid-obligation-allow-rule"]
  ],
  ["seats_limit_exceeds_structural_max", ["seatsLimit"]]
] as const satisfies readonly IssueProjection[];

describe("platform plan publication", () => {
  it("reports the complete ordered literal issue set for the current Start seed", () => {
    const issues = projectIssues(platformPlanSeedData[0]);

    expect(issues).toEqual([
      ["capability_enforcement_unwired", ["features", "engine"]],
      ["capability_partial", ["features", "pdf"]],
      ["capability_enforcement_unwired", ["features", "natal"]],
      ["capability_enforcement_unwired", ["features", "numerology"]],
      ["capability_absent", ["features", "page"]],
      ["capability_partial", ["features", "calendar"]],
      ["capability_partial", ["features", "crm"]],
      ["capability_partial", ["features", "inbox"]],
      ["capability_enforcement_unwired", ["features", "refs"]],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "chart.astrocartography.create"]
      ],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "chart.composite.create"]
      ],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "chart.child-purpose"]
      ],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "calculations.list-all.entitlement-projection"]
      ],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "inbox.paid-obligation-allow-rule"]
      ],
      ["quota_counter_unavailable", ["bookingsLimit", "counter", "bookings"]],
      ["quota_capability_missing", ["aiRequestsLimit", "capability", "ai"]],
      ["quota_counter_unavailable", ["aiRequestsLimit", "counter", "ai_requests"]],
      ["quota_capability_missing", ["automationLimit", "capability", "funnels"]]
    ] satisfies readonly IssueProjection[]);
    expect(issues).toHaveLength(18);
  });

  it("reports the complete ordered literal issue set for the current Pro seed", () => {
    expect(projectIssues(platformPlanSeedData[1])).toEqual(proIssues);
    expect(proIssues).toHaveLength(33);
  });

  it("reports the complete ordered literal issue set for the current Studio seed", () => {
    expect(projectIssues(platformPlanSeedData[2])).toEqual(studioIssues);
    expect(studioIssues).toHaveLength(38);
  });

  it("keeps issue order canonical when the candidate feature order is reversed", () => {
    const reversedFeatures = [...platformPlanSeedData[1].features].reverse();

    expect(projectIssues(candidate({ features: reversedFeatures }))).toEqual(proIssues);
  });

  it("reports one duplicate issue before the capability enforcement issue", () => {
    expect(projectIssues(candidate({ features: ["refs", "refs"] }))).toEqual([
      ["duplicate_capability", ["features", "refs"]],
      ["capability_enforcement_unwired", ["features", "refs"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("requires an entitled owning module for shared PDF and AI capabilities", () => {
    expect(projectIssues(candidate({ features: ["pdf"] }))).toEqual([
      ["capability_partial", ["features", "pdf"]],
      ["shared_capability_owner_missing", ["features", "pdf", "operationOwnership"]]
    ] satisfies readonly IssueProjection[]);

    expect(projectIssues(candidate({ features: ["ai"], aiRequestsLimit: null }))).toEqual([
      ["capability_partial", ["features", "ai"]],
      ["shared_capability_owner_missing", ["features", "ai", "operationOwnership"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("reports only the selected capability prerequisites and unresolved mappings", () => {
    expect(projectIssues(candidate({ features: ["natal"] }))).toEqual([
      ["capability_enforcement_unwired", ["features", "natal"]],
      ["capability_prerequisite_missing", ["features", "natal", "requiredCapabilities", "engine"]],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "chart.child-purpose"]
      ],
      [
        "unresolved_operation_mapping",
        ["features", "unresolvedMappingRefs", "calculations.list-all.entitlement-projection"]
      ]
    ] satisfies readonly IssueProjection[]);

    expect(projectIssues(candidate({ features: ["products"] }))).toEqual([]);
  });

  it("permits Funnels when both delivery workers reload the persisted booking owner", () => {
    const funnelPlan = candidate({ features: ["funnels"] });

    expect(projectIssues(funnelPlan)).toEqual([]);
    expect(() => assertPlatformPlanPublishable(funnelPlan)).not.toThrow();
  });

  it("checks finite counter-backed quotas and ignores unlimited quota counters", () => {
    expect(projectIssues(candidate({ bookingsLimit: 5 }))).toEqual([
      ["quota_capability_missing", ["bookingsLimit", "capability", "calendar"]],
      ["quota_counter_unavailable", ["bookingsLimit", "counter", "bookings"]]
    ] satisfies readonly IssueProjection[]);

    expect(projectIssues(candidate({ bookingsLimit: null }))).toEqual([]);
  });

  it("keeps seats structural-only until Team exists", () => {
    expect(projectIssues(candidate({ features: ["team"], seatsLimit: 5 }))).toEqual([
      ["capability_absent", ["features", "team"]],
      ["seats_limit_exceeds_structural_max", ["seatsLimit"]]
    ] satisfies readonly IssueProjection[]);

    expect(projectIssues(candidate({ seatsLimit: null }))).toEqual([
      ["seats_limit_exceeds_structural_max", ["seatsLimit"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("rejects duplicate counter declarations instead of selecting the first", () => {
    const bookingCounter = platformCapabilityManifest.calendar.usageCounters[0];
    if (!bookingCounter) throw new Error("Calendar booking counter fixture is missing");
    const manifest = {
      ...platformCapabilityManifest,
      calendar: {
        ...platformCapabilityManifest.calendar,
        usageCounters: [bookingCounter, bookingCounter]
      }
    } satisfies PlatformPlanPublicationRegistry["manifest"];
    const registry = {
      ...platformPlanPublicationRegistry,
      manifest
    } satisfies PlatformPlanPublicationRegistry;

    expect(
      projectIssues(candidate({ features: ["calendar"], bookingsLimit: 5 }), registry)
    ).toEqual([
      ["capability_partial", ["features", "calendar"]],
      ["quota_counter_declaration_invalid", ["bookingsLimit", "counter", "bookings"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("rejects a counter declared by the wrong capability owner", () => {
    const bookingCounter = platformCapabilityManifest.calendar.usageCounters[0];
    if (!bookingCounter) throw new Error("Calendar booking counter fixture is missing");
    const manifest = {
      ...platformCapabilityManifest,
      calendar: {
        ...platformCapabilityManifest.calendar,
        usageCounters: []
      },
      products: {
        ...platformCapabilityManifest.products,
        usageCounters: [bookingCounter]
      }
    } satisfies PlatformPlanPublicationRegistry["manifest"];
    const registry = {
      ...platformPlanPublicationRegistry,
      manifest
    } satisfies PlatformPlanPublicationRegistry;

    expect(
      projectIssues(candidate({ features: ["calendar"], bookingsLimit: 5 }), registry)
    ).toEqual([
      ["capability_partial", ["features", "calendar"]],
      ["quota_counter_declaration_invalid", ["bookingsLimit", "counter", "bookings"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("fails closed when the guard registry has an integrity issue", () => {
    const registry = {
      ...platformPlanPublicationRegistry,
      guardDeclarations: [
        {
          kind: "navigation",
          surfaceId: "orphan.counter.guard",
          ownerModule: "calendar",
          surfaceFingerprint: "orphan",
          capability: "calendar"
        }
      ]
    } satisfies PlatformPlanPublicationRegistry;

    expect(
      projectIssues(candidate({ features: ["calendar"], bookingsLimit: 5 }), registry)
    ).toEqual([
      ["capability_partial", ["features", "calendar"]],
      ["quota_counter_declaration_invalid", ["bookingsLimit", "counter", "bookings"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("does not trust an isolated ready flag without exact guard coverage", () => {
    const manifest = {
      ...platformCapabilityManifest,
      products: {
        ...platformCapabilityManifest.products,
        enforcement: "ready"
      }
    } satisfies PlatformPlanPublicationRegistry["manifest"];
    const registry = {
      ...platformPlanPublicationRegistry,
      manifest,
      guardDeclarations: []
    } satisfies PlatformPlanPublicationRegistry;

    expect(projectIssues(candidate({ features: ["products"] }), registry)).toEqual([
      ["capability_enforcement_unwired", ["features", "products"]]
    ] satisfies readonly IssueProjection[]);
  });

  it("throws one validation error containing the complete stable issue list", () => {
    const value = candidate({ features: ["natal"] });
    const expected = [
      {
        code: "capability_enforcement_unwired",
        path: ["features", "natal"],
        message: 'Capability "natal" enforcement is not wired.'
      },
      {
        code: "capability_prerequisite_missing",
        path: ["features", "natal", "requiredCapabilities", "engine"],
        message: 'Capability "natal" requires "engine".'
      },
      {
        code: "unresolved_operation_mapping",
        path: ["features", "unresolvedMappingRefs", "chart.child-purpose"],
        message: 'Capability operation mapping "chart.child-purpose" is unresolved.'
      },
      {
        code: "unresolved_operation_mapping",
        path: ["features", "unresolvedMappingRefs", "calculations.list-all.entitlement-projection"],
        message:
          'Capability operation mapping "calculations.list-all.entitlement-projection" is unresolved.'
      }
    ] as const satisfies readonly PlatformPlanPublicationIssue[];

    try {
      assertPlatformPlanPublishable(value);
      throw new Error("Expected publication validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformPlanPublicationValidationError);
      expect((error as PlatformPlanPublicationValidationError).issues).toEqual(expected);
    }
  });

  it("rejects every current prototype seed instead of treating display data as publishable", () => {
    for (const seed of platformPlanSeedData) {
      expect(() => assertPlatformPlanPublishable(seed)).toThrow(
        PlatformPlanPublicationValidationError
      );
    }
  });
});
