import {
  flowCapabilityManifestV2Schema,
  flowGraphV2Schema,
  type FlowActivationBlocker,
  type FlowGraphV2
} from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  FlowRuntimeControlIntegrityError,
  PlatformTariffAuthorityError,
  evaluateFlowActivationRuntimeControl,
  resolvePlatformTariffEntitlement,
  sha256CanonicalJson,
  verifyFlowCapabilityManifestForGraph,
  verifyPlatformTariffVersion,
  type CanonicalJson,
  type FlowActivationTransactionalReadiness,
  type FlowAutomationQuotaReadiness,
  type FlowEnrollmentAuthoritySnapshot,
  type FlowWorkerReadinessLease,
  type PlatformTariffSubscriptionSnapshot,
  type PlatformTariffVersion
} from "@elevenhouse/domain";
import { and, eq, inArray, sql } from "drizzle-orm";

import { flowWorkerReadinessLeases, flowWorkerRegistrations } from "../../schema/flows";
import {
  platformTariffSubscriptions,
  platformTariffVersionCapabilities,
  platformTariffVersions
} from "../../schema/platform-billing";
import { productMethods, productRequiredClientData, products } from "../../schema/products";
import { readCurrentFlowRuntimeControl } from "./drizzle-flow-runtime-control-reader";
import type { FlowEnrollmentTransaction } from "./drizzle-flow-enrollment-subjects";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

export type FlowActivationVersionRow = {
  readonly id: string;
  readonly flowId: string;
  readonly ownerUserId: string;
  readonly graphSchemaVersion: string | null;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

export type FlowActivationReadinessEvidence = {
  readonly graphSchemaVersion: string;
  readonly manifestSchemaVersion: string;
  readonly manifestDigest: `sha256:${string}` | null;
  readonly readiness: FlowActivationTransactionalReadiness;
};

type FlowActivationReadinessInput = {
  readonly current: FlowEnrollmentAuthoritySnapshot;
  readonly target: FlowActivationVersionRow;
  readonly ownerSubjectId: string;
  readonly activeAutomationAllocations: number;
};

export async function readFlowActivationReadiness(
  transaction: FlowEnrollmentTransaction,
  input: FlowActivationReadinessInput,
  options: { readonly lockRows?: boolean } = {}
): Promise<FlowActivationReadinessEvidence> {
  try {
    return await readFlowActivationReadinessEvidence(transaction, input, options);
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
    if (
      error instanceof FlowRuntimeControlIntegrityError ||
      error instanceof PlatformTariffAuthorityError
    ) {
      throw new FlowEnrollmentAuthorityIntegrityError({ cause: error });
    }
    throw error;
  }
}

async function readFlowActivationReadinessEvidence(
  transaction: FlowEnrollmentTransaction,
  input: FlowActivationReadinessInput,
  options: { readonly lockRows?: boolean }
): Promise<FlowActivationReadinessEvidence> {
  const lockRows = options.lockRows !== false;
  const policy = await readCurrentFlowRuntimeControl(transaction, { lockRows });
  const graphSchemaVersion = input.target.graphSchemaVersion ?? "unsupported";
  const manifestSchemaVersion = readManifestSchemaVersion(input.target.capabilityManifest);
  const manifestResult = flowCapabilityManifestV2Schema.safeParse(input.target.capabilityManifest);
  const graphResult = flowGraphV2Schema.safeParse(input.target.graph);

  if (
    graphSchemaVersion !== "flow-graph.v2" ||
    manifestSchemaVersion !== "flow-capability-manifest.v2"
  ) {
    const checkedAt = await readDatabaseInstant(transaction);
    return {
      graphSchemaVersion,
      manifestSchemaVersion,
      manifestDigest: null,
      readiness: blockedReadiness(input, policy.mode, policy.revision, checkedAt, [
        blocker("FLOW_VERSION_SCHEMA_UNSUPPORTED", "version.schemaVersion")
      ])
    };
  }
  if (
    !manifestResult.success ||
    !graphResult.success ||
    !verifyFlowCapabilityManifestForGraph({
      graph: graphResult.data,
      capabilityManifest: manifestResult.data
    }).valid
  ) {
    const checkedAt = await readDatabaseInstant(transaction);
    return {
      graphSchemaVersion,
      manifestSchemaVersion,
      manifestDigest: null,
      readiness: blockedReadiness(input, policy.mode, policy.revision, checkedAt, [
        blocker("FLOW_GRAPH_MANIFEST_INVALID", "version.capabilityManifest")
      ])
    };
  }

  const workerLeases = await readWorkerLeases(transaction, lockRows);
  const quotaEvidence = await readAutomationQuotaEvidence(transaction, {
    ownerUserId: input.current.ownerUserId,
    enrollmentState: input.current.enrollmentState,
    activeAllocations: input.activeAutomationAllocations,
    lockRows
  });
  const productBlockers = await readProductBlockers(
    transaction,
    input.current.ownerUserId,
    graphResult.data,
    lockRows
  );
  const checkedAt = await readDatabaseInstant(transaction);
  const quota = evaluateAutomationQuota(quotaEvidence, checkedAt);
  const runtime = evaluateFlowActivationRuntimeControl({
    flowId: input.current.flowId,
    ownerUserId: input.current.ownerUserId,
    ownerSubjectId: input.ownerSubjectId,
    versionId: input.target.id,
    definitionRevision: input.current.definitionRevision,
    enrollmentRevision: input.current.enrollmentRevision,
    expectedActiveVersionId: input.current.activeVersionId,
    manifest: manifestResult.data,
    policy,
    workerLeases,
    quota,
    checkedAt
  });
  const blockers = uniqueBlockers([...runtime.blockers, ...productBlockers]);
  return {
    graphSchemaVersion,
    manifestSchemaVersion,
    manifestDigest: sha256CanonicalJson(manifestResult.data as unknown as CanonicalJson),
    readiness: {
      ...runtime,
      decision: blockers.length === 0 ? "ready" : "blocked",
      blockers
    }
  };
}

async function readWorkerLeases(
  transaction: FlowEnrollmentTransaction,
  lockRows: boolean
): Promise<readonly FlowWorkerReadinessLease[]> {
  const query = transaction
    .select({
      instanceId: flowWorkerReadinessLeases.instanceId,
      state: flowWorkerReadinessLeases.state,
      policyRevision: flowWorkerReadinessLeases.policyRevision,
      readyUntil: flowWorkerReadinessLeases.readyUntil,
      roles: flowWorkerRegistrations.roles,
      maxRuntimeMode: flowWorkerRegistrations.maxRuntimeMode,
      maxCanaryOwnerSubjectIds: flowWorkerRegistrations.maxCanaryOwnerSubjectIds,
      requirementKeys: flowWorkerRegistrations.requirementKeys
    })
    .from(flowWorkerReadinessLeases)
    .innerJoin(
      flowWorkerRegistrations,
      eq(flowWorkerRegistrations.sessionId, flowWorkerReadinessLeases.sessionId)
    );
  const rows = lockRows ? await query.for("share", { of: flowWorkerReadinessLeases }) : await query;
  return rows.map((row) => ({
    schemaVersion: "flow-worker-readiness-lease.v1",
    instanceId: row.instanceId,
    state: row.state as FlowWorkerReadinessLease["state"],
    policyRevision: row.policyRevision,
    roles: row.roles as FlowWorkerReadinessLease["roles"],
    maxRuntimeMode: row.maxRuntimeMode as FlowWorkerReadinessLease["maxRuntimeMode"],
    maxCanaryOwnerSubjectIds: row.maxCanaryOwnerSubjectIds,
    requirementKeys: row.requirementKeys,
    readyUntil: toIsoInstant(row.readyUntil)
  }));
}

type FlowAutomationQuotaAuthorityEvidence =
  | { readonly kind: "entitlement_unavailable" }
  | {
      readonly kind: "candidate";
      readonly subscription: PlatformTariffSubscriptionSnapshot;
      readonly tariff: PlatformTariffVersion;
      readonly enrollmentState: FlowEnrollmentAuthoritySnapshot["enrollmentState"];
      readonly activeAllocations: number;
    };

async function readAutomationQuotaEvidence(
  transaction: FlowEnrollmentTransaction,
  input: {
    readonly ownerUserId: string;
    readonly enrollmentState: FlowEnrollmentAuthoritySnapshot["enrollmentState"];
    readonly activeAllocations: number;
    readonly lockRows: boolean;
  }
): Promise<FlowAutomationQuotaAuthorityEvidence> {
  if (!Number.isSafeInteger(input.activeAllocations) || input.activeAllocations < 0) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  const subscriptionQuery = transaction
    .select()
    .from(platformTariffSubscriptions)
    .where(
      and(
        eq(platformTariffSubscriptions.ownerUserId, input.ownerUserId),
        eq(platformTariffSubscriptions.state, "active")
      )
    )
    .limit(1);
  const [subscriptionRow] = input.lockRows
    ? await subscriptionQuery.for("share", { of: platformTariffSubscriptions })
    : await subscriptionQuery;
  if (!subscriptionRow) return { kind: "entitlement_unavailable" };

  const [tariffRow] = await transaction
    .select()
    .from(platformTariffVersions)
    .where(
      and(
        eq(platformTariffVersions.tariffSeriesId, subscriptionRow.tariffSeriesId),
        eq(platformTariffVersions.version, subscriptionRow.tariffVersion),
        eq(platformTariffVersions.canonicalDigest, subscriptionRow.tariffVersionDigest)
      )
    )
    .limit(1);
  if (!tariffRow) throw new FlowEnrollmentAuthorityIntegrityError();
  const capabilityRows = await transaction
    .select({ capability: platformTariffVersionCapabilities.capability })
    .from(platformTariffVersionCapabilities)
    .where(
      and(
        eq(platformTariffVersionCapabilities.tariffSeriesId, tariffRow.tariffSeriesId),
        eq(platformTariffVersionCapabilities.tariffVersion, tariffRow.version)
      )
    );

  const subscription: PlatformTariffSubscriptionSnapshot = {
    subscriptionId: subscriptionRow.id,
    ownerUserId: subscriptionRow.ownerUserId,
    tariffSeriesId: subscriptionRow.tariffSeriesId,
    tariffVersion: subscriptionRow.tariffVersion,
    tariffVersionDigest: subscriptionRow.tariffVersionDigest as `sha256:${string}`,
    commissionBpsSnapshot: subscriptionRow.commissionBpsSnapshot,
    version: subscriptionRow.version,
    state: subscriptionRow.state as PlatformTariffSubscriptionSnapshot["state"],
    startsAt: subscriptionRow.startsAt ? toIsoInstant(subscriptionRow.startsAt) : null,
    endsAt: subscriptionRow.endsAt ? toIsoInstant(subscriptionRow.endsAt) : null
  };
  const tariff = verifyPlatformTariffVersion({
    tariffSeriesId: tariffRow.tariffSeriesId,
    version: tariffRow.version,
    draftRevision: tariffRow.draftRevision,
    lifecycle: tariffRow.lifecycle as PlatformTariffVersion["lifecycle"],
    name: tariffRow.name,
    tagline: tariffRow.tagline,
    monthlyPriceMinor: tariffRow.monthlyPriceMinor,
    yearlyPriceMinor: tariffRow.yearlyPriceMinor,
    monthlyRecurringFrequencyDays: tariffRow.monthlyRecurringFrequencyDays,
    yearlyRecurringFrequencyDays: tariffRow.yearlyRecurringFrequencyDays,
    clientSaleCommissionBps: tariffRow.clientSaleCommissionBps,
    seatsLimit: tariffRow.seatsLimit,
    bookingsLimit: tariffRow.bookingsLimit,
    aiRequestsLimit: tariffRow.aiRequestsLimit,
    automationLimit: tariffRow.automationLimit,
    isPopular: tariffRow.isPopular,
    displayOrder: tariffRow.displayOrder,
    features: capabilityRows.map((row) => row.capability) as PlatformTariffVersion["features"],
    canonicalDigest: tariffRow.canonicalDigest as `sha256:${string}`
  });
  return {
    kind: "candidate",
    subscription,
    tariff,
    enrollmentState: input.enrollmentState,
    activeAllocations: input.activeAllocations
  };
}

function evaluateAutomationQuota(
  evidence: FlowAutomationQuotaAuthorityEvidence,
  checkedAt: string
): FlowAutomationQuotaReadiness {
  if (evidence.kind === "entitlement_unavailable") return evidence;
  if (
    resolvePlatformTariffEntitlement({
      subscription: evidence.subscription,
      tariff: evidence.tariff,
      capability: "funnels",
      now: checkedAt
    }) !== "allowed"
  ) {
    return { kind: "entitlement_unavailable" };
  }

  if (
    evidence.enrollmentState !== "active" &&
    evidence.tariff.automationLimit !== null &&
    evidence.activeAllocations >= evidence.tariff.automationLimit
  ) {
    return {
      kind: "exceeded",
      limit: evidence.tariff.automationLimit,
      activeAllocations: evidence.activeAllocations
    };
  }
  return {
    kind: "ready",
    limit: evidence.tariff.automationLimit,
    activeAllocations: evidence.activeAllocations
  };
}

async function readProductBlockers(
  transaction: FlowEnrollmentTransaction,
  ownerUserId: string,
  graph: FlowGraphV2,
  lockRows: boolean
): Promise<readonly FlowActivationBlocker[]> {
  const productIds = [
    ...new Set(
      graph.nodes.flatMap((node) =>
        node.kind === "booking_confirmed" ? node.config.productIds : []
      )
    )
  ];
  if (productIds.length === 0) return [];
  const requiresSingleNatalChart = graph.nodes.some(
    (node) => node.kind === "natal_chart_request"
  );
  const query = transaction
    .select({ id: products.id, status: products.status })
    .from(products)
    .where(and(eq(products.ownerUserId, ownerUserId), inArray(products.id, productIds)));
  const rows = lockRows ? await query.for("share", { of: products }) : await query;
  if (!requiresSingleNatalChart) {
    const activeIds = new Set(
      rows.filter((product) => product.status === "active").map((product) => product.id)
    );
    return productIds.every((productId) => activeIds.has(productId))
      ? []
      : [blocker("FLOW_PRODUCT_UNAVAILABLE", "graph.nodes.booking_confirmed.config.productIds")];
  }

  const methodRows = await transaction
    .select({ productId: productMethods.productId, value: productMethods.value })
    .from(productMethods)
    .where(inArray(productMethods.productId, productIds));
  const requirementRows = await transaction
    .select({ productId: productRequiredClientData.productId, value: productRequiredClientData.value })
    .from(productRequiredClientData)
    .where(inArray(productRequiredClientData.productId, productIds));
  const methodsByProductId = groupProductValues(methodRows);
  const requirementsByProductId = groupProductValues(requirementRows);
  const productsById = new Map(rows.map((row) => [row.id, row]));
  const everyProductIsEligible = productIds.every((productId) => {
    const product = productsById.get(productId);
    if (!product || product.status !== "active") return false;
    const methods = methodsByProductId.get(productId) ?? new Set<string>();
    const requirements = requirementsByProductId.get(productId) ?? new Set<string>();
    return (
      methods.has("natal") &&
      requirements.has("chart1") &&
      !requirements.has("chart2")
    );
  });
  return everyProductIsEligible
    ? []
    : [blocker("FLOW_PRODUCT_UNAVAILABLE", "graph.nodes.booking_confirmed.config.productIds")];
}

function groupProductValues(
  rows: readonly { readonly productId: string; readonly value: string }[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const valuesByProductId = new Map<string, Set<string>>();
  for (const row of rows) {
    const values = valuesByProductId.get(row.productId) ?? new Set<string>();
    values.add(row.value);
    valuesByProductId.set(row.productId, values);
  }
  return valuesByProductId;
}

function blockedReadiness(
  input: {
    readonly current: FlowEnrollmentAuthoritySnapshot;
    readonly target: FlowActivationVersionRow;
  },
  runtimeMode: FlowActivationTransactionalReadiness["runtimeMode"],
  rolloutPolicyRevision: number,
  checkedAt: string,
  blockers: readonly FlowActivationBlocker[]
): FlowActivationTransactionalReadiness {
  return {
    schemaVersion: "flow-activation-transaction-readiness.v1",
    flowId: input.current.flowId,
    versionId: input.target.id,
    definitionRevision: input.current.definitionRevision,
    enrollmentRevision: input.current.enrollmentRevision,
    expectedActiveVersionId: input.current.activeVersionId,
    runtimeMode,
    rolloutPolicyRevision,
    checkedAt,
    decision: "blocked",
    blockers
  };
}

function blocker(code: FlowActivationBlocker["code"], path: string): FlowActivationBlocker {
  return { code, path, capabilityKey: null };
}

function readManifestSchemaVersion(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unsupported";
  const schemaVersion = (value as Record<string, unknown>).schemaVersion;
  return typeof schemaVersion === "string" ? schemaVersion : "unsupported";
}

function uniqueBlockers(
  blockers: readonly FlowActivationBlocker[]
): readonly FlowActivationBlocker[] {
  return [
    ...new Map(
      blockers.map((item) => [`${item.code}:${item.path}:${item.capabilityKey}`, item])
    ).values()
  ];
}

async function readDatabaseInstant(transaction: FlowEnrollmentTransaction): Promise<string> {
  const result = await transaction.execute(
    sql<{ value: string }>`select (extract(epoch from clock_timestamp()) * 1000)::text as value`
  );
  const row = result.rows[0];
  const instant = row ? parseFlowDatabaseEpochMilliseconds(row.value) : null;
  if (!instant) throw new FlowEnrollmentAuthorityIntegrityError();
  return instant.toISOString();
}

function toIsoInstant(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  return value.toISOString();
}
