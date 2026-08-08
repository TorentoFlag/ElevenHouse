import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphV2Schema, type FlowGraphV2 } from "@elevenhouse/contracts";
import {
  FlowBookingEnrollmentDeferredError,
  FlowBookingLifecycleIntegrityError,
  FlowBookingLifecycleRuntimeDeferredError,
  activateFlowVersionEnrollment,
  compileFlowGraphV2,
  completeFlowWorkItem,
  createBuiltInFlowNodeExecutorRegistry,
  createFlowRuntimeRequirementKeys,
  interpretFlowExecutionClaim,
  replaceFlowRuntimeRolloutPolicy,
  snoozeFlowWorkItem,
  startFlowWorkItem,
  type FlowBookingConfirmedEnrollmentRequestedPayloadV1,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerRegistration,
  type ManualBookingClaim
} from "@elevenhouse/domain";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowEnrollmentControl } from "../../../scripts/flow-enrollment-control-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzlePlatformTariffAuthorityStore } from "../platform-billing/drizzle-platform-tariff-authority-store";
import { createDrizzleAvailabilityStore } from "../scheduling/drizzle-availability-store";
import { createDrizzleBookingCommandStore } from "../scheduling/drizzle-booking-command-store";
import { createDrizzleFlowBookingEnrollmentStore } from "./drizzle-flow-booking-enrollment-store";
import { createDrizzleFlowManualClientEnrollmentStore } from "./drizzle-flow-manual-client-enrollment-store";
import { createDrizzleFlowBookingLifecycleStore } from "./drizzle-flow-booking-lifecycle-store";
import { createDrizzleFlowEnrollmentControlStore } from "./drizzle-flow-enrollment-control-store";
import { createDrizzleFlowExecutionStore } from "./drizzle-flow-execution-store";
import { createDrizzleFlowRuntimeControlCommandStore } from "./drizzle-flow-runtime-control-command-store";
import { createDrizzleFlowWorkItemStore } from "./drizzle-flow-work-item-store";
import { createDrizzleFlowWorkerReadinessStore } from "./drizzle-flow-worker-readiness-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const integrationBaselineSql = process.env.FLOW_INTEGRATION_BASELINE_PATH
  ? readFileSync(process.env.FLOW_INTEGRATION_BASELINE_PATH, "utf8")
  : readCurrentMigrationSql();
const databaseName = `elevenhouse_flow_booking_enrollment_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe.sequential("Flow booking enrollment Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
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

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("atomically enrolls a confirmed booking into one epoch-pinned run and first token", async () => {
    const fixture = await createFixture();
    const store = enrollmentStore(fixture);

    const first = await store.enrollBookingConfirmed({
      request: fixture.request,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    expect(first).toMatchObject({
      status: "enrolled",
      replayed: false,
      runs: [
        {
          flowId: fixture.flowId,
          flowVersionId: fixture.versionId,
          activationEpochId: fixture.activationEpochId
        }
      ]
    });

    const persisted = await runtime.pool.query<{
      event_id: string;
      event_kind: string;
      occurrence_key: string;
      payload_digest: string;
      ingestion_outcome: string;
      run_id: string;
      run_version_id: string;
      activation_epoch_id: string;
      trigger_node_id: string;
      enrollment_policy_key: string;
      execution_authority_basis: string;
      execution_authority_ref_id: string;
      run_snapshot: Record<string, unknown>;
      token_id: string;
      token_node_id: string;
      token_node_kind: string;
      token_executor_key: string;
      token_state: string;
      trace_sequence: string;
      trace_event_type: string;
      trace_summary: Record<string, unknown>;
    }>(
      `SELECT event.id AS event_id,
              event.event_kind,
              event.occurrence_key,
              event.payload_digest,
              event.ingestion_outcome,
              run.id AS run_id,
              run.flow_version_id AS run_version_id,
              run.activation_epoch_id,
              run.trigger_node_id,
              run.enrollment_policy_key,
              run.execution_authority_basis,
              run.execution_authority_ref_id,
              run.snapshot AS run_snapshot,
              token.id AS token_id,
              token.node_id AS token_node_id,
              token.node_kind AS token_node_kind,
              token.executor_key AS token_executor_key,
              token.state AS token_state,
              trace.sequence::text AS trace_sequence,
              trace.event_type AS trace_event_type,
              trace.summary AS trace_summary
         FROM flow_runtime_events event
         JOIN flow_runs run ON run.runtime_event_id = event.id
         JOIN flow_execution_tokens token ON token.flow_run_id = run.id
         JOIN flow_run_events trace ON trace.flow_run_id = run.id
        WHERE event.source = 'booking' AND event.source_event_id = $1`,
      [fixture.request.sourceEventId]
    );
    expect(persisted.rows).toEqual([
      expect.objectContaining({
        event_kind: "booking_confirmed",
        occurrence_key: fixture.bookingId,
        payload_digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        ingestion_outcome: "enrolled",
        run_version_id: fixture.versionId,
        activation_epoch_id: fixture.activationEpochId,
        trigger_node_id: "trigger-booking",
        enrollment_policy_key: "once_per_occurrence",
        execution_authority_basis: "current_entitlement",
        execution_authority_ref_id: fixture.subscriptionId,
        run_snapshot: expect.objectContaining({
          schemaVersion: "flow-run-snapshot.v2",
          subject: expect.objectContaining({ bookingId: fixture.bookingId })
        }),
        token_node_id: "done",
        token_node_kind: "completed",
        token_executor_key: "completed:1:1",
        token_state: "runnable",
        trace_sequence: "1",
        trace_event_type: "run_enrolled",
        trace_summary: expect.objectContaining({
          schemaVersion: "flow-enrollment-trace.v1",
          outcome: "enrolled",
          reasonCode: "FLOW_TRIGGER_MATCHED",
          resultCode: "FLOW_RUN_ENROLLED",
          activationEpochId: fixture.activationEpochId,
          triggerNodeId: "trigger-booking",
          targetNodeId: "done",
          targetNodeKind: "completed",
          occurrenceKey: fixture.bookingId
        })
      })
    ]);

    await expect(
      store.enrollBookingConfirmed({
        request: fixture.request,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toEqual({ ...first, replayed: true });
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 1,
      runs: 1,
      tokens: 1
    });
  });

  it("persists a manual client enrollment with server-side relationship provenance and exact replay", async () => {
    const fixture = await createFixture({ automationLimit: 2 });
    const graph = manualClientGraph();
    const compiled = compileFlowGraphV2(graph);
    const capabilityManifest = compiled.capabilityManifest ?? raise("Expected manual client manifest");
    const requirementKeys = createFlowRuntimeRequirementKeys(capabilityManifest);
    await replaceFlowRuntimeRolloutPolicy({
      store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      idempotencyKey: `enable-manual-client-flow-${randomUUID()}`,
      expectedRevision: 2,
      policy: canaryPolicy(fixture.ownerSubjectId, requirementKeys),
      reason: "Manual client enrollment integration"
    });
    await createDrizzleFlowWorkerReadinessStore(runtime.database).register(
      workerRegistration(fixture.ownerSubjectId, requirementKeys)
    );
    const { flowId, versionId } = await createPublishedFlow({
      ownerUserId: fixture.ownerUserId,
      graph,
      capabilityManifest
    });
    const activation = await activateFlowVersionEnrollment({
      store: createDrizzleFlowEnrollmentControlStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      flowId,
      idempotencyKey: `activate-manual-flow-${randomUUID()}`,
      request: {
        schemaVersion: "flow-activation-command.v1",
        versionId,
        expectedRevision: 1,
        expectedEnrollmentRevision: 0,
        expectedActiveVersionId: null
      }
    });
    if (activation.outcome.kind !== "succeeded") raise("Expected manual Flow activation");
    await runtime.pool.query(
      `INSERT INTO client_astrologer_relationships (
        client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
      ) VALUES ($1, $2, 'manual', 'active', clock_timestamp(), clock_timestamp())`,
      [fixture.clientUserId, fixture.ownerUserId]
    );
    const store = createDrizzleFlowManualClientEnrollmentStore(runtime.database);
    const input = {
      ownerUserId: fixture.ownerUserId,
      flowId,
      clientUserId: fixture.clientUserId,
      idempotencyKey: "manual-client-enrollment-integration"
    };

    const first = await store.enrollManualClient(input);
    expect(first).toMatchObject({
      status: "enrolled",
      replayed: false,
      runs: [
        {
          flowId,
          flowVersionId: versionId,
          activationEpochId: activation.outcome.response.body.activationEpoch.id
        }
      ]
    });
    const persisted = await runtime.pool.query<{
      event_kind: string;
      subject_type: string;
      subject_id: string;
      payload: Record<string, string>;
      ingestion_outcome: string;
      snapshot: { subject: Record<string, string> };
    }>(
      `SELECT event.event_kind, event.subject_type, event.subject_id, event.payload,
              event.ingestion_outcome, run.snapshot
         FROM flow_runtime_events event
         JOIN flow_runs run ON run.runtime_event_id = event.id
        WHERE event.id = $1`,
      [first.eventId]
    );
    expect(persisted.rows).toEqual([
      expect.objectContaining({
        event_kind: "manual_client",
        subject_type: "client",
        subject_id: fixture.clientUserId,
        ingestion_outcome: "enrolled",
        payload: expect.objectContaining({ clientUserId: fixture.clientUserId }),
        snapshot: expect.objectContaining({
          subject: expect.objectContaining({ type: "client", clientUserId: fixture.clientUserId })
        })
      })
    ]);
    await expect(store.enrollManualClient(input)).resolves.toEqual({ ...first, replayed: true });
    const otherClientUserId = await createUser();
    await runtime.pool.query(
      `INSERT INTO client_astrologer_relationships (
        client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
      ) VALUES ($1, $2, 'manual', 'active', clock_timestamp(), clock_timestamp())`,
      [otherClientUserId, fixture.ownerUserId]
    );
    await expect(
      store.enrollManualClient({ ...input, clientUserId: otherClientUserId })
    ).rejects.toMatchObject({ code: "FLOW_MANUAL_CLIENT_ENROLLMENT_IDEMPOTENCY_CONFLICT" });
  });

  it("applies a canonical confirmation once and replays its lifecycle receipt without mutation", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowBookingLifecycleStore(runtime.database, fixture.workerIdentity);
    const input = {
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    };

    const first = await store.processBookingLifecycleEvent(input);
    expect(first).toEqual({
      lifecycleEventId: fixture.lifecycleEventId,
      bookingId: fixture.bookingId,
      ownerUserId: fixture.ownerUserId,
      appliedRevision: 1,
      eventKind: "confirmed",
      outcome: "enrolled",
      replayed: false,
      affectedRunCount: 1,
      affectedWorkItemCount: 0,
      preservedCompletedWorkItemCount: 0
    });

    const beforeReplay = await lifecyclePersistence(fixture.lifecycleEventId);
    expect(beforeReplay).toEqual([
      expect.objectContaining({
        applied_revision: 1,
        head_state: "confirmed",
        last_lifecycle_event_id: fixture.lifecycleEventId,
        receipt_outcome: "enrolled",
        source_event_id: fixture.lifecycleEventId,
        lifecycle_event_id: fixture.lifecycleEventId,
        lifecycle_revision: 1
      })
    ]);

    await expect(store.processBookingLifecycleEvent(input)).resolves.toEqual({
      ...first,
      replayed: true
    });
    await expect(lifecyclePersistence(fixture.lifecycleEventId)).resolves.toEqual(beforeReplay);
  });

  it("rejects a confirmation receipt backed by another Booking runtime event", async () => {
    const fixture = await createFixture();
    const otherBooking = await createAdditionalFixtureBooking(fixture);
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: otherBooking.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const otherRuntime = await runtime.pool.query<{ id: string; ingestion_outcome: string }>(
      `SELECT id, ingestion_outcome
         FROM flow_runtime_events
        WHERE source_event_id = $1`,
      [otherBooking.lifecycleEventId]
    );
    const runtimeEvent = otherRuntime.rows[0] ?? raise("Expected other Booking runtime event");

    await expect(
      inTransaction(async (client) => {
        await client.query(
          `INSERT INTO flow_booking_lifecycle_receipts (
             lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
             canonical_digest, outcome, flow_runtime_event_id, affected_run_count,
             affected_work_item_count, preserved_completed_work_item_count, processed_at
           )
           SELECT event.id, event.booking_id, event.owner_user_id, event.revision,
                  event.event_kind, event.canonical_digest, $2, $3, 1, 0, 0, clock_timestamp()
             FROM booking_lifecycle_events event
            WHERE event.id = $1`,
          [fixture.lifecycleEventId, runtimeEvent.ingestion_outcome, runtimeEvent.id]
        );
        await client.query(
          `INSERT INTO flow_booking_lifecycle_heads (
             booking_id, owner_user_id, applied_revision, state, current_start_at,
             current_end_at, current_time_zone, last_lifecycle_event_id,
             last_canonical_digest, created_at, updated_at
           )
           SELECT event.booking_id, event.owner_user_id, event.revision, 'confirmed',
                  event.after_start_at, event.after_end_at, event.after_time_zone,
                  event.id, event.canonical_digest, clock_timestamp(), clock_timestamp()
             FROM booking_lifecycle_events event
            WHERE event.id = $1`,
          [fixture.lifecycleEventId]
        );
      })
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_booking_lifecycle_source_consistency"
    });
    await expect(
      runtime.pool.query<{ receipts: string; heads: string }>(
        `SELECT
           (SELECT count(*)::text FROM flow_booking_lifecycle_receipts
             WHERE lifecycle_event_id = $1) AS receipts,
           (SELECT count(*)::text FROM flow_booking_lifecycle_heads
             WHERE booking_id = $2) AS heads`,
        [fixture.lifecycleEventId, fixture.bookingId]
      )
    ).resolves.toMatchObject({ rows: [{ receipts: "0", heads: "0" }] });
  });

  it("rejects a confirmation receipt with a forged affected-run count", async () => {
    const fixture = await createFixture();
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    await expect(
      inTransaction(async (client) => {
        await client.query(
          "ALTER TABLE flow_booking_lifecycle_receipts DISABLE TRIGGER flow_booking_lifecycle_receipts_immutable"
        );
        await client.query(
          `WITH deleted AS (
             DELETE FROM flow_booking_lifecycle_receipts
              WHERE lifecycle_event_id = $1
              RETURNING *
           )
           INSERT INTO flow_booking_lifecycle_receipts (
             lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
             canonical_digest, outcome, flow_runtime_event_id, affected_run_count,
             affected_work_item_count, preserved_completed_work_item_count, processed_at
           )
           SELECT lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
                  canonical_digest, outcome, flow_runtime_event_id, 999,
                  affected_work_item_count, preserved_completed_work_item_count, processed_at
             FROM deleted`,
          [fixture.lifecycleEventId]
        );
      })
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_booking_lifecycle_source_consistency"
    });
  });

  it("rejects updates and deletes of accepted runtime event evidence", async () => {
    const fixture = await createFixture();
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    await expect(
      runtime.pool.query(
        `UPDATE flow_runtime_events
            SET payload = payload || '{"tampered":true}'::jsonb
          WHERE source_event_id = $1`,
        [fixture.lifecycleEventId]
      )
    ).rejects.toMatchObject({ code: "55000", constraint: "flow_runtime_events_immutable" });
    await expect(
      runtime.pool.query("DELETE FROM flow_runtime_events WHERE source_event_id = $1", [
        fixture.lifecycleEventId
      ])
    ).rejects.toMatchObject({ code: "55000", constraint: "flow_runtime_events_immutable" });
    await expect(runtimeCounts(fixture.lifecycleEventId)).resolves.toEqual({
      events: 1,
      runs: 1,
      tokens: 1
    });
  });

  it("serializes concurrent lifecycle delivery to one confirmation receipt and runtime", async () => {
    const fixture = await createFixture();
    const input = {
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    };
    const [left, right] = await Promise.all([
      createDrizzleFlowBookingLifecycleStore(
        runtime.database,
        fixture.workerIdentity
      ).processBookingLifecycleEvent(input),
      createDrizzleFlowBookingLifecycleStore(
        runtime.database,
        fixture.workerIdentity
      ).processBookingLifecycleEvent(input)
    ]);

    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    await expect(runtimeCounts(fixture.lifecycleEventId)).resolves.toEqual({
      events: 1,
      runs: 1,
      tokens: 1
    });
    await expect(
      runtime.pool.query<{ receipts: string; heads: string }>(
        `SELECT
           (SELECT count(*)::text FROM flow_booking_lifecycle_receipts
             WHERE lifecycle_event_id = $1) AS receipts,
           (SELECT count(*)::text FROM flow_booking_lifecycle_heads
             WHERE booking_id = $2) AS heads`,
        [fixture.lifecycleEventId, fixture.bookingId]
      )
    ).resolves.toMatchObject({ rows: [{ receipts: "1", heads: "1" }] });
  });

  it("applies delayed confirmation and cancellation as one chain without transient runtime", async () => {
    const fixture = await createFixture();
    const bookingStore = createDrizzleBookingCommandStore(runtime.database);
    const canceledAt = await databaseNow();
    const cancellation = await bookingStore.executeOwnerCancellation(
      {
        actorUserId: fixture.ownerUserId,
        scope: "bookings.owner.cancel",
        key: `cancel-flow-booking-${randomUUID()}`,
        requestHash: `sha256:${"b".repeat(64)}`,
        now: canceledAt,
        expiresAt: new Date(Date.parse(canceledAt) + 24 * 60 * 60 * 1_000).toISOString()
      },
      {
        bookingId: fixture.bookingId,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      }
    );
    if (cancellation.kind !== "created") raise("Expected Booking cancellation creation");

    const store = createDrizzleFlowBookingLifecycleStore(runtime.database, fixture.workerIdentity);
    await expect(
      store.processBookingLifecycleEvent({
        lifecycleEventId: cancellation.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toEqual({
      lifecycleEventId: cancellation.lifecycleEvent.id,
      bookingId: fixture.bookingId,
      ownerUserId: fixture.ownerUserId,
      appliedRevision: 2,
      eventKind: "cancelled",
      outcome: "canceled",
      replayed: false,
      affectedRunCount: 0,
      affectedWorkItemCount: 0,
      preservedCompletedWorkItemCount: 0
    });

    const persisted = await runtime.pool.query<{
      head_state: string;
      applied_revision: number;
      revision: number;
      event_kind: string;
      outcome: string;
      runtime_count: string;
      run_count: string;
      work_item_count: string;
    }>(
      `SELECT head.state AS head_state,
              head.applied_revision,
              receipt.revision,
              receipt.event_kind,
              receipt.outcome,
              (SELECT count(*)::text FROM flow_runtime_events
                WHERE subject_id = $1::text AND subject_type = 'booking') AS runtime_count,
              (SELECT count(*)::text FROM flow_runs run
                JOIN flow_runtime_events event ON event.id = run.runtime_event_id
               WHERE event.subject_id = $1::text AND event.subject_type = 'booking') AS run_count,
              (SELECT count(*)::text FROM flow_work_items item
                JOIN flow_runs run ON run.id = item.flow_run_id
                JOIN flow_runtime_events event ON event.id = run.runtime_event_id
               WHERE event.subject_id = $1::text AND event.subject_type = 'booking') AS work_item_count
         FROM flow_booking_lifecycle_heads head
         JOIN flow_booking_lifecycle_receipts receipt
           ON receipt.booking_id = head.booking_id
          AND receipt.owner_user_id = head.owner_user_id
        WHERE head.booking_id = $2
        ORDER BY receipt.revision`,
      [fixture.bookingId, fixture.bookingId]
    );
    expect(persisted.rows).toEqual([
      {
        head_state: "cancelled",
        applied_revision: 2,
        revision: 1,
        event_kind: "confirmed",
        outcome: "subject_ineligible",
        runtime_count: "1",
        run_count: "0",
        work_item_count: "0"
      },
      {
        head_state: "cancelled",
        applied_revision: 2,
        revision: 2,
        event_kind: "cancelled",
        outcome: "canceled",
        runtime_count: "1",
        run_count: "0",
        work_item_count: "0"
      }
    ]);
  });

  it("cancels an active Booking run and work item with lifecycle-event provenance", async () => {
    const fixture = await createFixture({ targetKind: "work_item" });
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claimResult = await executionStore.claimNext({
      leaseOwner: "flows-worker-booking-lifecycle-test",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"],
      ownerScope: { kind: "all" }
    });
    if (!claimResult || claimResult.status !== "claimed") raise("Expected work-item claim");
    const decision = await interpretFlowExecutionClaim({
      claim: claimResult.claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    expect(decision.kind).toBe("wait_work_item");
    await expect(
      executionStore.finalize({ claim: claimResult.claim, decision })
    ).resolves.toMatchObject({ status: "applied" });

    const canceledAt = await databaseNow();
    const cancellation = await createDrizzleBookingCommandStore(
      runtime.database
    ).executeOwnerCancellation(
      {
        actorUserId: fixture.ownerUserId,
        scope: "bookings.owner.cancel",
        key: `cancel-active-flow-booking-${randomUUID()}`,
        requestHash: `sha256:${"c".repeat(64)}`,
        now: canceledAt,
        expiresAt: new Date(Date.parse(canceledAt) + 24 * 60 * 60 * 1_000).toISOString()
      },
      {
        bookingId: fixture.bookingId,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      }
    );
    if (cancellation.kind !== "created") raise("Expected Booking cancellation creation");

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: cancellation.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toEqual({
      lifecycleEventId: cancellation.lifecycleEvent.id,
      bookingId: fixture.bookingId,
      ownerUserId: fixture.ownerUserId,
      appliedRevision: 2,
      eventKind: "cancelled",
      outcome: "canceled",
      replayed: false,
      affectedRunCount: 1,
      affectedWorkItemCount: 1,
      preservedCompletedWorkItemCount: 0
    });

    const persisted = await runtime.pool.query<{
      work_item_id: string;
      run_status: string;
      token_state: string;
      work_item_status: string;
      last_run_event_id: string;
      run_event_id: string;
      booking_lifecycle_event_id: string;
      command_id: string | null;
      reason_code: string;
    }>(
      `SELECT item.id AS work_item_id,
              run.status AS run_status,
              token.state AS token_state,
              item.status AS work_item_status,
              item.last_run_event_id,
              trace.id AS run_event_id,
              trace.booking_lifecycle_event_id,
              trace.command_id,
              trace.summary->>'reasonCode' AS reason_code
         FROM flow_runtime_events runtime_event
         JOIN flow_runs run ON run.runtime_event_id = runtime_event.id
         JOIN flow_execution_tokens token ON token.flow_run_id = run.id
         JOIN flow_work_items item ON item.flow_run_id = run.id
         JOIN flow_run_events trace
           ON trace.flow_run_id = run.id AND trace.event_type = 'run_canceled'
        WHERE runtime_event.subject_type = 'booking'
          AND runtime_event.subject_id = $1`,
      [fixture.bookingId]
    );
    const canceledWorkItemId = persisted.rows[0]?.work_item_id ?? raise("Expected canceled item");
    expect(persisted.rows).toEqual([
      {
        work_item_id: canceledWorkItemId,
        run_status: "canceled",
        token_state: "canceled",
        work_item_status: "canceled",
        last_run_event_id: persisted.rows[0]?.run_event_id,
        run_event_id: persisted.rows[0]?.run_event_id,
        booking_lifecycle_event_id: cancellation.lifecycleEvent.id,
        command_id: null,
        reason_code: "FLOW_BOOKING_CANCELED"
      }
    ]);
    await expect(
      completeFlowWorkItem({
        store: createDrizzleFlowWorkItemStore(runtime.database),
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: canceledWorkItemId,
        idempotencyKey: `complete-after-booking-cancel-${randomUUID()}`,
        request: {
          expectedRevision: 2,
          expectedBookingLifecycleRevision: 2,
          resultSummary: "Too late"
        }
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: { code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED", status: "canceled" }
        }
      }
    });
  });

  it("rejects a cancellation receipt with forged runtime mutation counters", async () => {
    const fixture = await createFixture();
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const cancellation = await cancelFixtureBooking(fixture, "e");
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: cancellation.lifecycleEvent.id,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    await expect(
      inTransaction(async (client) => {
        await client.query(
          "ALTER TABLE flow_booking_lifecycle_receipts DISABLE TRIGGER flow_booking_lifecycle_receipts_immutable"
        );
        await client.query(
          `WITH deleted AS (
             DELETE FROM flow_booking_lifecycle_receipts
              WHERE lifecycle_event_id = $1
              RETURNING *
           )
           INSERT INTO flow_booking_lifecycle_receipts (
             lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
             canonical_digest, outcome, flow_runtime_event_id, affected_run_count,
             affected_work_item_count, preserved_completed_work_item_count, processed_at
           )
           SELECT lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
                  canonical_digest, outcome, flow_runtime_event_id, 999, 999, 999, processed_at
             FROM deleted`,
          [cancellation.lifecycleEvent.id]
        );
      })
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_booking_lifecycle_source_consistency"
    });

    await expect(
      runtime.pool.query<{
        affected_run_count: number;
        affected_work_item_count: number;
        preserved_completed_work_item_count: number;
      }>(
        `SELECT affected_run_count, affected_work_item_count,
                preserved_completed_work_item_count
           FROM flow_booking_lifecycle_receipts
          WHERE lifecycle_event_id = $1`,
        [cancellation.lifecycleEvent.id]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          affected_run_count: 1,
          affected_work_item_count: 0,
          preserved_completed_work_item_count: 0
        }
      ]
    });
  });

  it("cancels a claimed Booking token with one Booking-provenance attempt", async () => {
    const fixture = await createFixture({ targetKind: "work_item" });
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claimResult = await executionStore.claimNext({
      leaseOwner: "flows-worker-booking-claimed-cancel-test",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"],
      ownerScope: { kind: "all" }
    });
    if (!claimResult || claimResult.status !== "claimed") raise("Expected claimed token");

    const canceledAt = await databaseNow();
    const cancellation = await createDrizzleBookingCommandStore(
      runtime.database
    ).executeOwnerCancellation(
      {
        actorUserId: fixture.ownerUserId,
        scope: "bookings.owner.cancel",
        key: `cancel-claimed-flow-booking-${randomUUID()}`,
        requestHash: `sha256:${"1".repeat(64)}`,
        now: canceledAt,
        expiresAt: new Date(Date.parse(canceledAt) + 24 * 60 * 60 * 1_000).toISOString()
      },
      {
        bookingId: fixture.bookingId,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      }
    );
    if (cancellation.kind !== "created") raise("Expected Booking cancellation creation");

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: cancellation.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({ outcome: "canceled", affectedRunCount: 1 });

    const persisted = await runtime.pool.query<{
      run_status: string;
      token_state: string;
      attempt_outcome: string;
      attempt_reason_code: string;
      run_event_attempt_id: string;
      attempt_id: string;
      booking_lifecycle_event_id: string;
    }>(
      `SELECT run.status AS run_status,
              token.state AS token_state,
              attempt.outcome AS attempt_outcome,
              attempt.trace_summary->>'reasonCode' AS attempt_reason_code,
              trace.attempt_id AS run_event_attempt_id,
              attempt.id AS attempt_id,
              trace.booking_lifecycle_event_id
         FROM flow_runs run
         JOIN flow_execution_tokens token ON token.flow_run_id = run.id
         JOIN flow_execution_attempts attempt ON attempt.token_id = token.id
         JOIN flow_run_events trace
           ON trace.flow_run_id = run.id AND trace.event_type = 'run_canceled'
        WHERE run.id = $1`,
      [claimResult.claim.runId]
    );
    const attemptId = persisted.rows[0]?.attempt_id ?? raise("Expected canceled attempt");
    expect(persisted.rows).toEqual([
      {
        run_status: "canceled",
        token_state: "canceled",
        attempt_outcome: "canceled",
        attempt_reason_code: "FLOW_BOOKING_CANCELED",
        run_event_attempt_id: attemptId,
        attempt_id: attemptId,
        booking_lifecycle_event_id: cancellation.lifecycleEvent.id
      }
    ]);
  });

  it("cancels a runnable Booking run that has no human work item", async () => {
    const fixture = await createFixture();
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const cancellation = await cancelFixtureBooking(fixture, "2");

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: cancellation.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({
      outcome: "canceled",
      affectedRunCount: 1,
      affectedWorkItemCount: 0
    });
  });

  it("fails closed when a nonterminal Booking run has no execution token", async () => {
    const fixture = await createFixture();
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    await runtime.pool.query(
      `DELETE FROM flow_execution_tokens
        WHERE flow_run_id IN (
          SELECT run.id
            FROM flow_runs run
            JOIN flow_runtime_events event ON event.id = run.runtime_event_id
           WHERE event.source_event_id = $1
        )`,
      [fixture.lifecycleEventId]
    );
    const cancellation = await cancelFixtureBooking(fixture, "3");

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: cancellation.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).rejects.toMatchObject({
      code: "FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID"
    } satisfies Partial<FlowBookingLifecycleIntegrityError>);
    await expect(
      runtime.pool.query<{ applied_revision: number; cancellation_receipts: string }>(
        `SELECT head.applied_revision,
                (SELECT count(*)::text
                   FROM flow_booking_lifecycle_receipts receipt
                  WHERE receipt.lifecycle_event_id = $1) AS cancellation_receipts
           FROM flow_booking_lifecycle_heads head
          WHERE head.booking_id = $2`,
        [cancellation.lifecycleEvent.id, fixture.bookingId]
      )
    ).resolves.toMatchObject({
      rows: [{ applied_revision: 1, cancellation_receipts: "0" }]
    });
  });

  it("preserves a completed work item while canceling its still-active Booking run", async () => {
    const fixture = await createFixture({ targetKind: "work_item" });
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claimResult = await executionStore.claimNext({
      leaseOwner: "flows-worker-booking-completed-item-test",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"],
      ownerScope: { kind: "all" }
    });
    if (!claimResult || claimResult.status !== "claimed") raise("Expected work-item claim");
    const decision = await interpretFlowExecutionClaim({
      claim: claimResult.claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await executionStore.finalize({ claim: claimResult.claim, decision });
    const workItem = await runtime.pool.query<{ id: string }>(
      "SELECT id FROM flow_work_items WHERE flow_run_id = $1",
      [claimResult.claim.runId]
    );
    const workItemId = workItem.rows[0]?.id ?? raise("Expected persisted work item");
    const workItemStore = createDrizzleFlowWorkItemStore(runtime.database);
    await expect(
      startFlowWorkItem({
        store: workItemStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId,
        idempotencyKey: `start-completed-item-${randomUUID()}`,
        request: { expectedRevision: 1, expectedBookingLifecycleRevision: 1 }
      })
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
    await expect(
      completeFlowWorkItem({
        store: workItemStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId,
        idempotencyKey: `complete-item-before-cancel-${randomUUID()}`,
        request: {
          expectedRevision: 2,
          expectedBookingLifecycleRevision: 1,
          resultSummary: "Consultation preparation completed"
        }
      })
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
    const beforeCancellation = await completedWorkItemPersistence(workItemId);

    const canceledAt = await databaseNow();
    const cancellation = await createDrizzleBookingCommandStore(
      runtime.database
    ).executeOwnerCancellation(
      {
        actorUserId: fixture.ownerUserId,
        scope: "bookings.owner.cancel",
        key: `cancel-after-work-item-${randomUUID()}`,
        requestHash: `sha256:${"d".repeat(64)}`,
        now: canceledAt,
        expiresAt: new Date(Date.parse(canceledAt) + 24 * 60 * 60 * 1_000).toISOString()
      },
      {
        bookingId: fixture.bookingId,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      }
    );
    if (cancellation.kind !== "created") raise("Expected Booking cancellation creation");

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: cancellation.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({
      outcome: "canceled",
      affectedRunCount: 1,
      affectedWorkItemCount: 0,
      preservedCompletedWorkItemCount: 1
    });
    await expect(completedWorkItemPersistence(workItemId)).resolves.toEqual(beforeCancellation);
    await expect(
      runtime.pool.query<{ run_status: string; token_state: string }>(
        `SELECT run.status AS run_status, token.state AS token_state
           FROM flow_runs run
           JOIN flow_execution_tokens token ON token.flow_run_id = run.id
          WHERE run.id = $1`,
        [claimResult.claim.runId]
      )
    ).resolves.toMatchObject({ rows: [{ run_status: "canceled", token_state: "canceled" }] });
  });

  it("rejects cancellation provenance from another Booking owned by the same astrologer", async () => {
    const fixture = await createFixture();
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    const otherStartAt = new Date(Date.parse(fixture.endAt) + 60 * 60 * 1_000).toISOString();
    const otherEndAt = new Date(Date.parse(otherStartAt) + 60 * 60 * 1_000).toISOString();
    const bookingStore = createDrizzleBookingCommandStore(runtime.database);
    const createdAt = await databaseNow();
    const otherBooking = await bookingStore.executeManualBooking(
      {
        actorUserId: fixture.ownerUserId,
        scope: "bookings.manual.create",
        key: `other-flow-booking-${randomUUID()}`,
        requestHash: `sha256:${"e".repeat(64)}`,
        now: createdAt,
        expiresAt: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1_000).toISOString()
      },
      async (): Promise<ManualBookingClaim> => ({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        productId: fixture.productId,
        scheduleId: fixture.scheduleId,
        serviceStartAt: otherStartAt,
        serviceEndAt: otherEndAt,
        occupiedStartAt: otherStartAt,
        occupiedEndAt: otherEndAt,
        productSnapshot: {
          title: "Consultation",
          durationMinutes: 60,
          deliveryFormat: "video",
          priceMinor: 10_000,
          currency: "RUB",
          clientDataRequirements: bookingClientDataRequirements()
        },
        scheduleSnapshot: {
          timeZone: "Europe/Moscow",
          policy: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 }
        }
      })
    );
    const canceledAt = await databaseNow();
    const otherCancellation = await bookingStore.executeOwnerCancellation(
      {
        actorUserId: fixture.ownerUserId,
        scope: "bookings.owner.cancel",
        key: `cancel-other-flow-booking-${randomUUID()}`,
        requestHash: `sha256:${"f".repeat(64)}`,
        now: canceledAt,
        expiresAt: new Date(Date.parse(canceledAt) + 24 * 60 * 60 * 1_000).toISOString()
      },
      {
        bookingId: otherBooking.booking.id,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      }
    );
    if (otherCancellation.kind !== "created") raise("Expected other Booking cancellation");
    const run = await runtime.pool.query<{
      id: string;
      trace_sequence: string;
      node_id: string;
      node_kind: string;
    }>(
      `SELECT run.id,
              run.trace_sequence::text,
              token.node_id,
              token.node_kind
         FROM flow_runs run
         JOIN flow_runtime_events event ON event.id = run.runtime_event_id
         JOIN flow_execution_tokens token ON token.flow_run_id = run.id
        WHERE event.source_event_id = $1`,
      [fixture.lifecycleEventId]
    );
    const targetRun = run.rows[0] ?? raise("Expected first Booking Flow run");

    await expect(
      runtime.pool.query(
        `INSERT INTO flow_run_events (
           owner_user_id, flow_run_id, sequence, event_type, node_id,
           attempt_id, command_id, booking_lifecycle_event_id, summary, occurred_at
         ) VALUES ($1, $2, $3, 'run_canceled', $4, NULL, NULL, $5, $6, $7)`,
        [
          fixture.ownerUserId,
          targetRun.id,
          Number(targetRun.trace_sequence) + 1,
          targetRun.node_id,
          otherCancellation.lifecycleEvent.id,
          {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "canceled",
            nodeKind: targetRun.node_kind,
            reasonCode: "FLOW_BOOKING_CANCELED",
            resultCode: "FLOW_RUN_CANCELED"
          },
          canceledAt
        ]
      )
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_run_event_command_consistency"
    });
  });

  it("pins delayed enrollment to the version active when the booking was confirmed", async () => {
    const fixture = await createFixture();
    const switched = await publishAndActivateSecondVersion(fixture);
    const store = enrollmentStore(fixture);

    const result = await store.enrollBookingConfirmed({
      request: fixture.request,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    expect(result).toMatchObject({
      status: "enrolled",
      replayed: false,
      runs: [
        {
          flowId: fixture.flowId,
          flowVersionId: fixture.versionId,
          activationEpochId: fixture.activationEpochId
        }
      ]
    });
    const persisted = await runtime.pool.query<{
      run_version_id: string;
      activation_epoch_id: string;
      token_node_id: string;
      active_version_id: string;
      active_activation_epoch_id: string;
    }>(
      `SELECT run.flow_version_id AS run_version_id,
              run.activation_epoch_id,
              token.node_id AS token_node_id,
              control.active_version_id,
              control.active_activation_epoch_id
         FROM flow_runtime_events event
         JOIN flow_runs run ON run.runtime_event_id = event.id
         JOIN flow_execution_tokens token ON token.flow_run_id = run.id
         JOIN flow_enrollment_controls control ON control.flow_id = run.flow_id
        WHERE event.source_event_id = $1`,
      [fixture.request.sourceEventId]
    );
    expect(persisted.rows).toEqual([
      {
        run_version_id: fixture.versionId,
        activation_epoch_id: fixture.activationEpochId,
        token_node_id: "done",
        active_version_id: switched.versionId,
        active_activation_epoch_id: switched.activationEpochId
      }
    ]);
  });

  it("rejects a conflicting replay without creating secondary runtime state", async () => {
    const fixture = await createFixture();
    const store = enrollmentStore(fixture);
    await store.enrollBookingConfirmed({
      request: fixture.request,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    const conflictingRequest = {
      ...fixture.request,
      occurredAt: new Date(Date.parse(fixture.request.occurredAt) + 1_000).toISOString()
    };
    await expect(
      store.enrollBookingConfirmed({
        request: conflictingRequest,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).rejects.toMatchObject({
      code: "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_CONFLICT"
    });
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 1,
      runs: 1,
      tokens: 1
    });
  });

  it("persists a no-match outcome when the booking product is outside the trigger filter", async () => {
    const fixture = await createFixture({ flowMatchesBooking: false });
    const store = enrollmentStore(fixture);

    const result = await store.enrollBookingConfirmed({
      request: fixture.request,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    expect(result).toMatchObject({ status: "no_match", replayed: false, runs: [] });
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 1,
      runs: 0,
      tokens: 0
    });
    await expect(runtimeOutcome(fixture.request.sourceEventId)).resolves.toEqual("no_match");
  });

  it("persists a late-unmatched outcome without evaluating historical activations", async () => {
    const fixture = await createFixture({
      occurredAtOffsetMs: -8 * 24 * 60 * 60 * 1_000
    });
    const store = enrollmentStore(fixture);

    const result = await store.enrollBookingConfirmed({
      request: fixture.request,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    expect(result).toMatchObject({ status: "late_unmatched", replayed: false, runs: [] });
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 1,
      runs: 0,
      tokens: 0
    });
    await expect(runtimeOutcome(fixture.request.sourceEventId)).resolves.toEqual(
      "late_unmatched"
    );
  });

  it("converges concurrent duplicate delivery to one event, run, and token", async () => {
    const fixture = await createFixture();
    const store = enrollmentStore(fixture);
    const input = {
      request: fixture.request,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    };

    const results = await Promise.all([
      store.enrollBookingConfirmed(input),
      store.enrollBookingConfirmed(input)
    ]);

    expect(results.every((result) => result.status === "enrolled")).toBe(true);
    expect(results.filter((result) => result.replayed).length).toBe(1);
    expect(new Set(results.map((result) => result.eventId)).size).toBe(1);
    expect(new Set(results.flatMap((result) => result.runs.map((run) => run.runId))).size).toBe(1);
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 1,
      runs: 1,
      tokens: 1
    });
  });

  it("projects an accepted reschedule onto a pending work item without rewriting enrollment history", async () => {
    const fixture = await createFixture({ targetKind: "work_item" });
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const active = await createPendingFixtureWorkItem();
    const before = await bookingReschedulePersistence(fixture.bookingId, active.workItemId);
    const nextStartAt = new Date(Date.parse(fixture.startAt) + 48 * 60 * 60 * 1_000).toISOString();
    const reschedule = await rescheduleFixtureBooking(fixture, 1, nextStartAt);

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: reschedule.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({
      lifecycleEventId: reschedule.lifecycleEvent.id,
      appliedRevision: 2,
      eventKind: "rescheduled",
      outcome: "rescheduled",
      replayed: false,
      affectedRunCount: 1,
      affectedWorkItemCount: 1
    });

    const expectedDueAt = new Date(Date.parse(nextStartAt) - 24 * 60 * 60 * 1_000).toISOString();
    const projected = await bookingReschedulePersistence(fixture.bookingId, active.workItemId);
    expect(projected).toMatchObject([
      {
        head_revision: 2,
        head_start_at: new Date(nextStartAt),
        work_item_id: active.workItemId,
        work_item_status: "pending",
        work_item_revision: 2,
        due_policy_kind: "before_booking_start",
        due_lead_time_minutes: 1_440,
        due_booking_lifecycle_revision: 2,
        due_at: new Date(expectedDueAt),
        event_type: "booking_rescheduled",
        booking_lifecycle_event_id: reschedule.lifecycleEvent.id,
        snooze_adjustment: "unchanged"
      }
    ]);
    expect(projected[0]?.run_snapshot).toEqual(before[0]?.run_snapshot);

    const beforeReplay = await bookingReschedulePersistence(
      fixture.bookingId,
      active.workItemId
    );
    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: reschedule.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({ replayed: true, affectedRunCount: 1, affectedWorkItemCount: 1 });
    await expect(
      bookingReschedulePersistence(fixture.bookingId, active.workItemId)
    ).resolves.toEqual(beforeReplay);
  });

  it("shortens a snooze that would hide preparation past the rescheduled deadline", async () => {
    const fixture = await createFixture({ targetKind: "work_item" });
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const active = await createPendingFixtureWorkItem();
    const snoozedUntil = new Date(
      Date.parse(fixture.startAt) + 36 * 60 * 60 * 1_000
    ).toISOString();
    await expect(
      snoozeFlowWorkItem({
        store: createDrizzleFlowWorkItemStore(runtime.database),
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: active.workItemId,
        idempotencyKey: `snooze-before-booking-reschedule-${randomUUID()}`,
        request: { expectedRevision: 1, expectedBookingLifecycleRevision: 1, snoozedUntil }
      })
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
    const nextStartAt = new Date(Date.parse(fixture.startAt) + 48 * 60 * 60 * 1_000).toISOString();
    const expectedDueAt = new Date(Date.parse(nextStartAt) - 24 * 60 * 60 * 1_000).toISOString();
    const reschedule = await rescheduleFixtureBooking(fixture, 1, nextStartAt);

    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: reschedule.lifecycleEvent.id,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    await expect(
      bookingReschedulePersistence(fixture.bookingId, active.workItemId)
    ).resolves.toMatchObject([
      {
        work_item_status: "snoozed",
        work_item_revision: 3,
        due_at: new Date(expectedDueAt),
        available_at: new Date(expectedDueAt),
        snoozed_until: new Date(expectedDueAt),
        snooze_adjustment: "shortened"
      }
    ]);
  });

  it("defers accepted reschedule projection while a linked token is claimed and then resumes", async () => {
    const fixture = await createFixture({ targetKind: "work_item" });
    const lifecycleStore = createDrizzleFlowBookingLifecycleStore(
      runtime.database,
      fixture.workerIdentity
    );
    await lifecycleStore.processBookingLifecycleEvent({
      lifecycleEventId: fixture.lifecycleEventId,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claimResult = await executionStore.claimNext({
      leaseOwner: "flows-worker-booking-reschedule-claimed-test",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"],
      ownerScope: { kind: "all" }
    });
    if (!claimResult || claimResult.status !== "claimed") raise("Expected claimed token");
    const nextStartAt = new Date(Date.parse(fixture.startAt) + 48 * 60 * 60 * 1_000).toISOString();
    const reschedule = await rescheduleFixtureBooking(fixture, 1, nextStartAt);

    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: reschedule.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).rejects.toBeInstanceOf(FlowBookingLifecycleRuntimeDeferredError);
    await expect(
      runtime.pool.query<{ applied_revision: number; receipts: string; events: string }>(
        `SELECT head.applied_revision,
                (SELECT count(*)::text FROM flow_booking_lifecycle_receipts receipt
                  WHERE receipt.lifecycle_event_id = $2) AS receipts,
                (SELECT count(*)::text FROM flow_run_events event
                  WHERE event.booking_lifecycle_event_id = $2) AS events
           FROM flow_booking_lifecycle_heads head
          WHERE head.booking_id = $1`,
        [fixture.bookingId, reschedule.lifecycleEvent.id]
      )
    ).resolves.toMatchObject({
      rows: [{ applied_revision: 1, receipts: "0", events: "0" }]
    });

    const decision = await interpretFlowExecutionClaim({
      claim: claimResult.claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await executionStore.finalize({ claim: claimResult.claim, decision });
    await expect(
      lifecycleStore.processBookingLifecycleEvent({
        lifecycleEventId: reschedule.lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({ outcome: "rescheduled", affectedWorkItemCount: 1 });
  });

  it("defers without persistence while enrollment is killed and resumes after release", async () => {
    const fixture = await createFixture();
    const readinessStore = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const store = enrollmentStore(fixture);
    await replaceFlowRuntimeRolloutPolicy({
      store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      idempotencyKey: `kill-enrollment-${randomUUID()}`,
      expectedRevision: 2,
      policy: canaryPolicy(fixture.ownerSubjectId, fixture.requirementKeys, true),
      reason: "Enrollment kill-switch integration"
    });
    await readinessStore.heartbeat(fixture.workerIdentity);

    await expect(
      store.enrollBookingConfirmed({
        request: fixture.request,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).rejects.toBeInstanceOf(FlowBookingEnrollmentDeferredError);
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 0,
      runs: 0,
      tokens: 0
    });

    await replaceFlowRuntimeRolloutPolicy({
      store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      idempotencyKey: `release-enrollment-${randomUUID()}`,
      expectedRevision: 3,
      policy: canaryPolicy(fixture.ownerSubjectId, fixture.requirementKeys),
      reason: "Enrollment kill-switch release integration"
    });
    await readinessStore.heartbeat(fixture.workerIdentity);

    await expect(
      store.enrollBookingConfirmed({
        request: fixture.request,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({ status: "enrolled", replayed: false });
    await expect(runtimeCounts(fixture.request.sourceEventId)).resolves.toEqual({
      events: 1,
      runs: 1,
      tokens: 1
    });
  });
});

function enrollmentStore(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return createDrizzleFlowBookingEnrollmentStore(runtime.database, fixture.workerIdentity);
}

async function createPendingFixtureWorkItem(): Promise<{
  readonly workItemId: string;
  readonly runId: string;
}> {
  const executionStore = createDrizzleFlowExecutionStore(runtime.database);
  const claimResult = await executionStore.claimNext({
    leaseOwner: `flows-worker-work-item-${randomUUID()}`,
    leaseDurationMs: 30_000,
    executorKeys: ["astrologer_work_item:1:1"],
    ownerScope: { kind: "all" }
  });
  if (!claimResult || claimResult.status !== "claimed") raise("Expected work-item claim");
  const decision = await interpretFlowExecutionClaim({
    claim: claimResult.claim,
    registry: createBuiltInFlowNodeExecutorRegistry()
  });
  const finalized = await executionStore.finalize({ claim: claimResult.claim, decision });
  if (finalized.status !== "applied") raise("Expected work-item finalization");
  const workItem = await runtime.pool.query<{ id: string }>(
    "SELECT id FROM flow_work_items WHERE flow_run_id = $1",
    [claimResult.claim.runId]
  );
  return {
    workItemId: workItem.rows[0]?.id ?? raise("Expected persisted work item"),
    runId: claimResult.claim.runId
  };
}

async function rescheduleFixtureBooking(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  expectedLifecycleRevision: number,
  projectedStartAt: string
) {
  const now = await databaseNow();
  const projectedEndAt = new Date(Date.parse(projectedStartAt) + 60 * 60 * 1_000).toISOString();
  return createDrizzleBookingCommandStore(runtime.database).executeOwnerReschedule(
    {
      actorUserId: fixture.ownerUserId,
      scope: "bookings.owner.reschedule",
      key: `reschedule-flow-booking-${randomUUID()}`,
      requestHash: `sha256:${"b".repeat(64)}`,
      now,
      expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1_000).toISOString()
    },
    {
      bookingId: fixture.bookingId,
      expectedLifecycleRevision,
      projectedStartAt
    },
    async (context) => ({
      ownerUserId: fixture.ownerUserId,
      bookingId: fixture.bookingId,
      reservationId: context.booking.reservationId,
      scheduleId: context.scheduleId,
      expectedLifecycleRevision,
      serviceStartAt: projectedStartAt,
      serviceEndAt: projectedEndAt,
      occupiedStartAt: projectedStartAt,
      occupiedEndAt: projectedEndAt,
      scheduleSnapshot: {
        timeZone: context.booking.timeZone,
        policy: context.booking.policySnapshot
      }
    })
  );
}

async function bookingReschedulePersistence(bookingId: string, workItemId: string) {
  const result = await runtime.pool.query<{
    head_revision: number;
    head_start_at: Date;
    run_snapshot: Record<string, unknown>;
    work_item_id: string;
    work_item_status: string;
    work_item_revision: number;
    due_policy_kind: string;
    due_lead_time_minutes: number;
    due_booking_lifecycle_revision: number;
    due_at: Date;
    available_at: Date;
    snoozed_until: Date | null;
    event_type: string | null;
    booking_lifecycle_event_id: string | null;
    snooze_adjustment: string | null;
  }>(
    `SELECT head.applied_revision AS head_revision,
            head.current_start_at AS head_start_at,
            run.snapshot AS run_snapshot,
            item.id AS work_item_id,
            item.status AS work_item_status,
            item.revision AS work_item_revision,
            item.due_policy_kind,
            item.due_lead_time_minutes,
            item.due_booking_lifecycle_revision,
            item.due_at,
            item.available_at,
            item.snoozed_until,
            trace.event_type,
            trace.booking_lifecycle_event_id,
            trace.summary->>'snoozeAdjustment' AS snooze_adjustment
       FROM flow_booking_lifecycle_heads head
       JOIN flow_runtime_events runtime_event
         ON runtime_event.subject_id = head.booking_id::text
        AND runtime_event.owner_user_id = head.owner_user_id
        AND runtime_event.source = 'booking'
       JOIN flow_runs run ON run.runtime_event_id = runtime_event.id
       JOIN flow_work_items item ON item.flow_run_id = run.id AND item.id = $2
       LEFT JOIN LATERAL (
         SELECT event_type, booking_lifecycle_event_id, summary
           FROM flow_run_events event
          WHERE event.flow_run_id = run.id
            AND event.event_type = 'booking_rescheduled'
          ORDER BY event.sequence DESC
          LIMIT 1
       ) trace ON true
      WHERE head.booking_id = $1`,
    [bookingId, workItemId]
  );
  return result.rows;
}

async function cancelFixtureBooking(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  requestHashCharacter: string
) {
  const canceledAt = await databaseNow();
  const cancellation = await createDrizzleBookingCommandStore(
    runtime.database
  ).executeOwnerCancellation(
    {
      actorUserId: fixture.ownerUserId,
      scope: "bookings.owner.cancel",
      key: `cancel-flow-booking-fixture-${randomUUID()}`,
      requestHash: `sha256:${requestHashCharacter.repeat(64)}`,
      now: canceledAt,
      expiresAt: new Date(Date.parse(canceledAt) + 24 * 60 * 60 * 1_000).toISOString()
    },
    {
      bookingId: fixture.bookingId,
      expectedLifecycleRevision: 1,
      reasonCode: "astrologer_unavailable"
    }
  );
  if (cancellation.kind !== "created") raise("Expected Booking cancellation creation");
  return cancellation;
}

async function createFixture(
  options: {
    readonly flowMatchesBooking?: boolean;
    readonly occurredAtOffsetMs?: number;
    readonly targetKind?: "completed" | "work_item";
    readonly automationLimit?: number;
  } = {}
) {
  const ownerUserId = await createUser();
  const clientUserId = await createUser();
  const productId = await createProduct(ownerUserId);
  const triggerProductId =
    options.flowMatchesBooking === false ? await createProduct(ownerUserId) : productId;
  const owner = await runtime.pool.query<{ owner_subject_id: string }>(
    "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
    [ownerUserId]
  );
  const ownerSubjectId = owner.rows[0]?.owner_subject_id ?? raise("Expected owner subject");
  const graph =
    options.targetKind === "work_item"
      ? bookingWorkItemGraph(triggerProductId)
      : bookingGraph(triggerProductId);
  const compiled = compileFlowGraphV2(graph);
  const capabilityManifest = compiled.capabilityManifest ?? raise("Expected manifest");
  const requirementKeys = createFlowRuntimeRequirementKeys(capabilityManifest);

  await replaceFlowRuntimeRolloutPolicy({
    store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
    actorUserId: ownerUserId,
    idempotencyKey: `enable-flow-${randomUUID()}`,
    expectedRevision: 1,
    policy: canaryPolicy(ownerSubjectId, requirementKeys),
    reason: "Booking enrollment integration"
  });
  const registration = workerRegistration(ownerSubjectId, requirementKeys);
  await createDrizzleFlowWorkerReadinessStore(runtime.database).register(registration);
  const subscriptionId = await createActiveTariff(ownerUserId, options.automationLimit ?? 1);
  const { flowId, versionId } = await createPublishedFlow({
    ownerUserId,
    graph,
    capabilityManifest
  });
  const activation = await activateFlowVersionEnrollment({
    store: createDrizzleFlowEnrollmentControlStore(runtime.database),
    actorUserId: ownerUserId,
    ownerUserId,
    flowId,
    idempotencyKey: `activate-flow-${randomUUID()}`,
    request: {
      schemaVersion: "flow-activation-command.v1",
      versionId,
      expectedRevision: 1,
      expectedEnrollmentRevision: 0,
      expectedActiveVersionId: null
    }
  });
  if (activation.outcome.kind !== "succeeded") raise("Expected activation");

  const schedule = await createDrizzleAvailabilityStore(runtime.database).putDefault({
    ownerUserId,
    expectedVersion: null,
    timeZone: "Europe/Moscow",
    startIntervalMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minimumNoticeMinutes: 0,
    bookingHorizonDays: 60,
    maximumBookingsPerDay: null,
    weeklyPeriods: [],
    dateOverrides: [],
    productIds: [productId],
    now: await databaseNow()
  });
  if (schedule.kind !== "created") raise("Expected schedule");
  const databaseInstant = await databaseNow();
  const occurredAt = new Date(
    Date.parse(databaseInstant) + (options.occurredAtOffsetMs ?? 0)
  ).toISOString();
  const startAt = new Date(Date.parse(occurredAt) + 24 * 60 * 60 * 1_000).toISOString();
  const endAt = new Date(Date.parse(startAt) + 60 * 60 * 1_000).toISOString();
  const booking = await createDrizzleBookingCommandStore(runtime.database).executeManualBooking(
    {
      actorUserId: ownerUserId,
      scope: "bookings.manual.create",
      key: `flow-booking-${randomUUID()}`,
      requestHash: `sha256:${"a".repeat(64)}`,
      now: occurredAt,
      expiresAt: new Date(Date.parse(occurredAt) + 24 * 60 * 60 * 1_000).toISOString()
    },
    async (): Promise<ManualBookingClaim> => ({
      ownerUserId,
      clientUserId,
      productId,
      scheduleId: schedule.schedule.id,
      serviceStartAt: startAt,
      serviceEndAt: endAt,
      occupiedStartAt: startAt,
      occupiedEndAt: endAt,
      productSnapshot: {
        title: "Consultation",
        durationMinutes: 60,
        deliveryFormat: "video",
        priceMinor: 10_000,
        currency: "RUB",
        clientDataRequirements: bookingClientDataRequirements()
      },
      scheduleSnapshot: {
        timeZone: "Europe/Moscow",
        policy: {
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          minimumNoticeMinutes: 0
        }
      }
    })
  );
  const lifecycle = await runtime.pool.query<{ id: string; occurred_at: Date }>(
    `SELECT id, occurred_at
       FROM booking_lifecycle_events
      WHERE booking_id = $1 AND owner_user_id = $2 AND revision = 1`,
    [booking.booking.id, ownerUserId]
  );
  const confirmationEvent = lifecycle.rows[0] ?? raise("Expected confirmation lifecycle event");
  const request: FlowBookingConfirmedEnrollmentRequestedPayloadV1 = {
    schemaVersion: "flow-booking-confirmed-enrollment-request.v1",
    eventKind: "booking_confirmed",
    source: "booking",
    sourceEventId: `booking:${booking.booking.id}:confirmed`,
    subjectType: "booking",
    subjectId: booking.booking.id,
    occurrenceKey: booking.booking.id,
    occurredAt: confirmationEvent.occurred_at.toISOString(),
    payloadSchemaVersion: 1,
    payload: { bookingId: booking.booking.id }
  };

  return {
    ownerUserId,
    clientUserId,
    productId,
    ownerSubjectId,
    requirementKeys,
    workerIdentity: {
      instanceId: registration.instanceId,
      sessionId: registration.sessionId
    },
    subscriptionId,
    flowId,
    versionId,
    activationEpochId: activation.outcome.response.body.activationEpoch.id,
    bookingId: booking.booking.id,
    lifecycleEventId: confirmationEvent.id,
    scheduleId: schedule.schedule.id,
    startAt,
    endAt,
    request
  };
}

async function createAdditionalFixtureBooking(
  fixture: Pick<
    Awaited<ReturnType<typeof createFixture>>,
    "ownerUserId" | "clientUserId" | "productId" | "scheduleId" | "endAt"
  >
): Promise<{ readonly bookingId: string; readonly lifecycleEventId: string }> {
  const startAt = new Date(Date.parse(fixture.endAt) + 60 * 60 * 1_000).toISOString();
  const endAt = new Date(Date.parse(startAt) + 60 * 60 * 1_000).toISOString();
  const createdAt = await databaseNow();
  const booking = await createDrizzleBookingCommandStore(runtime.database).executeManualBooking(
    {
      actorUserId: fixture.ownerUserId,
      scope: "bookings.manual.create",
      key: `additional-flow-booking-${randomUUID()}`,
      requestHash: `sha256:${"9".repeat(64)}`,
      now: createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1_000).toISOString()
    },
    async (): Promise<ManualBookingClaim> => ({
      ownerUserId: fixture.ownerUserId,
      clientUserId: fixture.clientUserId,
      productId: fixture.productId,
      scheduleId: fixture.scheduleId,
      serviceStartAt: startAt,
      serviceEndAt: endAt,
      occupiedStartAt: startAt,
      occupiedEndAt: endAt,
      productSnapshot: {
        title: "Consultation",
        durationMinutes: 60,
        deliveryFormat: "video",
        priceMinor: 10_000,
        currency: "RUB",
        clientDataRequirements: bookingClientDataRequirements()
      },
      scheduleSnapshot: {
        timeZone: "Europe/Moscow",
        policy: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 }
      }
    })
  );
  const lifecycle = await runtime.pool.query<{ id: string }>(
    `SELECT id
       FROM booking_lifecycle_events
      WHERE booking_id = $1 AND owner_user_id = $2 AND revision = 1`,
    [booking.booking.id, fixture.ownerUserId]
  );
  return {
    bookingId: booking.booking.id,
    lifecycleEventId: lifecycle.rows[0]?.id ?? raise("Expected additional lifecycle event")
  };
}

function bookingClientDataRequirements() {
  return {
    schemaVersion: "booking-client-data-requirements.v1",
    executionMode: "live",
    participantMode: "solo",
    requiredClientData: ["chart1"],
    methods: ["natal"]
  } as const;
}

function bookingGraph(productId: string, completedNodeId = "done"): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "trigger-booking",
        kind: "booking_confirmed",
        displayTitle: "Booking confirmed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [productId] }
      },
      {
        id: completedNodeId,
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: completedNodeId === "done" ? "consultation_prepared" : "follow_up" }
      }
    ],
    edges: [
      {
        id: "booking-done",
        sourceNodeId: "trigger-booking",
        targetNodeId: completedNodeId,
        sourceHandle: "next"
      }
    ]
  });
}

function manualClientGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "trigger-manual-client",
        kind: "manual_client",
        displayTitle: "Client selected manually",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
      }
    ],
    edges: [
      {
        id: "manual-client-done",
        sourceNodeId: "trigger-manual-client",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  });
}

function bookingWorkItemGraph(productId: string): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "trigger-booking",
        kind: "booking_confirmed",
        displayTitle: "Booking confirmed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [productId] }
      },
      {
        id: "prepare-consultation",
        kind: "astrologer_work_item",
        displayTitle: "Prepare consultation",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          taskKind: "consultation_preparation",
          taskTitle: "Prepare consultation",
          instructions: "Review the chart and client questions",
          priority: "high",
          duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
          completionRequirements: { resultSummary: "required" }
        }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
      }
    ],
    edges: [
      {
        id: "booking-work-item",
        sourceNodeId: "trigger-booking",
        targetNodeId: "prepare-consultation",
        sourceHandle: "next"
      },
      {
        id: "work-item-done",
        sourceNodeId: "prepare-consultation",
        targetNodeId: "done",
        sourceHandle: "success"
      }
    ]
  });
}

async function publishAndActivateSecondVersion(
  fixture: Awaited<ReturnType<typeof createFixture>>
): Promise<{ readonly versionId: string; readonly activationEpochId: string }> {
  const graph = bookingGraph(fixture.productId, "done-v2");
  const compiled = compileFlowGraphV2(graph);
  const capabilityManifest = compiled.capabilityManifest ?? raise("Expected V2 manifest");
  const versionId = await inTransaction(async (client) => {
    const version = await client.query<{ id: string }>(
      `INSERT INTO flow_versions (
         flow_id, owner_user_id, version, source_revision, approval_mode,
         graph_schema_version, graph, capability_manifest, published_at
       ) VALUES (
         $1, $2, 2, 2, 'manual_approve', 'flow-graph.v2', $3, $4,
         transaction_timestamp()
       ) RETURNING id`,
      [fixture.flowId, fixture.ownerUserId, graph, capabilityManifest]
    );
    const id = version.rows[0]?.id ?? raise("Expected V2 flow version");
    await client.query(
      `UPDATE flows
          SET revision = 2, draft_graph = $2,
              published_version_id = $3,
              published_at = (SELECT published_at FROM flow_versions WHERE id = $3),
              updated_at = transaction_timestamp()
        WHERE id = $1`,
      [fixture.flowId, graph, id]
    );
    return id;
  });
  const activation = await activateFlowVersionEnrollment({
    store: createDrizzleFlowEnrollmentControlStore(runtime.database),
    actorUserId: fixture.ownerUserId,
    ownerUserId: fixture.ownerUserId,
    flowId: fixture.flowId,
    idempotencyKey: `switch-flow-${randomUUID()}`,
    request: {
      schemaVersion: "flow-activation-command.v1",
      versionId,
      expectedRevision: 2,
      expectedEnrollmentRevision: 1,
      expectedActiveVersionId: fixture.versionId
    }
  });
  if (activation.outcome.kind !== "succeeded") raise("Expected V2 activation");
  return {
    versionId,
    activationEpochId: activation.outcome.response.body.activationEpoch.id
  };
}

async function createPublishedFlow(input: {
  readonly ownerUserId: string;
  readonly graph: FlowGraphV2;
  readonly capabilityManifest: unknown;
}) {
  return inTransaction(async (client) => {
    const flow = await client.query<{ id: string }>(
      `INSERT INTO flows (
         owner_user_id, name, origin, status, definition_state, approval_mode,
         revision, draft_graph, created_at, updated_at
       ) VALUES (
         $1, 'Booking enrollment fixture', $2, 'draft', 'draft', 'manual_approve',
         1, $3, transaction_timestamp(), transaction_timestamp()
       ) RETURNING id`,
      [
        input.ownerUserId,
        { schemaVersion: "flow-definition-origin.v1", type: "blank" },
        input.graph
      ]
    );
    const flowId = flow.rows[0]?.id ?? raise("Expected flow");
    const version = await client.query<{ id: string }>(
      `INSERT INTO flow_versions (
         flow_id, owner_user_id, version, source_revision, approval_mode,
         graph_schema_version, graph, capability_manifest, published_at
       ) VALUES (
         $1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4,
         transaction_timestamp()
       ) RETURNING id`,
      [flowId, input.ownerUserId, input.graph, input.capabilityManifest]
    );
    const versionId = version.rows[0]?.id ?? raise("Expected version");
    await client.query(
      `UPDATE flows
          SET status = 'published', definition_state = 'versioned',
              published_version_id = $2,
              published_at = (SELECT published_at FROM flow_versions WHERE id = $2),
              updated_at = transaction_timestamp()
        WHERE id = $1`,
      [flowId, versionId]
    );
    return { flowId, versionId };
  });
}

async function createActiveTariff(ownerUserId: string, automationLimit: number): Promise<string> {
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
    now: await databaseNow()
  });
  const subscription = await runtime.pool.query<{ id: string }>(
    "SELECT id FROM platform_tariff_subscriptions WHERE owner_user_id = $1",
    [ownerUserId]
  );
  return subscription.rows[0]?.id ?? raise("Expected subscription");
}

function canaryPolicy(
  ownerSubjectId: string,
  requirementKeys: readonly string[],
  enrollmentGlobalKillSwitch = false
): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerSubjectId],
    allowedRequirementKeys: requirementKeys,
    killSwitches: {
      enrollment: {
        global: enrollmentGlobalKillSwitch,
        ownerSubjectIds: [],
        capabilityKeys: []
      },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
}

function workerRegistration(
  ownerSubjectId: string,
  requirementKeys: readonly string[]
): FlowWorkerRegistration {
  const identity = randomUUID();
  return {
    schemaVersion: "flow-worker-registration.v2",
    sessionId: randomUUID(),
    instanceId: `flows-worker-${identity}`,
    roles: ["executor", "enrollment"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys,
    deploymentId: `deployment-${identity}`,
    buildId: `build-${identity}`
  };
}

async function createUser(): Promise<string> {
  const user = await runtime.pool.query<{ id: string }>(
    "INSERT INTO users (status) VALUES ('active') RETURNING id"
  );
  return user.rows[0]?.id ?? raise("Expected user");
}

async function createProduct(ownerUserId: string): Promise<string> {
  const product = await runtime.pool.query<{ id: string }>(
    `INSERT INTO products (
       owner_user_id, type, status, title, price_minor, currency,
       execution_mode, payment_model, duration_minutes, participant_mode
     ) VALUES (
       $1, 'single', 'active', 'Consultation', 10000, 'RUB',
       'live', 'once', 60, 'solo'
     ) RETURNING id`,
    [ownerUserId]
  );
  return product.rows[0]?.id ?? raise("Expected product");
}

async function runtimeCounts(sourceEventId: string) {
  const result = await runtime.pool.query<{
    events: string;
    runs: string;
    tokens: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM flow_runtime_events WHERE source_event_id = $1) AS events,
       (SELECT count(*)::text FROM flow_runs run
          JOIN flow_runtime_events event ON event.id = run.runtime_event_id
         WHERE event.source_event_id = $1) AS runs,
       (SELECT count(*)::text FROM flow_execution_tokens token
          JOIN flow_runs run ON run.id = token.flow_run_id
          JOIN flow_runtime_events event ON event.id = run.runtime_event_id
         WHERE event.source_event_id = $1) AS tokens`,
    [sourceEventId]
  );
  const row = result.rows[0] ?? raise("Expected counts");
  return { events: Number(row.events), runs: Number(row.runs), tokens: Number(row.tokens) };
}

async function lifecyclePersistence(lifecycleEventId: string) {
  const result = await runtime.pool.query<{
    head_xmin: string;
    receipt_xmin: string;
    runtime_event_xmin: string;
    run_xmin: string;
    applied_revision: number;
    head_state: string;
    last_lifecycle_event_id: string;
    receipt_outcome: string;
    source_event_id: string;
    lifecycle_event_id: string;
    lifecycle_revision: number;
  }>(
    `SELECT head.xmin::text AS head_xmin,
            receipt.xmin::text AS receipt_xmin,
            event.xmin::text AS runtime_event_xmin,
            run.xmin::text AS run_xmin,
            head.applied_revision,
            head.state AS head_state,
            head.last_lifecycle_event_id,
            receipt.outcome AS receipt_outcome,
            event.source_event_id,
            event.payload->>'lifecycleEventId' AS lifecycle_event_id,
            (event.payload->>'lifecycleRevision')::integer AS lifecycle_revision
       FROM flow_booking_lifecycle_receipts receipt
       JOIN flow_booking_lifecycle_heads head
         ON head.booking_id = receipt.booking_id
        AND head.owner_user_id = receipt.owner_user_id
       JOIN flow_runtime_events event ON event.id = receipt.flow_runtime_event_id
       JOIN flow_runs run ON run.runtime_event_id = event.id
      WHERE receipt.lifecycle_event_id = $1`,
    [lifecycleEventId]
  );
  return result.rows;
}

async function completedWorkItemPersistence(workItemId: string) {
  const result = await runtime.pool.query<{
    xmin: string;
    status: string;
    revision: number;
    result_summary: string | null;
    completed_at: Date | null;
    canceled_at: Date | null;
    last_command_id: string | null;
    last_run_event_id: string | null;
  }>(
    `SELECT xmin::text,
            status,
            revision,
            result_summary,
            completed_at,
            canceled_at,
            last_command_id,
            last_run_event_id
       FROM flow_work_items
      WHERE id = $1`,
    [workItemId]
  );
  return result.rows;
}

async function runtimeOutcome(sourceEventId: string): Promise<string> {
  const result = await runtime.pool.query<{ ingestion_outcome: string }>(
    "SELECT ingestion_outcome FROM flow_runtime_events WHERE source_event_id = $1",
    [sourceEventId]
  );
  return result.rows[0]?.ingestion_outcome ?? raise("Expected runtime event outcome");
}

async function databaseNow(): Promise<string> {
  const result = await runtime.pool.query<{ now: Date }>("SELECT clock_timestamp() AS now");
  return result.rows[0]?.now.toISOString() ?? raise("Expected database clock");
}

async function inTransaction<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: isolatedDatabaseUrl });
  try {
    await client.connect();
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function raise(message: string): never {
  throw new Error(message);
}
