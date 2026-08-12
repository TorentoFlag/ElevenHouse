import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  flowCapabilityManifestV2Schema,
  flowGraphV2Schema,
  type FlowGraphV2
} from "@elevenhouse/contracts";
import {
  activateFlowVersionEnrollment,
  compileFlowGraphV2,
  createFlowRuntimeRequirementKeys,
  FlowEnrollmentAuthorityIntegrityError,
  FlowEnrollmentCommandBusyError,
  pauseFlowEnrollment,
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerRegistration
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowEnrollmentControl } from "../../../scripts/flow-enrollment-control-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzlePlatformTariffAuthorityStore } from "../platform-billing/drizzle-platform-tariff-authority-store";
import { runFlowEnrollmentControlOutcomeRetention } from "./drizzle-flow-enrollment-control-retention-store";
import { createDrizzleFlowEnrollmentControlStore } from "./drizzle-flow-enrollment-control-store";
import { createDrizzleFlowEnrollmentQueryStore } from "./drizzle-flow-enrollment-query-store";
import { createDrizzleFlowDefinitionReadStore } from "./drizzle-flow-definition-read-store";
import { createDrizzleFlowActivationReviewStore } from "./drizzle-flow-activation-review-store";
import { provisionFlowEnrollmentReadAuthority } from "./drizzle-flow-enrollment-authority-provisioning";
import { createDrizzleFlowRuntimeControlCommandStore } from "./drizzle-flow-runtime-control-command-store";
import { createDrizzleFlowWorkerReadinessStore } from "./drizzle-flow-worker-readiness-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const integrationBaselineSql = process.env.FLOW_INTEGRATION_BASELINE_PATH
  ? readFileSync(process.env.FLOW_INTEGRATION_BASELINE_PATH, "utf8")
  : readCurrentMigrationSql();
const databaseName = `elevenhouse_flow_enrollment_store_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });

const graph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Manual client",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Completed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "manual-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
});
const compiledGraph = compileFlowGraphV2(graph);
if (!compiledGraph.capabilityManifest) throw new Error("Expected publishable enrollment graph");
const capabilityManifest = compiledGraph.capabilityManifest;
const requirementKeys = createFlowRuntimeRequirementKeys(capabilityManifest);

let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

describe.sequential("Flow enrollment control store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await runtime.pool.query("DROP SCHEMA public CASCADE");
    await runtime.pool.query("CREATE SCHEMA public");
    await runtime.pool.query(integrationBaselineSql);
    await inTransaction(async (client) => {
      await reconcileAuditActorSubjects(client);
      await reconcileFlowRuntimeControlAuthority(client);
      await reconcileFlowEnrollmentControl(client);
    });
  }, 30_000);

  it("activates once and exact-replays the durable response without another allocation", async () => {
    const fixture = await createFixture();
    const input = activationInput(fixture, "activate-flow-0001");

    const created = await activateFlowVersionEnrollment(input);
    const replayed = await activateFlowVersionEnrollment(input);

    expect(created).toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          statusCode: 200,
          body: {
            enrollment: {
              state: "active",
              enrollmentRevision: 1,
              activeVersionId: fixture.versionId
            },
            activationEpoch: { sequence: 1, effectiveTo: null }
          }
        }
      }
    });
    expect(replayed).toEqual({ ...created, kind: "replayed" });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      commandCount: 1,
      outcomeCount: 1,
      activeAllocations: 1,
      quotaRevision: 2
    });
  });

  it("projects inactive and active enrollment authority without leaking foreign ownership", async () => {
    const fixture = await createFixture();
    const queryStore = createDrizzleFlowEnrollmentQueryStore(runtime.database);
    const definitionReadStore = createDrizzleFlowDefinitionReadStore(runtime.database);

    await expect(
      queryStore.getByOwner({ ownerUserId: fixture.ownerUserId, flowId: fixture.flowId })
    ).resolves.toEqual({
      schemaVersion: "flow-enrollment-detail.v1",
      enrollment: {
        schemaVersion: "flow-enrollment-control.v1",
        flowId: fixture.flowId,
        state: "inactive",
        definitionRevision: fixture.definitionRevision,
        enrollmentRevision: 0,
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null,
        lastPausedAt: null
      },
      activeActivationEpoch: null
    });
    await expect(
      queryStore.getByOwner({ ownerUserId: fixture.actorUserId, flowId: fixture.flowId })
    ).resolves.toBeNull();

    const activated = await activateFlowVersionEnrollment(
      activationInput(fixture, "activate-for-enrollment-query-0001")
    );
    if (activated.outcome.kind !== "succeeded") throw new Error("Expected activation");

    await expect(
      queryStore.getByOwner({ ownerUserId: fixture.ownerUserId, flowId: fixture.flowId })
    ).resolves.toEqual({
      schemaVersion: "flow-enrollment-detail.v1",
      enrollment: activated.outcome.response.body.enrollment,
      activeActivationEpoch: activated.outcome.response.body.activationEpoch
    });
    await expect(
      definitionReadStore.getByOwner({ ownerUserId: fixture.ownerUserId, flowId: fixture.flowId })
    ).resolves.toMatchObject({
      id: fixture.flowId,
      revision: fixture.definitionRevision,
      enrollment: {
        authority: "enrollment_v1",
        control: activated.outcome.response.body.enrollment
      }
    });
    await expect(
      definitionReadStore.listByOwner({
        ownerUserId: fixture.ownerUserId,
        query: { state: "all", enrollmentState: "active", limit: 50, offset: 0 }
      })
    ).resolves.toMatchObject({
      total: 1,
      flows: [{ enrollment: { authority: "enrollment_v1", control: { state: "active" } } }]
    });

    await pauseFlowEnrollment({
      store: fixture.store,
      actorUserId: fixture.actorUserId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      idempotencyKey: "pause-for-enrollment-query-0001",
      request: {
        schemaVersion: "flow-enrollment-pause-command.v1",
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: fixture.versionId,
        expectedActivationEpochId: activated.outcome.response.body.activationEpoch.id
      }
    });
    await expect(
      definitionReadStore.getByOwner({ ownerUserId: fixture.ownerUserId, flowId: fixture.flowId })
    ).resolves.toMatchObject({
      enrollment: { control: { state: "paused" } }
    });
  });

  it("reviews activation in a read-only snapshot with complete command CAS evidence", async () => {
    const fixture = await createFixture();
    await runtime.database.transaction((transaction) =>
      provisionFlowEnrollmentReadAuthority(transaction, fixture.ownerUserId)
    );
    const store = createDrizzleFlowActivationReviewStore(runtime.database);
    const before = await readReviewWriteCounts(fixture.ownerUserId);

    await expect(
      store.getByOwner({
        ownerUserId: fixture.ownerUserId,
        flowId: fixture.flowId,
        versionId: fixture.versionId
      })
    ).resolves.toMatchObject({
      schemaVersion: "flow-activation-review.v1",
      flowId: fixture.flowId,
      versionId: fixture.versionId,
      definitionRevision: fixture.definitionRevision,
      enrollmentRevision: 0,
      expectedActiveVersionId: null,
      decision: "ready",
      blockers: []
    });
    await expect(
      store.getByOwner({
        ownerUserId: fixture.actorUserId,
        flowId: fixture.flowId,
        versionId: fixture.versionId
      })
    ).resolves.toBeNull();
    await expect(readReviewWriteCounts(fixture.ownerUserId)).resolves.toEqual(before);

  });

  it("blocks review and activation when the persisted manifest does not match its graph", async () => {
    const fixture = await createFixture({
      capabilityManifest: flowCapabilityManifestV2Schema.parse({
        ...capabilityManifest,
        requiredCapabilities: ["products.read"]
      })
    });
    await runtime.database.transaction((transaction) =>
      provisionFlowEnrollmentReadAuthority(transaction, fixture.ownerUserId)
    );
    const reviewStore = createDrizzleFlowActivationReviewStore(runtime.database);

    await expect(
      reviewStore.getByOwner({
        ownerUserId: fixture.ownerUserId,
        flowId: fixture.flowId,
        versionId: fixture.versionId
      })
    ).resolves.toMatchObject({
      decision: "blocked",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "FLOW_GRAPH_MANIFEST_INVALID" })
      ])
    });
    await expect(
      activateFlowVersionEnrollment(
        activationInput(fixture, "activate-graph-manifest-mismatch-0001")
      )
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_ACTIVATION_BLOCKED",
            blockers: expect.arrayContaining([
              expect.objectContaining({ code: "FLOW_GRAPH_MANIFEST_INVALID" })
            ])
          }
        }
      }
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 0,
      openEpochs: 0,
      activeAllocations: 0
    });
  });

  it("blocks a natal Flow when an active selected product does not require a single natal chart", async () => {
    const productId = randomUUID();
    const natalGraph = bookingNatalGraph(productId);
    const compiledNatalGraph = compileFlowGraphV2(natalGraph);
    const natalManifest = compiledNatalGraph.capabilityManifest;
    if (!natalManifest) throw new Error("Expected a publishable natal Flow graph");
    const fixture = await createFixture({ graph: natalGraph, capabilityManifest: natalManifest });
    await insertProduct(fixture.ownerUserId, productId, {
      methods: ["forecast"],
      requiredClientData: ["chart1"]
    });

    await expect(
      activateFlowVersionEnrollment(activationInput(fixture, "activate-incompatible-product-0001"))
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_ACTIVATION_BLOCKED",
            blockers: expect.arrayContaining([
              expect.objectContaining({ code: "FLOW_PRODUCT_UNAVAILABLE" })
            ])
          }
        }
      }
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 0,
      openEpochs: 0,
      activeAllocations: 0
    });
  });

  it("blocks a natal Flow when the selected product requires a second chart", async () => {
    const productId = randomUUID();
    const natalGraph = bookingNatalGraph(productId);
    const natalManifest = compileRequiredManifest(natalGraph);
    const fixture = await createFixture({ graph: natalGraph, capabilityManifest: natalManifest });
    await insertProduct(fixture.ownerUserId, productId, {
      methods: ["natal"],
      requiredClientData: ["chart1", "chart2"]
    });

    await expect(
      activateFlowVersionEnrollment(activationInput(fixture, "activate-second-chart-product-0001"))
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_ACTIVATION_BLOCKED",
            blockers: expect.arrayContaining([
              expect.objectContaining({ code: "FLOW_PRODUCT_UNAVAILABLE" })
            ])
          }
        }
      }
    });
  });

  it("activates a natal Flow for an active product that requires one natal chart", async () => {
    const productId = randomUUID();
    const natalGraph = bookingNatalGraph(productId);
    const natalManifest = compileRequiredManifest(natalGraph);
    const fixture = await createFixture({ graph: natalGraph, capabilityManifest: natalManifest });
    await insertProduct(fixture.ownerUserId, productId, {
      methods: ["natal"],
      requiredClientData: ["chart1"]
    });

    await expect(
      activateFlowVersionEnrollment(activationInput(fixture, "activate-natal-product-0001"))
    ).resolves.toMatchObject({ kind: "created", outcome: { kind: "succeeded" } });
  });

  it("evaluates entitlement with a database instant sampled after subscription locks", async () => {
    const fixture = await createFixture();
    const subscription = await runtime.pool.query<{ ends_at: Date }>(
      `UPDATE platform_tariff_subscriptions
          SET ends_at = clock_timestamp() + interval '650 milliseconds',
              version = version + 1,
              updated_at = clock_timestamp()
        WHERE owner_user_id = $1 AND state = 'active'
        RETURNING ends_at`,
      [fixture.ownerUserId]
    );
    const endsAt = subscription.rows[0]?.ends_at;
    if (!endsAt) throw new Error("Expected an active tariff subscription");

    const blocker = await runtime.pool.connect();
    let attempt: ReturnType<typeof activateFlowVersionEnrollment> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM platform_tariff_subscriptions WHERE owner_user_id = $1 FOR UPDATE",
        [fixture.ownerUserId]
      );
      attempt = activateFlowVersionEnrollment(
        activationInput(fixture, "activate-after-entitlement-expiry-0001")
      );
      void attempt.catch(() => undefined);
      await waitForLockWaiters(1, "platform_tariff_subscriptions");
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, endsAt.getTime() - Date.now() + 25))
      );
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    if (!attempt) throw new Error("Expected an activation attempt");

    await expect(attempt).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_ACTIVATION_BLOCKED",
            blockers: expect.arrayContaining([
              expect.objectContaining({ code: "FLOW_ENTITLEMENT_UNAVAILABLE" })
            ])
          }
        }
      }
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 0,
      openEpochs: 0,
      activeAllocations: 0
    });
  });

  it("normalizes corrupted persisted tariff evidence as enrollment authority integrity", async () => {
    const fixture = await createFixture();
    await runtime.database.transaction((transaction) =>
      provisionFlowEnrollmentReadAuthority(transaction, fixture.ownerUserId)
    );
    await runtime.pool.query(
      `UPDATE platform_tariff_versions version
          SET automation_limit = automation_limit + 1
         FROM platform_tariff_subscriptions subscription
        WHERE subscription.owner_user_id = $1
          AND version.tariff_series_id = subscription.tariff_series_id
          AND version.version = subscription.tariff_version`,
      [fixture.ownerUserId]
    );
    const reviewStore = createDrizzleFlowActivationReviewStore(runtime.database);

    await expect(
      reviewStore.getByOwner({
        ownerUserId: fixture.ownerUserId,
        flowId: fixture.flowId,
        versionId: fixture.versionId
      })
    ).rejects.toBeInstanceOf(FlowEnrollmentAuthorityIntegrityError);
  });

  it("serializes concurrent exact replay to one command and rejects a changed request", async () => {
    const fixture = await createFixture();
    const input = activationInput(fixture, "concurrent-exact-replay-0001");
    const actorSubject = await runtime.pool.query<{ actor_subject_id: string }>(
      `SELECT actor_subject_id FROM audit_actor_subjects
        WHERE kind = 'user' AND user_id = $1`,
      [fixture.actorUserId]
    );
    const blocker = await runtime.pool.connect();
    let first: ReturnType<typeof activateFlowVersionEnrollment> | undefined;
    let second: ReturnType<typeof activateFlowVersionEnrollment> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT actor_subject_id FROM audit_actor_subjects
          WHERE actor_subject_id = $1 FOR UPDATE`,
        [actorSubject.rows[0]!.actor_subject_id]
      );
      first = activateFlowVersionEnrollment(input);
      second = activateFlowVersionEnrollment(input);
      await waitForLockWaiters(2, "audit_actor_subjects");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    if (!first || !second) throw new Error("Expected concurrent replay attempts");
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.kind).sort()).toEqual(["created", "replayed"]);
    expect(results[0]!.outcome).toEqual(results[1]!.outcome);
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      epochCount: 1,
      commandCount: 1,
      outcomeCount: 1,
      activeAllocations: 1
    });

    await expect(
      activateFlowVersionEnrollment({
        ...input,
        request: { ...input.request, expectedRevision: input.request.expectedRevision + 1 }
      })
    ).resolves.toMatchObject({
      kind: "replayed",
      outcome: {
        kind: "rejected",
        response: { statusCode: 409, body: { code: "FLOW_IDEMPOTENCY_KEY_REUSED" } }
      }
    });
  });

  it("durably rejects stale CAS without changing the active epoch or quota", async () => {
    const fixture = await createFixture();
    await activateFlowVersionEnrollment(activationInput(fixture, "activate-flow-0002"));

    const rejected = await activateFlowVersionEnrollment({
      ...activationInput(fixture, "activate-flow-stale-0001"),
      request: {
        ...activationInput(fixture, "activate-flow-stale-0001").request,
        expectedEnrollmentRevision: 0,
        expectedActiveVersionId: null
      }
    });

    expect(rejected).toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_ENROLLMENT_REVISION_CONFLICT",
            expectedRevision: 0,
            currentRevision: 1
          }
        }
      }
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      epochCount: 1,
      activeAllocations: 1,
      quotaRevision: 2,
      commandCount: 2,
      outcomeCount: 2
    });
  });

  it("switches an active version at the tariff limit without consuming another slot", async () => {
    const fixture = await createFixture({ automationLimit: 1 });
    await activateFlowVersionEnrollment(activationInput(fixture, "activate-flow-0003"));
    const nextVersion = await publishNextVersion(fixture);

    const switched = await activateFlowVersionEnrollment({
      store: fixture.store,
      actorUserId: fixture.actorUserId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      idempotencyKey: "switch-flow-version-0001",
      request: {
        schemaVersion: "flow-activation-command.v1",
        versionId: nextVersion.versionId,
        expectedRevision: nextVersion.definitionRevision,
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: fixture.versionId
      }
    });

    expect(switched).toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          body: {
            enrollment: {
              enrollmentRevision: 2,
              activeVersionId: nextVersion.versionId
            },
            activationEpoch: { sequence: 2 }
          }
        }
      }
    });
    const epochs = await runtime.pool.query<{
      flow_version_id: string;
      effective_from: string;
      effective_to: string | null;
      close_reason: string | null;
    }>(
      `SELECT flow_version_id, effective_from::text, effective_to::text, close_reason
         FROM flow_activation_epochs WHERE flow_id = $1 ORDER BY sequence`,
      [fixture.flowId]
    );
    expect(epochs.rows).toHaveLength(2);
    expect(epochs.rows[0]).toMatchObject({
      flow_version_id: fixture.versionId,
      effective_to: epochs.rows[1]!.effective_from,
      close_reason: "version_switch"
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      epochCount: 2,
      activeAllocations: 1,
      quotaRevision: 2
    });
  });

  it("persists one winner and one durable stale-CAS rejection for concurrent switches", async () => {
    const fixture = await createFixture();
    const activated = await activateFlowVersionEnrollment(
      activationInput(fixture, "activate-before-switch-race-0001")
    );
    if (activated.outcome.kind !== "succeeded") throw new Error("Expected activation");
    const candidates = await publishConcurrentVersions(fixture);
    const switchInputs = candidates.map((versionId, index) => ({
      store: fixture.store,
      actorUserId: fixture.actorUserId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      idempotencyKey: `concurrent-switch-000${index + 1}`,
      request: {
        schemaVersion: "flow-activation-command.v1" as const,
        versionId,
        expectedRevision: fixture.definitionRevision + 2,
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: fixture.versionId
      }
    }));
    const actorSubject = await runtime.pool.query<{ actor_subject_id: string }>(
      `SELECT actor_subject_id FROM audit_actor_subjects
        WHERE kind = 'user' AND user_id = $1`,
      [fixture.actorUserId]
    );
    const blocker = await runtime.pool.connect();
    let attempts:
      | readonly [
          ReturnType<typeof activateFlowVersionEnrollment>,
          ReturnType<typeof activateFlowVersionEnrollment>
        ]
      | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT actor_subject_id FROM audit_actor_subjects
          WHERE actor_subject_id = $1 FOR UPDATE`,
        [actorSubject.rows[0]!.actor_subject_id]
      );
      attempts = [
        activateFlowVersionEnrollment(switchInputs[0]!),
        activateFlowVersionEnrollment(switchInputs[1]!)
      ];
      await waitForLockWaiters(2, "audit_actor_subjects");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    if (!attempts) throw new Error("Expected concurrent switch attempts");
    const results = await Promise.all(attempts);
    const winner = results.find((result) => result.outcome.kind === "succeeded");
    const loserIndex = results.findIndex((result) => result.outcome.kind === "rejected");
    expect(winner).toMatchObject({ kind: "created", outcome: { kind: "succeeded" } });
    expect(results[loserIndex]).toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: { statusCode: 409, body: { code: "FLOW_ENROLLMENT_REVISION_CONFLICT" } }
      }
    });
    await expect(activateFlowVersionEnrollment(switchInputs[loserIndex]!)).resolves.toEqual({
      ...results[loserIndex],
      kind: "replayed"
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      epochCount: 2,
      commandCount: 3,
      outcomeCount: 3,
      activeAllocations: 1,
      quotaRevision: 2
    });
  });

  it("pauses enrollment as containment even after rollout becomes definition-only", async () => {
    const fixture = await createFixture();
    const activated = await activateFlowVersionEnrollment(
      activationInput(fixture, "activate-flow-0004")
    );
    if (activated.outcome.kind !== "succeeded") throw new Error("Expected activation");
    await replaceFlowRuntimeRolloutPolicy({
      store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
      actorUserId: fixture.actorUserId,
      idempotencyKey: "disable-flow-runtime-0001",
      expectedRevision: 2,
      policy: definitionOnlyPolicy(),
      reason: "Containment integration"
    });

    const paused = await pauseFlowEnrollment({
      store: fixture.store,
      actorUserId: fixture.actorUserId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      idempotencyKey: "pause-flow-enrollment-0001",
      request: {
        schemaVersion: "flow-enrollment-pause-command.v1",
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: fixture.versionId,
        expectedActivationEpochId: activated.outcome.response.body.activationEpoch.id
      }
    });

    expect(paused).toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          body: {
            enrollment: { state: "paused", enrollmentRevision: 2 },
            closedEpoch: { closeReason: "pause_enrollment" }
          }
        }
      }
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 0,
      openEpochs: 0,
      epochCount: 1,
      activeAllocations: 0,
      quotaRevision: 3
    });
  });

  it("rejects a control bound to another owner's subject", async () => {
    const fixture = await createFixture();
    const foreignOwnerUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1)", [foreignOwnerUserId]);
    const foreignSubject = await runtime.pool.query<{ owner_subject_id: string }>(
      `INSERT INTO flow_runtime_owner_subjects (owner_user_id)
       VALUES ($1) RETURNING owner_subject_id`,
      [foreignOwnerUserId]
    );

    await expect(
      inTransaction(async (client) => {
        await client.query(
          `INSERT INTO flow_automation_quota_authorities (owner_subject_id) VALUES ($1)`,
          [foreignSubject.rows[0]!.owner_subject_id]
        );
        await client.query(
          `INSERT INTO flow_enrollment_controls (flow_id, owner_user_id, owner_subject_id)
           VALUES ($1, $2, $3)`,
          [fixture.flowId, fixture.ownerUserId, foreignSubject.rows[0]!.owner_subject_id]
        );
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      })
    ).rejects.toThrow("flow enrollment owner subject binding is inconsistent");
  });

  it("rejects a control transition whose persisted enrollment CAS is stale", async () => {
    const fixture = await createFixture();
    const actorSubject = await runtime.pool.query<{ actor_subject_id: string }>(
      `SELECT actor_subject_id FROM audit_actor_subjects
        WHERE kind = 'user' AND user_id = $1`,
      [fixture.actorUserId]
    );
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO flow_automation_quota_authorities (owner_subject_id) VALUES ($1)`,
        [fixture.ownerSubjectId]
      );
      await client.query(
        `INSERT INTO flow_enrollment_controls (flow_id, owner_user_id, owner_subject_id)
         VALUES ($1, $2, $3)`,
        [fixture.flowId, fixture.ownerUserId, fixture.ownerSubjectId]
      );
      const command = await client.query<{ id: string }>(
        `INSERT INTO flow_enrollment_commands (
           actor_subject_id, owner_subject_id, route_template, resource_id, command_scope,
           idempotency_key, request_hash, request_schema_version, target_version_id,
           expected_definition_revision, expected_enrollment_revision,
           expected_active_version_id, expected_activation_epoch_id, replay_until
         ) VALUES (
           $1, $2, '/flows/:flowId/activate', $3, 'flows.enrollment.activate.v1',
           'stale-causal-cas-0001', $4, 'flow-activation-command.v1', $5,
           $6, 99, NULL, NULL, transaction_timestamp() + interval '24 hours'
         ) RETURNING id`,
        [
          actorSubject.rows[0]!.actor_subject_id,
          fixture.ownerSubjectId,
          fixture.flowId,
          `sha256:${"c".repeat(64)}`,
          fixture.versionId,
          fixture.definitionRevision
        ]
      );

      await expect(
        client.query(
          `UPDATE flow_enrollment_controls
              SET state = 'active', enrollment_revision = 1,
                  active_version_id = $2, active_activation_epoch_id = $3,
                  active_since = clock_timestamp(), last_command_id = $4
            WHERE flow_id = $1`,
          [fixture.flowId, fixture.versionId, randomUUID(), command.rows[0]!.id]
        )
      ).rejects.toThrow("flow enrollment command causal CAS is inconsistent");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("rejects a nullable activation definition CAS at command insertion", async () => {
    const fixture = await createFixture();
    const actorSubject = await runtime.pool.query<{ actor_subject_id: string }>(
      `SELECT actor_subject_id FROM audit_actor_subjects
        WHERE kind = 'user' AND user_id = $1`,
      [fixture.actorUserId]
    );
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query(
          `INSERT INTO flow_enrollment_commands (
             actor_subject_id, owner_subject_id, route_template, resource_id, command_scope,
             idempotency_key, request_hash, request_schema_version, target_version_id,
             expected_definition_revision, expected_enrollment_revision,
             expected_active_version_id, expected_activation_epoch_id, replay_until
           ) VALUES (
             $1, $2, '/flows/:flowId/activate', $3, 'flows.enrollment.activate.v1',
             'nullable-definition-cas-0001', $4, 'flow-activation-command.v1', $5,
             NULL, 0, NULL, NULL, transaction_timestamp() + interval '24 hours'
           )`,
          [
            actorSubject.rows[0]!.actor_subject_id,
            fixture.ownerSubjectId,
            fixture.flowId,
            `sha256:${"d".repeat(64)}`,
            fixture.versionId
          ]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "flow_enrollment_commands_request_shape_check"
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("preserves a paused control as durable enrollment CAS history", async () => {
    const fixture = await createFixture();
    const activated = await activateFlowVersionEnrollment(
      activationInput(fixture, "activate-before-control-delete-0001")
    );
    if (activated.outcome.kind !== "succeeded") throw new Error("Expected activation");
    await pauseFlowEnrollment({
      store: fixture.store,
      actorUserId: fixture.actorUserId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      idempotencyKey: "pause-before-control-delete-0001",
      request: {
        schemaVersion: "flow-enrollment-pause-command.v1",
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: fixture.versionId,
        expectedActivationEpochId: activated.outcome.response.body.activationEpoch.id
      }
    });

    await expect(
      runtime.pool.query("DELETE FROM flow_enrollment_controls WHERE flow_id = $1", [
        fixture.flowId
      ])
    ).rejects.toThrow("flow enrollment control cannot be removed");
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 0,
      openEpochs: 0,
      epochCount: 1,
      activeAllocations: 0,
      quotaRevision: 3
    });
  });

  it("serializes two flows competing for the last automation slot", async () => {
    const fixture = await createFixture({ automationLimit: 1 });
    const second = await createPublishedFlow(fixture.ownerUserId, 1);
    const secondActorUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1)", [secondActorUserId]);
    const blocker = await runtime.pool.connect();
    let first: ReturnType<typeof activateFlowVersionEnrollment> | undefined;
    let secondAttempt: ReturnType<typeof activateFlowVersionEnrollment> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT owner_subject_id FROM flow_runtime_owner_subjects
          WHERE owner_subject_id = $1 FOR UPDATE`,
        [fixture.ownerSubjectId]
      );
      first = activateFlowVersionEnrollment(activationInput(fixture, "quota-race-flow-0001"));
      secondAttempt = activateFlowVersionEnrollment({
        ...activationInput(fixture, "quota-race-flow-0002"),
        actorUserId: secondActorUserId,
        flowId: second.flowId,
        request: {
          ...activationInput(fixture, "quota-race-flow-0002").request,
          versionId: second.versionId
        }
      });
      await waitForOwnerSubjectLockWaiters(2);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    if (!first || !secondAttempt) throw new Error("Expected concurrent activation attempts");
    const results = await Promise.all([first, secondAttempt]);

    expect(results.filter((result) => result.outcome.kind === "succeeded")).toHaveLength(1);
    expect(results.filter((result) => result.outcome.kind === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.outcome.kind === "rejected")).toMatchObject({
      outcome: {
        response: {
          body: {
            code: "FLOW_ACTIVATION_BLOCKED",
            blockers: [{ code: "FLOW_AUTOMATION_QUOTA_EXCEEDED" }]
          }
        }
      }
    });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      activeAllocations: 1,
      commandCount: 2,
      outcomeCount: 2
    });
  });

  it("bounds activation lock waits, rolls back the command, and permits the same key after release", async () => {
    const fixture = await createFixture();
    await runtime.pool.query(
      `INSERT INTO flow_automation_quota_authorities (owner_subject_id)
       VALUES ($1)`,
      [fixture.ownerSubjectId]
    );
    const blocker = await runtime.pool.connect();
    let attempt: { readonly failure: unknown; readonly elapsed: number } | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT owner_subject_id FROM flow_automation_quota_authorities
          WHERE owner_subject_id = $1 FOR UPDATE`,
        [fixture.ownerSubjectId]
      );
      const startedAt = Date.now();
      const failure = await activateFlowVersionEnrollment(
        activationInput(fixture, "activate-lock-timeout-0001")
      ).catch((error: unknown) => error);
      attempt = { failure, elapsed: Date.now() - startedAt };
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }

    if (!attempt) throw new Error("Expected activation command attempt");
    expect(attempt.failure).toBeInstanceOf(FlowEnrollmentCommandBusyError);
    expect(attempt.elapsed).toBeLessThan(3_000);
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 0,
      openEpochs: 0,
      commandCount: 0,
      outcomeCount: 0,
      activeAllocations: 0,
      quotaRevision: 1
    });
    await expect(
      activateFlowVersionEnrollment(activationInput(fixture, "activate-lock-timeout-0001"))
    ).resolves.toMatchObject({ kind: "created", outcome: { kind: "succeeded" } });
  });

  it("bounds pause lock waits without persisting a failed attempt", async () => {
    const fixture = await createFixture();
    const activated = await activateFlowVersionEnrollment(
      activationInput(fixture, "activate-before-pause-timeout-0001")
    );
    if (activated.outcome.kind !== "succeeded") throw new Error("Expected activation");
    const pauseInput = {
      store: fixture.store,
      actorUserId: fixture.actorUserId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      idempotencyKey: "pause-lock-timeout-0001",
      request: {
        schemaVersion: "flow-enrollment-pause-command.v1" as const,
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: fixture.versionId,
        expectedActivationEpochId: activated.outcome.response.body.activationEpoch.id
      }
    };
    const blocker = await runtime.pool.connect();
    let attempt: { readonly failure: unknown; readonly elapsed: number } | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT owner_subject_id FROM flow_automation_quota_authorities
          WHERE owner_subject_id = $1 FOR UPDATE`,
        [fixture.ownerSubjectId]
      );
      const startedAt = Date.now();
      const failure = await pauseFlowEnrollment(pauseInput).catch((error: unknown) => error);
      attempt = { failure, elapsed: Date.now() - startedAt };
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }

    if (!attempt) throw new Error("Expected pause command attempt");
    expect(attempt.failure).toBeInstanceOf(FlowEnrollmentCommandBusyError);
    expect(attempt.elapsed).toBeLessThan(3_000);
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      activeControls: 1,
      openEpochs: 1,
      commandCount: 1,
      outcomeCount: 1,
      activeAllocations: 1,
      quotaRevision: 2
    });
    await expect(pauseFlowEnrollment(pauseInput)).resolves.toMatchObject({
      kind: "created",
      outcome: { kind: "succeeded" }
    });
  });

  it("purges expired outcomes in concurrent bounded batches while retaining command tombstones", async () => {
    const fixture = await createFixture({ automationLimit: 3 });
    const second = await createPublishedFlow(fixture.ownerUserId, 1);
    const third = await createPublishedFlow(fixture.ownerUserId, 1);
    const fixtures = [fixture, { ...fixture, ...second }, { ...fixture, ...third }] as const;
    const keys = [
      "enrollment-retention-0001",
      "enrollment-retention-0002",
      "enrollment-retention-0003"
    ] as const;
    for (const [index, current] of fixtures.entries()) {
      await activateFlowVersionEnrollment(activationInput(current, keys[index]!));
    }

    await expect(
      runtime.pool.query(
        `DELETE FROM flow_enrollment_command_outcomes
          WHERE command_id = (
            SELECT id FROM flow_enrollment_commands WHERE idempotency_key = $1
          )`,
        [keys[2]]
      )
    ).rejects.toThrow("flow enrollment outcomes are immutable");

    await runtime.pool.query(
      "ALTER TABLE flow_enrollment_commands DISABLE TRIGGER flow_enrollment_commands_transition_guard"
    );
    try {
      await runtime.pool.query(
        `WITH aged AS (
           SELECT clock_timestamp() - interval '25 hours' AS created_at
         )
         UPDATE flow_enrollment_commands
            SET created_at = aged.created_at,
                replay_until = aged.created_at + interval '24 hours'
           FROM aged
          WHERE idempotency_key = ANY($1::text[])`,
        [[keys[0], keys[1]]]
      );
    } finally {
      await runtime.pool.query(
        "ALTER TABLE flow_enrollment_commands ENABLE TRIGGER flow_enrollment_commands_transition_guard"
      );
    }

    const results = await Promise.all([
      runFlowEnrollmentControlOutcomeRetention(runtime.database, { batchSize: 1 }),
      runFlowEnrollmentControlOutcomeRetention(runtime.database, { batchSize: 1 })
    ]);
    expect(results.reduce((total, result) => total + result.purged, 0)).toBe(2);
    await expect(
      runFlowEnrollmentControlOutcomeRetention(runtime.database, { batchSize: 10 })
    ).resolves.toEqual({ purged: 0 });
    await expect(readEnrollmentState(fixture.ownerUserId)).resolves.toMatchObject({
      commandCount: 3,
      outcomeCount: 1,
      activeControls: 3,
      openEpochs: 3,
      activeAllocations: 3
    });
    await expect(
      activateFlowVersionEnrollment(activationInput(fixture, keys[0]))
    ).resolves.toMatchObject({
      kind: "replayed",
      outcome: {
        kind: "rejected",
        response: { statusCode: 409, body: { code: "FLOW_IDEMPOTENCY_KEY_EXPIRED" } }
      }
    });
  });

  it("rolls back command, epoch, control, and quota when outcome persistence fails late", async () => {
    const fixture = await createFixture();
    await runtime.pool.query(`
      CREATE FUNCTION reject_flow_enrollment_test_outcome()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM flow_enrollment_commands command
           WHERE command.id = NEW.command_id
             AND command.idempotency_key = 'late-outcome-failure-0001'
        ) THEN
          RAISE EXCEPTION 'forced enrollment outcome failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await runtime.pool.query(`
      CREATE TRIGGER reject_flow_enrollment_test_outcome
      BEFORE INSERT ON flow_enrollment_command_outcomes
      FOR EACH ROW EXECUTE FUNCTION reject_flow_enrollment_test_outcome()
    `);

    try {
      const failure = await activateFlowVersionEnrollment(
        activationInput(fixture, "late-outcome-failure-0001")
      ).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced enrollment outcome failure");
    } finally {
      await runtime.pool.query(
        "DROP TRIGGER reject_flow_enrollment_test_outcome ON flow_enrollment_command_outcomes"
      );
      await runtime.pool.query("DROP FUNCTION reject_flow_enrollment_test_outcome() ");
    }

    const state = await runtime.pool.query<{
      controls: string;
      epochs: string;
      commands: string;
      outcomes: string;
      quotas: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM flow_enrollment_controls WHERE flow_id = $1) AS controls,
         (SELECT count(*)::text FROM flow_activation_epochs WHERE flow_id = $1) AS epochs,
         (SELECT count(*)::text FROM flow_enrollment_commands WHERE resource_id = $1) AS commands,
         (SELECT count(*)::text FROM flow_enrollment_command_outcomes outcome
           JOIN flow_enrollment_commands command ON command.id = outcome.command_id
          WHERE command.resource_id = $1) AS outcomes,
         (SELECT count(*)::text FROM flow_automation_quota_authorities
           WHERE owner_subject_id = $2) AS quotas`,
      [fixture.flowId, fixture.ownerSubjectId]
    );
    expect(state.rows[0]).toEqual({
      controls: "0",
      epochs: "0",
      commands: "0",
      outcomes: "0",
      quotas: "0"
    });
    await expect(
      activateFlowVersionEnrollment(activationInput(fixture, "late-outcome-failure-0001"))
    ).resolves.toMatchObject({ kind: "created", outcome: { kind: "succeeded" } });
  });

  it("rolls back newly resolved actor and owner subjects when command insertion fails", async () => {
    const fixture = await createFixture();
    const freshActorUserId = randomUUID();
    const freshOwnerUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1), ($2)", [
      freshActorUserId,
      freshOwnerUserId
    ]);
    await runtime.pool.query(`
      CREATE FUNCTION reject_flow_enrollment_test_command()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.idempotency_key = 'atomic-subject-failure' THEN
          RAISE EXCEPTION 'forced enrollment command failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await runtime.pool.query(`
      CREATE TRIGGER reject_flow_enrollment_test_command
      BEFORE INSERT ON flow_enrollment_commands
      FOR EACH ROW EXECUTE FUNCTION reject_flow_enrollment_test_command()
    `);

    const failure = await activateFlowVersionEnrollment({
      store: fixture.store,
      actorUserId: freshActorUserId,
      ownerUserId: freshOwnerUserId,
      flowId: randomUUID(),
      idempotencyKey: "atomic-subject-failure",
      request: {
        schemaVersion: "flow-activation-command.v1",
        versionId: randomUUID(),
        expectedRevision: 1,
        expectedEnrollmentRevision: 0,
        expectedActiveVersionId: null
      }
    }).catch((error: unknown) => error);
    expect(errorChain(failure)).toContain("forced enrollment command failure");

    const subjects = await runtime.pool.query<{ actor_count: string; owner_count: string }>(
      `SELECT
         (SELECT count(*)::text FROM audit_actor_subjects WHERE user_id = $1) AS actor_count,
         (SELECT count(*)::text FROM flow_runtime_owner_subjects WHERE owner_user_id = $2)
           AS owner_count`,
      [freshActorUserId, freshOwnerUserId]
    );
    expect(subjects.rows[0]).toEqual({ actor_count: "0", owner_count: "0" });
  });
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(
  input: {
    readonly automationLimit?: number;
    readonly capabilityManifest?: typeof capabilityManifest;
    readonly graph?: FlowGraphV2;
  } = {}
) {
  const ownerUserId = randomUUID();
  const actorUserId = randomUUID();
  await runtime.pool.query("INSERT INTO users (id) VALUES ($1), ($2)", [ownerUserId, actorUserId]);
  const owner = await runtime.pool.query<{ owner_subject_id: string }>(
    "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
    [ownerUserId]
  );
  const ownerSubjectId = owner.rows[0]!.owner_subject_id;

  const fixtureGraph = input.graph ?? graph;
  const fixtureManifest = input.capabilityManifest ?? compileRequiredManifest(fixtureGraph);
  const fixtureRequirementKeys = createFlowRuntimeRequirementKeys(fixtureManifest);
  await replaceFlowRuntimeRolloutPolicy({
    store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
    actorUserId,
    idempotencyKey: `enable-flow-${randomUUID()}`,
    expectedRevision: 1,
    policy: canaryPolicy(ownerSubjectId, fixtureRequirementKeys),
    reason: "Enrollment integration"
  });
  const workerStore = createDrizzleFlowWorkerReadinessStore(runtime.database);
  await workerStore.register(workerRegistration(ownerSubjectId, fixtureRequirementKeys));
  await createActiveTariff(ownerUserId, input.automationLimit ?? 1);
  const published = await createPublishedFlow(ownerUserId, 1, fixtureManifest, fixtureGraph);
  return {
    ...published,
    actorUserId,
    ownerUserId,
    ownerSubjectId,
    store: createDrizzleFlowEnrollmentControlStore(runtime.database)
  };
}

function activationInput(fixture: Fixture, idempotencyKey: string) {
  return {
    store: fixture.store,
    actorUserId: fixture.actorUserId,
    ownerUserId: fixture.ownerUserId,
    flowId: fixture.flowId,
    idempotencyKey,
    request: {
      schemaVersion: "flow-activation-command.v1" as const,
      versionId: fixture.versionId,
      expectedRevision: fixture.definitionRevision,
      expectedEnrollmentRevision: 0,
      expectedActiveVersionId: null
    }
  };
}

async function createPublishedFlow(
  ownerUserId: string,
  definitionRevision: number,
  publishedCapabilityManifest: typeof capabilityManifest = capabilityManifest,
  publishedGraph: FlowGraphV2 = graph
) {
  return inTransaction(async (client) => {
    const flow = await client.query<{ id: string }>(
      `INSERT INTO flows (
         owner_user_id, name, origin, definition_state, approval_mode,
         revision, draft_graph, draft_presentation, created_at, updated_at
       ) VALUES (
         $1, 'Enrollment fixture', $2, 'draft', 'manual_approve',
         $3, $4, $5, transaction_timestamp(), transaction_timestamp()
       ) RETURNING id`,
      [ownerUserId, origin(), definitionRevision, publishedGraph, presentation()]
    );
    const flowId = flow.rows[0]!.id;
    const version = await insertVersion(client, {
      flowId,
      ownerUserId,
      version: 1,
      sourceRevision: definitionRevision,
      graph: publishedGraph,
      capabilityManifest: publishedCapabilityManifest
    });
    await client.query(
      `UPDATE flows
          SET definition_state = 'versioned',
              published_version_id = $2,
              published_at = (SELECT published_at FROM flow_versions WHERE id = $2),
              updated_at = transaction_timestamp()
        WHERE id = $1`,
      [flowId, version.versionId]
    );
    return { flowId, versionId: version.versionId, definitionRevision };
  });
}

async function publishNextVersion(fixture: Fixture) {
  return inTransaction(async (client) => {
    const nextRevision = fixture.definitionRevision + 1;
    const version = await insertVersion(client, {
      flowId: fixture.flowId,
      ownerUserId: fixture.ownerUserId,
      version: 2,
      sourceRevision: nextRevision
    });
    await client.query(
      `UPDATE flows
          SET revision = $3, published_version_id = $2,
              published_at = (SELECT published_at FROM flow_versions WHERE id = $2),
              updated_at = transaction_timestamp()
        WHERE id = $1`,
      [fixture.flowId, version.versionId, nextRevision]
    );
    return { versionId: version.versionId, definitionRevision: nextRevision };
  });
}

async function publishConcurrentVersions(fixture: Fixture): Promise<readonly [string, string]> {
  return inTransaction(async (client) => {
    const second = await insertVersion(client, {
      flowId: fixture.flowId,
      ownerUserId: fixture.ownerUserId,
      version: 2,
      sourceRevision: fixture.definitionRevision + 1
    });
    const third = await insertVersion(client, {
      flowId: fixture.flowId,
      ownerUserId: fixture.ownerUserId,
      version: 3,
      sourceRevision: fixture.definitionRevision + 2
    });
    await client.query(
      `UPDATE flows
          SET revision = $3, published_version_id = $2,
              published_at = (SELECT published_at FROM flow_versions WHERE id = $2),
              updated_at = transaction_timestamp()
        WHERE id = $1`,
      [fixture.flowId, third.versionId, fixture.definitionRevision + 2]
    );
    return [second.versionId, third.versionId] as const;
  });
}

async function insertVersion(
  client: Client,
  input: {
    readonly flowId: string;
    readonly ownerUserId: string;
    readonly version: number;
    readonly sourceRevision: number;
    readonly graph?: FlowGraphV2;
    readonly capabilityManifest?: typeof capabilityManifest;
  }
) {
  const version = await client.query<{ id: string }>(
    `INSERT INTO flow_versions (
       flow_id, owner_user_id, version, source_revision, approval_mode,
       graph_schema_version, graph, presentation, capability_manifest, published_at
     ) VALUES (
       $1, $2, $3, $4, 'manual_approve', 'flow-graph.v2', $5, $6, $7,
       transaction_timestamp()
     ) RETURNING id`,
    [
      input.flowId,
      input.ownerUserId,
      input.version,
      input.sourceRevision,
      input.graph ?? graph,
      presentation(),
      input.capabilityManifest ?? capabilityManifest
    ]
  );
  return { versionId: version.rows[0]!.id };
}

async function createActiveTariff(ownerUserId: string, automationLimit: number): Promise<void> {
  const tariffSeriesId = `flows-${randomUUID()}`;
  const store = createDrizzlePlatformTariffAuthorityStore({ database: runtime.database });
  const draft = await store.createDraft({
    tariffSeriesId,
    version: 1,
    name: "Flows integration",
    tagline: "Flows integration entitlement",
    monthlyPriceMinor: 0,
    yearlyPriceMinor: 0,
    monthlyRecurringFrequencyDays: null,
    yearlyRecurringFrequencyDays: null,
    clientSaleCommissionBps: 0,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit,
    isPopular: false,
    displayOrder: 0,
    features: ["funnels"]
  });
  await runtime.pool.query(
    `UPDATE platform_tariff_versions
        SET lifecycle = 'published', published_at = transaction_timestamp()
      WHERE tariff_series_id = $1 AND version = 1 AND canonical_digest = $2`,
    [tariffSeriesId, draft.canonicalDigest]
  );
  await store.beginSubscriptionPurchase({
    ownerUserId,
    tariffSeriesId,
    version: 1,
    billingCycle: "month",
    now: new Date().toISOString()
  });
}

function canaryPolicy(
  ownerSubjectId: string,
  requiredRequirementKeys = requirementKeys
): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerSubjectId],
    allowedRequirementKeys: requiredRequirementKeys,
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
}

function definitionOnlyPolicy(): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "definition_only",
    canaryOwnerSubjectIds: [],
    allowedRequirementKeys: [],
    killSwitches: {
      enrollment: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
}

function workerRegistration(
  ownerSubjectId: string,
  requiredRequirementKeys = requirementKeys
): FlowWorkerRegistration {
  const identity = randomUUID();
  return {
    schemaVersion: "flow-worker-registration.v2",
    sessionId: randomUUID(),
    instanceId: `flows-worker-${identity}`,
    roles: ["executor", "enrollment"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys: requiredRequirementKeys,
    deploymentId: `deployment-${identity}`,
    buildId: `build-${identity}`
  };
}

async function readReviewWriteCounts(ownerUserId: string) {
  const result = await runtime.pool.query<{
    commands: string;
    outcomes: string;
    controls: string;
    epochs: string;
    active_allocations: number;
    quota_revision: number;
  }>(
    `SELECT
       (SELECT count(*)::text FROM flow_enrollment_commands) AS commands,
       (SELECT count(*)::text FROM flow_enrollment_command_outcomes) AS outcomes,
       (SELECT count(*)::text FROM flow_enrollment_controls) AS controls,
       (SELECT count(*)::text FROM flow_activation_epochs) AS epochs,
       quota.active_allocations,
       quota.revision AS quota_revision
      FROM flow_automation_quota_authorities quota
      JOIN flow_runtime_owner_subjects subject
        ON subject.owner_subject_id = quota.owner_subject_id
     WHERE subject.owner_user_id = $1`,
    [ownerUserId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Expected provisioned review authority");
  return row;
}

async function readEnrollmentState(ownerUserId: string) {
  const result = await runtime.pool.query<{
    active_controls: string;
    open_epochs: string;
    epoch_count: string;
    command_count: string;
    outcome_count: string;
    active_allocations: number;
    quota_revision: number;
  }>(
    `SELECT
       (SELECT count(*)::text FROM flow_enrollment_controls
         WHERE owner_user_id = $1 AND state = 'active') AS active_controls,
       (SELECT count(*)::text FROM flow_activation_epochs epoch
         JOIN flow_enrollment_controls control ON control.flow_id = epoch.flow_id
        WHERE control.owner_user_id = $1 AND epoch.effective_to IS NULL) AS open_epochs,
       (SELECT count(*)::text FROM flow_activation_epochs epoch
         JOIN flow_enrollment_controls control ON control.flow_id = epoch.flow_id
        WHERE control.owner_user_id = $1) AS epoch_count,
       (SELECT count(*)::text FROM flow_enrollment_commands command
         JOIN flow_runtime_owner_subjects subject
           ON subject.owner_subject_id = command.owner_subject_id
        WHERE subject.owner_user_id = $1) AS command_count,
       (SELECT count(*)::text FROM flow_enrollment_command_outcomes outcome
         JOIN flow_enrollment_commands command ON command.id = outcome.command_id
         JOIN flow_runtime_owner_subjects subject
           ON subject.owner_subject_id = command.owner_subject_id
        WHERE subject.owner_user_id = $1) AS outcome_count,
       quota.active_allocations,
       quota.revision AS quota_revision
      FROM flow_automation_quota_authorities quota
      JOIN flow_runtime_owner_subjects subject
        ON subject.owner_subject_id = quota.owner_subject_id
     WHERE subject.owner_user_id = $1`,
    [ownerUserId]
  );
  const row = result.rows[0]!;
  return {
    activeControls: Number(row.active_controls),
    openEpochs: Number(row.open_epochs),
    epochCount: Number(row.epoch_count),
    commandCount: Number(row.command_count),
    outcomeCount: Number(row.outcome_count),
    activeAllocations: row.active_allocations,
    quotaRevision: row.quota_revision
  };
}

async function inTransaction<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = await runtime.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client as unknown as Client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function origin() {
  return { schemaVersion: "flow-definition-origin.v1", type: "blank" } as const;
}

function presentation() {
  return {
    schemaVersion: "flow-presentation.v1",
    nodes: [
      { nodeId: "manual", position: { x: 80, y: 120 } },
      { nodeId: "completed", position: { x: 400, y: 120 } }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function compileRequiredManifest(value: FlowGraphV2): typeof capabilityManifest {
  const compiled = compileFlowGraphV2(value);
  if (!compiled.capabilityManifest) throw new Error("Expected a publishable Flow graph");
  return compiled.capabilityManifest;
}

async function insertProduct(
  ownerUserId: string,
  productId: string,
  input: {
    readonly methods: readonly string[];
    readonly requiredClientData: readonly string[];
  }
): Promise<void> {
  await inTransaction(async (client) => {
    await client.query(
      `INSERT INTO products (
         id, owner_user_id, type, status, title, price_minor, currency,
         execution_mode, payment_model, duration_minutes, participant_mode
       ) VALUES ($1, $2, 'single', 'active', 'Natal fixture', 10000, 'RUB',
         'live', 'once', 60, 'solo')`,
      [productId, ownerUserId]
    );
    await client.query("UPDATE products SET revision = revision + 1 WHERE id = $1", [productId]);
    for (const [order, value] of input.methods.entries()) {
      await client.query(
        "INSERT INTO product_methods (product_id, value, \"order\") VALUES ($1, $2, $3)",
        [productId, value, order]
      );
    }
    for (const [order, value] of input.requiredClientData.entries()) {
      await client.query(
        "INSERT INTO product_required_client_data (product_id, value, \"order\") VALUES ($1, $2, $3)",
        [productId, value, order]
      );
    }
  });
}

function bookingNatalGraph(productId: string): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "booking",
        kind: "booking_confirmed",
        displayTitle: "Booking confirmed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [productId] }
      },
      {
        id: "natal-chart",
        kind: "natal_chart_request",
        displayTitle: "Calculate natal chart",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          interpretationMode: "adult_natal",
          settings: {
            zodiac: "tropical",
            houseSystem: "placidus",
            nodeType: "true",
            aspectPreset: "major",
            orbMultiplier: 1
          }
        }
      },
      {
        id: "completed",
        kind: "completed",
        displayTitle: "Completed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "natal_chart_calculated" }
      }
    ],
    edges: [
      {
        id: "booking-to-chart",
        sourceNodeId: "booking",
        targetNodeId: "natal-chart",
        sourceHandle: "next"
      },
      {
        id: "chart-to-completed",
        sourceNodeId: "natal-chart",
        targetNodeId: "completed",
        sourceHandle: "next"
      }
    ]
  });
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test Flow enrollment store");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function errorChain(value: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = value;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join("\n");
}

async function waitForOwnerSubjectLockWaiters(expected: number): Promise<void> {
  return waitForLockWaiters(expected, "flow_runtime_owner_subjects");
}

async function waitForLockWaiters(expected: number, queryFragment: string): Promise<void> {
  const deadline = Date.now() + 750;
  while (Date.now() < deadline) {
    const result = await runtime.pool.query<{ waiting: number }>(
      `
      SELECT count(*)::integer AS waiting
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'
         AND query LIKE $1
    `,
      [`%${queryFragment}%`]
    );
    if (result.rows[0]?.waiting === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expected} concurrent ${queryFragment} lock waiters`);
}
