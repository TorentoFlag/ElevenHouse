import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphV2Schema, type FlowGraphV2 } from "@elevenhouse/contracts";
import {
  compileFlowGraphV2,
  cancelDurableFlowRun,
  completeFlowWorkItem,
  createBookingLifecycleEvent,
  createBuiltInFlowNodeExecutorRegistry,
  decideDurableFlowApproval,
  createFlowNodeExecutorRegistry,
  CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
  FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
  FLOW_MESSAGING_DELIVERY_TERMINAL_SIGNAL,
  interpretFlowExecutionClaim,
  listOwnerFlowWorkItems,
  normalizeBookingConfirmedFlowLifecycleEvent,
  FlowRuntimeCommandIntegrityError,
  snoozeFlowWorkItem,
  startFlowWorkItem,
  type FlowExecutionClaim,
  type FlowExecutionDecision,
  type FlowNormalizedBookingConfirmedEventV1
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  createDrizzleFlowExecutionSignalStore,
  createDrizzleFlowExecutionStore
} from "./drizzle-flow-execution-store";
import { createDrizzleFlowBookingLifecycleStore } from "./drizzle-flow-booking-lifecycle-store";
import { createDrizzleFlowBirthProfileRecheckStore } from "./drizzle-flow-birth-profile-recheck-store";
import { createDrizzleFlowRunCancellationStore } from "./drizzle-flow-run-cancellation-store";
import { createDrizzleFlowWorkItemWakeStore } from "./drizzle-flow-work-item-wake-store";
import { createDrizzleFlowWorkItemStore } from "./drizzle-flow-work-item-store";
import { createDrizzleFlowApprovalStore } from "./drizzle-flow-approval-store";
import { createDrizzleFlowApprovalWakeStore } from "./drizzle-flow-approval-wake-store";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";
import { readCurrentMigrationSql } from "../../testing/current-migration-sql";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const integrationMigrationPaths = (process.env.FLOW_INTEGRATION_MIGRATION_PATHS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const databaseName = `elevenhouse_flow_execution_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

const graph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
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

const advancingGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: ["11111111-1111-4111-8111-111111111111"] }
    },
    {
      id: "birth-data",
      kind: "birth_data_available",
      displayTitle: "Есть данные рождения?",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { purpose: "service_preparation" }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    },
    {
      id: "suppressed",
      kind: "suppressed",
      displayTitle: "Нет данных",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { reasonCode: "birth_data_missing" }
    }
  ],
  edges: [
    {
      id: "booking-birth",
      sourceNodeId: "booking",
      targetNodeId: "birth-data",
      sourceHandle: "next"
    },
    {
      id: "birth-yes",
      sourceNodeId: "birth-data",
      targetNodeId: "completed",
      sourceHandle: "true"
    },
    {
      id: "birth-no",
      sourceNodeId: "birth-data",
      targetNodeId: "suppressed",
      sourceHandle: "false"
    }
  ]
});

const workItemGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "prepare-consultation",
      kind: "astrologer_work_item",
      displayTitle: "Подготовка консультации",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        taskKind: "consultation_preparation",
        taskTitle: "Подготовить консультацию",
        instructions: "Проверьте карту и вопросы клиента",
        priority: "high"
      }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "manual-prepare",
      sourceNodeId: "manual",
      targetNodeId: "prepare-consultation",
      sourceHandle: "next"
    },
    {
      id: "prepare-completed",
      sourceNodeId: "prepare-consultation",
      targetNodeId: "completed",
      sourceHandle: "success"
    }
  ]
});

const approvalGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "review-material",
      kind: "astrologer_approval",
      displayTitle: "Проверить материал перед отправкой",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        approvalKind: "ai_output",
        approvalTitle: "Подтвердить материал",
        expiresAfterMinutes: 1_440
      }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    },
    {
      id: "suppressed",
      kind: "suppressed",
      displayTitle: "Материал отклонён",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { reasonCode: "approval_rejected" }
    },
    {
      id: "failed",
      kind: "failed",
      displayTitle: "Время подтверждения истекло",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { errorCode: "approval_timeout" }
    }
  ],
  edges: [
    {
      id: "manual-approval",
      sourceNodeId: "manual",
      targetNodeId: "review-material",
      sourceHandle: "next"
    },
    {
      id: "approval-approved",
      sourceNodeId: "review-material",
      targetNodeId: "completed",
      sourceHandle: "approved"
    },
    {
      id: "approval-rejected",
      sourceNodeId: "review-material",
      targetNodeId: "suppressed",
      sourceHandle: "rejected"
    },
    {
      id: "approval-timeout",
      sourceNodeId: "review-material",
      targetNodeId: "failed",
      sourceHandle: "timeout"
    }
  ]
});

const natalAiApprovalGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: ["10000000-0000-4000-8000-000000000001"] }
    },
    {
      id: "natal-chart",
      kind: "natal_chart_request",
      displayTitle: "Рассчитать натальную карту",
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
      id: "review-natal-ai",
      kind: "natal_chart_ai_draft",
      displayTitle: "Проверить AI-черновик натальной карты",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        chartRequestNodeId: "natal-chart",
        locale: "ru",
        approvalTitle: "Проверить AI-черновик натальной карты",
        expiresAfterMinutes: 60
      }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    },
    {
      id: "suppressed",
      kind: "suppressed",
      displayTitle: "Черновик отклонён",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { reasonCode: "natal_draft_rejected" }
    },
    {
      id: "failed",
      kind: "failed",
      displayTitle: "Срок проверки истёк",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { errorCode: "natal_draft_approval_timed_out" }
    }
  ],
  edges: [
    {
      id: "booking-chart",
      sourceNodeId: "booking",
      targetNodeId: "natal-chart",
      sourceHandle: "next"
    },
    {
      id: "chart-ai",
      sourceNodeId: "natal-chart",
      targetNodeId: "review-natal-ai",
      sourceHandle: "next"
    },
    {
      id: "ai-approved",
      sourceNodeId: "review-natal-ai",
      targetNodeId: "completed",
      sourceHandle: "approved"
    },
    {
      id: "ai-rejected",
      sourceNodeId: "review-natal-ai",
      targetNodeId: "suppressed",
      sourceHandle: "rejected"
    },
    {
      id: "ai-timeout",
      sourceNodeId: "review-natal-ai",
      targetNodeId: "failed",
      sourceHandle: "timeout"
    }
  ]
});

const chartWaitGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: ["10000000-0000-4000-8000-000000000001"] }
    },
    {
      id: "natal-chart",
      kind: "natal_chart_request",
      displayTitle: "Рассчитать натальную карту",
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
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "booking-natal-chart",
      sourceNodeId: "booking",
      targetNodeId: "natal-chart",
      sourceHandle: "next"
    },
    {
      id: "natal-chart-completed",
      sourceNodeId: "natal-chart",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
});

const messagingWaitGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: ["10000000-0000-4000-8000-000000000001"] }
    },
    {
      id: "send-message",
      kind: "send_message",
      displayTitle: "Отправить напоминание",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { textTemplate: "Напомните клиенту о консультации." }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    },
    {
      id: "delivery-failed",
      kind: "failed",
      displayTitle: "Доставка не удалась",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { errorCode: "message_delivery_failed" }
    }
  ],
  edges: [
    {
      id: "booking-message",
      sourceNodeId: "booking",
      targetNodeId: "send-message",
      sourceHandle: "next"
    },
    {
      id: "message-success",
      sourceNodeId: "send-message",
      targetNodeId: "completed",
      sourceHandle: "success"
    },
    {
      id: "message-error",
      sourceNodeId: "send-message",
      targetNodeId: "delivery-failed",
      sourceHandle: "error"
    }
  ]
});

const bookingWorkItemGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: ["10000000-0000-4000-8000-000000000001"] }
    },
    {
      id: "prepare-consultation",
      kind: "astrologer_work_item",
      displayTitle: "Подготовка консультации",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        taskKind: "consultation_preparation",
        taskTitle: "Подготовить консультацию",
        instructions: "Проверьте карту и вопросы клиента",
        priority: "high",
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        completionRequirements: { resultSummary: "required" }
      }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "booking-prepare",
      sourceNodeId: "booking",
      targetNodeId: "prepare-consultation",
      sourceHandle: "next"
    },
    {
      id: "prepare-completed",
      sourceNodeId: "prepare-consultation",
      targetNodeId: "completed",
      sourceHandle: "success"
    }
  ]
});

const birthDataCollectionWorkItemGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: ["10000000-0000-4000-8000-000000000001"] }
    },
    {
      id: "collect-birth-data",
      kind: "astrologer_work_item",
      displayTitle: "Собрать данные рождения",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        taskKind: "birth_data_collection",
        taskTitle: "Собрать данные рождения",
        instructions: "Получите и внесите данные рождения клиента",
        priority: "high",
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        completionRequirements: { resultSummary: "optional" }
      }
    },
    {
      id: "birth-data",
      kind: "birth_data_available",
      displayTitle: "Данные рождения готовы",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { purpose: "service_preparation" }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "booking-birth-data",
      sourceNodeId: "booking",
      targetNodeId: "birth-data",
      sourceHandle: "next"
    },
    {
      id: "birth-data-missing",
      sourceNodeId: "birth-data",
      targetNodeId: "collect-birth-data",
      sourceHandle: "false"
    },
    {
      id: "birth-data-collected",
      sourceNodeId: "collect-birth-data",
      targetNodeId: "birth-data",
      sourceHandle: "success"
    },
    {
      id: "birth-data-completed",
      sourceNodeId: "birth-data",
      targetNodeId: "completed",
      sourceHandle: "true"
    }
  ]
});

function requireCapabilityManifest(input: FlowGraphV2) {
  const compiled = compileFlowGraphV2(input);
  if (!compiled.capabilityManifest) raise("Expected publishable integration graph");
  return compiled.capabilityManifest;
}

const capabilityManifest = requireCapabilityManifest(graph);
const advancingCapabilityManifest = requireCapabilityManifest(advancingGraph);
const workItemCapabilityManifest = requireCapabilityManifest(workItemGraph);
const approvalCapabilityManifest = requireCapabilityManifest(approvalGraph);
const natalAiApprovalCapabilityManifest = requireCapabilityManifest(natalAiApprovalGraph);
const chartWaitCapabilityManifest = requireCapabilityManifest(chartWaitGraph);
const messagingWaitCapabilityManifest = requireCapabilityManifest(messagingWaitGraph);
const bookingWorkItemCapabilityManifest = requireCapabilityManifest(bookingWorkItemGraph);
const birthDataCollectionWorkItemCapabilityManifest = requireCapabilityManifest(
  birthDataCollectionWorkItemGraph
);

function createBirthDataRegistry() {
  return createFlowNodeExecutorRegistry([
    {
      kind: "birth_data_available",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      evaluate: async (node) => ({
        kind: "advance",
        sourceNodeId: node.id,
        sourceHandle: "true"
      })
    }
  ]);
}

describe("flow execution store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
    await runtime.pool.query(
      integrationMigrationPaths.length
        ? integrationMigrationPaths
            .map((migrationPath) => readFileSync(migrationPath, "utf8"))
            .join("\n")
        : readCurrentMigrationSql()
    );
    const reconciliationClient = new Client({ connectionString: isolatedDatabaseUrl });
    await reconciliationClient.connect();
    try {
      await reconciliationClient.query("BEGIN");
      await reconcileAuditActorSubjects(reconciliationClient);
      await reconcileFlowRuntimeControlAuthority(reconciliationClient);
      await reconciliationClient.query("COMMIT");
    } catch (error) {
      await reconciliationClient.query("ROLLBACK");
      throw error;
    } finally {
      await reconciliationClient.end();
    }
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
    await clearBookingLifecycleFixtures();
    await runtime.pool.query(
      "ALTER TABLE flow_versions VALIDATE CONSTRAINT flow_versions_capability_manifest_schema_check"
    );
  });

  async function clearBookingLifecycleFixtures(): Promise<void> {
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "ALTER TABLE flow_booking_lifecycle_heads DISABLE TRIGGER flow_booking_lifecycle_heads_transition_guard"
      );
      await client.query(
        "ALTER TABLE flow_booking_lifecycle_receipts DISABLE TRIGGER flow_booking_lifecycle_receipts_immutable"
      );
      await client.query(
        "ALTER TABLE booking_lifecycle_events DISABLE TRIGGER booking_lifecycle_events_immutable"
      );
      await client.query(
        "ALTER TABLE client_birth_data_history DISABLE TRIGGER client_birth_data_history_append_only"
      );
      await client.query("delete from flow_booking_lifecycle_heads");
      await client.query("delete from flow_booking_lifecycle_receipts");
      await client.query("delete from flow_runs");
      await client.query("delete from outbox_events where event_type = $1", [
        CLIENT_BIRTH_PROFILE_UPDATED_EVENT
      ]);
      await client.query("delete from client_birth_data_history");
      await client.query("delete from client_birth_data");
      await client.query("delete from client_astrologer_relationships");
      await client.query("delete from booking_lifecycle_events");
      await client.query("delete from bookings");
      await client.query("delete from users");
      await client.query(
        "ALTER TABLE client_birth_data_history ENABLE TRIGGER client_birth_data_history_append_only"
      );
      await client.query(
        "ALTER TABLE booking_lifecycle_events ENABLE TRIGGER booking_lifecycle_events_immutable"
      );
      await client.query(
        "ALTER TABLE flow_booking_lifecycle_receipts ENABLE TRIGGER flow_booking_lifecycle_receipts_immutable"
      );
      await client.query(
        "ALTER TABLE flow_booking_lifecycle_heads ENABLE TRIGGER flow_booking_lifecycle_heads_transition_guard"
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  it("never rounds a later PostgreSQL transition instant behind an earlier microsecond write", async () => {
    const sample = await runtime.pool.query<{
      prior_at: string;
      transition_epoch_ms: string;
    }>(`
      SELECT '2026-08-03 19:51:59.390814+00'::timestamptz::text AS prior_at,
             (
               extract(epoch FROM '2026-08-03 19:51:59.390819+00'::timestamptz) * 1000
             )::text AS transition_epoch_ms
    `);
    const row = sample.rows[0] ?? raise("Expected PostgreSQL clock precision sample");
    const transitionAt = parseFlowDatabaseEpochMilliseconds(row.transition_epoch_ms);
    if (!transitionAt) raise("Expected parsed flow database transition instant");

    const comparison = await runtime.pool.query<{
      causally_ordered: boolean;
      millisecond_aligned: boolean;
    }>(
      `SELECT $1::timestamptz >= $2::timestamptz AS causally_ordered,
              mod(extract(microseconds FROM $1::timestamptz)::bigint, 1000) = 0
                AS millisecond_aligned`,
      [transitionAt.toISOString(), row.prior_at]
    );

    expect(comparison.rows[0]).toEqual({
      causally_ordered: true,
      millisecond_aligned: true
    });
  });

  it("allows exactly one concurrent claimant and atomically completes one terminal token", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claimResults = await Promise.all([
      store.claimNext({
        leaseOwner: "flows-worker-a",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      }),
      store.claimNext({
        leaseOwner: "flows-worker-b",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ]);
    const claimedResult = claimResults.find((candidate) => candidate?.status === "claimed");
    if (!claimedResult || claimedResult.status !== "claimed") raise("Expected one claim");
    const claim = claimedResult.claim;

    expect(claimResults.filter((candidate) => candidate !== null)).toHaveLength(1);
    expect(claim).toMatchObject({
      tokenId: fixture.tokenId,
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId,
      flowId: fixture.flowId,
      flowVersionId: fixture.flowVersionId,
      nodeId: "completed",
      nodeKind: "completed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      attemptNumber: 1n,
      fencingToken: 1n
    });
    expect(new Date(claim.leaseExpiresAt).getTime()).toBeGreaterThan(
      new Date(claim.claimedAt).getTime()
    );

    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });
    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "completed",
      current_node_id: "completed",
      trace_sequence: "1"
    });
    expect(persisted.token).toMatchObject({
      state: "completed",
      fencing_token: "1",
      lease_owner: null,
      lease_expires_at: null,
      claimed_at: null
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "completed",
        executor_key: "completed:1:1",
        attempt_number: "1",
        fencing_token: "1",
        outcome: "completed",
        result_code: "consultation_prepared"
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "run_completed",
        node_id: "completed",
        summary: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: "completed",
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: "consultation_prepared"
        }
      }
    ]);
    expect(persisted.events[0]?.attempt_id).toBe(persisted.attempts[0]?.id);
    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });
    await expect(selectExecution(fixture.runId)).resolves.toEqual(persisted);
  });

  it("claims only persisted owners admitted by the canary owner scope", async () => {
    const excluded = await createTerminalFixture({
      availableAt: "2026-08-03T08:00:00.000Z"
    });
    const allowed = await createTerminalFixture({
      availableAt: "2026-08-03T08:01:00.000Z"
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    const result = await store.claimNext({
      leaseOwner: "flows-worker-canary",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"],
      ownerScope: { kind: "allowlist", ownerUserIds: [allowed.ownerUserId] }
    });

    expect(result).toMatchObject({
      status: "claimed",
      claim: {
        ownerUserId: allowed.ownerUserId,
        tokenId: allowed.tokenId
      }
    });
    expect((await selectExecution(excluded.runId)).token).toMatchObject({
      state: "runnable",
      lease_owner: null
    });
  });

  it("rejects duplicate canary owners even when UUID casing differs", async () => {
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-invalid-canary",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: {
          kind: "allowlist",
          ownerUserIds: [
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
          ]
        }
      })
    ).rejects.toThrow("Flow execution canary owner ids must be unique UUIDs");
  });

  it("globally recovers a removed canary owner without making it claimable", async () => {
    const removed = await createTerminalFixture({
      availableAt: "2026-08-03T08:00:00.000Z"
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await claimExecution(store, {
      leaseOwner: "flows-worker-removed-owner",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"],
      ownerScope: { kind: "allowlist", ownerUserIds: [removed.ownerUserId] }
    });
    await expireClaimedToken(removed.tokenId);

    await expect(store.recoverExpired({ limit: 1 })).resolves.toMatchObject({
      recoveredCount: 1,
      retryScheduledCount: 1
    });

    expect((await selectExecution(removed.runId)).token).toMatchObject({
      state: "retry_scheduled",
      lease_owner: null
    });
    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [removed.tokenId]
    );
    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-after-removal",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: {
          kind: "allowlist",
          ownerUserIds: ["00000000-0000-4000-8000-000000000099"]
        }
      })
    ).resolves.toBeNull();
  });

  it("atomically advances one stable token to the persisted target node", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-advance",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    expect(claim).toMatchObject({
      tokenId: fixture.tokenId,
      nodeId: "birth-data",
      nodeActivationSequence: 1n,
      attemptNumber: 1n,
      fencingToken: 1n
    });

    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "running",
      current_node_id: "completed",
      trace_sequence: "1",
      completed_at: null
    });
    expect(persisted.token).toMatchObject({
      id: fixture.tokenId,
      node_id: "completed",
      node_kind: "completed",
      config_schema_version: 1,
      executor_contract_version: 1,
      executor_key: "completed:1:1",
      state: "runnable",
      node_activation_sequence: "2",
      attempt_counter: "0",
      fencing_token: "1",
      failure_disposition: null,
      failure_reason_code: null,
      terminal_at: null,
      quarantined_at: null,
      claimed_at: null,
      lease_owner: null,
      lease_expires_at: null
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "birth-data",
        executor_key: "birth_data_available:1:1",
        node_activation_sequence: "1",
        attempt_number: "1",
        fencing_token: "1",
        outcome: "advanced",
        result_code: "FLOW_TOKEN_ADVANCED"
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "token_advanced",
        node_id: "birth-data",
        summary: decision.trace
      }
    ]);
    expect(persisted.events[0]?.attempt_id).toBe(persisted.attempts[0]?.id);
  });

  it("atomically creates one human work item and suspends the claimed token", async () => {
    const fixture = await createWorkItemFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-work-item",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    expect(decision).toMatchObject({
      kind: "wait_work_item",
      sourceNodeId: "prepare-consultation",
      completionHandle: "success",
      resultCode: "FLOW_WAITING_WORK_ITEM"
    });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const [persisted, workItems] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_work_items where flow_run_id = $1", [fixture.runId])
    ]);
    expect(persisted.run).toMatchObject({
      status: "waiting",
      current_node_id: "prepare-consultation",
      trace_sequence: "1",
      completed_at: null
    });
    expect(persisted.token).toMatchObject({
      id: fixture.tokenId,
      node_id: "prepare-consultation",
      state: "waiting_work_item",
      node_activation_sequence: "1",
      attempt_counter: "1",
      fencing_token: "1",
      claimed_at: null,
      lease_owner: null,
      lease_expires_at: null
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "prepare-consultation",
        node_activation_sequence: "1",
        attempt_number: "1",
        outcome: "waiting",
        result_code: "FLOW_WAITING_WORK_ITEM",
        trace_summary: decision.trace
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "token_waiting",
        node_id: "prepare-consultation",
        summary: decision.trace
      }
    ]);
    expect(workItems.rows).toMatchObject([
      {
        owner_user_id: fixture.ownerUserId,
        flow_run_id: fixture.runId,
        flow_version_id: fixture.flowVersionId,
        token_id: fixture.tokenId,
        node_activation_sequence: "1",
        node_id: "prepare-consultation",
        completion_handle: "success",
        status: "pending",
        task_kind: "consultation_preparation",
        title: "Подготовить консультацию",
        instructions: "Проверьте карту и вопросы клиента",
        assignee_user_id: fixture.ownerUserId,
        priority: "high",
        revision: 1
      }
    ]);
    expect(persisted.events[0]?.attempt_id).toBe(persisted.attempts[0]?.id);

    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });
    await expect(
      runtime.pool.query<{ count: string }>(
        "select count(*)::text as count from flow_work_items where flow_run_id = $1",
        [fixture.runId]
      )
    ).resolves.toMatchObject({ rows: [{ count: "1" }] });
  });

  it("atomically creates a token-bound approval and suspends the claimed token", async () => {
    const fixture = await createApprovalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-approval",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_approval:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const [persisted, approvals] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_approvals where flow_run_id = $1", [fixture.runId])
    ]);
    expect(persisted.run).toMatchObject({
      status: "waiting",
      current_node_id: "review-material",
      trace_sequence: "1"
    });
    expect(persisted.token).toMatchObject({
      id: fixture.tokenId,
      state: "waiting_approval",
      node_id: "review-material",
      node_activation_sequence: "1"
    });
    expect(approvals.rows).toMatchObject([
      {
        owner_user_id: fixture.ownerUserId,
        flow_run_id: fixture.runId,
        execution_token_id: fixture.tokenId,
        node_activation_sequence: "1",
        status: "pending",
        kind: "ai_output",
        title: "Подтвердить материал",
        preview: "Проверить материал перед отправкой",
        revision: 1,
        last_command_id: null,
        last_run_event_id: null
      }
    ]);
    expect(approvals.rows[0]?.expires_at).not.toBeNull();
    expect(persisted.attempts).toMatchObject([
      {
        outcome: "waiting",
        result_code: "FLOW_WAITING_APPROVAL",
        trace_summary: decision.trace
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        event_type: "token_waiting",
        node_id: "review-material",
        summary: decision.trace
      }
    ]);
  });

  it("decides a token-bound approval exactly once and resumes its pinned token", async () => {
    const fixture = await createApprovalFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-approval-decision",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_approval:1:1"]
    });
    const waitDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(executionStore.finalize({ claim, decision: waitDecision })).resolves.toMatchObject(
      {
        status: "applied"
      }
    );
    const approval = await runtime.pool.query<{ id: string }>(
      "select id from flow_approvals where flow_run_id = $1",
      [fixture.runId]
    );
    const approvalId = approval.rows[0]?.id ?? raise("Expected persisted approval");
    const approvalStore = createDrizzleFlowApprovalStore(runtime.database);
    const result = await decideDurableFlowApproval({
      store: approvalStore,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      approvalId,
      idempotencyKey: "flow-approval-decision-1",
      request: { expectedRevision: 1, decision: "approved", note: "Checked" }
    });
    expect(result).toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: { body: { approval: { id: approvalId, status: "approved", revision: 2 } } }
      }
    });
    await expect(
      decideDurableFlowApproval({
        store: approvalStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        approvalId,
        idempotencyKey: "flow-approval-decision-1",
        request: { expectedRevision: 1, decision: "approved", note: "Checked" }
      })
    ).resolves.toMatchObject({ kind: "replayed" });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "running",
      current_node_id: "completed",
      trace_sequence: "2"
    });
    expect(persisted.token).toMatchObject({
      state: "runnable",
      node_id: "completed",
      node_activation_sequence: "2"
    });
    expect(persisted.events).toContainEqual(
      expect.objectContaining({
        event_type: "token_advanced",
        node_id: "review-material",
        summary: expect.objectContaining({
          reasonCode: "FLOW_APPROVAL_DECIDED",
          sourceHandle: "approved"
        })
      })
    );
  });

  it("records an AI-draft approval decision through its matching runtime command", async () => {
    const fixture = await createNatalAiApprovalFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-natal-ai-approval-decision",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_ai_draft:1:1"]
    });
    const waitDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createNatalAiDraftRegistry(fixture)
    });
    await expect(executionStore.finalize({ claim, decision: waitDecision })).resolves.toMatchObject(
      {
        status: "applied"
      }
    );
    const approval = await runtime.pool.query<{ id: string }>(
      "select id from flow_approvals where flow_run_id = $1",
      [fixture.runId]
    );
    const approvalId = approval.rows[0]?.id ?? raise("Expected persisted natal AI approval");

    await expect(
      decideDurableFlowApproval({
        store: createDrizzleFlowApprovalStore(runtime.database),
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        approvalId,
        idempotencyKey: "natal-ai-approval-decision-1",
        request: { expectedRevision: 1, decision: "approved", note: "Проверено" }
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: { body: { approval: { id: approvalId, status: "approved", revision: 2 } } }
      }
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.events).toContainEqual(
      expect.objectContaining({
        event_type: "token_advanced",
        node_id: "review-natal-ai",
        summary: expect.objectContaining({
          nodeKind: "natal_chart_ai_draft",
          reasonCode: "FLOW_APPROVAL_DECIDED",
          sourceHandle: "approved"
        })
      })
    );
  });

  it("expires an AI-draft approval and completes its failed terminal node", async () => {
    const fixture = await createNatalAiApprovalFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const waitClaim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-natal-ai-approval-timeout",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_ai_draft:1:1"]
    });
    const waitDecision = await interpretFlowExecutionClaim({
      claim: waitClaim,
      registry: createNatalAiDraftRegistry(fixture)
    });
    await executionStore.finalize({ claim: waitClaim, decision: waitDecision });
    await runtime.pool.query(
      "update flow_approvals set created_at = clock_timestamp() - interval '2 seconds', expires_at = clock_timestamp() - interval '1 second' where flow_run_id = $1",
      [fixture.runId]
    );

    await expect(
      createDrizzleFlowApprovalWakeStore(runtime.database).wakeDue({ limit: 10 })
    ).resolves.toMatchObject({
      expiredCount: 1
    });
    const terminalClaim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-natal-ai-failed-terminal",
      leaseDurationMs: 30_000,
      executorKeys: ["failed:1:1"]
    });
    const terminalDecision = await interpretFlowExecutionClaim({
      claim: terminalClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      executionStore.finalize({ claim: terminalClaim, decision: terminalDecision })
    ).resolves.toMatchObject({
      status: "applied"
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "completed", current_node_id: "failed" });
    expect(persisted.events).toContainEqual(
      expect.objectContaining({
        event_type: "run_completed",
        node_id: "failed",
        summary: expect.objectContaining({
          nodeKind: "failed",
          resultCode: "natal_draft_approval_timed_out"
        })
      })
    );
  });

  it("expires a token-bound approval exactly once and resumes its pinned timeout edge", async () => {
    const fixture = await createApprovalFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-approval-timeout",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_approval:1:1"]
    });
    const waitDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(executionStore.finalize({ claim, decision: waitDecision })).resolves.toMatchObject(
      {
        status: "applied"
      }
    );
    await runtime.pool.query(
      "update flow_approvals set created_at = clock_timestamp() - interval '2 seconds', expires_at = clock_timestamp() - interval '1 second' where flow_run_id = $1",
      [fixture.runId]
    );

    const wakeStore = createDrizzleFlowApprovalWakeStore(runtime.database);
    const outcomes = await Promise.all([
      wakeStore.wakeDue({ limit: 10 }),
      wakeStore.wakeDue({ limit: 10 })
    ]);
    expect(outcomes.reduce((total, outcome) => total + outcome.expiredCount, 0)).toBe(1);

    const [execution, approval] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_approvals where flow_run_id = $1", [fixture.runId])
    ]);
    expect(execution.run).toMatchObject({
      status: "running",
      current_node_id: "failed",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "runnable",
      node_id: "failed",
      node_activation_sequence: "2"
    });
    expect(execution.events).toContainEqual(
      expect.objectContaining({
        event_type: "approval_expired",
        node_id: "review-material",
        attempt_id: null,
        command_id: null,
        summary: expect.objectContaining({
          reasonCode: "FLOW_APPROVAL_EXPIRED",
          sourceHandle: "timeout",
          selectedEdgeId: "approval-timeout",
          targetNodeId: "failed"
        })
      })
    );
    expect(approval.rows).toMatchObject([
      {
        status: "expired",
        revision: 2,
        last_command_id: null,
        last_run_event_id: expect.any(String)
      }
    ]);
  });

  it("rejects a human decision racing an expired approval without taking a second edge", async () => {
    const fixture = await createApprovalFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-approval-timeout-race",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_approval:1:1"]
    });
    const waitDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(executionStore.finalize({ claim, decision: waitDecision })).resolves.toMatchObject(
      {
        status: "applied"
      }
    );
    const approval = await runtime.pool.query<{ id: string }>(
      "select id from flow_approvals where flow_run_id = $1",
      [fixture.runId]
    );
    const approvalId = approval.rows[0]?.id ?? raise("Expected persisted approval");
    await runtime.pool.query(
      "update flow_approvals set created_at = clock_timestamp() - interval '2 seconds', expires_at = clock_timestamp() - interval '1 second' where id = $1",
      [approvalId]
    );

    const [decision, wake] = await Promise.all([
      decideDurableFlowApproval({
        store: createDrizzleFlowApprovalStore(runtime.database),
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        approvalId,
        idempotencyKey: "flow-approval-expired-race-decision",
        request: { expectedRevision: 1, decision: "approved", note: "Too late" }
      }),
      createDrizzleFlowApprovalWakeStore(runtime.database).wakeDue({ limit: 10 })
    ]);

    expect(decision).toMatchObject({
      kind: "created",
      outcome: { kind: "rejected", response: { statusCode: 409 } }
    });
    if (decision.kind !== "created" || decision.outcome.kind !== "rejected") {
      throw new Error("Expected the expired approval decision to be rejected");
    }
    expect(["FLOW_APPROVAL_TRANSITION_NOT_ALLOWED", "FLOW_APPROVAL_REVISION_CONFLICT"]).toContain(
      decision.outcome.response.body.code
    );
    expect(wake.expiredCount).toBe(1);

    const [execution, persistedApproval] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_approvals where id = $1", [approvalId])
    ]);
    expect(execution.run).toMatchObject({ status: "running", current_node_id: "failed" });
    expect(execution.token).toMatchObject({ state: "runnable", node_id: "failed" });
    expect(
      execution.events.filter((event) => event.event_type === "approval_expired")
    ).toHaveLength(1);
    expect(execution.events.filter((event) => event.event_type === "token_advanced")).toHaveLength(
      0
    );
    expect(persistedApproval.rows).toMatchObject([{ status: "expired", revision: 2 }]);
  });

  it("wakes a snoozed approval without advancing its token", async () => {
    const fixture = await createApprovalFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-approval-snooze",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_approval:1:1"]
    });
    const waitDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(executionStore.finalize({ claim, decision: waitDecision })).resolves.toMatchObject(
      {
        status: "applied"
      }
    );
    const approval = await runtime.pool.query<{ id: string }>(
      "select id from flow_approvals where flow_run_id = $1",
      [fixture.runId]
    );
    const approvalId = approval.rows[0]?.id ?? raise("Expected persisted approval");
    const scheduledFor = new Date(Date.now() + 100).toISOString();
    await expect(
      decideDurableFlowApproval({
        store: createDrizzleFlowApprovalStore(runtime.database),
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        approvalId,
        idempotencyKey: "flow-approval-snooze-1",
        request: { expectedRevision: 1, decision: "snoozed", snoozedUntil: scheduledFor }
      })
    ).resolves.toMatchObject({
      outcome: { kind: "succeeded", response: { body: { approval: { status: "snoozed" } } } }
    });
    await runtime.pool.query("select pg_sleep(0.2)");

    const outcomes = await Promise.all([
      createDrizzleFlowApprovalWakeStore(runtime.database).wakeDue({ limit: 10 }),
      createDrizzleFlowApprovalWakeStore(runtime.database).wakeDue({ limit: 10 })
    ]);
    expect(outcomes.reduce((total, outcome) => total + outcome.wokenCount, 0)).toBe(1);

    const [execution, persistedApproval] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_approvals where id = $1", [approvalId])
    ]);
    expect(execution.run).toMatchObject({
      status: "waiting",
      current_node_id: "review-material",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "waiting_approval",
      node_id: "review-material",
      node_activation_sequence: "1"
    });
    expect(execution.events).toContainEqual(
      expect.objectContaining({
        event_type: "approval_available",
        summary: expect.objectContaining({ reasonCode: "FLOW_APPROVAL_SNOOZE_ELAPSED" })
      })
    );
    expect(persistedApproval.rows).toMatchObject([
      { status: "pending", revision: 3, snoozed_until: null, last_run_event_id: expect.any(String) }
    ]);
  });

  it("persists a chart terminal-signal wait without advancing the token", async () => {
    const fixture = await createChartWaitFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-chart-wait",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_request:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry({
        natalChartRequester: {
          request: async () => ({ kind: "active_job", jobId: fixture.chartJobId })
        }
      })
    });

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const [execution, waits] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_execution_signal_waits where token_id = $1", [
        fixture.tokenId
      ])
    ]);
    expect(execution.run).toMatchObject({
      status: "waiting",
      current_node_id: "natal-chart",
      trace_sequence: "1"
    });
    expect(execution.token).toMatchObject({
      state: "waiting_signal",
      node_id: "natal-chart",
      node_activation_sequence: "1"
    });
    expect(execution.attempts).toMatchObject([
      {
        node_id: "natal-chart",
        outcome: "waiting",
        result_code: "FLOW_WAITING_SIGNAL",
        trace_summary: decision.trace
      }
    ]);
    expect(waits.rows).toMatchObject([
      {
        owner_user_id: fixture.ownerUserId,
        flow_run_id: fixture.runId,
        flow_version_id: fixture.flowVersionId,
        token_id: fixture.tokenId,
        node_activation_sequence: "1",
        node_id: "natal-chart",
        signal_type: "chart.calculation.terminal.v1",
        correlation_id: fixture.chartJobId,
        success_handle: "next",
        state: "waiting",
        consumed_signal_id: null
      }
    ]);
  });

  it("replays a reused chart result as run-scoped durable terminal evidence", async () => {
    const fixture = await createChartWaitFixture();
    await createDrizzleFlowExecutionSignalStore(runtime.database).ingest({
      sourceEventId: randomUUID(),
      ownerUserId: fixture.ownerUserId,
      signalType: "chart.calculation.terminal.v1",
      correlationId: fixture.chartJobId,
      outcome: "succeeded",
      occurredAt: "2026-08-03T00:00:00.000Z"
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-chart-reuse",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_request:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry({
        natalChartRequester: {
          request: async () => ({
            kind: "existing_result",
            calculationId: randomUUID(),
            jobId: fixture.chartJobId
          })
        }
      })
    });

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 2n
    });

    const [execution, waits, inbox] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_execution_signal_waits where token_id = $1", [
        fixture.tokenId
      ]),
      runtime.pool.query("select * from flow_execution_signal_inbox where source_event_id = $1", [
        fixture.tokenId
      ])
    ]);
    expect(execution.run).toMatchObject({
      status: "running",
      current_node_id: "completed",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "runnable",
      node_id: "completed",
      node_activation_sequence: "2"
    });
    expect(waits.rows).toMatchObject([
      {
        state: "consumed",
        correlation_id: fixture.chartJobId,
        expected_source_event_id: fixture.tokenId,
        consumed_signal_id: inbox.rows[0]?.id
      }
    ]);
    expect(inbox.rows).toMatchObject([
      { source_event_id: fixture.tokenId, correlation_id: fixture.chartJobId, outcome: "succeeded" }
    ]);
  });

  it("consumes a successful chart terminal signal once and resumes the pinned next node", async () => {
    const fixture = await createChartWaitFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const signalStore = createDrizzleFlowExecutionSignalStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-chart-signal-success",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_request:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry({
        natalChartRequester: {
          request: async () => ({ kind: "active_job", jobId: fixture.chartJobId })
        }
      })
    });
    await store.finalize({ claim, decision });

    const sourceEventId = randomUUID();
    await expect(
      signalStore.ingest({
        sourceEventId,
        ownerUserId: fixture.ownerUserId,
        signalType: FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
        correlationId: fixture.chartJobId,
        outcome: "succeeded",
        occurredAt: "2026-08-05T00:00:00.000Z"
      })
    ).resolves.toEqual({ status: "consumed", runId: fixture.runId, traceSequence: 2n });
    await expect(
      signalStore.ingest({
        sourceEventId,
        ownerUserId: fixture.ownerUserId,
        signalType: FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
        correlationId: fixture.chartJobId,
        outcome: "succeeded",
        occurredAt: "2026-08-05T00:00:00.000Z"
      })
    ).resolves.toEqual({ status: "replayed" });

    const [execution, waits, inbox] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_execution_signal_waits where token_id = $1", [
        fixture.tokenId
      ]),
      runtime.pool.query("select * from flow_execution_signal_inbox where source_event_id = $1", [
        sourceEventId
      ])
    ]);
    expect(execution.run).toMatchObject({
      status: "running",
      current_node_id: "completed",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "runnable",
      node_id: "completed",
      node_kind: "completed",
      node_activation_sequence: "2"
    });
    expect(execution.events).toMatchObject([
      { sequence: "1", event_type: "token_waiting", node_id: "natal-chart" },
      {
        sequence: "2",
        event_type: "token_signaled",
        node_id: "natal-chart",
        summary: {
          reasonCode: "FLOW_CHART_CALCULATION_COMPLETED",
          resultCode: "FLOW_TOKEN_ADVANCED",
          targetNodeId: "completed"
        }
      }
    ]);
    expect(waits.rows).toMatchObject([
      { state: "consumed", consumed_signal_id: inbox.rows[0]?.id }
    ]);
    expect(inbox.rows).toMatchObject([{ source_event_id: sourceEventId, outcome: "succeeded" }]);
    expect(inbox.rows[0]?.consumed_at).not.toBeNull();
  });

  it("terminally fails the waiting Flow when the chart terminal signal fails", async () => {
    const fixture = await createChartWaitFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const signalStore = createDrizzleFlowExecutionSignalStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-chart-signal-failure",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_request:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry({
        natalChartRequester: {
          request: async () => ({ kind: "active_job", jobId: fixture.chartJobId })
        }
      })
    });
    await store.finalize({ claim, decision });

    await expect(
      signalStore.ingest({
        sourceEventId: randomUUID(),
        ownerUserId: fixture.ownerUserId,
        signalType: FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
        correlationId: fixture.chartJobId,
        outcome: "failed",
        occurredAt: "2026-08-05T00:00:00.000Z"
      })
    ).resolves.toEqual({ status: "consumed", runId: fixture.runId, traceSequence: 2n });

    const execution = await selectExecution(fixture.runId);
    expect(execution.run).toMatchObject({
      status: "failed_terminal",
      current_node_id: "natal-chart",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "failed",
      failure_disposition: "failed_terminal",
      failure_reason_code: "FLOW_CHART_CALCULATION_FAILED"
    });
    expect(execution.events).toMatchObject([
      { sequence: "1", event_type: "token_waiting", node_id: "natal-chart" },
      {
        sequence: "2",
        event_type: "run_failed",
        node_id: "natal-chart",
        summary: {
          reasonCode: "FLOW_CHART_CALCULATION_FAILED",
          resultCode: "FLOW_EXECUTION_FAILED_TERMINAL"
        }
      }
    ]);
  });

  it("routes a durable messaging delivery terminal signal through success or error", async () => {
    const fixture = await createMessagingWaitFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const signalStore = createDrizzleFlowExecutionSignalStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-messaging-signal",
      leaseDurationMs: 30_000,
      executorKeys: ["send_message:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry({
        messagingRequester: {
          prepare: async () => ({ kind: "queued", messageId: fixture.messageId })
        }
      })
    });
    await store.finalize({ claim, decision });

    await expect(
      signalStore.ingest({
        sourceEventId: randomUUID(),
        ownerUserId: fixture.ownerUserId,
        signalType: FLOW_MESSAGING_DELIVERY_TERMINAL_SIGNAL,
        correlationId: fixture.messageId,
        outcome: "failed",
        occurredAt: "2026-08-05T00:00:00.000Z"
      })
    ).resolves.toEqual({ status: "consumed", runId: fixture.runId, traceSequence: 2n });

    const execution = await selectExecution(fixture.runId);
    expect(execution.run).toMatchObject({
      status: "running",
      current_node_id: "delivery-failed",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "runnable",
      node_id: "delivery-failed",
      node_kind: "failed"
    });
    expect(execution.events).toMatchObject([
      { sequence: "1", event_type: "token_waiting", node_id: "send-message" },
      {
        sequence: "2",
        event_type: "token_signaled",
        node_id: "send-message",
        summary: {
          reasonCode: "FLOW_MESSAGING_DELIVERY_COMPLETED",
          sourceHandle: "error",
          targetNodeId: "delivery-failed"
        }
      }
    ]);
  });

  it("consumes a stored terminal signal when the chart wait is persisted later", async () => {
    const fixture = await createChartWaitFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const signalStore = createDrizzleFlowExecutionSignalStore(runtime.database);
    const sourceEventId = randomUUID();
    await expect(
      signalStore.ingest({
        sourceEventId,
        ownerUserId: fixture.ownerUserId,
        signalType: FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
        correlationId: fixture.chartJobId,
        outcome: "succeeded",
        occurredAt: "2026-08-05T00:00:00.000Z"
      })
    ).resolves.toEqual({ status: "stored" });

    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-chart-signal-before-wait",
      leaseDurationMs: 30_000,
      executorKeys: ["natal_chart_request:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry({
        natalChartRequester: {
          request: async () => ({ kind: "active_job", jobId: fixture.chartJobId })
        }
      })
    });

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 2n
    });
    const execution = await selectExecution(fixture.runId);
    expect(execution.run).toMatchObject({ status: "running", trace_sequence: "2" });
    expect(execution.token).toMatchObject({ state: "runnable", node_id: "completed" });
    await expect(
      signalStore.ingest({
        sourceEventId,
        ownerUserId: fixture.ownerUserId,
        signalType: FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
        correlationId: fixture.chartJobId,
        outcome: "succeeded",
        occurredAt: "2026-08-05T00:00:00.000Z"
      })
    ).resolves.toEqual({ status: "replayed" });
  });

  it("pins a booking-relative deadline in the human work item", async () => {
    const fixture = await createBookingWorkItemFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-booking-work-item",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    expect(claim).toMatchObject({
      enrollmentSnapshot: {
        subject: { bookingId: fixture.bookingId, startAt: fixture.startAt }
      },
      effectiveRunSnapshot: {
        subject: { bookingId: fixture.bookingId, startAt: fixture.startAt }
      },
      bookingLifecycleContext: {
        bookingId: fixture.bookingId,
        appliedRevision: 1,
        schedule: { startAt: fixture.startAt, timeZone: "Europe/Moscow" }
      }
    });
    expect(decision).toMatchObject({
      kind: "wait_work_item",
      workItem: {
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        completionRequirements: { resultSummary: "required" },
        dueAt: fixture.expectedDueAt
      }
    });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied"
    });

    await expect(
      runtime.pool.query(
        `select due_policy_kind, due_lead_time_minutes,
                due_booking_lifecycle_revision, due_at
           from flow_work_items
          where flow_run_id = $1`,
        [fixture.runId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          due_policy_kind: "before_booking_start",
          due_lead_time_minutes: 1_440,
          due_booking_lifecycle_revision: 1,
          due_at: new Date(fixture.expectedDueAt)
        }
      ]
    });
  });

  it("defers a claim until accepted Booking reschedule projection is current", async () => {
    const fixture = await createBookingWorkItemFixture();
    const nextStartAt = "2026-08-12T12:00:00.000Z";
    const expectedDueAt = "2026-08-11T12:00:00.000Z";
    const lifecycleEvent = await rescheduleBookingProjectionSubject(fixture, nextStartAt);
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-booking-projection-lag",
        leaseDurationMs: 30_000,
        executorKeys: ["astrologer_work_item:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toBeNull();
    await expect(selectExecution(fixture.runId)).resolves.toMatchObject({
      token: { state: "runnable", attempt_counter: "0" },
      attempts: [],
      events: []
    });

    await expect(
      createDrizzleFlowBookingLifecycleStore(runtime.database, {
        instanceId: randomUUID(),
        sessionId: randomUUID()
      }).processBookingLifecycleEvent({
        lifecycleEventId: lifecycleEvent.id,
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).resolves.toMatchObject({
      outcome: "rescheduled",
      appliedRevision: 2,
      affectedRunCount: 1,
      affectedWorkItemCount: 0
    });

    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-booking-projection-current",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    expect(claim).toMatchObject({
      enrollmentSnapshot: { subject: { startAt: fixture.startAt } },
      effectiveRunSnapshot: { subject: { startAt: nextStartAt } },
      bookingLifecycleContext: { bookingId: fixture.bookingId, appliedRevision: 2 }
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    expect(decision).toMatchObject({ workItem: { dueAt: expectedDueAt } });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
    await expect(
      runtime.pool.query(
        `select due_booking_lifecycle_revision, due_at
           from flow_work_items
          where flow_run_id = $1`,
        [fixture.runId]
      )
    ).resolves.toMatchObject({
      rows: [{ due_booking_lifecycle_revision: 2, due_at: new Date(expectedDueAt) }]
    });
  });

  it("rolls back the human work item with the token transition when its event insert fails", async () => {
    const fixture = await createWorkItemFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-work-item-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await installFlowEventInsertFailure();
    try {
      const failure = await store.finalize({ claim, decision }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const [afterFailure, workItemCount] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query<{ count: string }>(
        "select count(*)::text as count from flow_work_items where flow_run_id = $1",
        [fixture.runId]
      )
    ]);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-work-item-rollback",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    expect(workItemCount.rows).toEqual([{ count: "0" }]);

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
    await expect(
      runtime.pool.query<{ count: string }>(
        "select count(*)::text as count from flow_work_items where flow_run_id = $1",
        [fixture.runId]
      )
    ).resolves.toMatchObject({ rows: [{ count: "1" }] });
  });

  it("does not create a human work item for an expired stale finalize", async () => {
    const fixture = await createWorkItemFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-work-item-expired",
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expireClaimedToken(fixture.tokenId);

    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const [afterStaleFinalize, workItemCount] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query<{ count: string }>(
        "select count(*)::text as count from flow_work_items where flow_run_id = $1",
        [fixture.runId]
      )
    ]);
    expect(afterStaleFinalize.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleFinalize.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-work-item-expired",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterStaleFinalize.attempts).toEqual([]);
    expect(afterStaleFinalize.events).toEqual([]);
    expect(workItemCount.rows).toEqual([{ count: "0" }]);
  });

  it("lists work items only inside the authenticated owner scope", async () => {
    const owned = await createWaitingWorkItemFixture();
    const foreign = await createWaitingWorkItemFixture();
    const store = createDrizzleFlowWorkItemStore(runtime.database);

    await expect(
      listOwnerFlowWorkItems({
        store,
        ownerUserId: owned.ownerUserId,
        query: { status: "active", limit: 50, offset: 0 }
      })
    ).resolves.toMatchObject({
      total: 1,
      asOf: expect.any(String),
      items: [
        {
          workItem: { id: owned.workItemId, flowRunId: owned.runId, status: "pending" },
          context: {
            status: "integrity_error",
            code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
          }
        }
      ]
    });
    await expect(
      startFlowWorkItem({
        store,
        actorUserId: owned.ownerUserId,
        ownerUserId: owned.ownerUserId,
        workItemId: foreign.workItemId,
        idempotencyKey: "foreign-work-item-start-1",
        request: { expectedRevision: 1 }
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: { statusCode: 404, body: { code: "FLOW_WORK_ITEM_NOT_FOUND" } }
      }
    });
  });

  it("builds a deterministic active queue without future snoozed work", async () => {
    const pending = await createWaitingWorkItemFixture();
    const inProgress = await createWaitingWorkItemFixture(pending.ownerUserId);
    const dueSnooze = await createWaitingWorkItemFixture(pending.ownerUserId);
    const futureSnooze = await createWaitingWorkItemFixture(pending.ownerUserId);
    const store = createDrizzleFlowWorkItemStore(runtime.database);

    await startWaitingWorkItem(inProgress, "active-queue-start-1");
    await snoozeFlowWorkItem({
      store,
      actorUserId: pending.ownerUserId,
      ownerUserId: pending.ownerUserId,
      workItemId: dueSnooze.workItemId,
      idempotencyKey: "active-queue-due-snooze-1",
      request: {
        expectedRevision: 1,
        snoozedUntil: new Date(Date.now() + 100).toISOString()
      }
    });
    await snoozeFlowWorkItem({
      store,
      actorUserId: pending.ownerUserId,
      ownerUserId: pending.ownerUserId,
      workItemId: futureSnooze.workItemId,
      idempotencyKey: "active-queue-future-snooze-1",
      request: {
        expectedRevision: 1,
        snoozedUntil: new Date(Date.now() + 86_400_000).toISOString()
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const active = await listOwnerFlowWorkItems({
      store,
      ownerUserId: pending.ownerUserId,
      query: { status: "active", limit: 50, offset: 0 }
    });
    expect(active.items.map(({ workItem }) => workItem.id)).toEqual([
      inProgress.workItemId,
      pending.workItemId,
      dueSnooze.workItemId
    ]);
    expect(active.total).toBe(3);
    expect(active.items.some(({ workItem }) => workItem.id === futureSnooze.workItemId)).toBe(
      false
    );

    await expect(
      listOwnerFlowWorkItems({
        store,
        ownerUserId: pending.ownerUserId,
        query: { status: "active", limit: 1, offset: 10 }
      })
    ).resolves.toMatchObject({ items: [], total: 3, asOf: expect.any(String) });
  });

  it("wakes an elapsed snooze exactly once while its run and token stay waiting", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const commandStore = createDrizzleFlowWorkItemStore(runtime.database);
    const wakeStore = createDrizzleFlowWorkItemWakeStore(runtime.database);
    const scheduledFor = new Date(Date.now() + 100).toISOString();
    await snoozeFlowWorkItem({
      store: commandStore,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "wake-elapsed-snooze-1",
      request: { expectedRevision: 1, snoozedUntil: scheduledFor }
    });
    await runtime.pool.query("select pg_sleep(0.2)");

    const outcomes = await Promise.all([
      wakeStore.wakeDue({ limit: 10 }),
      wakeStore.wakeDue({ limit: 10 })
    ]);
    expect(outcomes.reduce((total, outcome) => total + outcome.wokenCount, 0)).toBe(1);
    expect(outcomes.every((outcome) => outcome.asOf.endsWith("Z"))).toBe(true);

    const [execution, workItem] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_work_items where id = $1", [fixture.workItemId])
    ]);
    expect(execution.run).toMatchObject({ status: "waiting", trace_sequence: "2" });
    expect(execution.token).toMatchObject({
      state: "waiting_work_item",
      node_id: "prepare-consultation",
      node_activation_sequence: "1"
    });
    expect(execution.events).toMatchObject([
      { sequence: "1", event_type: "token_waiting" },
      {
        sequence: "2",
        event_type: "work_item_available",
        attempt_id: null,
        command_id: null,
        summary: {
          outcome: "available",
          reasonCode: "FLOW_WORK_ITEM_SNOOZE_ELAPSED",
          workItemId: fixture.workItemId,
          fromRevision: 2,
          toRevision: 3,
          scheduledFor
        }
      }
    ]);
    expect(workItem.rows).toMatchObject([
      {
        status: "pending",
        revision: 3,
        snoozed_until: null,
        last_command_id: null,
        last_run_event_id: execution.events[1]?.id
      }
    ]);
  });

  it("fails closed without a wake event when the waiting runtime is incoherent", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const commandStore = createDrizzleFlowWorkItemStore(runtime.database);
    const scheduledFor = new Date(Date.now() + 100).toISOString();
    await snoozeFlowWorkItem({
      store: commandStore,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "wake-incoherent-snooze-1",
      request: { expectedRevision: 1, snoozedUntil: scheduledFor }
    });
    await runtime.pool.query(
      "update flow_execution_tokens set state = 'waiting_signal' where id = $1",
      [fixture.tokenId]
    );
    await runtime.pool.query("select pg_sleep(0.2)");

    await expect(
      createDrizzleFlowWorkItemWakeStore(runtime.database).wakeDue({ limit: 10 })
    ).resolves.toMatchObject({
      wokenCount: 0,
      integrityFailureCount: 1
    });
    const [workItem, eventCount] = await Promise.all([
      runtime.pool.query("select * from flow_work_items where id = $1", [fixture.workItemId]),
      runtime.pool.query<{ count: string }>(
        "select count(*)::text as count from flow_run_events where flow_run_id = $1",
        [fixture.runId]
      )
    ]);
    expect(workItem.rows).toMatchObject([{ status: "snoozed", revision: 2 }]);
    expect(eventCount.rows).toEqual([{ count: "1" }]);
  });

  it("starts, replays and snoozes a work item with optimistic revision authority", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const store = createDrizzleFlowWorkItemStore(runtime.database);

    const startInput = {
      store,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "start-work-item-command-1",
      request: { expectedRevision: 1 }
    } as const;
    await expect(startFlowWorkItem(startInput)).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: { body: { workItem: { status: "in_progress", revision: 2 } } }
      }
    });
    await expect(startFlowWorkItem(startInput)).resolves.toMatchObject({
      kind: "replayed",
      outcome: {
        kind: "succeeded",
        response: { body: { workItem: { status: "in_progress", revision: 2 } } }
      }
    });

    const snoozedUntil = new Date(Date.now() + 86_400_000).toISOString();
    await expect(
      snoozeFlowWorkItem({
        store,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: fixture.workItemId,
        idempotencyKey: "snooze-work-item-command-1",
        request: { expectedRevision: 2, snoozedUntil }
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          body: { workItem: { status: "snoozed", revision: 3, snoozedUntil } }
        }
      }
    });
    await expect(
      startFlowWorkItem({
        ...startInput,
        idempotencyKey: "start-work-item-command-2",
        request: { expectedRevision: 2 }
      })
    ).resolves.toMatchObject({
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: { code: "FLOW_WORK_ITEM_REVISION_CONFLICT", currentRevision: 3 }
        }
      }
    });
  });

  it("refuses to complete human work before the astrologer starts it", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const store = createDrizzleFlowWorkItemStore(runtime.database);

    await expect(
      completeFlowWorkItem({
        store,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: fixture.workItemId,
        idempotencyKey: "complete-pending-work-item-1",
        request: { expectedRevision: 1 }
      })
    ).resolves.toMatchObject({
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: { code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED", status: "pending" }
        }
      }
    });

    const execution = await selectExecution(fixture.runId);
    expect(execution.run).toMatchObject({ status: "waiting", trace_sequence: "1" });
    expect(execution.token).toMatchObject({
      state: "waiting_work_item",
      node_id: "prepare-consultation"
    });
  });

  it("persists and replays a required-summary rejection without advancing the pinned token", async () => {
    const fixture = await createWaitingBookingWorkItemFixture();
    const store = createDrizzleFlowWorkItemStore(runtime.database);
    await expect(
      listOwnerFlowWorkItems({
        store,
        ownerUserId: fixture.ownerUserId,
        query: { status: "active", limit: 50, offset: 0 }
      })
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          workItem: { id: fixture.workItemId },
          context: {
            status: "available",
            completionRequirements: { resultSummary: "required" }
          }
        }
      ]
    });
    await startWaitingWorkItem(fixture, "start-required-summary-work-item-1");
    const rejectedInput = {
      store,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "complete-required-summary-work-item-1",
      request: {
        expectedRevision: 2,
        expectedBookingLifecycleRevision: fixture.bookingLifecycleRevision
      }
    } as const;

    await expect(completeFlowWorkItem(rejectedInput)).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: { code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED" }
        }
      }
    });
    await expect(completeFlowWorkItem(rejectedInput)).resolves.toMatchObject({
      kind: "replayed",
      outcome: {
        kind: "rejected",
        response: { body: { code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED" } }
      }
    });

    const [waitingExecution, waitingWorkItem] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_work_items where id = $1", [fixture.workItemId])
    ]);
    expect(waitingExecution.run).toMatchObject({ status: "waiting", trace_sequence: "1" });
    expect(waitingExecution.token).toMatchObject({
      state: "waiting_work_item",
      node_id: "prepare-consultation",
      node_activation_sequence: "1"
    });
    expect(waitingWorkItem.rows).toMatchObject([{ status: "in_progress", revision: 2 }]);

    await expect(
      completeFlowWorkItem({
        ...rejectedInput,
        idempotencyKey: "complete-required-summary-work-item-2",
        request: {
          expectedRevision: 2,
          expectedBookingLifecycleRevision: fixture.bookingLifecycleRevision,
          resultSummary: "Карта и вопросы проверены"
        }
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          body: {
            workItem: {
              status: "completed",
              revision: 3,
              resultSummary: "Карта и вопросы проверены"
            }
          }
        }
      }
    });
    await expect(selectExecution(fixture.runId)).resolves.toMatchObject({
      run: { status: "running", current_node_id: "completed", trace_sequence: "2" },
      token: { state: "runnable", node_id: "completed", node_activation_sequence: "2" }
    });
  });

  it("rechecks a singleton birth profile, resumes the exact waiting booking run, and replays safely", async () => {
    const fixture = await createWaitingBirthDataCollectionFixture();
    const profileEvent = await persistBirthProfileRevision({
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.ownerUserId,
      ready: true
    });
    const store = createDrizzleFlowBirthProfileRecheckStore(runtime.database);

    await expect(store.recheck(profileEvent)).resolves.toEqual({
      sourceOutboxEventId: profileEvent.sourceOutboxEventId,
      profileHistoryId: profileEvent.event.birthDataHistoryId,
      outcome: "ready",
      replayed: false,
      affectedRunCount: 1
    });

    const [execution, workItem, receipts] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query(
        `select status, completed_by_user_id, result_summary, revision, last_command_id
           from flow_work_items where id = $1`,
        [fixture.workItemId]
      ),
      runtime.pool.query(
        `select outcome, birth_data_revision, source_outbox_event_id, flow_run_id
           from flow_birth_profile_recheck_receipts where flow_run_id = $1`,
        [fixture.runId]
      )
    ]);
    expect(execution.run).toMatchObject({
      status: "running",
      current_node_id: "birth-data",
      trace_sequence: "2"
    });
    expect(execution.token).toMatchObject({
      state: "runnable",
      node_id: "birth-data",
      node_activation_sequence: "2"
    });
    expect(execution.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "token_advanced",
          summary: expect.objectContaining({
            reasonCode: "FLOW_BIRTH_PROFILE_RECHECK_READY",
            sourceOutboxEventId: profileEvent.sourceOutboxEventId,
            birthDataHistoryId: profileEvent.event.birthDataHistoryId,
            birthDataRevision: 1,
            workItemId: fixture.workItemId
          })
        })
      ])
    );
    expect(JSON.stringify(execution.events)).not.toContain("1990-02-02");
    expect(workItem.rows).toEqual([
      {
        status: "completed",
        completed_by_user_id: null,
        result_summary: null,
        revision: 2,
        last_command_id: null
      }
    ]);
    expect(receipts.rows).toEqual([
      {
        outcome: "ready",
        birth_data_revision: 1,
        source_outbox_event_id: profileEvent.sourceOutboxEventId,
        flow_run_id: fixture.runId
      }
    ]);

    await expect(store.recheck(profileEvent)).resolves.toEqual({
      sourceOutboxEventId: profileEvent.sourceOutboxEventId,
      profileHistoryId: profileEvent.event.birthDataHistoryId,
      outcome: "ready",
      replayed: true,
      affectedRunCount: 1
    });
    await expect(selectExecution(fixture.runId)).resolves.toMatchObject({
      run: { status: "running", current_node_id: "birth-data", trace_sequence: "2" },
      token: { state: "runnable", node_id: "birth-data", node_activation_sequence: "2" }
    });
  });

  it("records a not-ready singleton profile without resolving its birth-data task", async () => {
    const fixture = await createWaitingBirthDataCollectionFixture();
    const profileEvent = await persistBirthProfileRevision({
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.ownerUserId,
      ready: false
    });

    await expect(
      createDrizzleFlowBirthProfileRecheckStore(runtime.database).recheck(profileEvent)
    ).resolves.toEqual({
      sourceOutboxEventId: profileEvent.sourceOutboxEventId,
      profileHistoryId: profileEvent.event.birthDataHistoryId,
      outcome: "not_ready",
      replayed: false,
      affectedRunCount: 0
    });
    await expect(selectExecution(fixture.runId)).resolves.toMatchObject({
      run: { status: "waiting", current_node_id: "collect-birth-data", trace_sequence: "1" },
      token: {
        state: "waiting_work_item",
        node_id: "collect-birth-data",
        node_activation_sequence: "1"
      }
    });
    await expect(
      runtime.pool.query(
        `select status, completed_by_user_id, revision from flow_work_items where id = $1`,
        [fixture.workItemId]
      )
    ).resolves.toMatchObject({
      rows: [{ status: "pending", completed_by_user_id: null, revision: 1 }]
    });
  });

  it("does not recheck a profile for an archived client-astrologer relationship", async () => {
    const fixture = await createWaitingBirthDataCollectionFixture();
    const profileEvent = await persistBirthProfileRevision({
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.ownerUserId,
      ready: true
    });
    await runtime.pool.query(
      `update client_astrologer_relationships
          set status = 'archived', archived_at = transaction_timestamp()
        where client_user_id = $1 and astrologer_user_id = $2`,
      [fixture.clientUserId, fixture.ownerUserId]
    );

    await expect(
      createDrizzleFlowBirthProfileRecheckStore(runtime.database).recheck(profileEvent)
    ).resolves.toEqual({
      sourceOutboxEventId: profileEvent.sourceOutboxEventId,
      profileHistoryId: profileEvent.event.birthDataHistoryId,
      outcome: "stale",
      replayed: false,
      affectedRunCount: 0
    });
    await expect(selectExecution(fixture.runId)).resolves.toMatchObject({
      run: { status: "waiting", current_node_id: "collect-birth-data", trace_sequence: "1" },
      token: { state: "waiting_work_item", node_id: "collect-birth-data" }
    });
    await expect(
      runtime.pool.query(
        "select count(*)::text as count from flow_birth_profile_recheck_receipts where flow_run_id = $1",
        [fixture.runId]
      )
    ).resolves.toMatchObject({ rows: [{ count: "0" }] });
  });

  it("hides mixed Booking revisions and fences work-item commands until reschedule projection is current", async () => {
    const fixture = await createWaitingBookingWorkItemFixture();
    const store = createDrizzleFlowWorkItemStore(runtime.database);
    const lifecycleEvent = await rescheduleBookingProjectionSubject(
      fixture,
      "2026-08-12T12:00:00.000Z"
    );

    await expect(
      listOwnerFlowWorkItems({
        store,
        ownerUserId: fixture.ownerUserId,
        query: { status: "active", limit: 50, offset: 0 }
      })
    ).resolves.toMatchObject({
      items: [
        {
          workItem: { id: fixture.workItemId, revision: 1, dueAt: fixture.expectedDueAt },
          context: {
            status: "context_pending",
            code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
            bookingId: fixture.bookingId,
            appliedRevision: 1,
            aggregateRevision: 2
          }
        }
      ]
    });
    await expect(
      startFlowWorkItem({
        store,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: fixture.workItemId,
        idempotencyKey: "start-booking-work-item-projection-pending-1",
        request: { expectedRevision: 1, expectedBookingLifecycleRevision: 1 }
      })
    ).resolves.toMatchObject({
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
            bookingId: fixture.bookingId,
            appliedRevision: 1,
            aggregateRevision: 2
          }
        }
      }
    });

    await createDrizzleFlowBookingLifecycleStore(runtime.database, {
      instanceId: randomUUID(),
      sessionId: randomUUID()
    }).processBookingLifecycleEvent({
      lifecycleEventId: lifecycleEvent.id,
      latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
      futureSkewToleranceMs: 5 * 60 * 1_000
    });

    await expect(
      listOwnerFlowWorkItems({
        store,
        ownerUserId: fixture.ownerUserId,
        query: { status: "active", limit: 50, offset: 0 }
      })
    ).resolves.toMatchObject({
      items: [
        {
          workItem: {
            id: fixture.workItemId,
            revision: 2,
            dueAt: "2026-08-11T12:00:00.000Z"
          },
          context: {
            status: "available",
            booking: {
              id: fixture.bookingId,
              lifecycleRevision: 2,
              currentStartAt: "2026-08-12T12:00:00.000Z"
            }
          }
        }
      ]
    });
    await expect(
      startFlowWorkItem({
        store,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: fixture.workItemId,
        idempotencyKey: "start-booking-work-item-missing-context-1",
        request: { expectedRevision: 2 }
      })
    ).resolves.toMatchObject({
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
            currentBookingLifecycleRevision: 2
          }
        }
      }
    });
    await expect(
      startFlowWorkItem({
        store,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: fixture.workItemId,
        idempotencyKey: "start-booking-work-item-stale-context-1",
        request: { expectedRevision: 1, expectedBookingLifecycleRevision: 1 }
      })
    ).resolves.toMatchObject({
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: {
            code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
            currentBookingLifecycleRevision: 2
          }
        }
      }
    });
    await expect(
      startFlowWorkItem({
        store,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        workItemId: fixture.workItemId,
        idempotencyKey: "start-booking-work-item-current-context-1",
        request: { expectedRevision: 2, expectedBookingLifecycleRevision: 2 }
      })
    ).resolves.toMatchObject({
      outcome: {
        kind: "succeeded",
        response: { body: { workItem: { status: "in_progress", revision: 3 } } }
      }
    });
  });

  it("completes human work and resumes the same pinned token exactly once", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const workItemStore = createDrizzleFlowWorkItemStore(runtime.database);
    await startWaitingWorkItem(fixture, "start-work-item-before-completion-1");
    const completionInput = {
      store: workItemStore,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "complete-work-item-command-1",
      request: { expectedRevision: 2, resultSummary: "Подготовка завершена" }
    } as const;

    await expect(completeFlowWorkItem(completionInput)).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          body: {
            workItem: {
              id: fixture.workItemId,
              status: "completed",
              revision: 3,
              resultSummary: "Подготовка завершена",
              completedByUserId: fixture.ownerUserId
            }
          }
        }
      }
    });
    await expect(completeFlowWorkItem(completionInput)).resolves.toMatchObject({
      kind: "replayed",
      outcome: { kind: "succeeded", response: { body: { workItem: { revision: 3 } } } }
    });

    const resumed = await selectExecution(fixture.runId);
    expect(resumed.run).toMatchObject({
      status: "running",
      current_node_id: "completed",
      trace_sequence: "2"
    });
    expect(resumed.token).toMatchObject({
      id: fixture.tokenId,
      state: "runnable",
      node_id: "completed",
      node_kind: "completed",
      node_activation_sequence: "2",
      attempt_counter: "0"
    });
    expect(resumed.events).toMatchObject([
      { sequence: "1", event_type: "token_waiting" },
      {
        sequence: "2",
        event_type: "token_advanced",
        attempt_id: null,
        summary: {
          outcome: "advanced",
          nodeKind: "astrologer_work_item",
          reasonCode: "FLOW_WORK_ITEM_COMPLETED",
          sourceHandle: "success",
          targetNodeId: "completed",
          targetNodeKind: "completed"
        }
      }
    ]);
    expect(resumed.events[1]?.command_id).toBeTruthy();

    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const terminalClaim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-after-human-completion",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const terminalDecision = await interpretFlowExecutionClaim({
      claim: terminalClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      executionStore.finalize({ claim: terminalClaim, decision: terminalDecision })
    ).resolves.toMatchObject({ status: "applied", traceSequence: 3n });
  });

  it("rolls back work completion, command and token resume when its trace event fails", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const store = createDrizzleFlowWorkItemStore(runtime.database);
    await startWaitingWorkItem(fixture, "start-work-item-before-rollback-1");
    const completionInput = {
      store,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "complete-work-item-rollback-1",
      request: { expectedRevision: 2 }
    } as const;

    await installFlowEventInsertFailure();
    try {
      const failure = await completeFlowWorkItem(completionInput).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const [afterFailure, workItem, commandCount] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_work_items where id = $1", [fixture.workItemId]),
      runtime.pool.query<{ count: string }>(
        "select count(*)::text as count from flow_runtime_commands where idempotency_key = $1",
        [completionInput.idempotencyKey]
      )
    ]);
    expect(afterFailure.run).toMatchObject({
      status: "waiting",
      current_node_id: "prepare-consultation",
      trace_sequence: "1"
    });
    expect(afterFailure.token).toMatchObject({
      state: "waiting_work_item",
      node_id: "prepare-consultation",
      node_activation_sequence: "1"
    });
    expect(afterFailure.events).toHaveLength(1);
    expect(workItem.rows).toMatchObject([{ status: "in_progress", revision: 2 }]);
    expect(commandCount.rows).toEqual([{ count: "0" }]);

    await expect(completeFlowWorkItem(completionInput)).resolves.toMatchObject({
      kind: "created",
      outcome: { kind: "succeeded" }
    });
  });

  it("fails closed when a replayed work completion has lost its durable event", async () => {
    const fixture = await createWaitingWorkItemFixture();
    await startWaitingWorkItem(fixture, "start-work-item-before-missing-event-1");
    const completionInput = {
      store: createDrizzleFlowWorkItemStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey: "complete-work-item-missing-event-1",
      request: { expectedRevision: 2 }
    } as const;

    await expect(completeFlowWorkItem(completionInput)).resolves.toMatchObject({
      kind: "created",
      outcome: { kind: "succeeded" }
    });
    const commandId = await removeCommandEvent(completionInput.idempotencyKey);

    await runtime.pool.query(
      "ALTER TABLE flow_runtime_commands DISABLE TRIGGER flow_runtime_commands_immutable_identity"
    );
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE flow_runtime_commands SET updated_at = updated_at WHERE id = $1", [
        commandId
      ]);
      await expect(client.query("COMMIT")).rejects.toMatchObject({
        constraint: "flow_runtime_command_event_consistency"
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await runtime.pool.query(
        "ALTER TABLE flow_runtime_commands ENABLE TRIGGER flow_runtime_commands_immutable_identity"
      );
    }

    await expect(completeFlowWorkItem(completionInput)).rejects.toBeInstanceOf(
      FlowRuntimeCommandIntegrityError
    );
  });

  it("cancels the active human work item with its owning run command", async () => {
    const fixture = await createWaitingWorkItemFixture();

    await expect(
      cancelDurableFlowRun({
        store: createDrizzleFlowRunCancellationStore(runtime.database),
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-run-with-work-item-1",
        request: {}
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: { body: { run: { id: fixture.runId, status: "canceled" } } }
      }
    });

    const [execution, workItem] = await Promise.all([
      selectExecution(fixture.runId),
      runtime.pool.query("select * from flow_work_items where id = $1", [fixture.workItemId])
    ]);
    expect(execution.token).toMatchObject({ state: "canceled" });
    expect(execution.run).toMatchObject({ status: "canceled", trace_sequence: "2" });
    expect(execution.events).toMatchObject([
      { sequence: "1", event_type: "token_waiting" },
      { sequence: "2", event_type: "run_canceled" }
    ]);
    expect(workItem.rows).toMatchObject([
      { status: "canceled", revision: 2, canceled_at: expect.any(Date) }
    ]);
    expect(workItem.rows[0]?.last_command_id).toBe(execution.events[1]?.command_id);
  });

  it("fails closed when a replayed cancellation has lost its durable event", async () => {
    const fixture = await createWaitingWorkItemFixture();
    const cancellationInput = {
      store: createDrizzleFlowRunCancellationStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId,
      idempotencyKey: "cancel-run-missing-event-1",
      request: {}
    } as const;

    await expect(cancelDurableFlowRun(cancellationInput)).resolves.toMatchObject({
      kind: "created",
      outcome: { kind: "succeeded" }
    });
    await removeCommandEvent(cancellationInput.idempotencyKey);

    await expect(cancelDurableFlowRun(cancellationInput)).rejects.toBeInstanceOf(
      FlowRuntimeCommandIntegrityError
    );
  });

  it("resets node-local attempts while preserving the run-wide fence on the next activation", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const firstClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-first-activation",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const advanceDecision = await interpretFlowExecutionClaim({
      claim: firstClaim,
      registry: createBirthDataRegistry()
    });
    await expect(
      store.finalize({ claim: firstClaim, decision: advanceDecision })
    ).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const secondClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-second-activation",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(secondClaim).toMatchObject({
      tokenId: fixture.tokenId,
      nodeId: "completed",
      nodeActivationSequence: 2n,
      attemptNumber: 1n,
      fencingToken: 2n
    });
    const terminalDecision = await interpretFlowExecutionClaim({
      claim: secondClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      store.finalize({ claim: secondClaim, decision: terminalDecision })
    ).resolves.toMatchObject({ status: "applied", traceSequence: 2n });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "completed",
      current_node_id: "completed",
      trace_sequence: "2"
    });
    expect(persisted.token).toMatchObject({
      id: fixture.tokenId,
      state: "completed",
      node_activation_sequence: "2",
      attempt_counter: "1",
      fencing_token: "2"
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "birth-data",
        node_activation_sequence: "1",
        attempt_number: "1",
        fencing_token: "1",
        outcome: "advanced"
      },
      {
        node_id: "completed",
        node_activation_sequence: "2",
        attempt_number: "1",
        fencing_token: "2",
        outcome: "completed"
      }
    ]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "token_advanced" },
      { sequence: "2", event_type: "run_completed" }
    ]);
  });

  it("derives an advance target from the persisted definition instead of a worker claim", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-persisted-target",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const persistedDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });
    const forgedGraph = flowGraphV2Schema.parse({
      ...advancingGraph,
      edges: advancingGraph.edges.map((edge) => {
        if (edge.id === "birth-yes") return { ...edge, targetNodeId: "suppressed" };
        if (edge.id === "birth-no") return { ...edge, targetNodeId: "completed" };
        return edge;
      })
    });
    const forgedClaim: FlowExecutionClaim = {
      ...claim,
      graph: forgedGraph,
      capabilityManifest: requireCapabilityManifest(forgedGraph)
    };
    const forgedDecision = await interpretFlowExecutionClaim({
      claim: forgedClaim,
      registry: createBirthDataRegistry()
    });

    await expect(store.finalize({ claim: forgedClaim, decision: forgedDecision })).rejects.toThrow(
      "decision target does not match persisted graph"
    );
    const afterRejection = await selectExecution(fixture.runId);
    expect(afterRejection.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterRejection.token).toMatchObject({
      node_id: "birth-data",
      state: "claimed",
      node_activation_sequence: "1",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterRejection.attempts).toEqual([]);
    expect(afterRejection.events).toEqual([]);

    await expect(store.finalize({ claim, decision: persistedDecision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });
  });

  it("uses the post-validation claim clock for both token and run chronology", async () => {
    const fixture = await createTerminalFixture();
    const barrier = delayNextDatabaseTransaction();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    try {
      const claimPromise = store.claimNext({
        leaseOwner: "flows-worker-post-validation-clock",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      });
      await barrier.entered.promise;
      await runtime.pool.query("select pg_sleep(0.05)");
      barrier.release.resolve();

      const result = await claimPromise;
      if (!result || result.status !== "claimed") raise("Expected one claim");
      const persisted = await selectExecution(fixture.runId);

      expect(persisted.token?.updated_at.toISOString()).toBe(result.claim.claimedAt);
      expect(persisted.run?.updated_at.toISOString()).toBe(result.claim.claimedAt);
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  });

  it("rejects success finalization that acquires its token lock after the lease deadline", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-success-deadline",
      leaseDurationMs: 750,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      runAfterBlockedLeaseExpiry(fixture.tokenId, claim.leaseExpiresAt, () =>
        store.finalize({ claim, decision })
      )
    ).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  }, 10_000);

  it("rejects failure finalization that acquires its token lock after the lease deadline", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-failure-deadline",
      leaseDurationMs: 750,
      executorKeys: ["completed:1:1"]
    });

    await expect(
      runAfterBlockedLeaseExpiry(fixture.tokenId, claim.leaseExpiresAt, () =>
        store.finalizeFailure({
          claim,
          failure: {
            classification: "retryable",
            reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
          }
        })
      )
    ).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  }, 10_000);

  it("skips a locked earlier token instead of blocking later runnable work", async () => {
    const earlier = await createTerminalFixture({ availableAt: "2026-08-03T08:00:00.000Z" });
    const later = await createTerminalFixture({ availableAt: "2026-08-03T08:01:00.000Z" });
    const locker = await runtime.pool.connect();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    try {
      await locker.query("begin");
      await locker.query("select id from flow_execution_tokens where id = $1 for update", [
        earlier.tokenId
      ]);

      const claimPromise = store.claimNext({
        leaseOwner: "flows-worker-skip-locked",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      });
      const result = await Promise.race([
        claimPromise,
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 1_000))
      ]);

      expect(result).not.toBe("timeout");
      expect(result).toMatchObject({ status: "claimed", claim: { tokenId: later.tokenId } });
      await locker.query("rollback");
      await claimPromise;
    } finally {
      await locker.query("rollback").catch(() => undefined);
      locker.release();
      await runtime.pool.query("delete from users where id = any($1::uuid[])", [
        [earlier.ownerUserId, later.ownerUserId]
      ]);
    }
  });

  it("quarantines a token pinned to unsupported interpreter semantics", async () => {
    const fixture = await createTerminalFixture({
      allowInvalidDefinitionShape: true,
      capabilityManifest: {
        ...capabilityManifest,
        executionSemanticsVersion: "flow-interpreter.v2"
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-unsupported-interpreter",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      tokenId: fixture.tokenId,
      reasonCode: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      failure_disposition: "quarantined",
      failure_reason_code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
    });
    expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "1" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "run_failed", attempt_id: null }
    ]);
  });

  it("uses a post-lock clock when quarantining poison work", async () => {
    const fixture = await createTerminalFixture({
      allowInvalidDefinitionShape: true,
      capabilityManifest: {
        ...capabilityManifest,
        executionSemanticsVersion: "flow-interpreter.v2"
      }
    });
    const barrier = delayNextDatabaseTransaction();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    try {
      const quarantinePromise = store.claimNext({
        leaseOwner: "flows-worker-poison-clock",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      });
      await barrier.entered.promise;
      await runtime.pool.query("select pg_sleep(0.05)");
      const newerState = await runtime.pool.query<{ updated_at: Date }>(
        "update flow_execution_tokens set updated_at = clock_timestamp() where id = $1 returning updated_at",
        [fixture.tokenId]
      );
      barrier.release.resolve();

      await expect(quarantinePromise).resolves.toMatchObject({ status: "quarantined" });
      const persisted = await selectExecution(fixture.runId);
      const priorUpdatedAt = newerState.rows[0]?.updated_at ?? raise("Expected token update time");

      expect(persisted.token?.terminal_at.getTime()).toBeGreaterThanOrEqual(
        priorUpdatedAt.getTime()
      );
      expect(persisted.token?.updated_at.getTime()).toBeGreaterThanOrEqual(
        priorUpdatedAt.getTime()
      );
      expect(persisted.events[0]?.occurred_at.getTime()).toBeGreaterThanOrEqual(
        priorUpdatedAt.getTime()
      );
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  });

  it("quarantines a graph-manifest snapshot whose executor set was truncated", async () => {
    const fixture = await createTerminalFixture({
      capabilityManifest: {
        ...capabilityManifest,
        nodeExecutors: []
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-manifest-preflight",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      reasonCode: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
    });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      failure_disposition: "quarantined"
    });
  });

  it("quarantines a token whose pinned graph node metadata disagrees", async () => {
    const fixture = await createTerminalFixture({
      allowInvalidDefinitionShape: true,
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === "completed" ? { ...node, configSchemaVersion: 2 } : node
        )
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-graph-preflight",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      reasonCode: "FLOW_PINNED_GRAPH_INVALID"
    });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      failure_disposition: "quarantined"
    });
  });

  it("quarantines an invalid pinned graph before persisting a lease", async () => {
    const fixture = await createTerminalFixture({
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === "completed" ? { ...node, config: {} } : node))
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-graph-validation",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      reasonCode: "FLOW_PINNED_GRAPH_INVALID"
    });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      lease_owner: null,
      failure_disposition: "quarantined"
    });
  });

  it("removes an earlier poison token so the next runnable token can be claimed", async () => {
    const poison = await createTerminalFixture({
      availableAt: "2026-08-03T08:00:00.000Z",
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === "completed" ? { ...node, config: {} } : node))
      }
    });
    const healthy = await createTerminalFixture({ availableAt: "2026-08-03T08:01:00.000Z" });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-poison-first",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({ status: "quarantined", tokenId: poison.tokenId });
    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-after-poison",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "claimed",
      claim: { tokenId: healthy.tokenId }
    });
  });

  it("persists a typed retry, respects its database due time and reclaims it", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const firstClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-typed-retry-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });

    const result = await store.finalizeFailure({
      claim: firstClaim,
      failure: {
        classification: "retryable",
        reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
      }
    });
    expect(result).toMatchObject({
      status: "applied",
      disposition: "retry_scheduled",
      traceSequence: 1n
    });
    if (result.status !== "applied" || !result.availableAt) raise("Expected retry due time");
    expect(new Date(result.availableAt).getTime()).toBeGreaterThan(Date.now());
    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-too-early",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toBeNull();

    const retryState = await selectExecution(fixture.runId);
    expect(retryState.run).toMatchObject({ status: "failed_retryable", trace_sequence: "1" });
    expect(retryState.token).toMatchObject({
      state: "retry_scheduled",
      failure_disposition: "retry_scheduled",
      failure_reason_code: "FLOW_NODE_EXECUTION_RETRYABLE",
      max_attempts: 3
    });
    expect(retryState.attempts).toMatchObject([
      { outcome: "retry_scheduled", result_code: "FLOW_EXECUTION_RETRY_SCHEDULED" }
    ]);
    expect(retryState.events).toMatchObject([
      { event_type: "token_retry_scheduled", sequence: "1" }
    ]);

    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [fixture.tokenId]
    );
    const retryClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-typed-retry-2",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(retryClaim).toMatchObject({ attemptNumber: 2n, fencingToken: 2n });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "claimed",
      failure_disposition: null,
      failure_reason_code: null
    });
  });

  it("enforces the exact retry V1 tuple and state-specific counter invariants", async () => {
    const fixture = await createTerminalFixture();

    await expect(
      runtime.pool.query("update flow_execution_tokens set max_attempts = 20 where id = $1", [
        fixture.tokenId
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'claimed', claimed_at = transaction_timestamp(),
                lease_owner = 'invalid-zero-claim',
                lease_expires_at = transaction_timestamp() + interval '1 minute'
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 3, fencing_token = 3,
                failure_disposition = 'retry_scheduled',
                failure_reason_code = 'FLOW_NODE_EXECUTION_RETRYABLE'
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                failure_disposition = 'retry_scheduled',
                failure_reason_code = 'FLOW_NODE_EXECUTION_REJECTED'
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const missingRetryDisposition = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                failure_disposition = null,
                failure_reason_code = 'FLOW_NODE_EXECUTION_RETRYABLE'
          where id = $1`,
        [missingRetryDisposition.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const missingRetryReason = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                failure_disposition = 'retry_scheduled', failure_reason_code = null
          where id = $1`,
        [missingRetryReason.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const missingTerminalReason = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'failed', attempt_counter = 1, fencing_token = 1,
                failure_disposition = 'failed_terminal', failure_reason_code = null,
                terminal_at = transaction_timestamp()
          where id = $1`,
        [missingTerminalReason.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("quarantines a claimable token whose persisted failure metadata is incomplete", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_failure_state_check
    `);

    try {
      await runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                available_at = transaction_timestamp() - interval '1 second',
                failure_disposition = null, failure_reason_code = null
          where id = $1`,
        [fixture.tokenId]
      );
      await runtime.pool.query("update flow_runs set status = 'failed_retryable' where id = $1", [
        fixture.runId
      ]);

      await expect(
        store.claimNext({
          leaseOwner: "flows-worker-invalid-retry-metadata",
          leaseDurationMs: 30_000,
          executorKeys: ["completed:1:1"],
          ownerScope: { kind: "all" }
        })
      ).resolves.toMatchObject({ status: "quarantined", tokenId: fixture.tokenId });

      const persisted = await selectExecution(fixture.runId);
      expect(persisted.token).toMatchObject({
        state: "failed",
        failure_disposition: "quarantined",
        failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
      });
      expect(persisted.attempts).toEqual([]);
    } finally {
      await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
      await restoreFailureStateConstraint();
    }
  });

  it("allows one defensive retry for an unknown failure, then fails terminally", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const firstClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-unknown-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expect(
      store.finalizeFailure({
        claim: firstClaim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
        }
      })
    ).resolves.toMatchObject({ disposition: "retry_scheduled" });

    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [fixture.tokenId]
    );
    const secondClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-unknown-2",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expect(
      store.finalizeFailure({
        claim: secondClaim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
        }
      })
    ).resolves.toMatchObject({
      disposition: "failed_terminal",
      availableAt: null,
      traceSequence: 2n
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "2" });
    expect(persisted.token).toMatchObject({
      state: "failed",
      attempt_counter: "2",
      failure_disposition: "failed_terminal",
      failure_reason_code: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE",
      quarantined_at: null
    });
    expect(persisted.attempts.map((attempt) => attempt.outcome)).toEqual([
      "retry_scheduled",
      "failed"
    ]);
  });

  it("quarantines a deterministic post-claim integrity failure and fences stale success", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-integrity-failure",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      store.finalizeFailure({
        claim,
        failure: {
          classification: "permanent",
          reasonCode: "FLOW_RUNTIME_TRACE_INVALID"
        }
      })
    ).resolves.toMatchObject({ disposition: "quarantined", traceSequence: 1n });
    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "failed",
      failure_disposition: "quarantined",
      failure_reason_code: "FLOW_RUNTIME_TRACE_INVALID"
    });
    expect(persisted.token?.quarantined_at).not.toBeNull();
    expect(JSON.stringify(persisted)).not.toContain("private");
  });

  it("exhausts the immutable three-attempt budget with bounded equal jitter", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    for (const attemptNumber of [1, 2] as const) {
      const claim = await claimExecution(store, {
        leaseOwner: `flows-worker-budget-${attemptNumber}`,
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      });
      const result = await store.finalizeFailure({
        claim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
        }
      });
      expect(result).toMatchObject({
        status: "applied",
        disposition: "retry_scheduled",
        traceSequence: BigInt(attemptNumber)
      });

      const retryState = await selectExecution(fixture.runId);
      const availableAt = retryState.token?.available_at as Date | undefined;
      const updatedAt = retryState.token?.updated_at as Date | undefined;
      if (!availableAt || !updatedAt) raise("Expected persisted retry timestamps");
      const delayMs = availableAt.getTime() - updatedAt.getTime();
      const cappedDelayMs = 1_000 * 2 ** (attemptNumber - 1);
      expect(delayMs).toBeGreaterThanOrEqual(cappedDelayMs / 2);
      expect(delayMs).toBeLessThanOrEqual(cappedDelayMs);

      await runtime.pool.query(
        "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
        [fixture.tokenId]
      );
    }

    const finalClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-budget-3",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(finalClaim).toMatchObject({ attemptNumber: 3n, fencingToken: 3n });
    await expireClaimedToken(fixture.tokenId);

    await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
      recoveredCount: 1,
      retryScheduledCount: 0,
      failedTerminalCount: 1,
      quarantinedCount: 0
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "3" });
    expect(persisted.token).toMatchObject({
      state: "failed",
      attempt_counter: "3",
      failure_disposition: "failed_terminal",
      failure_reason_code: "FLOW_TOKEN_LEASE_EXPIRED",
      fencing_token: "4"
    });
    expect(
      persisted.attempts.map(({ attempt_number, fencing_token, outcome, result_code }) => ({
        attempt_number,
        fencing_token,
        outcome,
        result_code
      }))
    ).toEqual([
      {
        attempt_number: "1",
        fencing_token: "1",
        outcome: "retry_scheduled",
        result_code: "FLOW_EXECUTION_RETRY_SCHEDULED"
      },
      {
        attempt_number: "2",
        fencing_token: "2",
        outcome: "retry_scheduled",
        result_code: "FLOW_EXECUTION_RETRY_SCHEDULED"
      },
      {
        attempt_number: "3",
        fencing_token: "3",
        outcome: "failed",
        result_code: "FLOW_EXECUTION_RETRY_EXHAUSTED"
      }
    ]);
    expect(persisted.events.map(({ sequence, event_type }) => ({ sequence, event_type }))).toEqual([
      { sequence: "1", event_type: "token_retry_scheduled" },
      { sequence: "2", event_type: "token_retry_scheduled" },
      { sequence: "3", event_type: "run_failed" }
    ]);
  });

  it("quarantines an invalid expired claim instead of poisoning every recovery sweep", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_attempt_counter_check,
        DROP CONSTRAINT flow_execution_tokens_fencing_token_check,
        DROP CONSTRAINT IF EXISTS flow_execution_tokens_counter_state_check
    `);

    try {
      await runtime.pool.query(
        `update flow_execution_tokens
            set state = 'claimed', claimed_at = transaction_timestamp() - interval '1 minute',
                lease_owner = 'flows-worker-invalid-recovery',
                lease_expires_at = transaction_timestamp() - interval '1 second'
          where id = $1`,
        [fixture.tokenId]
      );

      await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
        recoveredCount: 1,
        retryScheduledCount: 0,
        failedTerminalCount: 0,
        quarantinedCount: 1
      });
      const persisted = await selectExecution(fixture.runId);
      expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "1" });
      expect(persisted.token).toMatchObject({
        state: "failed",
        attempt_counter: "0",
        failure_disposition: "quarantined",
        failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
      });
      expect(persisted.attempts).toEqual([]);
      expect(persisted.events).toMatchObject([
        {
          event_type: "run_failed",
          attempt_id: null,
          summary: { reasonCode: "FLOW_TOKEN_RUNTIME_STATE_INVALID" }
        }
      ]);
    } finally {
      await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
      await runtime.pool.query(`
        ALTER TABLE flow_execution_tokens
          ADD CONSTRAINT flow_execution_tokens_attempt_counter_check CHECK (
            attempt_counter BETWEEN 0 AND max_attempts
          ),
          ADD CONSTRAINT flow_execution_tokens_fencing_token_check CHECK (
            fencing_token >= attempt_counter
          ),
          ADD CONSTRAINT flow_execution_tokens_counter_state_check CHECK (
            (state NOT IN ('runnable', 'retry_scheduled') OR attempt_counter < max_attempts)
            AND (state NOT IN ('claimed', 'retry_scheduled') OR attempt_counter > 0)
          )
      `);
    }
  });

  it("quarantines an expired claim whose claim timestamp is after its lease deadline", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_lease_state_check
    `);

    try {
      await runtime.pool.query(
        `update flow_execution_tokens
            set state = 'claimed',
                claimed_at = transaction_timestamp() + interval '1 minute',
                lease_owner = 'flows-worker-invalid-lease-order',
                lease_expires_at = transaction_timestamp() - interval '1 second',
                attempt_counter = 1, fencing_token = 1
          where id = $1`,
        [fixture.tokenId]
      );

      await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
        recoveredCount: 1,
        retryScheduledCount: 0,
        failedTerminalCount: 0,
        quarantinedCount: 1
      });
      const persisted = await selectExecution(fixture.runId);
      expect(persisted.token).toMatchObject({
        state: "failed",
        attempt_counter: "1",
        failure_disposition: "quarantined",
        failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
      });
      expect(persisted.attempts).toEqual([]);
      expect(persisted.events).toMatchObject([
        {
          event_type: "run_failed",
          attempt_id: null,
          summary: { reasonCode: "FLOW_TOKEN_RUNTIME_STATE_INVALID" }
        }
      ]);
    } finally {
      await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
      await restoreLeaseStateConstraint();
    }
  });

  it("quarantines a claimed token whose entire persisted lease clock is future-dated", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(
      `update flow_execution_tokens
          set state = 'claimed',
              claimed_at = clock_timestamp() + interval '1 minute',
              lease_owner = 'flows-worker-future-clock',
              lease_expires_at = clock_timestamp() + interval '2 minutes',
              attempt_counter = 1, fencing_token = 1,
              updated_at = clock_timestamp() + interval '1 minute'
        where id = $1`,
      [fixture.tokenId]
    );

    await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
      recoveredCount: 1,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 1
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "failed",
      failure_disposition: "quarantined",
      failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
    });
    expect(persisted.attempts).toEqual([]);
  });

  it("does not recover a live claim committed after the recovery transaction began", async () => {
    const fixture = await createTerminalFixture();
    const barrier = delayNextDatabaseTransaction();
    const recoveryStore = createDrizzleFlowExecutionStore(runtime.database);

    try {
      const recoveryPromise = recoveryStore.recoverExpired({ limit: 10 });
      await barrier.entered.promise;
      await runtime.pool.query("select pg_sleep(0.05)");
      const claim = await claimExecution(createDrizzleFlowExecutionStore(runtime.database), {
        leaseOwner: "flows-worker-after-recovery-start",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      });
      barrier.release.resolve();

      await expect(recoveryPromise).resolves.toEqual({
        recoveredCount: 0,
        retryScheduledCount: 0,
        failedTerminalCount: 0,
        quarantinedCount: 0
      });
      const persisted = await selectExecution(fixture.runId);
      expect(persisted.token).toMatchObject({
        state: "claimed",
        attempt_counter: "1",
        fencing_token: claim.fencingToken.toString(),
        lease_owner: claim.leaseOwner
      });
      expect(persisted.attempts).toEqual([]);
      expect(persisted.events).toEqual([]);
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  });

  it("recovers one expired lease, increments its fence and rejects the stale worker", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const staleClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-stale",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expireClaimedToken(fixture.tokenId);

    const recovered = await Promise.all([
      store.recoverExpired({ limit: 10 }),
      store.recoverExpired({ limit: 10 })
    ]);
    expect(recovered.reduce((sum, value) => sum + value.recoveredCount, 0)).toBe(1);
    expect(recovered.reduce((sum, value) => sum + value.retryScheduledCount, 0)).toBe(1);
    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [fixture.tokenId]
    );

    const freshClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-fresh",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(freshClaim.fencingToken).toBe(3n);
    expect(freshClaim.attemptNumber).toBe(2n);

    const staleDecision = await interpretFlowExecutionClaim({
      claim: staleClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(store.finalize({ claim: staleClaim, decision: staleDecision })).resolves.toEqual({
      status: "stale"
    });

    const freshDecision = await interpretFlowExecutionClaim({
      claim: freshClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      store.finalize({ claim: freshClaim, decision: freshDecision })
    ).resolves.toMatchObject({
      status: "applied",
      traceSequence: 2n
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "completed", trace_sequence: "2" });
    expect(persisted.attempts).toMatchObject([
      { attempt_number: "1", fencing_token: "1", outcome: "lease_expired" },
      { attempt_number: "2", fencing_token: "3", outcome: "completed" }
    ]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "token_lease_expired" },
      { sequence: "2", event_type: "run_completed" }
    ]);
  });

  it("rejects finalize after the database lease deadline before recovery runs", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-expired-before-recovery",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expireClaimedToken(fixture.tokenId);

    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const afterStaleFinalize = await selectExecution(fixture.runId);
    expect(afterStaleFinalize.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleFinalize.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-expired-before-recovery",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterStaleFinalize.attempts).toEqual([]);
    expect(afterStaleFinalize.events).toEqual([]);
    await expect(store.recoverExpired({ limit: 10 })).resolves.toMatchObject({
      recoveredCount: 1,
      retryScheduledCount: 1,
      failedTerminalCount: 0
    });
  });

  it("treats owner, lease, activation, fence and node metadata mismatches as stale with zero writes", async () => {
    const fixture = await createTerminalFixture();
    const otherOwnerUserId = await createUser();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-cas",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      store.finalize({ claim: { ...claim, ownerUserId: otherOwnerUserId }, decision })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({ claim: { ...claim, leaseOwner: "flows-worker-other" }, decision })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({
        claim: { ...claim, nodeActivationSequence: claim.nodeActivationSequence + 1n },
        decision
      })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({ claim: { ...claim, fencingToken: claim.fencingToken + 1n }, decision })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({
        claim: { ...claim, nodeId: "different-node" },
        decision: { ...decision, sourceNodeId: "different-node" }
      })
    ).resolves.toEqual({ status: "stale" });

    const afterStaleWrites = await selectExecution(fixture.runId);
    expect(afterStaleWrites.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleWrites.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(afterStaleWrites.attempts).toEqual([]);
    expect(afterStaleWrites.events).toEqual([]);
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("treats failure owner, lease, activation, fence and node mismatches as stale with zero writes", async () => {
    const fixture = await createTerminalFixture();
    const otherOwnerUserId = await createUser();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-failure-cas",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const failure = {
      classification: "retryable" as const,
      reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE" as const
    };

    await expect(
      store.finalizeFailure({ claim: { ...claim, ownerUserId: otherOwnerUserId }, failure })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({ claim: { ...claim, leaseOwner: "flows-worker-other" }, failure })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({
        claim: { ...claim, nodeActivationSequence: claim.nodeActivationSequence + 1n },
        failure
      })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({
        claim: { ...claim, fencingToken: claim.fencingToken + 1n },
        failure
      })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({ claim: { ...claim, nodeId: "different-node" }, failure })
    ).resolves.toEqual({ status: "stale" });

    const afterStaleWrites = await selectExecution(fixture.runId);
    expect(afterStaleWrites.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleWrites.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(afterStaleWrites.attempts).toEqual([]);
    expect(afterStaleWrites.events).toEqual([]);
    await expect(store.finalizeFailure({ claim, failure })).resolves.toMatchObject({
      status: "applied",
      disposition: "retry_scheduled"
    });
  });

  it("persists attempt audit lineage from the locked database row", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-db-audit",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    const callerAlteredClaim = {
      ...claim,
      attemptNumber: claim.attemptNumber + 100n,
      claimedAt: "2000-01-01T00:00:00.000Z"
    };

    await expect(store.finalize({ claim: callerAlteredClaim, decision })).resolves.toMatchObject({
      status: "applied"
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0]).toMatchObject({
      attempt_number: "1",
      fencing_token: "1"
    });
    expect(persisted.attempts[0]?.started_at.toISOString()).toBe(claim.claimedAt);
  });

  it("rejects attempt history outside the retry budget or its fence lineage", async () => {
    const overBudgetFixture = await createTerminalFixture();
    const overBudgetClaim = await claimExecution(
      createDrizzleFlowExecutionStore(runtime.database),
      {
        leaseOwner: "flows-worker-attempt-budget",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      }
    );
    await expect(
      insertRawCompletedAttempt(overBudgetFixture, overBudgetClaim, 4, 4)
    ).rejects.toMatchObject({ code: "23514" });

    const invalidFenceFixture = await createTerminalFixture();
    const invalidFenceClaim = await claimExecution(
      createDrizzleFlowExecutionStore(runtime.database),
      {
        leaseOwner: "flows-worker-attempt-fence",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      }
    );
    await expect(
      insertRawCompletedAttempt(invalidFenceFixture, invalidFenceClaim, 2, 1)
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces positive activation identity and node-local attempt uniqueness", async () => {
    const invalidTokenFixture = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        "update flow_execution_tokens set node_activation_sequence = 0 where id = $1",
        [invalidTokenFixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const invalidAttemptClaim = await claimExecution(
      createDrizzleFlowExecutionStore(runtime.database),
      {
        leaseOwner: "flows-worker-invalid-activation",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      }
    );
    await expect(
      insertRawCompletedAttempt(
        invalidTokenFixture,
        { ...invalidAttemptClaim, nodeActivationSequence: 0n },
        1,
        1
      )
    ).rejects.toMatchObject({ code: "23514" });

    await insertRawCompletedAttempt(invalidTokenFixture, invalidAttemptClaim, 1, 1);
    await expect(
      insertRawCompletedAttempt(invalidTokenFixture, invalidAttemptClaim, 1, 2)
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "flow_execution_attempts_token_activation_attempt_unique"
    });
  });

  it("allows only one causal run event for each execution attempt", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-one-causal-event",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const persisted = await selectExecution(fixture.runId);
    const attemptId = persisted.attempts[0]?.id ?? raise("Expected persisted attempt");

    await expect(
      runtime.pool.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary, occurred_at)
         values ($1, $2, 2, 'run_completed', 'completed', $3, $4, clock_timestamp())`,
        [fixture.ownerUserId, fixture.runId, attemptId, decision.trace]
      )
    ).rejects.toMatchObject({ code: "23505", constraint: "flow_run_events_attempt_unique" });
  });

  it("rejects malformed advanced attempt and event traces", async () => {
    const fixture = await createAdvancingFixture();
    const claim = await claimExecution(createDrizzleFlowExecutionStore(runtime.database), {
      leaseOwner: "flows-worker-malformed-advance",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });
    const attemptId = randomUUID();
    const malformedAttemptTrace = { ...decision.trace, sourceHandle: true };
    const malformedEventTrace = { ...decision.trace, selectedEdgeId: 123 };
    const insertAttempt = (trace: Record<string, unknown>) =>
      runtime.pool.query(
        `insert into flow_execution_attempts
          (id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary, started_at, completed_at, created_at)
         values ($1, $2, $3, $4, $5, 'birth-data', 'birth_data_available:1:1', 1, 1, 1,
           $6, 'advanced', 'FLOW_TOKEN_ADVANCED', $7, $8, clock_timestamp(), clock_timestamp())`,
        [
          attemptId,
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          claim.leaseOwner,
          trace,
          claim.claimedAt
        ]
      );

    await expect(insertAttempt(malformedAttemptTrace)).rejects.toMatchObject({ code: "23514" });
    await insertAttempt(decision.trace);
    await expect(
      runtime.pool.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary, occurred_at)
         values ($1, $2, 1, 'token_advanced', 'birth-data', $3, $4, clock_timestamp())`,
        [fixture.ownerUserId, fixture.runId, attemptId, malformedEventTrace]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects completed token and audit state for a non-terminal node", async () => {
    const fixture = await createAdvancingFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'completed', terminal_at = clock_timestamp()
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_execution_tokens_completed_node_check"
    });

    const claim = await claimExecution(createDrizzleFlowExecutionStore(runtime.database), {
      leaseOwner: "flows-worker-invalid-terminal-audit",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const invalidTerminalTrace = {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "terminal",
      nodeKind: "birth_data_available",
      reasonCode: "FLOW_GOAL_REACHED",
      resultCode: "invalid_early_completion"
    };
    await expect(
      runtime.pool.query(
        `insert into flow_execution_attempts
          (owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary, started_at, completed_at, created_at)
         values ($1, $2, $3, $4, 'birth-data', 'birth_data_available:1:1', 1, 1, 1,
           $5, 'completed', 'invalid_early_completion', $6, $7, clock_timestamp(),
           clock_timestamp())`,
        [
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          claim.leaseOwner,
          invalidTerminalTrace,
          claim.claimedAt
        ]
      )
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_execution_attempts_trace_summary_schema_check"
    });
  });

  it("rejects non-redacted trace data before changing the claimed token", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-atomic",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    const invalidDecision = {
      ...decision,
      trace: {
        ...decision.trace,
        birthData: { date: "1990-01-02", place: "Moscow" }
      }
    } as unknown as FlowExecutionDecision;

    await expect(store.finalize({ claim, decision: invalidDecision })).rejects.toThrow(
      "FLOW_RUNTIME_TRACE_INVALID"
    );
    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-atomic",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("rejects an unknown decision discriminator before opening a database transaction", async () => {
    await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-unknown-decision",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const transactionSpy = vi.spyOn(runtime.database, "transaction");

    try {
      await expect(
        store.finalize({
          claim,
          decision: {
            kind: "waiting",
            sourceNodeId: claim.nodeId,
            resultCode: "unexpected_terminal",
            trace: {
              schemaVersion: "flow-runtime-trace.v1",
              outcome: "terminal",
              nodeKind: "completed",
              reasonCode: "FLOW_GOAL_REACHED",
              resultCode: "unexpected_terminal"
            }
          } as never
        })
      ).rejects.toThrow("FLOW_RUNTIME_TRACE_INVALID");
      expect(transactionSpy).not.toHaveBeenCalled();
    } finally {
      transactionSpy.mockRestore();
    }
  });

  it("rejects terminal completion from a persisted non-terminal node with zero writes", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-early-terminal",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const decision: FlowExecutionDecision = {
      kind: "terminal",
      sourceNodeId: claim.nodeId,
      terminalStatus: "completed",
      resultCode: "invalid_early_completion",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: "birth_data_available",
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: "invalid_early_completion"
      }
    };

    await expect(store.finalize({ claim, decision })).rejects.toThrow("FLOW_RUNTIME_TRACE_INVALID");
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", node_id: "birth-data" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  });

  it("derives terminal completion from the persisted completed-node goal", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-persisted-terminal",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const forgedClaim: FlowExecutionClaim = {
      ...claim,
      graph: flowGraphV2Schema.parse({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.kind === "completed" ? { ...node, config: { goalKey: "forged_completion" } } : node
        )
      })
    };
    const forgedDecision: FlowExecutionDecision = {
      kind: "terminal",
      sourceNodeId: claim.nodeId,
      terminalStatus: "completed",
      resultCode: "forged_completion",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: "completed",
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: "forged_completion"
      }
    };

    await expect(store.finalize({ claim: forgedClaim, decision: forgedDecision })).rejects.toThrow(
      "FLOW_RUNTIME_TRACE_INVALID"
    );
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", node_id: "completed" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  });

  it("rolls back token, run and attempt writes when the final event insert fails", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-event-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await installFlowEventInsertFailure();
    try {
      const failure = await store.finalize({ claim, decision }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-event-rollback",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("rolls back an advance when its causal event cannot be persisted", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-advance-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });

    await installFlowEventInsertFailure();
    try {
      const failure = await store.finalize({ claim, decision }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({
      status: "running",
      current_node_id: "birth-data",
      trace_sequence: "0"
    });
    expect(afterFailure.token).toMatchObject({
      id: fixture.tokenId,
      node_id: "birth-data",
      state: "claimed",
      node_activation_sequence: "1",
      attempt_counter: "1",
      fencing_token: "1",
      lease_owner: "flows-worker-advance-rollback"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("rolls back expired-lease recovery when its trace event cannot be persisted", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await claimExecution(store, {
      leaseOwner: "flows-worker-recovery-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expireClaimedToken(fixture.tokenId);

    await installFlowEventInsertFailure();
    try {
      const failure = await store.recoverExpired({ limit: 10 }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-recovery-rollback",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    await expect(store.recoverExpired({ limit: 10 })).resolves.toMatchObject({
      recoveredCount: 1
    });
  });

  it("commits each recovered token independently so a later poison write cannot roll back it", async () => {
    const earlier = await createTerminalFixture({ availableAt: "2026-08-03T08:00:00.000Z" });
    const later = await createTerminalFixture({ availableAt: "2026-08-03T08:01:00.000Z" });
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await claimExecution(store, {
      leaseOwner: "flows-worker-recovery-first",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await claimExecution(store, {
      leaseOwner: "flows-worker-recovery-second",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '3 seconds',
              lease_expires_at = case id
            when $1::uuid then transaction_timestamp() - interval '2 seconds'
            when $2::uuid then transaction_timestamp() - interval '1 second'
            else lease_expires_at
          end
        where id = any($3::uuid[])`,
      [earlier.tokenId, later.tokenId, [earlier.tokenId, later.tokenId]]
    );

    await installFlowEventInsertFailure(later.runId);
    try {
      const failure = await store.recoverExpired({ limit: 2 }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const firstState = await selectExecution(earlier.runId);
    expect(firstState.run).toMatchObject({ status: "failed_retryable", trace_sequence: "1" });
    expect(firstState.token).toMatchObject({ state: "retry_scheduled", fencing_token: "2" });
    expect(firstState.attempts).toHaveLength(1);
    expect(firstState.events).toHaveLength(1);

    const secondState = await selectExecution(later.runId);
    expect(secondState.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(secondState.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-recovery-second",
      fencing_token: "1"
    });
    expect(secondState.attempts).toEqual([]);
    expect(secondState.events).toEqual([]);
  });

  it("enforces strict trace JSON and append-only history while allowing aggregate erasure", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-history",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const persisted = await selectExecution(fixture.runId);
    const attemptId = persisted.attempts[0]?.id ?? raise("Expected attempt id");
    const eventId = persisted.events[0]?.id ?? raise("Expected event id");

    await expect(
      runtime.pool.query(
        "update flow_execution_attempts set result_code = 'tampered' where id = $1",
        [attemptId]
      )
    ).rejects.toThrow("flow execution attempts are immutable");
    await expect(
      runtime.pool.query("delete from flow_run_events where id = $1", [eventId])
    ).rejects.toThrow("flow run events can only be deleted with their run");
    await expect(runtime.pool.query("truncate flow_run_events cascade")).rejects.toThrow(
      "flow run events are immutable"
    );
    await expect(runtime.pool.query("truncate flow_execution_attempts cascade")).rejects.toThrow(
      "flow execution attempts are immutable"
    );
    await expect(
      runtime.pool.query(
        `insert into flow_execution_attempts
          (owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary,
           started_at, completed_at, created_at)
         values ($1, $2, $3, $4, 'completed', 'completed:1:1', 1, 2, 2, 'attacker',
           'completed', 'consultation_prepared', $5, transaction_timestamp(),
           transaction_timestamp(), transaction_timestamp())`,
        [
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          { ...decision.trace, rawMessage: "private message" }
        ]
      )
    ).rejects.toThrow("flow_execution_attempts_trace_summary_schema_check");
    await expect(
      runtime.pool.query(
        `insert into flow_execution_attempts
          (owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary,
           started_at, completed_at, created_at)
         values ($1, $2, $3, $4, 'completed', 'completed:1:1', 1, 2, 2, 'attacker',
           'completed', null, $5, transaction_timestamp(),
           transaction_timestamp(), transaction_timestamp())`,
        [fixture.ownerUserId, fixture.runId, fixture.tokenId, fixture.flowVersionId, decision.trace]
      )
    ).rejects.toThrow('null value in column "result_code"');

    await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
    const erased = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from flow_runs where id = $1",
      [fixture.runId]
    );
    expect(erased.rows[0]?.count).toBe("0");
  });

  it("returns an owner-scoped ordered execution detail pinned to one immutable version", async () => {
    const fixture = await createTerminalFixture();
    const otherOwnerUserId = await createUser();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-detail",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });

    await expect(
      store.getRunDetail({ ownerUserId: otherOwnerUserId, runId: fixture.runId })
    ).resolves.toBeNull();
    await expect(
      store.getRunDetail({ ownerUserId: fixture.ownerUserId, runId: fixture.runId })
    ).resolves.toMatchObject({
      runId: fixture.runId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      flowVersionId: fixture.flowVersionId,
      graphSchemaVersion: "flow-graph.v2",
      status: "completed",
      token: { id: fixture.tokenId, state: "completed", fencingToken: 1n },
      attempts: [{ fencingToken: 1n, outcome: "completed" }],
      events: [{ sequence: 1n, eventType: "run_completed" }]
    });
  });

  it("fails closed when an attempt and its causal event disagree", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-causal-consistency",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    await runtime.pool.query(
      "ALTER TABLE flow_run_events DISABLE TRIGGER flow_run_events_immutable"
    );
    try {
      await runtime.pool.query(
        `UPDATE flow_run_events
            SET summary = jsonb_set(summary, '{resultCode}', '"different_result"'::jsonb)
          WHERE flow_run_id = $1`,
        [fixture.runId]
      );
    } finally {
      await runtime.pool.query(
        "ALTER TABLE flow_run_events ENABLE TRIGGER flow_run_events_immutable"
      );
    }

    await expect(
      store.getRunDetail({ ownerUserId: fixture.ownerUserId, runId: fixture.runId })
    ).rejects.toThrow("causal event does not match its execution attempt");
  });

  it("orders attempts by causal event sequence when timestamps and ids disagree", async () => {
    const fixture = await createAdvancingFixture();
    const firstAttemptId = "a0000000-0000-4000-8000-000000000002";
    const secondAttemptId = "a0000000-0000-4000-8000-000000000001";
    const currentClock = await runtime.pool.query<{ current_at: Date }>(
      `select greatest(run.updated_at, token.updated_at) + interval '1 millisecond' as current_at
         from flow_runs run
         join flow_execution_tokens token on token.flow_run_id = run.id
        where run.id = $1`,
      [fixture.runId]
    );
    const occurredAt =
      currentClock.rows[0]?.current_at.toISOString() ?? raise("Expected current runtime clock");
    const advancedTrace = {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "advanced",
      nodeKind: "birth_data_available",
      reasonCode: "FLOW_EDGE_SELECTED",
      resultCode: "FLOW_TOKEN_ADVANCED",
      sourceHandle: "true",
      selectedEdgeId: "birth-yes",
      targetNodeId: "completed",
      targetNodeKind: "completed"
    };
    const terminalTrace = {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "terminal",
      nodeKind: "completed",
      reasonCode: "FLOW_GOAL_REACHED",
      resultCode: "consultation_prepared"
    };
    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update flow_execution_tokens
            set node_id = 'completed', node_kind = 'completed',
                config_schema_version = 1, executor_contract_version = 1,
                executor_key = 'completed:1:1', state = 'completed',
                node_activation_sequence = 2, attempt_counter = 1, fencing_token = 2,
                terminal_at = $2, updated_at = $2
          where id = $1`,
        [fixture.tokenId, occurredAt]
      );
      await client.query(
        `update flow_runs
            set status = 'completed', current_node_id = 'completed', trace_sequence = 2,
                completed_at = $2, updated_at = $2
          where id = $1`,
        [fixture.runId, occurredAt]
      );
      await client.query(
        `insert into flow_execution_attempts
          (id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary, started_at, completed_at, created_at)
         values
          ($1, $3, $4, $5, $6, 'birth-data', 'birth_data_available:1:1',
           1, 1, 1, 'flows-worker-causal-1', 'advanced', 'FLOW_TOKEN_ADVANCED', $7, $9, $9, $9),
          ($2, $3, $4, $5, $6, 'completed', 'completed:1:1',
           2, 1, 2, 'flows-worker-causal-2', 'completed', 'consultation_prepared', $8, $9, $9, $9)`,
        [
          firstAttemptId,
          secondAttemptId,
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          advancedTrace,
          terminalTrace,
          occurredAt
        ]
      );
      await client.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary, occurred_at)
         values
          ($1, $2, 1, 'token_advanced', 'birth-data', $3, $5, $7),
          ($1, $2, 2, 'run_completed', 'completed', $4, $6, $7)`,
        [
          fixture.ownerUserId,
          fixture.runId,
          firstAttemptId,
          secondAttemptId,
          advancedTrace,
          terminalTrace,
          occurredAt
        ]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const detail = await createDrizzleFlowExecutionStore(runtime.database).getRunDetail({
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId
    });
    expect(detail?.attempts.map((attempt) => attempt.id)).toEqual([
      firstAttemptId,
      secondAttemptId
    ]);
    expect(detail?.events.map((event) => event.attemptId)).toEqual([
      firstAttemptId,
      secondAttemptId
    ]);
  });

  async function createTerminalFixture(
    input: {
      readonly allowInvalidDefinitionShape?: boolean;
      readonly availableAt?: string;
      readonly capabilityManifest?: unknown;
      readonly createRunSnapshot?: (context: {
        readonly flowVersionId: string;
        readonly sourceEventId: string;
        readonly subjectId: string;
        readonly occurredAt: string;
      }) => unknown;
      readonly graph?: unknown;
      readonly normalizedRuntimeEvent?: FlowNormalizedBookingConfirmedEventV1;
      readonly ownerUserId?: string;
      readonly runtimeEventSource?: "booking" | "manual";
      readonly runtimeEventSubjectId?: string;
      readonly runtimeEventSubjectType?: "booking" | "client";
      readonly initialNode?: {
        readonly id: string;
        readonly kind: FlowExecutionClaim["nodeKind"];
        readonly configSchemaVersion: number;
        readonly executorContractVersion: number;
      };
    } = {}
  ) {
    const ownerUserId = input.ownerUserId ?? (await createUser());
    const client = await runtime.pool.connect();
    const fixtureGraph = input.graph ?? graph;
    const initialNode = input.initialNode ?? {
      id: "completed",
      kind: "completed" as const,
      configSchemaVersion: 1,
      executorContractVersion: 1
    };
    let capabilityManifestConstraint: string | null = null;

    try {
      await client.query("begin");
      const flow = await client.query<{ id: string }>(
        `insert into flows
          (owner_user_id, name, origin, definition_state, approval_mode,
           revision, draft_graph, draft_presentation, created_at, updated_at)
         values ($1, 'Terminal runtime fixture', $2, 'draft', 'manual_approve',
           1, $3, $4, transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          { schemaVersion: "flow-definition-origin.v1", type: "blank" },
          fixtureGraph,
          {
            schemaVersion: "flow-presentation.v1",
            nodes: [
              { nodeId: "manual", position: { x: 80, y: 120 } },
              { nodeId: "completed", position: { x: 400, y: 120 } }
            ],
            viewport: { x: 0, y: 0, zoom: 1 }
          }
        ]
      );
      const flowId = flow.rows[0]?.id ?? raise("Expected flow id");
      capabilityManifestConstraint = input.allowInvalidDefinitionShape
        ? await suspendFlowVersionCapabilityManifestConstraint(client)
        : null;
      const version = await client.query<{ id: string }>(
        `insert into flow_versions
          (flow_id, owner_user_id, version, source_revision, approval_mode,
           graph_schema_version, graph, presentation, capability_manifest, published_at)
         values ($1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4, $5,
           transaction_timestamp())
         returning id`,
        [
          flowId,
          ownerUserId,
          fixtureGraph,
          {
            schemaVersion: "flow-presentation.v1",
            nodes: [
              { nodeId: "manual", position: { x: 80, y: 120 } },
              { nodeId: "completed", position: { x: 400, y: 120 } }
            ],
            viewport: { x: 0, y: 0, zoom: 1 }
          },
          input.capabilityManifest ?? capabilityManifest
        ]
      );
      const flowVersionId = version.rows[0]?.id ?? raise("Expected version id");
      await client.query(
        `update flows
            set definition_state = 'versioned',
                published_version_id = $2,
                published_at = (
                  select published_at from flow_versions where id = $2 and flow_id = $1
                ),
                updated_at = transaction_timestamp()
          where id = $1`,
        [flowId, flowVersionId]
      );
      const normalizedRuntimeEvent = input.normalizedRuntimeEvent;
      const sourceEventId = normalizedRuntimeEvent?.sourceEventId ?? `fixture:${randomUUID()}`;
      const subjectId =
        normalizedRuntimeEvent?.subjectId ?? input.runtimeEventSubjectId ?? randomUUID();
      const occurredAt = normalizedRuntimeEvent?.occurredAtUtc ?? new Date().toISOString();
      const runtimeEvent = await client.query<{ id: string }>(
        `insert into flow_runtime_events
          (owner_user_id, source, source_event_id, dedupe_key, event_kind,
           subject_type, subject_id, occurrence_key, occurred_at,
           payload_schema_version, payload_digest, payload, classification,
           redaction_version, retention_policy_id, ingestion_outcome, processed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $17)
         returning id`,
        [
          ownerUserId,
          normalizedRuntimeEvent?.source ?? input.runtimeEventSource ?? "manual",
          sourceEventId,
          normalizedRuntimeEvent?.dedupeKey ?? sourceEventId,
          normalizedRuntimeEvent?.eventKind ?? null,
          normalizedRuntimeEvent?.subjectType ?? input.runtimeEventSubjectType ?? "client",
          subjectId,
          normalizedRuntimeEvent?.occurrenceKey ?? null,
          occurredAt,
          normalizedRuntimeEvent?.payloadSchemaVersion ?? null,
          normalizedRuntimeEvent?.canonicalPayloadHash ?? null,
          normalizedRuntimeEvent?.allowlistedPayload ?? {},
          normalizedRuntimeEvent?.classification ?? null,
          normalizedRuntimeEvent?.redactionVersion ?? null,
          normalizedRuntimeEvent?.retentionPolicyId ?? null,
          normalizedRuntimeEvent ? "enrolled" : null,
          normalizedRuntimeEvent ? occurredAt : null
        ]
      );
      const runtimeEventId = runtimeEvent.rows[0]?.id ?? raise("Expected runtime event id");
      const run = await client.query<{ id: string }>(
        `insert into flow_runs
         (owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
           snapshot, current_node_id, created_at, updated_at)
         values ($1, $2, $3, $4, 'pending', $5, $6,
           transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          flowId,
          flowVersionId,
          runtimeEventId,
          input.createRunSnapshot?.({ flowVersionId, sourceEventId, subjectId, occurredAt }) ?? {
            schemaVersion: "flow-run-snapshot.v2",
            enrollment: {
              activationEpochId: randomUUID(),
              triggerNodeId: "manual",
              occurrenceKey: randomUUID(),
              policyKey: "once_per_occurrence",
              policyRevision: 1,
              rolloutPolicyRevision: 1,
              eventOccurredAt: occurredAt,
              enrolledAt: occurredAt
            },
            subject: {
              type: "booking",
              bookingId: randomUUID(),
              clientUserId: randomUUID(),
              productId: randomUUID(),
              startAt: occurredAt,
              endAt: occurredAt
            },
            executionAuthority: {
              basis: "current_entitlement",
              referenceId: randomUUID()
            }
          },
          initialNode.id
        ]
      );
      const runId = run.rows[0]?.id ?? raise("Expected run id");
      const token = await client.query<{ id: string }>(
        `insert into flow_execution_tokens
         (owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
           config_schema_version, executor_contract_version, executor_key, state,
           available_at, retry_policy_key, max_attempts, retry_base_delay_ms,
           retry_max_delay_ms, attempt_counter, fencing_token, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7,
           $8, 'runnable', coalesce($9::timestamptz, transaction_timestamp()),
           'flow-execution-retry.v1', $10, $11, $12, 0, 0,
           transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          runId,
          flowVersionId,
          initialNode.id,
          initialNode.kind,
          initialNode.configSchemaVersion,
          initialNode.executorContractVersion,
          `${initialNode.kind}:${initialNode.configSchemaVersion}:${initialNode.executorContractVersion}`,
          input.availableAt ?? null,
          3,
          1_000,
          60_000
        ]
      );
      const tokenId = token.rows[0]?.id ?? raise("Expected token id");
      await client.query("commit");
      if (capabilityManifestConstraint) {
        await restoreFlowVersionCapabilityManifestConstraint(client, capabilityManifestConstraint);
      }
      return { ownerUserId, flowId, flowVersionId, runId, tokenId, runtimeEventId };
    } catch (error) {
      await client.query("rollback");
      if (capabilityManifestConstraint) {
        await restoreFlowVersionCapabilityManifestConstraint(client, capabilityManifestConstraint);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function createAdvancingFixture() {
    return createTerminalFixture({
      graph: advancingGraph,
      initialNode: {
        id: "birth-data",
        kind: "birth_data_available",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: advancingCapabilityManifest
    });
  }

  async function createWorkItemFixture(ownerUserId?: string) {
    return createTerminalFixture({
      ownerUserId,
      graph: workItemGraph,
      initialNode: {
        id: "prepare-consultation",
        kind: "astrologer_work_item",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: workItemCapabilityManifest
    });
  }

  async function createApprovalFixture(ownerUserId?: string) {
    return createTerminalFixture({
      ownerUserId,
      graph: approvalGraph,
      initialNode: {
        id: "review-material",
        kind: "astrologer_approval",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: approvalCapabilityManifest
    });
  }

  async function createNatalAiApprovalFixture(ownerUserId?: string) {
    const fixture = await createTerminalFixture({
      ownerUserId,
      graph: natalAiApprovalGraph,
      initialNode: {
        id: "review-natal-ai",
        kind: "natal_chart_ai_draft",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: natalAiApprovalCapabilityManifest
    });
    const calculationId = randomUUID();
    const interpretationId = randomUUID();
    await runtime.pool.query(
      `insert into calculation_records
        (id, owner_user_id, module, mode, interpretation_mode, method_code, title, status,
         request_fingerprint, input_data, result_data, result_summary, result_checksum,
         created_at, updated_at)
       values ($1, $2, 'chart', 'individual', 'adult_natal', 'natal', 'Fixture natal chart', 'calculated',
         $3, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $4, now(), now())`,
      [calculationId, fixture.ownerUserId, `sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`]
    );
    await runtime.pool.query(
      `insert into calculation_interpretations
        (id, calculation_id, source, status, text, model_id, prompt_version,
         approved_at, created_at, updated_at)
       values ($1, $2, 'ai', 'draft', 'Полный неизменяемый текст черновика трактовки.', 'gpt-test',
         'chart.interpretationDraft@3', null, now(), now())`,
      [interpretationId, calculationId]
    );
    return { ...fixture, calculationId, interpretationId };
  }

  function createNatalAiDraftRegistry(input: {
    readonly calculationId: string;
    readonly interpretationId: string;
  }) {
    return createBuiltInFlowNodeExecutorRegistry({
      natalChartAiDraftRequester: {
        prepare: async () => ({
          calculationId: input.calculationId,
          interpretationId: input.interpretationId,
          sourceChecksum: `sha256:${"a".repeat(64)}`,
          contentChecksum: `sha256:${"b".repeat(64)}`,
          outputText: "Полный неизменяемый текст черновика трактовки.",
          preview: "Ключевые темы: ответственность и устойчивость."
        })
      }
    });
  }

  async function createChartWaitFixture(ownerUserId?: string) {
    const fixture = await createTerminalFixture({
      ownerUserId,
      graph: chartWaitGraph,
      initialNode: {
        id: "natal-chart",
        kind: "natal_chart_request",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: chartWaitCapabilityManifest
    });
    return { ...fixture, chartJobId: randomUUID() };
  }

  async function createMessagingWaitFixture(ownerUserId?: string) {
    const clientUserId = await createUser();
    const fixture = await createTerminalFixture({
      ownerUserId,
      graph: messagingWaitGraph,
      initialNode: {
        id: "send-message",
        kind: "send_message",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: messagingWaitCapabilityManifest,
      createRunSnapshot: ({ flowVersionId, subjectId, occurredAt }) => ({
        schemaVersion: "flow-run-snapshot.v2",
        enrollment: {
          activationEpochId: randomUUID(),
          triggerNodeId: "booking",
          occurrenceKey: randomUUID(),
          policyKey: "once_per_occurrence",
          policyRevision: 1,
          rolloutPolicyRevision: 1,
          eventOccurredAt: occurredAt,
          enrolledAt: occurredAt
        },
        subject: {
          type: "booking",
          bookingId: subjectId,
          clientUserId,
          productId: randomUUID(),
          startAt: occurredAt,
          endAt: occurredAt
        },
        executionAuthority: { basis: "current_entitlement", referenceId: flowVersionId }
      })
    });
    return { ...fixture, clientUserId, messageId: randomUUID() };
  }

  async function createBookingWorkItemFixture(ownerUserId?: string) {
    const resolvedOwnerUserId = ownerUserId ?? (await createUser());
    const bookingId = randomUUID();
    const clientUserId = await createUser();
    const startAt = "2026-08-10T10:00:00.000Z";
    const expectedDueAt = "2026-08-09T10:00:00.000Z";
    const projectionSubject = await createBookingProjectionSubject({
      ownerUserId: resolvedOwnerUserId,
      clientUserId,
      bookingId,
      startAt,
      endAt: "2026-08-10T11:00:00.000Z"
    });
    const fixture = await createTerminalFixture({
      ownerUserId: resolvedOwnerUserId,
      graph: bookingWorkItemGraph,
      initialNode: {
        id: "prepare-consultation",
        kind: "astrologer_work_item",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: bookingWorkItemCapabilityManifest,
      normalizedRuntimeEvent: projectionSubject.normalizedRuntimeEvent,
      runtimeEventSource: "booking",
      runtimeEventSubjectType: "booking",
      runtimeEventSubjectId: bookingId,
      createRunSnapshot: ({ subjectId, occurredAt }) => ({
        schemaVersion: "flow-run-snapshot.v2",
        enrollment: {
          activationEpochId: randomUUID(),
          triggerNodeId: "booking",
          occurrenceKey: bookingId,
          policyKey: "once_per_occurrence",
          policyRevision: 1,
          rolloutPolicyRevision: 1,
          eventOccurredAt: occurredAt,
          enrolledAt: occurredAt
        },
        subject: {
          type: "booking",
          bookingId: subjectId,
          clientUserId,
          productId: "10000000-0000-4000-8000-000000000001",
          startAt,
          endAt: "2026-08-10T11:00:00.000Z"
        },
        executionAuthority: {
          basis: "current_entitlement",
          referenceId: randomUUID()
        }
      })
    });
    await persistFixtureBookingLifecycleHead({
      lifecycleEvent: projectionSubject.lifecycleEvent,
      runtimeEventId: fixture.runtimeEventId
    });
    return {
      ...fixture,
      bookingId,
      clientUserId,
      startAt,
      endAt: "2026-08-10T11:00:00.000Z",
      expectedDueAt,
      bookingLifecycleRevision: 1
    };
  }

  async function createBirthDataCollectionBookingFixture(ownerUserId?: string) {
    const resolvedOwnerUserId = ownerUserId ?? (await createUser());
    const bookingId = randomUUID();
    const clientUserId = await createUser();
    const startAt = "2026-08-10T10:00:00.000Z";
    const endAt = "2026-08-10T11:00:00.000Z";
    const projectionSubject = await createBookingProjectionSubject({
      ownerUserId: resolvedOwnerUserId,
      clientUserId,
      bookingId,
      startAt,
      endAt
    });
    const fixture = await createTerminalFixture({
      ownerUserId: resolvedOwnerUserId,
      graph: birthDataCollectionWorkItemGraph,
      initialNode: {
        id: "collect-birth-data",
        kind: "astrologer_work_item",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: birthDataCollectionWorkItemCapabilityManifest,
      normalizedRuntimeEvent: projectionSubject.normalizedRuntimeEvent,
      runtimeEventSource: "booking",
      runtimeEventSubjectType: "booking",
      runtimeEventSubjectId: bookingId,
      createRunSnapshot: ({ subjectId, occurredAt }) => ({
        schemaVersion: "flow-run-snapshot.v2",
        enrollment: {
          activationEpochId: randomUUID(),
          triggerNodeId: "booking",
          occurrenceKey: bookingId,
          policyKey: "once_per_occurrence",
          policyRevision: 1,
          rolloutPolicyRevision: 1,
          eventOccurredAt: occurredAt,
          enrolledAt: occurredAt
        },
        subject: {
          type: "booking",
          bookingId: subjectId,
          clientUserId,
          productId: "10000000-0000-4000-8000-000000000001",
          startAt,
          endAt
        },
        executionAuthority: {
          basis: "current_entitlement",
          referenceId: randomUUID()
        }
      })
    });
    await persistFixtureBookingLifecycleHead({
      lifecycleEvent: projectionSubject.lifecycleEvent,
      runtimeEventId: fixture.runtimeEventId
    });
    return { ...fixture, bookingId, clientUserId, startAt, endAt };
  }

  async function createBookingProjectionSubject(input: {
    readonly ownerUserId: string;
    readonly clientUserId: string;
    readonly bookingId: string;
    readonly startAt: string;
    readonly endAt: string;
  }) {
    const lifecycleEvent = createBookingLifecycleEvent({
      id: randomUUID(),
      bookingId: input.bookingId,
      ownerUserId: input.ownerUserId,
      revision: 1,
      kind: "confirmed",
      actor: { kind: "system", userId: null },
      reasonCode: null,
      before: null,
      after: {
        startAt: input.startAt,
        endAt: input.endAt,
        timeZone: "Europe/Moscow"
      },
      occurredAt: new Date().toISOString()
    });
    const normalizedRuntimeEvent = normalizeBookingConfirmedFlowLifecycleEvent({
      lifecycleEvent,
      subject: {
        id: input.bookingId,
        ownerUserId: input.ownerUserId,
        clientUserId: input.clientUserId,
        productId: "10000000-0000-4000-8000-000000000001",
        state: "confirmed",
        source: "manual",
        startAt: input.startAt,
        endAt: input.endAt,
        timeZone: "Europe/Moscow"
      }
    });
    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into products
          (id, owner_user_id, type, status, title, price_minor, currency,
           execution_mode, payment_model, duration_minutes, participant_mode)
         values ($1, $2, 'single', 'active', 'Натальная консультация', 10000, 'RUB',
           'live', 'once', 60, 'solo')`,
        ["10000000-0000-4000-8000-000000000001", input.ownerUserId]
      );
      const schedule = await client.query<{ id: string }>(
        `insert into availability_schedules
          (owner_user_id, name, time_zone, is_default, version, start_interval_minutes,
           buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes,
           booking_horizon_days)
         values ($1, 'Default', 'Europe/Moscow', true, 1, 30, 0, 0, 0, 60)
         returning id`,
        [input.ownerUserId]
      );
      const scheduleId = schedule.rows[0]?.id ?? raise("Expected booking schedule id");
      const reservation = await client.query<{ id: string }>(
        `insert into schedule_reservations
          (owner_user_id, schedule_id, kind, lifecycle, service_start_at, service_end_at,
           occupied_start_at, occupied_end_at, source_aggregate_id)
         values ($1, $2, 'booking', 'active', $3, $4, $3, $4, $5)
         returning id`,
        [input.ownerUserId, scheduleId, input.startAt, input.endAt, input.bookingId]
      );
      const reservationId = reservation.rows[0]?.id ?? raise("Expected booking reservation id");
      await client.query(
        `insert into bookings
          (id, owner_user_id, client_user_id, product_id, reservation_id, source, state,
           lifecycle_revision,
           service_start_at, service_end_at, product_title_snapshot,
           duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot,
           currency_snapshot, time_zone_snapshot, policy_snapshot, client_data_requirements_snapshot)
         values ($1, $2, $3, $4, $5, 'manual', 'confirmed', 1, $6, $7,
           'Натальная консультация', 60, 'video', 10000, 'RUB', 'Europe/Moscow', '{}', $8::jsonb)`,
        [
          input.bookingId,
          input.ownerUserId,
          input.clientUserId,
          "10000000-0000-4000-8000-000000000001",
          reservationId,
          input.startAt,
          input.endAt,
          JSON.stringify({
            schemaVersion: "booking-client-data-requirements.v1",
            executionMode: "live",
            participantMode: "solo",
            requiredClientData: ["chart1"],
            methods: ["natal"]
          })
        ]
      );
      await client.query(
        `insert into booking_lifecycle_events
          (id, booking_id, owner_user_id, revision, event_kind, actor_kind,
           actor_user_id, reason_code, before_start_at, before_end_at, before_time_zone,
           after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at,
           created_at)
         values ($1, $2, $3, 1, 'confirmed', 'system', null, null, null, null, null,
           $4, $5, $6, $7, $8, $8)`,
        [
          lifecycleEvent.id,
          lifecycleEvent.bookingId,
          lifecycleEvent.ownerUserId,
          lifecycleEvent.after?.startAt,
          lifecycleEvent.after?.endAt,
          lifecycleEvent.after?.timeZone,
          lifecycleEvent.canonicalDigest,
          lifecycleEvent.occurredAt
        ]
      );
      await client.query(
        "insert into client_profiles (user_id, display_name_snapshot) values ($1, 'Мария')",
        [input.clientUserId]
      );
      await client.query("commit");
      return { lifecycleEvent, normalizedRuntimeEvent };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async function persistBirthProfileRevision(input: {
    readonly clientUserId: string;
    readonly astrologerUserId: string;
    readonly ready: boolean;
  }) {
    const birthDataId = randomUUID();
    const birthDataHistoryId = randomUUID();
    const sourceOutboxEventId = randomUUID();
    const occurredAt = "2026-08-09T10:00:00.000Z";
    const event = {
      schemaVersion: "client-birth-profile-updated.v1" as const,
      birthDataHistoryId,
      birthDataId,
      clientUserId: input.clientUserId,
      revision: 1,
      actorUserId: input.astrologerUserId,
      actorRole: "astrologer" as const,
      occurredAt
    };
    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into client_astrologer_relationships
          (client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at,
           created_at, updated_at)
         values ($1, $2, 'booking', 'active', $3, $3, $3, $3)`,
        [input.clientUserId, input.astrologerUserId, occurredAt]
      );
      await client.query(
        `insert into client_birth_data
          (id, client_user_id, birth_date, birth_time, birth_time_precision, birth_place_text,
           birth_country_code, birth_city, birth_timezone, birth_latitude, birth_longitude,
           source, revision, last_edited_by_user_id, last_edited_by_role, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, 'RU', 'Moscow', $7, $8, $9,
           'client_profile', 1, $10, 'astrologer', $11, $11)`,
        [
          birthDataId,
          input.clientUserId,
          input.ready ? "1990-02-02" : null,
          input.ready ? "12:00" : null,
          input.ready ? "exact" : "unknown",
          input.ready ? "Moscow" : null,
          input.ready ? "Europe/Moscow" : null,
          input.ready ? 55.7558 : null,
          input.ready ? 37.6173 : null,
          input.astrologerUserId,
          occurredAt
        ]
      );
      await client.query(
        `insert into client_birth_data_history
          (id, birth_data_id, client_user_id, revision, actor_user_id, actor_role, source,
           snapshot, recorded_at)
         values ($1, $2, $3, 1, $4, 'astrologer', 'client_profile', $5::jsonb, $6)`,
        [
          birthDataHistoryId,
          birthDataId,
          input.clientUserId,
          input.astrologerUserId,
          JSON.stringify({ schemaVersion: "client-birth-profile.v1", revision: 1 }),
          occurredAt
        ]
      );
      await client.query(
        `insert into outbox_events (id, event_type, aggregate_id, payload, available_at, created_at, updated_at)
         values ($1, $2, $3, $4::jsonb, $5, $5, $5)`,
        [
          sourceOutboxEventId,
          CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
          birthDataHistoryId,
          JSON.stringify(event),
          occurredAt
        ]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return { sourceOutboxEventId, event };
  }

  async function persistFixtureBookingLifecycleHead(input: {
    readonly lifecycleEvent: ReturnType<typeof createBookingLifecycleEvent>;
    readonly runtimeEventId: string;
  }): Promise<void> {
    const event = input.lifecycleEvent;
    if (!event.after) raise("Expected confirmed Booking lifecycle schedule");
    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into flow_booking_lifecycle_receipts
          (lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
           canonical_digest, outcome, flow_runtime_event_id, affected_run_count,
           affected_work_item_count, preserved_completed_work_item_count, processed_at)
         values ($1, $2, $3, 1, 'confirmed', $4, 'enrolled', $5, 1, 0, 0,
           transaction_timestamp())`,
        [event.id, event.bookingId, event.ownerUserId, event.canonicalDigest, input.runtimeEventId]
      );
      await client.query(
        `insert into flow_booking_lifecycle_heads
          (booking_id, owner_user_id, applied_revision, state, current_start_at,
           current_end_at, current_time_zone, last_lifecycle_event_id,
           last_canonical_digest, created_at, updated_at)
         values ($1, $2, 1, 'confirmed', $3, $4, $5, $6, $7,
           transaction_timestamp(), transaction_timestamp())`,
        [
          event.bookingId,
          event.ownerUserId,
          event.after.startAt,
          event.after.endAt,
          event.after.timeZone,
          event.id,
          event.canonicalDigest
        ]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async function rescheduleBookingProjectionSubject(
    fixture: Awaited<ReturnType<typeof createBookingWorkItemFixture>>,
    nextStartAt: string
  ) {
    const nextEndAt = new Date(Date.parse(nextStartAt) + 60 * 60 * 1_000).toISOString();
    const lifecycleEvent = createBookingLifecycleEvent({
      id: randomUUID(),
      bookingId: fixture.bookingId,
      ownerUserId: fixture.ownerUserId,
      revision: 2,
      kind: "rescheduled",
      actor: { kind: "astrologer", userId: fixture.ownerUserId },
      reasonCode: null,
      before: {
        startAt: fixture.startAt,
        endAt: fixture.endAt,
        timeZone: "Europe/Moscow"
      },
      after: { startAt: nextStartAt, endAt: nextEndAt, timeZone: "Europe/Moscow" },
      occurredAt: new Date().toISOString()
    });
    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      const reservation = await client.query(
        `update schedule_reservations reservation
            set service_start_at = $2, service_end_at = $3,
                occupied_start_at = $2, occupied_end_at = $3,
                updated_at = transaction_timestamp()
           from bookings booking
          where booking.id = $1
            and booking.owner_user_id = $4
            and reservation.id = booking.reservation_id
            and reservation.owner_user_id = booking.owner_user_id
            and reservation.lifecycle = 'active'
         returning reservation.id`,
        [fixture.bookingId, nextStartAt, nextEndAt, fixture.ownerUserId]
      );
      if (reservation.rowCount !== 1) raise("Expected one active Booking reservation");
      const booking = await client.query(
        `update bookings
            set service_start_at = $2, service_end_at = $3,
                lifecycle_revision = 2, updated_at = transaction_timestamp()
          where id = $1 and owner_user_id = $4 and lifecycle_revision = 1
         returning id`,
        [fixture.bookingId, nextStartAt, nextEndAt, fixture.ownerUserId]
      );
      if (booking.rowCount !== 1) raise("Expected Booking lifecycle revision one");
      await client.query(
        `insert into booking_lifecycle_events
          (id, booking_id, owner_user_id, revision, event_kind, actor_kind,
           actor_user_id, reason_code, before_start_at, before_end_at, before_time_zone,
           after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at,
           created_at)
         values ($1, $2, $3, 2, 'rescheduled', 'astrologer', $3, null, $4, $5, $6,
           $7, $8, $9, $10, $11, $11)`,
        [
          lifecycleEvent.id,
          lifecycleEvent.bookingId,
          lifecycleEvent.ownerUserId,
          lifecycleEvent.before?.startAt,
          lifecycleEvent.before?.endAt,
          lifecycleEvent.before?.timeZone,
          lifecycleEvent.after?.startAt,
          lifecycleEvent.after?.endAt,
          lifecycleEvent.after?.timeZone,
          lifecycleEvent.canonicalDigest,
          lifecycleEvent.occurredAt
        ]
      );
      await client.query("commit");
      return lifecycleEvent;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async function createWaitingWorkItemFixture(ownerUserId?: string) {
    const fixture = await createWorkItemFixture(ownerUserId);
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: `flows-worker-create-work-item-${fixture.tokenId}`,
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const result = await runtime.pool.query<{ id: string }>(
      "select id from flow_work_items where flow_run_id = $1",
      [fixture.runId]
    );
    const workItemId = result.rows[0]?.id ?? raise("Expected waiting work item id");
    return { ...fixture, workItemId };
  }

  async function createWaitingBookingWorkItemFixture(ownerUserId?: string) {
    const fixture = await createBookingWorkItemFixture(ownerUserId);
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: `flows-worker-create-booking-work-item-${fixture.tokenId}`,
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const result = await runtime.pool.query<{ id: string }>(
      "select id from flow_work_items where flow_run_id = $1",
      [fixture.runId]
    );
    const workItemId = result.rows[0]?.id ?? raise("Expected waiting booking work item id");
    return { ...fixture, workItemId };
  }

  async function createWaitingBirthDataCollectionFixture(ownerUserId?: string) {
    const fixture = await createBirthDataCollectionBookingFixture(ownerUserId);
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: `flows-worker-create-birth-data-work-item-${fixture.tokenId}`,
      leaseDurationMs: 30_000,
      executorKeys: ["astrologer_work_item:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const result = await runtime.pool.query<{ id: string }>(
      "select id from flow_work_items where flow_run_id = $1",
      [fixture.runId]
    );
    const workItemId = result.rows[0]?.id ?? raise("Expected waiting birth-data work item id");
    return { ...fixture, workItemId };
  }

  async function startWaitingWorkItem(
    fixture: {
      readonly ownerUserId: string;
      readonly workItemId: string;
      readonly bookingLifecycleRevision?: number;
    },
    idempotencyKey: string
  ): Promise<void> {
    const result = await startFlowWorkItem({
      store: createDrizzleFlowWorkItemStore(runtime.database),
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      workItemId: fixture.workItemId,
      idempotencyKey,
      request: {
        expectedRevision: 1,
        ...(fixture.bookingLifecycleRevision === undefined
          ? {}
          : { expectedBookingLifecycleRevision: fixture.bookingLifecycleRevision })
      }
    });
    if (
      result.outcome.kind !== "succeeded" ||
      result.outcome.response.body.workItem.status !== "in_progress"
    ) {
      raise("Expected waiting work item to start");
    }
  }

  async function suspendFlowVersionCapabilityManifestConstraint(
    client: import("pg").PoolClient
  ): Promise<string> {
    const result = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'flow_versions'::regclass
          AND conname = 'flow_versions_capability_manifest_schema_check'`
    );
    const definition = result.rows[0]?.definition;
    if (!definition) raise("Expected flow version capability-manifest constraint");
    await client.query(
      "ALTER TABLE flow_versions DROP CONSTRAINT flow_versions_capability_manifest_schema_check"
    );
    return definition;
  }

  async function restoreFlowVersionCapabilityManifestConstraint(
    client: import("pg").PoolClient,
    definition: string
  ): Promise<void> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_constraint
          WHERE conrelid = 'flow_versions'::regclass
            AND conname = 'flow_versions_capability_manifest_schema_check'
       ) AS exists`
    );
    if (result.rows[0]?.exists) return;
    await client.query(
      `ALTER TABLE flow_versions
         ADD CONSTRAINT flow_versions_capability_manifest_schema_check
         ${definition} NOT VALID`
    );
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function removeCommandEvent(idempotencyKey: string): Promise<string> {
    const command = await runtime.pool.query<{ id: string }>(
      "SELECT id FROM flow_runtime_commands WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    const commandId = command.rows[0]?.id ?? raise("Expected runtime command id");
    await runtime.pool.query(
      "ALTER TABLE flow_run_events DISABLE TRIGGER flow_run_events_immutable"
    );
    try {
      const deleted = await runtime.pool.query(
        "DELETE FROM flow_run_events WHERE command_id = $1 RETURNING id",
        [commandId]
      );
      if (deleted.rowCount !== 1) raise("Expected one command event");
    } finally {
      await runtime.pool.query(
        "ALTER TABLE flow_run_events ENABLE TRIGGER flow_run_events_immutable"
      );
    }
    return commandId;
  }

  async function selectExecution(runId: string) {
    const [run, token, attempts, events] = await Promise.all([
      runtime.pool.query("select * from flow_runs where id = $1", [runId]),
      runtime.pool.query("select * from flow_execution_tokens where flow_run_id = $1", [runId]),
      runtime.pool.query(
        "select * from flow_execution_attempts where flow_run_id = $1 order by completed_at, id",
        [runId]
      ),
      runtime.pool.query("select * from flow_run_events where flow_run_id = $1 order by sequence", [
        runId
      ])
    ]);
    return {
      run: run.rows[0] ?? null,
      token: token.rows[0] ?? null,
      attempts: attempts.rows,
      events: events.rows
    };
  }

  async function runAfterBlockedLeaseExpiry<T>(
    tokenId: string,
    leaseExpiresAt: string,
    transition: () => Promise<T>
  ): Promise<T> {
    const blocker = await runtime.pool.connect();
    let released = false;
    try {
      await blocker.query("begin");
      await blocker.query("select id from flow_execution_tokens where id = $1 for update", [
        tokenId
      ]);
      const pendingTransition = transition();
      const waitMs = Math.max(0, new Date(leaseExpiresAt).getTime() - Date.now() + 150);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      await blocker.query("rollback");
      released = true;
      return await pendingTransition;
    } finally {
      if (!released) await blocker.query("rollback").catch(() => undefined);
      blocker.release();
    }
  }

  function delayNextDatabaseTransaction() {
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const originalTransaction = runtime.database.transaction.bind(runtime.database);
    const spy = vi.spyOn(runtime.database, "transaction");
    spy.mockImplementationOnce(((callback, config) =>
      originalTransaction(async (transaction) => {
        entered.resolve();
        await release.promise;
        return callback(transaction);
      }, config)) as typeof runtime.database.transaction);

    return { entered, release, restore: () => spy.mockRestore() };
  }

  async function expireClaimedToken(tokenId: string): Promise<void> {
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '2 seconds',
              lease_expires_at = transaction_timestamp() - interval '1 second'
        where id = $1`,
      [tokenId]
    );
  }

  function createDeferred<T>() {
    let resolve!: (value?: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise as (value?: T | PromiseLike<T>) => void;
    });
    return { promise, resolve };
  }

  async function insertRawCompletedAttempt(
    fixture: Awaited<ReturnType<typeof createTerminalFixture>>,
    claim: FlowExecutionClaim,
    attemptNumber: number,
    fencingToken: number
  ) {
    return runtime.pool.query(
      `insert into flow_execution_attempts
        (owner_user_id, flow_run_id, token_id, flow_version_id, node_id,
         executor_key, node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
         result_code, trace_summary, started_at, completed_at, created_at)
       values ($1, $2, $3, $4, 'completed', 'completed:1:1', $5, $6, $7, $8,
         'completed', 'consultation_prepared', $9, $10, clock_timestamp(),
         clock_timestamp())`,
      [
        fixture.ownerUserId,
        fixture.runId,
        fixture.tokenId,
        fixture.flowVersionId,
        claim.nodeActivationSequence,
        attemptNumber,
        fencingToken,
        claim.leaseOwner,
        {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: "completed",
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: "consultation_prepared"
        },
        claim.claimedAt
      ]
    );
  }

  async function restoreFailureStateConstraint(): Promise<void> {
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        ADD CONSTRAINT flow_execution_tokens_failure_state_check CHECK (
          (
            state = 'retry_scheduled'
            AND failure_disposition IS NOT NULL
            AND failure_disposition = 'retry_scheduled'
            AND failure_reason_code IS NOT NULL
            AND failure_reason_code IN (
              'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
              'FLOW_TOKEN_LEASE_EXPIRED'
            )
            AND quarantined_at IS NULL
          ) OR (
            state = 'failed'
            AND failure_disposition IS NOT NULL
            AND failure_reason_code IS NOT NULL
            AND (
              (
                failure_disposition = 'quarantined'
                AND failure_reason_code IN (
                  'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                  'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                  'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                  'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE'
                )
                AND quarantined_at IS NOT NULL
              ) OR (
                failure_disposition = 'failed_terminal'
                AND failure_reason_code IN (
                  'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_NODE_EXECUTION_RETRYABLE',
                  'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED'
                )
                AND quarantined_at IS NULL
              )
            )
          ) OR (
            state NOT IN ('retry_scheduled', 'failed')
            AND failure_disposition IS NULL
            AND failure_reason_code IS NULL
            AND quarantined_at IS NULL
          )
        )
    `);
  }

  async function restoreLeaseStateConstraint(): Promise<void> {
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        ADD CONSTRAINT flow_execution_tokens_lease_state_check CHECK (
          (
            state = 'claimed'
            AND claimed_at IS NOT NULL
            AND lease_owner IS NOT NULL
            AND lease_expires_at IS NOT NULL
            AND claimed_at <= lease_expires_at
          ) OR (
            state <> 'claimed'
            AND claimed_at IS NULL
            AND lease_owner IS NULL
            AND lease_expires_at IS NULL
          )
        )
    `);
  }

  async function installFlowEventInsertFailure(runId?: string): Promise<void> {
    const failureStatement = runId
      ? `IF NEW.flow_run_id = '${runId}'::uuid THEN
          RAISE EXCEPTION 'forced flow run event insert failure';
        END IF;`
      : "RAISE EXCEPTION 'forced flow run event insert failure';";
    await runtime.pool.query(`
      CREATE OR REPLACE FUNCTION elevenhouse_test_fail_flow_event_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $test_failure$
      BEGIN
        ${failureStatement}
        RETURN NEW;
      END;
      $test_failure$;
      CREATE TRIGGER flow_run_events_test_insert_failure
      BEFORE INSERT ON flow_run_events
      FOR EACH ROW
      EXECUTE FUNCTION elevenhouse_test_fail_flow_event_insert();
    `);
  }

  async function removeFlowEventInsertFailure(): Promise<void> {
    await runtime.pool.query(`
      DROP TRIGGER IF EXISTS flow_run_events_test_insert_failure ON flow_run_events;
      DROP FUNCTION IF EXISTS elevenhouse_test_fail_flow_event_insert();
    `);
  }
});

async function claimExecution(
  store: ReturnType<typeof createDrizzleFlowExecutionStore>,
  input: Omit<
    Parameters<ReturnType<typeof createDrizzleFlowExecutionStore>["claimNext"]>[0],
    "ownerScope"
  > &
    Partial<
      Pick<
        Parameters<ReturnType<typeof createDrizzleFlowExecutionStore>["claimNext"]>[0],
        "ownerScope"
      >
    >
): Promise<FlowExecutionClaim> {
  const result = await store.claimNext({
    ...input,
    ownerScope: input.ownerScope ?? { kind: "all" }
  });
  if (!result || result.status !== "claimed") raise("Expected claimed flow execution token");
  return result.claim;
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

function errorChain(value: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = value;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join("\n");
}
