import { createHash, randomUUID } from "node:crypto";

import { flowGraphV2Schema, type FlowGraphV2 } from "@elevenhouse/contracts";
import {
  activateFlowVersionEnrollment,
  compileFlowGraphV2,
  completeFlowWorkItem,
  createBuiltInFlowNodeExecutorRegistry,
  createFlowRuntimeRequirementKeys,
  decideDurableFlowApproval,
  interpretFlowExecutionClaim,
  replaceFlowRuntimeRolloutPolicy,
  resolveChartExecutionProfile,
  startFlowWorkItem,
  type FlowRuntimeRolloutPolicy,
  type FlowNatalChartAiDraftRequester,
  type FlowWorkerRegistration,
  type ManualBookingClaim
} from "@elevenhouse/domain";
import {
  createDrizzleAvailabilityStore,
  createDrizzleBookingCommandStore,
  createDrizzleFlowApprovalStore,
  createDrizzleFlowBirthDataReadinessReader,
  createDrizzleFlowBookingLifecycleStore,
  createDrizzleFlowEnrollmentControlStore,
  createDrizzleFlowExecutionSignalStore,
  createDrizzleFlowRuntimeControlCommandStore,
  createDrizzleFlowManualClientEnrollmentStore,
  createDrizzleFlowMessagingRequester,
  createDrizzleFlowNatalChartRequester,
  createDrizzleFlowWorkerExecutionStore,
  createDrizzleFlowWorkerReadinessStore,
  createDrizzleFlowWorkItemStore
} from "@elevenhouse/db";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createDrizzleChartCalculationCommandStore } from "../src/adapters/charts/drizzle-chart-calculation-job-store";
import { createDrizzlePlatformTariffAuthorityStore } from "../src/adapters/platform-billing/drizzle-platform-tariff-authority-store";

const qaPrefix = `flow-local-qa-${Date.now()}`;
const runtime = createPostgresRuntime();
const allowedRequirementKeys = new Set<string>();
let birthDataSequence = 0;
let bookingSequence = 0;

type QaResult = Record<string, unknown>;

async function main() {
  const results: QaResult[] = [];
  const ownerUserId = await createUser();
  const clientUserId = await createUser();
  const ownerSubjectId = await createOwnerSubject(ownerUserId);
  await createActiveTariff(ownerUserId, 100);
  const relationshipId = await createRelationship(ownerUserId, clientUserId);
  const productId = await createProduct(ownerUserId);

  results.push(
    await runManualTerminalScenario(ownerUserId, ownerSubjectId, clientUserId, "completed"),
    await runManualTerminalScenario(ownerUserId, ownerSubjectId, clientUserId, "suppressed"),
    await runManualTerminalScenario(ownerUserId, ownerSubjectId, clientUserId, "failed"),
    await runWorkItemScenario(ownerUserId, ownerSubjectId, clientUserId),
    await runApprovalScenario(ownerUserId, ownerSubjectId, clientUserId, "approved"),
    await runApprovalScenario(ownerUserId, ownerSubjectId, clientUserId, "rejected"),
    await runBookingConfirmedScenario(ownerUserId, ownerSubjectId, clientUserId, productId),
    await runBirthDataScenario(ownerUserId, ownerSubjectId, productId, true),
    await runBirthDataScenario(ownerUserId, ownerSubjectId, productId, false),
    await runNatalChartRequestScenario(ownerUserId, ownerSubjectId),
    await runNatalChartAiDraftScenario(ownerUserId, ownerSubjectId, "approved"),
    await runNatalChartAiDraftScenario(ownerUserId, ownerSubjectId, "rejected"),
    await runMessagingScenario(ownerUserId, ownerSubjectId, clientUserId, true),
    await runMessagingScenario(ownerUserId, ownerSubjectId, clientUserId, false)
  );

  printResults({ ownerUserId, clientUserId, relationshipId, results });
}

async function runManualTerminalScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  clientUserId: string,
  terminalKind: "completed" | "suppressed" | "failed"
) {
  const graph = manualTerminalGraph(terminalKind);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const enrollment = await createDrizzleFlowManualClientEnrollmentStore(
    runtime.database
  ).enrollManualClient({
    ownerUserId,
    flowId,
    clientUserId,
    idempotencyKey: `${qaPrefix}-${terminalKind}`
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs[0] ?? raise(`Expected ${terminalKind} run`);
  return {
    scenario: `manual_${terminalKind}`,
    enrollment,
    execution,
    persisted: await runPersistence(run.runId)
  };
}

async function runWorkItemScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  clientUserId: string
) {
  const graph = workItemGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const enrollment = await createDrizzleFlowManualClientEnrollmentStore(
    runtime.database
  ).enrollManualClient({
    ownerUserId,
    flowId,
    clientUserId,
    idempotencyKey: `${qaPrefix}-work-item`
  });
  const firstExecution = await processAll(workerIdentity);
  const workItem = await runtime.pool.query<{ id: string; revision: number }>(
    "select id, revision from flow_work_items where owner_user_id = $1 and flow_run_id = $2",
    [ownerUserId, enrollment.runs[0]?.runId]
  );
  const workItemId = workItem.rows[0]?.id ?? raise("Expected work item");
  await startFlowWorkItem({
    store: createDrizzleFlowWorkItemStore(runtime.database),
    actorUserId: ownerUserId,
    ownerUserId,
    workItemId,
    idempotencyKey: `${qaPrefix}-work-item-start`,
    request: { expectedRevision: workItem.rows[0]!.revision }
  });
  await completeFlowWorkItem({
    store: createDrizzleFlowWorkItemStore(runtime.database),
    actorUserId: ownerUserId,
    ownerUserId,
    workItemId,
    idempotencyKey: `${qaPrefix}-work-item-complete`,
    request: { expectedRevision: workItem.rows[0]!.revision + 1, resultSummary: "QA completed" }
  });
  const secondExecution = await processAll(workerIdentity);
  const run = enrollment.runs[0] ?? raise("Expected work-item run");
  return {
    scenario: "manual_work_item_complete",
    enrollment,
    firstExecution,
    workItemId,
    secondExecution,
    persisted: await runPersistence(run.runId)
  };
}

async function runApprovalScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  clientUserId: string,
  decision: "approved" | "rejected"
) {
  const graph = approvalGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const enrollment = await createDrizzleFlowManualClientEnrollmentStore(
    runtime.database
  ).enrollManualClient({
    ownerUserId,
    flowId,
    clientUserId,
    idempotencyKey: `${qaPrefix}-approval-${decision}`
  });
  const firstExecution = await processAll(workerIdentity);
  const approval = await runtime.pool.query<{ id: string; revision: number }>(
    "select id, revision from flow_approvals where owner_user_id = $1 and flow_run_id = $2",
    [ownerUserId, enrollment.runs[0]?.runId]
  );
  const approvalId = approval.rows[0]?.id ?? raise("Expected approval");
  await decideDurableFlowApproval({
    store: createDrizzleFlowApprovalStore(runtime.database),
    actorUserId: ownerUserId,
    ownerUserId,
    approvalId,
    idempotencyKey: `${qaPrefix}-approval-${decision}-decide`,
    request: { expectedRevision: approval.rows[0]!.revision, decision }
  });
  const secondExecution = await processAll(workerIdentity);
  const run = enrollment.runs[0] ?? raise("Expected approval run");
  return {
    scenario: `manual_approval_${decision}`,
    enrollment,
    firstExecution,
    approvalId,
    secondExecution,
    persisted: await runPersistence(run.runId)
  };
}

async function runBookingConfirmedScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  clientUserId: string,
  productId: string
) {
  const graph = bookingCompletedGraph(productId);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const booking = await createConfirmedBooking(ownerUserId, clientUserId, productId);
  const enrollment = await createDrizzleFlowBookingLifecycleStore(
    runtime.database,
    workerIdentity
  ).processBookingLifecycleEvent({
    lifecycleEventId: booking.lifecycleEventId,
    latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
    futureSkewToleranceMs: 5 * 60 * 1_000
  });
  const execution = await processAll(workerIdentity);
  const runId = await runIdByBookingLifecycleEvent(booking.lifecycleEventId, flowId);
  return {
    scenario: "booking_confirmed_completed",
    bookingId: booking.bookingId,
    enrollment,
    execution,
    persisted: await runPersistence(runId)
  };
}

async function runBirthDataScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  productId: string,
  ready: boolean
) {
  const graph = bookingBirthDataGraph(productId);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  await createRelationship(ownerUserId, scenarioClientUserId);
  const booking = await createConfirmedBooking(ownerUserId, scenarioClientUserId, productId);
  if (ready) await createBirthData(scenarioClientUserId);
  const enrollment = await createDrizzleFlowBookingLifecycleStore(
    runtime.database,
    workerIdentity
  ).processBookingLifecycleEvent({
    lifecycleEventId: booking.lifecycleEventId,
    latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
    futureSkewToleranceMs: 5 * 60 * 1_000
  });
  const execution = await processAll(
    workerIdentity,
    createBuiltInFlowNodeExecutorRegistry({
      birthDataReadinessReader: createDrizzleFlowBirthDataReadinessReader(runtime.database)
    })
  );
  const runId = await runIdByBookingLifecycleEvent(booking.lifecycleEventId, flowId);
  return {
    scenario: `booking_birth_data_${ready ? "ready" : "missing"}`,
    bookingId: booking.bookingId,
    clientUserId: scenarioClientUserId,
    enrollment,
    execution,
    persisted: await runPersistence(runId)
  };
}

async function runNatalChartRequestScenario(ownerUserId: string, ownerSubjectId: string) {
  const productId = await createProduct(ownerUserId);
  const graph = natalChartRequestGraph(productId);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  await createRelationship(ownerUserId, scenarioClientUserId);
  await createBirthData(scenarioClientUserId);
  const booking = await createConfirmedBooking(ownerUserId, scenarioClientUserId, productId);
  const enrollment = await createDrizzleFlowBookingLifecycleStore(
    runtime.database,
    workerIdentity
  ).processBookingLifecycleEvent({
    lifecycleEventId: booking.lifecycleEventId,
    latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
    futureSkewToleranceMs: 5 * 60 * 1_000
  });
  const registry = createBuiltInFlowNodeExecutorRegistry({
    natalChartRequester: createDrizzleFlowNatalChartRequester(runtime.database, {
      commandStore: createDrizzleChartCalculationCommandStore(runtime.database),
      executionProfile: resolveChartExecutionProfile({ NODE_ENV: "test" })
    })
  });
  const firstExecution = await processAll(workerIdentity, registry);
  const runId = await runIdByBookingLifecycleEvent(booking.lifecycleEventId, flowId);
  const wait = await runtime.pool.query<{
    correlation_id: string;
    expected_source_event_id: string | null;
    token_id: string;
  }>(
    `select correlation_id, expected_source_event_id, token_id
       from flow_execution_signal_waits
      where flow_run_id = $1
        and signal_type = 'chart.calculation.terminal.v1'
        and state = 'waiting'
      order by created_at desc
      limit 1`,
    [runId]
  );
  const chartJobId = wait.rows[0]?.correlation_id ?? raise("Expected chart signal wait");
  const signalResult = await createDrizzleFlowExecutionSignalStore(runtime.database).ingest({
    sourceEventId: wait.rows[0]?.expected_source_event_id ?? randomUUID(),
    ownerUserId,
    signalType: "chart.calculation.terminal.v1",
    correlationId: chartJobId,
    outcome: "succeeded",
    occurredAt: await databaseNow()
  });
  const secondExecution = await processAll(workerIdentity, registry);
  return {
    scenario: "booking_natal_chart_request_success",
    bookingId: booking.bookingId,
    clientUserId: scenarioClientUserId,
    chartJobId,
    enrollment,
    firstExecution,
    signalResult,
    secondExecution,
    persisted: await runPersistence(runId)
  };
}

async function runNatalChartAiDraftScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  decision: "approved" | "rejected"
) {
  const productId = await createProduct(ownerUserId);
  const graph = natalChartAiDraftGraph(productId);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  await createRelationship(ownerUserId, scenarioClientUserId);
  await createBirthData(scenarioClientUserId);
  const booking = await createConfirmedBooking(ownerUserId, scenarioClientUserId, productId);
  const enrollment = await createDrizzleFlowBookingLifecycleStore(
    runtime.database,
    workerIdentity
  ).processBookingLifecycleEvent({
    lifecycleEventId: booking.lifecycleEventId,
    latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
    futureSkewToleranceMs: 5 * 60 * 1_000
  });
  const registry = createBuiltInFlowNodeExecutorRegistry({
    natalChartRequester: createDrizzleFlowNatalChartRequester(runtime.database, {
      commandStore: createDrizzleChartCalculationCommandStore(runtime.database),
      executionProfile: resolveChartExecutionProfile({ NODE_ENV: "test" })
    }),
    natalChartAiDraftRequester: fakeNatalChartAiDraftRequester()
  });
  const firstExecution = await processAll(workerIdentity, registry);
  const runId = await runIdByBookingLifecycleEvent(booking.lifecycleEventId, flowId);
  const wait = await runtime.pool.query<{
    correlation_id: string;
    expected_source_event_id: string | null;
  }>(
    `select correlation_id, expected_source_event_id
       from flow_execution_signal_waits
      where flow_run_id = $1
        and signal_type = 'chart.calculation.terminal.v1'
        and state = 'waiting'
      order by created_at desc
      limit 1`,
    [runId]
  );
  const chartJobId = wait.rows[0]?.correlation_id ?? raise("Expected AI chart signal wait");
  const signalResult = await createDrizzleFlowExecutionSignalStore(runtime.database).ingest({
    sourceEventId: wait.rows[0]?.expected_source_event_id ?? randomUUID(),
    ownerUserId,
    signalType: "chart.calculation.terminal.v1",
    correlationId: chartJobId,
    outcome: "succeeded",
    occurredAt: await databaseNow()
  });
  const secondExecution = await processAll(workerIdentity, registry);
  const approval = await runtime.pool.query<{ id: string; revision: number }>(
    "select id, revision from flow_approvals where owner_user_id = $1 and flow_run_id = $2",
    [ownerUserId, runId]
  );
  const approvalId =
    approval.rows[0]?.id ??
    raise(
      `Expected AI draft approval: ${JSON.stringify(
        {
          runId,
          wait: wait.rows[0],
          signalResult,
          secondExecution,
          persisted: await runPersistence(runId)
        },
        jsonReplacer
      )}`
    );
  await decideDurableFlowApproval({
    store: createDrizzleFlowApprovalStore(runtime.database),
    actorUserId: ownerUserId,
    ownerUserId,
    approvalId,
    idempotencyKey: `${qaPrefix}-ai-draft-${decision}-decide`,
    request: { expectedRevision: approval.rows[0]!.revision, decision }
  });
  const thirdExecution = await processAll(workerIdentity, registry);
  return {
    scenario: `booking_natal_chart_ai_draft_${decision}`,
    bookingId: booking.bookingId,
    clientUserId: scenarioClientUserId,
    chartJobId,
    approvalId,
    enrollment,
    firstExecution,
    signalResult,
    secondExecution,
    thirdExecution,
    persisted: await runPersistence(runId)
  };
}

async function runMessagingScenario(
  ownerUserId: string,
  ownerSubjectId: string,
  clientUserId: string,
  canSend: boolean
) {
  const graph = messagingGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = canSend ? clientUserId : await createUser();
  if (!canSend) await createRelationship(ownerUserId, scenarioClientUserId);
  const thread = await createMessagingThread(ownerUserId, scenarioClientUserId, canSend);
  const enrollment = await createDrizzleFlowManualClientEnrollmentStore(
    runtime.database
  ).enrollManualClient({
    ownerUserId,
    flowId,
    clientUserId: scenarioClientUserId,
    idempotencyKey: `${qaPrefix}-messaging-${canSend ? "success" : "error"}`
  });
  const registry = createBuiltInFlowNodeExecutorRegistry({
    messagingRequester: createDrizzleFlowMessagingRequester(runtime.database)
  });
  const firstExecution = await processAll(workerIdentity, registry);
  let signalResult: unknown = null;
  if (canSend) {
    const message = await runtime.pool.query<{ id: string }>(
      "select id from messages where thread_id = $1 order by created_at desc limit 1",
      [thread.threadId]
    );
    const messageId = message.rows[0]?.id ?? raise("Expected queued message");
    signalResult = await createDrizzleFlowExecutionSignalStore(runtime.database).ingest({
      sourceEventId: randomUUID(),
      ownerUserId,
      signalType: "messaging.message.delivery.terminal.v1",
      correlationId: messageId,
      outcome: "succeeded",
      occurredAt: await databaseNow()
    });
  }
  const secondExecution = await processAll(workerIdentity, registry);
  const run = enrollment.runs[0] ?? raise("Expected messaging run");
  return {
    scenario: `manual_send_message_${canSend ? "success" : "error"}`,
    enrollment,
    firstExecution,
    signalResult,
    secondExecution,
    persisted: await runPersistence(run.runId)
  };
}

async function processAll(
  workerIdentity: { readonly instanceId: string; readonly sessionId: string },
  registry = createBuiltInFlowNodeExecutorRegistry()
) {
  const store = createDrizzleFlowWorkerExecutionStore(runtime.database, workerIdentity);
  const processed = [];
  for (let i = 0; i < 10; i += 1) {
    const claimResult = await store.claimNext({ executorKeys: registry.executorKeys });
    if (!claimResult) {
      processed.push({ status: "idle" });
      break;
    }
    if (claimResult.status !== "claimed") {
      processed.push(claimResult);
      continue;
    }
    const decision = await interpretFlowExecutionClaim({ claim: claimResult.claim, registry });
    const finalized = await store.finalize({ claim: claimResult.claim, decision });
    processed.push({
      status: finalized.status,
      runId: claimResult.claim.runId,
      tokenId: claimResult.claim.tokenId,
      nodeKind: claimResult.claim.nodeKind,
      decisionKind: decision.kind
    });
  }
  return processed;
}

async function publishActivateAndAdmit(
  ownerUserId: string,
  ownerSubjectId: string,
  graph: FlowGraphV2
) {
  const compiled = compileFlowGraphV2(graph);
  const capabilityManifest =
    compiled.capabilityManifest ??
    raise(`Expected capability manifest: ${JSON.stringify(compiled, jsonReplacer)}`);
  const requirementKeys = createFlowRuntimeRequirementKeys(capabilityManifest);
  await enablePolicy(ownerUserId, ownerSubjectId, requirementKeys);
  const workerIdentity = await registerWorker(ownerSubjectId, requirementKeys);
  const { flowId, versionId } = await createPublishedFlow(ownerUserId, graph, capabilityManifest);
  const activation = await activateFlowVersionEnrollment({
    store: createDrizzleFlowEnrollmentControlStore(runtime.database),
    actorUserId: ownerUserId,
    ownerUserId,
    flowId,
    idempotencyKey: `${qaPrefix}-activate-${randomUUID()}`,
    request: {
      schemaVersion: "flow-activation-command.v1",
      versionId,
      expectedRevision: 1,
      expectedEnrollmentRevision: 0,
      expectedActiveVersionId: null
    }
  });
  if (activation.outcome.kind !== "succeeded") {
    raise(`Expected activation: ${JSON.stringify(activation.outcome, jsonReplacer)}`);
  }
  return { flowId, versionId, requirementKeys, workerIdentity };
}

async function enablePolicy(
  ownerUserId: string,
  ownerSubjectId: string,
  requirementKeys: readonly string[]
) {
  for (const requirementKey of requirementKeys) allowedRequirementKeys.add(requirementKey);
  const current = await runtime.pool.query<{ revision: number }>(
    "select revision from flow_runtime_rollout_policy_versions order by revision desc limit 1"
  );
  await replaceFlowRuntimeRolloutPolicy({
    store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
    actorUserId: ownerUserId,
    idempotencyKey: `${qaPrefix}-policy-${randomUUID()}`,
    expectedRevision: current.rows[0]?.revision ?? 1,
    policy: canaryPolicy(ownerSubjectId, [...allowedRequirementKeys].sort()),
    reason: "Local Flow QA"
  });
}

async function registerWorker(ownerSubjectId: string, requirementKeys: readonly string[]) {
  const identity = { instanceId: `${qaPrefix}-worker-${randomUUID()}`, sessionId: randomUUID() };
  const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
  await store.register({
    schemaVersion: "flow-worker-registration.v2",
    sessionId: identity.sessionId,
    instanceId: identity.instanceId,
    roles: ["executor", "enrollment"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys,
    deploymentId: `${qaPrefix}-deployment`,
    buildId: `${qaPrefix}-build`
  } satisfies FlowWorkerRegistration);
  await store.heartbeat(identity);
  return identity;
}

function canaryPolicy(
  ownerSubjectId: string,
  requirementKeys: readonly string[]
): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerSubjectId],
    allowedRequirementKeys: requirementKeys,
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
}

async function createPublishedFlow(
  ownerUserId: string,
  graph: FlowGraphV2,
  capabilityManifest: unknown
) {
  const client = await runtime.pool.connect();
  try {
    await client.query("begin");
    const flow = await client.query<{ id: string }>(
      `insert into flows (owner_user_id, name, origin, definition_state, approval_mode, revision, draft_graph, created_at, updated_at)
       values ($1, $2, $3, 'draft', 'manual_approve', 1, $4, transaction_timestamp(), transaction_timestamp())
       returning id`,
      [
        ownerUserId,
        `${qaPrefix} flow`,
        { schemaVersion: "flow-definition-origin.v1", type: "blank" },
        graph
      ]
    );
    const flowId = flow.rows[0]?.id ?? raise("Expected flow id");
    const version = await client.query<{ id: string }>(
      `insert into flow_versions (flow_id, owner_user_id, version, source_revision, approval_mode, graph_schema_version, graph, capability_manifest, published_at)
       values ($1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4, transaction_timestamp())
       returning id`,
      [flowId, ownerUserId, graph, capabilityManifest]
    );
    const versionId = version.rows[0]?.id ?? raise("Expected version id");
    await client.query(
      `update flows
          set definition_state = 'versioned',
              published_version_id = $2,
              published_at = (select published_at from flow_versions where id = $2),
              updated_at = transaction_timestamp()
        where id = $1`,
      [flowId, versionId]
    );
    await client.query("commit");
    return { flowId, versionId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createConfirmedBooking(
  ownerUserId: string,
  clientUserId: string,
  productId: string
) {
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
  const scheduleId =
    "schedule" in schedule ? schedule.schedule.id : await defaultScheduleId(ownerUserId);
  const now = await databaseNow();
  bookingSequence += 1;
  const startAt = new Date(
    Date.parse(now) + (24 + bookingSequence * 2) * 60 * 60 * 1_000
  ).toISOString();
  const endAt = new Date(Date.parse(startAt) + 60 * 60 * 1_000).toISOString();
  const booking = await createDrizzleBookingCommandStore(runtime.database).executeManualBooking(
    {
      actorUserId: ownerUserId,
      scope: "bookings.manual.create",
      key: `${qaPrefix}-booking-${randomUUID()}`,
      requestHash: `sha256:${"a".repeat(64)}`,
      now,
      expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1_000).toISOString()
    },
    async (): Promise<ManualBookingClaim> => ({
      ownerUserId,
      clientUserId,
      productId,
      scheduleId,
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
  const lifecycle = await runtime.pool.query<{ id: string; occurred_at: Date }>(
    "select id, occurred_at from booking_lifecycle_events where booking_id = $1 and owner_user_id = $2 and revision = 1",
    [booking.booking.id, ownerUserId]
  );
  const event = lifecycle.rows[0] ?? raise("Expected booking lifecycle event");
  return {
    bookingId: booking.booking.id,
    lifecycleEventId: event.id,
    request: {
      schemaVersion: "flow-booking-confirmed-enrollment-request.v1" as const,
      eventKind: "booking_confirmed" as const,
      source: "booking" as const,
      sourceEventId: `booking:${booking.booking.id}:confirmed`,
      subjectType: "booking" as const,
      subjectId: booking.booking.id,
      occurrenceKey: booking.booking.id,
      occurredAt: event.occurred_at.toISOString(),
      payloadSchemaVersion: 1 as const,
      payload: { bookingId: booking.booking.id }
    }
  };
}

async function defaultScheduleId(ownerUserId: string) {
  const row = await runtime.pool.query<{ id: string }>(
    "select id from availability_schedules where owner_user_id = $1 and is_default = true order by updated_at desc limit 1",
    [ownerUserId]
  );
  return row.rows[0]?.id ?? raise("Expected schedule");
}

async function runIdByBookingLifecycleEvent(lifecycleEventId: string, flowId?: string) {
  const row = await runtime.pool.query<{ id: string }>(
    `select run.id
       from flow_booking_lifecycle_receipts receipt
       join flow_runs run on run.runtime_event_id = receipt.flow_runtime_event_id
      where receipt.lifecycle_event_id = $1
        and ($2::uuid is null or run.flow_id = $2::uuid)
      order by run.created_at desc`,
    [lifecycleEventId, flowId ?? null]
  );
  return row.rows[0]?.id ?? raise("Expected booking lifecycle run");
}

async function runPersistence(runId: string) {
  const rows = await runtime.pool.query(
    `select run.status, run.current_node_id, event.event_kind, token.state as token_state, token.node_kind,
            trace.event_type, trace.summary
       from flow_runs run
       join flow_runtime_events event on event.id = run.runtime_event_id
       left join flow_execution_tokens token on token.flow_run_id = run.id
       left join flow_run_events trace on trace.flow_run_id = run.id
      where run.id = $1
      order by trace.sequence`,
    [runId]
  );
  return rows.rows;
}

async function createUser() {
  const user = await runtime.pool.query<{ id: string }>(
    "insert into users (status) values ('active') returning id"
  );
  return user.rows[0]?.id ?? raise("Expected user");
}

async function createOwnerSubject(ownerUserId: string) {
  const row = await runtime.pool.query<{ owner_subject_id: string }>(
    "insert into flow_runtime_owner_subjects (owner_user_id) values ($1) returning owner_subject_id",
    [ownerUserId]
  );
  return row.rows[0]?.owner_subject_id ?? raise("Expected owner subject");
}

async function createRelationship(ownerUserId: string, clientUserId: string) {
  const row = await runtime.pool.query<{ id: string }>(
    `insert into client_astrologer_relationships (client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at, created_at, updated_at)
     values ($1, $2, 'manual', 'active', transaction_timestamp(), transaction_timestamp(), transaction_timestamp(), transaction_timestamp())
     returning id`,
    [clientUserId, ownerUserId]
  );
  return row.rows[0]?.id ?? raise("Expected relationship");
}

async function createBirthData(clientUserId: string) {
  birthDataSequence += 1;
  const birthDay = String(1 + (birthDataSequence % 27)).padStart(2, "0");
  const birthHour = String(8 + (birthDataSequence % 10)).padStart(2, "0");
  await runtime.pool.query(
    `insert into client_birth_data
      (client_user_id, birth_date, birth_time, birth_time_precision, birth_place_text,
       birth_country_code, birth_city, birth_timezone, birth_latitude, birth_longitude,
       source, revision, last_edited_by_user_id, last_edited_by_role, created_at, updated_at)
     values ($1, $2, $3, 'exact', 'Moscow', 'RU', 'Moscow',
       'Europe/Moscow', 55.7558, 37.6173, 'client_profile', 1, $1, 'client',
       transaction_timestamp(), transaction_timestamp())
     on conflict (client_user_id) do update
       set birth_date = excluded.birth_date,
           birth_time = excluded.birth_time,
           birth_time_precision = excluded.birth_time_precision,
           birth_timezone = excluded.birth_timezone,
           birth_latitude = excluded.birth_latitude,
           birth_longitude = excluded.birth_longitude,
           revision = client_birth_data.revision + 1,
           updated_at = transaction_timestamp()`,
    [clientUserId, `1990-01-${birthDay}`, `${birthHour}:00`]
  );
}

async function createMessagingThread(ownerUserId: string, clientUserId: string, canSend: boolean) {
  const channelConnectionId = randomUUID();
  const externalIdentityId = randomUUID();
  const threadId = randomUUID();
  const now = await databaseNow();
  await runtime.pool.query(
    `insert into messaging_channel_connections
      (id, astrologer_user_id, provider, mode, status, external_account_id, capabilities, created_at, updated_at)
     values ($1, $2, 'telegram', 'telegram_business_bot', 'active', $3, $4::jsonb, $5, $5)`,
    [channelConnectionId, ownerUserId, `business-${randomUUID()}`, JSON.stringify({ canSend }), now]
  );
  await runtime.pool.query(
    `insert into messaging_external_identities
      (id, channel_connection_id, provider, provider_chat_id, link_status, first_seen_at, last_seen_at)
     values ($1, $2, 'telegram', $3, 'linked', $4, $4)`,
    [externalIdentityId, channelConnectionId, `chat-${randomUUID()}`, now]
  );
  await runtime.pool.query(
    `insert into messaging_threads
      (id, astrologer_user_id, client_user_id, status, unread_astrologer_count, created_at, updated_at)
     values ($1, $2, $3, 'open', 0, $4, $4)`,
    [threadId, ownerUserId, clientUserId, now]
  );
  await runtime.pool.query(
    `insert into messaging_thread_identities (thread_id, external_identity_id, provider, is_primary, created_at)
     values ($1, $2, 'telegram', true, $3)`,
    [threadId, externalIdentityId, now]
  );
  return { threadId, channelConnectionId };
}

async function createProduct(ownerUserId: string) {
  const client = await runtime.pool.connect();
  try {
    await client.query("begin");
    const row = await client.query<{ id: string }>(
      `insert into products (owner_user_id, type, status, title, price_minor, currency, execution_mode, payment_model, duration_minutes, participant_mode)
       values ($1, 'single', 'active', 'QA consultation', 10000, 'RUB', 'live', 'once', 60, 'solo')
       returning id`,
      [ownerUserId]
    );
    const productId = row.rows[0]?.id ?? raise("Expected product");
    await client.query(
      "insert into product_methods (product_id, value, \"order\") values ($1, 'natal', 0)",
      [productId]
    );
    await client.query(
      "insert into product_required_client_data (product_id, value, \"order\") values ($1, 'chart1', 0)",
      [productId]
    );
    await client.query(
      "update products set revision = revision + 1, updated_at = transaction_timestamp() where id = $1",
      [productId]
    );
    await client.query("commit");
    return productId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createActiveTariff(ownerUserId: string, automationLimit: number) {
  const tariffSeriesId = `${qaPrefix}-${randomUUID()}`;
  const store = createDrizzlePlatformTariffAuthorityStore({ database: runtime.database });
  const draft = await store.createDraft({
    tariffSeriesId,
    version: 1,
    name: "Local Flow QA",
    tagline: "Local Flow QA",
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
    "update platform_tariff_versions set lifecycle = 'published', published_at = transaction_timestamp() where tariff_series_id = $1 and version = 1 and canonical_digest = $2",
    [tariffSeriesId, draft.canonicalDigest]
  );
  await store.beginSubscriptionPurchase({
    ownerUserId,
    tariffSeriesId,
    version: 1,
    billingCycle: "month",
    now: await databaseNow()
  });
}

async function databaseNow() {
  const row = await runtime.pool.query<{ now: Date }>("select transaction_timestamp() as now");
  return row.rows[0]!.now.toISOString();
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

function printResults(input: {
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
  readonly results: readonly QaResult[];
}) {
  const payload =
    process.env.FLOW_QA_COMPACT === "true"
      ? {
          qaPrefix,
          ownerUserId: input.ownerUserId,
          clientUserId: input.clientUserId,
          relationshipId: input.relationshipId,
          results: input.results.map(compactResult)
        }
      : { qaPrefix, ...input };
  console.log(JSON.stringify(payload, jsonReplacer, 2));
}

function compactResult(result: QaResult) {
  const persisted = Array.isArray(result.persisted) ? result.persisted : [];
  const rows = persisted.filter((row): row is Record<string, unknown> =>
    Boolean(row && typeof row === "object")
  );
  const traces = rows
    .filter((row) => typeof row.event_type === "string")
    .map((row) => ({
      eventType: row.event_type,
      resultCode: summaryValue(row.summary, "resultCode"),
      sourceHandle: summaryValue(row.summary, "sourceHandle"),
      reasonCode: summaryValue(row.summary, "reasonCode")
    }));
  const last = rows.at(-1);
  return {
    scenario: result.scenario,
    enrollment: summarizeEnrollment(result.enrollment),
    firstExecution: summarizeExecution(result.firstExecution),
    execution: summarizeExecution(result.execution),
    secondExecution: summarizeExecution(result.secondExecution),
    thirdExecution: summarizeExecution(result.thirdExecution),
    signalResult: result.signalResult,
    persisted: last
      ? {
          status: last.status,
          currentNodeId: last.current_node_id,
          eventKind: last.event_kind,
          tokenState: last.token_state,
          nodeKind: last.node_kind,
          traces
        }
      : null
  };
}

function summarizeEnrollment(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const enrollment = value as {
    readonly status?: unknown;
    readonly outcome?: unknown;
    readonly runs?: unknown;
  };
  return {
    status: enrollment.status,
    outcome: enrollment.outcome,
    runCount: Array.isArray(enrollment.runs) ? enrollment.runs.length : undefined
  };
}

function summarizeExecution(value: unknown) {
  if (!Array.isArray(value)) return value ?? null;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const item = entry as Record<string, unknown>;
    return {
      status: item.status,
      nodeKind: item.nodeKind,
      decisionKind: item.decisionKind
    };
  });
}

function summaryValue(summary: unknown, key: string) {
  if (!summary || typeof summary !== "object") return undefined;
  return (summary as Record<string, unknown>)[key];
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function manualTerminalGraph(kind: "completed" | "suppressed" | "failed"): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Manual",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      terminalNode(kind)
    ],
    edges: [
      {
        id: "manual-terminal",
        sourceNodeId: "manual",
        targetNodeId: "terminal",
        sourceHandle: "next"
      }
    ]
  });
}

function terminalNode(kind: "completed" | "suppressed" | "failed") {
  if (kind === "completed")
    return {
      id: "terminal",
      kind,
      displayTitle: "Completed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "qa_goal" }
    };
  if (kind === "suppressed")
    return {
      id: "terminal",
      kind,
      displayTitle: "Suppressed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { reasonCode: "qa_suppressed" }
    };
  return {
    id: "terminal",
    kind,
    displayTitle: "Failed",
    configSchemaVersion: 1,
    executorContractVersion: 1,
    config: { errorCode: "qa_failed" }
  };
}

function workItemGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Manual",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "work",
        kind: "astrologer_work_item",
        displayTitle: "Work",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          taskKind: "consultation_preparation",
          taskTitle: "QA work item",
          priority: "normal"
        }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_work_done" }
      }
    ],
    edges: [
      { id: "manual-work", sourceNodeId: "manual", targetNodeId: "work", sourceHandle: "next" },
      { id: "work-done", sourceNodeId: "work", targetNodeId: "done", sourceHandle: "success" }
    ]
  });
}

function approvalGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Manual",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "approval",
        kind: "astrologer_approval",
        displayTitle: "Review",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { approvalKind: "manual_task", approvalTitle: "QA approval" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_approved" }
      },
      {
        id: "reject",
        kind: "suppressed",
        displayTitle: "Rejected",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "qa_rejected" }
      }
    ],
    edges: [
      {
        id: "manual-approval",
        sourceNodeId: "manual",
        targetNodeId: "approval",
        sourceHandle: "next"
      },
      {
        id: "approval-done",
        sourceNodeId: "approval",
        targetNodeId: "done",
        sourceHandle: "approved"
      },
      {
        id: "approval-reject",
        sourceNodeId: "approval",
        targetNodeId: "reject",
        sourceHandle: "rejected"
      }
    ]
  });
}

function bookingCompletedGraph(productId: string): FlowGraphV2 {
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
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_booking_done" }
      }
    ],
    edges: [
      { id: "booking-done", sourceNodeId: "booking", targetNodeId: "done", sourceHandle: "next" }
    ]
  });
}

function bookingBirthDataGraph(productId: string): FlowGraphV2 {
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
        id: "birth",
        kind: "birth_data_available",
        displayTitle: "Birth data?",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { purpose: "service_preparation" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_birth_ready" }
      },
      {
        id: "missing",
        kind: "suppressed",
        displayTitle: "Missing",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "qa_birth_missing" }
      }
    ],
    edges: [
      { id: "booking-birth", sourceNodeId: "booking", targetNodeId: "birth", sourceHandle: "next" },
      { id: "birth-done", sourceNodeId: "birth", targetNodeId: "done", sourceHandle: "true" },
      { id: "birth-missing", sourceNodeId: "birth", targetNodeId: "missing", sourceHandle: "false" }
    ]
  });
}

function natalChartRequestGraph(productId: string): FlowGraphV2 {
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
        id: "chart",
        kind: "natal_chart_request",
        displayTitle: "Natal chart",
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
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_chart_requested" }
      }
    ],
    edges: [
      { id: "booking-chart", sourceNodeId: "booking", targetNodeId: "chart", sourceHandle: "next" },
      { id: "chart-done", sourceNodeId: "chart", targetNodeId: "done", sourceHandle: "next" }
    ]
  });
}

function natalChartAiDraftGraph(productId: string): FlowGraphV2 {
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
        id: "chart",
        kind: "natal_chart_request",
        displayTitle: "Natal chart",
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
        id: "ai",
        kind: "natal_chart_ai_draft",
        displayTitle: "AI draft",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          chartRequestNodeId: "chart",
          locale: "ru",
          approvalTitle: "Проверить QA AI-черновик",
          expiresAfterMinutes: 1_440
        }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_ai_draft_approved" }
      },
      {
        id: "reject",
        kind: "suppressed",
        displayTitle: "Rejected",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "qa_ai_draft_rejected" }
      },
      {
        id: "timeout",
        kind: "suppressed",
        displayTitle: "Timed out",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "qa_ai_draft_timeout" }
      }
    ],
    edges: [
      { id: "booking-chart", sourceNodeId: "booking", targetNodeId: "chart", sourceHandle: "next" },
      { id: "chart-ai", sourceNodeId: "chart", targetNodeId: "ai", sourceHandle: "next" },
      { id: "ai-done", sourceNodeId: "ai", targetNodeId: "done", sourceHandle: "approved" },
      { id: "ai-reject", sourceNodeId: "ai", targetNodeId: "reject", sourceHandle: "rejected" },
      { id: "ai-timeout", sourceNodeId: "ai", targetNodeId: "timeout", sourceHandle: "timeout" }
    ]
  });
}

function messagingGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Manual",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "message",
        kind: "send_message",
        displayTitle: "Send",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { textTemplate: "QA message" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_message_sent" }
      },
      {
        id: "error",
        kind: "suppressed",
        displayTitle: "Error",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "qa_message_error" }
      }
    ],
    edges: [
      {
        id: "manual-message",
        sourceNodeId: "manual",
        targetNodeId: "message",
        sourceHandle: "next"
      },
      {
        id: "message-done",
        sourceNodeId: "message",
        targetNodeId: "done",
        sourceHandle: "success"
      },
      { id: "message-error", sourceNodeId: "message", targetNodeId: "error", sourceHandle: "error" }
    ]
  });
}

function fakeNatalChartAiDraftRequester(): FlowNatalChartAiDraftRequester {
  return {
    prepare: async (input) => {
      const sourceChecksum = sha256(`${qaPrefix}:${input.runId}:${input.tokenId}:source`);
      const contentChecksum = `sha256:${"b".repeat(64)}` as const;
      const outputText = "QA AI draft output";
      const calculation = await runtime.pool.query<{ id: string }>(
        `insert into calculation_records
          (owner_user_id, module, mode, interpretation_mode, method_code, title,
           status, request_fingerprint, input_data, result_data, result_summary, result_checksum)
         values ($1, 'chart', 'individual', 'adult_natal', 'natal', 'QA natal chart',
           'calculated', $2, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $3)
         returning id`,
        [input.ownerUserId, sourceChecksum, sourceChecksum]
      );
      const calculationId = calculation.rows[0]?.id ?? raise("Expected QA calculation");
      const interpretation = await runtime.pool.query<{ id: string }>(
        `insert into calculation_interpretations
          (calculation_id, source, status, text, model_id, prompt_version)
         values ($1, 'ai', 'draft', $2, 'qa-local-fake', 'qa-flow-runtime-local')
         returning id`,
        [calculationId, outputText]
      );
      return {
        calculationId,
        interpretationId: interpretation.rows[0]?.id ?? raise("Expected QA interpretation"),
        sourceChecksum,
        contentChecksum,
        outputText,
        preview: "QA AI draft preview"
      };
    }
  };
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function raise(message: string): never {
  throw new Error(message);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => runtime.close());
