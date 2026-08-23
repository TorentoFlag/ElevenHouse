import { createHash, randomUUID } from "node:crypto";

import { flowGraphV2Schema, type FlowGraphV2 } from "@elevenhouse/contracts";
import {
  activateFlowVersionEnrollment,
  compileFlowGraphV2,
  completeFlowWorkItem,
  createBuiltInFlowNodeExecutorRegistry,
  createAstroEventFlowEnrollmentRequestedPayload,
  createClientLifecycleChangedFlowEnrollmentRequestedPayload,
  createFreeProductReceivedFlowEnrollmentRequestedPayload,
  createFirstInboundMessageFlowEnrollmentRequestedPayload,
  createFlowRuntimeRequirementKeys,
  createNewLeadFlowEnrollmentRequestedPayload,
  createProductPurchasedFlowEnrollmentRequestedPayload,
  createReviewFirstPublishedFlowEnrollmentRequestedPayload,
  createScheduleTimeFlowEnrollmentRequestedPayload,
  createSubscriptionEventFlowEnrollmentRequestedPayload,
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
  createDrizzleFlowClientEventEnrollmentStore,
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
import { createDrizzleReviewCommandStore } from "../src/adapters/reviews/drizzle-review-command-store";

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
    await runProductPurchasedStartScenario(ownerUserId, ownerSubjectId),
    await runFirstInboundMessageStartScenario(ownerUserId, ownerSubjectId),
    await runClientLifecycleChangedStartScenario(ownerUserId, ownerSubjectId),
    await runNewLeadStartScenario(ownerUserId, ownerSubjectId),
    await runFreeProductReceivedStartScenario(ownerUserId, ownerSubjectId),
    await runAstroEventStartScenario(ownerUserId, ownerSubjectId),
    await runScheduleTimeStartScenario(ownerUserId, ownerSubjectId),
    await runReviewFirstPublishedStartScenario(ownerUserId, ownerSubjectId),
    await runSubscriptionEventStartScenario(ownerUserId, ownerSubjectId),
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

async function runProductPurchasedStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const productId = await createProduct(ownerUserId);
  const graph = productPurchasedGraph(productId);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  await createRelationship(ownerUserId, scenarioClientUserId);
  const order = await createPaidOrder(ownerUserId, scenarioClientUserId, productId);
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createProductPurchasedFlowEnrollmentRequestedPayload({
      orderId: order.orderId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      productId,
      capturedAt: order.updatedAt
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  const replay = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createProductPurchasedFlowEnrollmentRequestedPayload({
      orderId: order.orderId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      productId,
      capturedAt: order.updatedAt
    })
  });
  return {
    scenario: "product_purchased_completed",
    orderId: order.orderId,
    clientUserId: scenarioClientUserId,
    enrollment,
    replay: { status: replay.status, replayed: replay.replayed, runCount: replay.runs.length },
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected product-purchased run"))
  };
}

async function runFirstInboundMessageStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = firstInboundMessageGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const thread = await createMessagingThread(ownerUserId, scenarioClientUserId, true);
  const message = await createInboundMessage(thread);
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createFirstInboundMessageFlowEnrollmentRequestedPayload({
      messageId: message.messageId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      receivedAt: message.receivedAt
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  const pastMessage = await createInboundMessage(thread);
  const pastEnrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createFirstInboundMessageFlowEnrollmentRequestedPayload({
      messageId: pastMessage.messageId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      receivedAt: "2000-01-01T00:00:00.000Z"
    })
  });
  return {
    scenario: "first_inbound_message_completed",
    messageId: message.messageId,
    clientUserId: scenarioClientUserId,
    enrollment,
    pastEnrollment: {
      status: pastEnrollment.status,
      replayed: pastEnrollment.replayed,
      runCount: pastEnrollment.runs.length
    },
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected first-inbound-message run"))
  };
}

async function runClientLifecycleChangedStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = clientLifecycleChangedGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const history = await createClientLifecycleHistory({
    relationshipId,
    sourceEventId: `${qaPrefix}-lifecycle-${randomUUID()}`,
    fromStatus: "new",
    toStatus: "active"
  });
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createClientLifecycleChangedFlowEnrollmentRequestedPayload({
      historyId: history.historyId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      fromStatus: "new",
      toStatus: "active",
      occurredAt: history.occurredAt
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  const nonMatchingHistory = await createClientLifecycleHistory({
    relationshipId,
    sourceEventId: `${qaPrefix}-lifecycle-${randomUUID()}`,
    fromStatus: "active",
    toStatus: "inactive"
  });
  const nonMatchingEnrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createClientLifecycleChangedFlowEnrollmentRequestedPayload({
      historyId: nonMatchingHistory.historyId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      fromStatus: "active",
      toStatus: "inactive",
      occurredAt: nonMatchingHistory.occurredAt
    })
  });
  return {
    scenario: "client_lifecycle_changed_completed",
    historyId: history.historyId,
    clientUserId: scenarioClientUserId,
    enrollment,
    nonMatchingEnrollment: {
      status: nonMatchingEnrollment.status,
      replayed: nonMatchingEnrollment.replayed,
      runCount: nonMatchingEnrollment.runs.length
    },
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected lifecycle run"))
  };
}

async function runNewLeadStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = newLeadGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const occurredAt = await databaseNow();
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createNewLeadFlowEnrollmentRequestedPayload({
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      createdAt: occurredAt
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  return {
    scenario: "new_lead_completed",
    clientUserId: scenarioClientUserId,
    relationshipId,
    enrollment,
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected new-lead run"))
  };
}

async function runFreeProductReceivedStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const productId = await createProduct(ownerUserId);
  const graph = freeProductReceivedGraph(productId);
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createFreeProductReceivedFlowEnrollmentRequestedPayload({
      receiptId: randomUUID(),
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      productId,
      receivedAt: await databaseNow()
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  return {
    scenario: "free_product_received_completed",
    clientUserId: scenarioClientUserId,
    productId,
    enrollment,
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected free-product run"))
  };
}

async function runAstroEventStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = astroEventGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createAstroEventFlowEnrollmentRequestedPayload({
      astroEventId: randomUUID(),
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      eventCode: "full_moon",
      occurredAt: await databaseNow()
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  return {
    scenario: "astro_event_completed",
    clientUserId: scenarioClientUserId,
    enrollment,
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected astro-event run"))
  };
}

async function runScheduleTimeStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = scheduleTimeGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createScheduleTimeFlowEnrollmentRequestedPayload({
      scheduleOccurrenceId: randomUUID(),
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      scheduleKey: "weekly_digest",
      firedAt: await databaseNow()
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  return {
    scenario: "schedule_time_completed",
    clientUserId: scenarioClientUserId,
    enrollment,
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected schedule-time run"))
  };
}

async function runReviewFirstPublishedStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = reviewFirstPublishedGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const review = await createPublishedReviewForFlowQa(
    ownerUserId,
    scenarioClientUserId,
    relationshipId
  );
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createReviewFirstPublishedFlowEnrollmentRequestedPayload({
      reviewId: review.reviewId,
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      firstApprovedVersionId: review.firstApprovedVersionId,
      publishedAt: review.publishedAt
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  return {
    scenario: "review_first_published_completed",
    clientUserId: scenarioClientUserId,
    enrollment,
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected review-first-published run"))
  };
}

async function runSubscriptionEventStartScenario(ownerUserId: string, ownerSubjectId: string) {
  const graph = subscriptionEventGraph();
  const { flowId, workerIdentity } = await publishActivateAndAdmit(
    ownerUserId,
    ownerSubjectId,
    graph
  );
  const scenarioClientUserId = await createUser();
  const relationshipId = await createRelationship(ownerUserId, scenarioClientUserId);
  const enrollment = await createDrizzleFlowClientEventEnrollmentStore(
    runtime.database
  ).enrollClientEvent({
    request: createSubscriptionEventFlowEnrollmentRequestedPayload({
      subscriptionEventId: randomUUID(),
      ownerUserId,
      clientUserId: scenarioClientUserId,
      relationshipId,
      eventType: "renewed",
      occurredAt: await databaseNow()
    })
  });
  const execution = await processAll(workerIdentity);
  const run = enrollment.runs.find((candidate) => candidate.flowId === flowId);
  return {
    scenario: "subscription_event_completed",
    clientUserId: scenarioClientUserId,
    enrollment,
    execution,
    persisted: await runPersistence(run?.runId ?? raise("Expected subscription-event run"))
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

async function createPublishedReviewForFlowQa(
  ownerUserId: string,
  clientUserId: string,
  relationshipId: string
) {
  const productId = await createProduct(ownerUserId);
  const moderatorUserId = await createUser();
  const reviewableInstanceId = randomUUID();
  const reviewId = randomUUID();
  const firstApprovedVersionId = randomUUID();
  const receivedAt = await databaseNow();
  const submittedAt = await databaseNow();
  const publishedAt = await databaseNow();

  await runtime.pool.query(
    `insert into reviewable_instances
      (id, astrologer_user_id, client_user_id, relationship_id, kind, status, window_policy,
       source_resource_key, product_id, order_id, booking_id, title_snapshot, context_label_snapshot,
       received_at, review_window_closes_at, blocked_reason_code, created_at, updated_at)
     values ($1, $2, $3, $4, 'booking', 'reviewable', 'standard_14_days_after_receipt',
       $5, $6, null, null, 'QA consultation', '60 minutes', $7,
       $7::timestamptz + interval '14 days', null, $7, $7)`,
    [
      reviewableInstanceId,
      ownerUserId,
      clientUserId,
      relationshipId,
      `booking:${randomUUID()}`,
      productId,
      receivedAt
    ]
  );

  const reviewCommands = createDrizzleReviewCommandStore(runtime.database);
  const submission = await reviewCommands.submitReviewVersion({
    actorUserId: clientUserId,
    now: submittedAt,
    reviewableInstanceId,
    nextReviewId: reviewId,
    nextVersionId: firstApprovedVersionId,
    submission: {
      rating: 5,
      text: "Flow QA review publication.",
      publicIdentityMode: "named"
    }
  });
  if (submission.kind === "rejected") {
    throw new Error(`Expected QA review submission, got ${submission.reason}`);
  }

  const approval = await reviewCommands.approveReviewVersion({
    moderatorUserId,
    now: publishedAt,
    reviewId,
    versionId: firstApprovedVersionId,
    nextPublicationEventId: randomUUID()
  });
  if (approval.kind === "rejected") {
    throw new Error(`Expected QA review approval, got ${approval.reason}`);
  }

  return { reviewId, firstApprovedVersionId, publishedAt };
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
  return { threadId, channelConnectionId, externalIdentityId };
}

async function createInboundMessage(input: {
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string;
}) {
  const now = await databaseNow();
  const message = await runtime.pool.query<{ id: string; created_at: Date }>(
    `insert into messages
      (thread_id, channel_connection_id, external_identity_id, direction, sender_kind,
       provider_message_id, provider_update_id, provider_sent_at, content_type, text,
       status, created_at, updated_at)
     values ($1, $2, $3, 'inbound', 'client', $4, $5, $6, 'text', 'QA inbound message',
       'received', $6, $6)
     returning id, created_at`,
    [
      input.threadId,
      input.channelConnectionId,
      input.externalIdentityId,
      `provider-message-${randomUUID()}`,
      `provider-update-${randomUUID()}`,
      now
    ]
  );
  const row = message.rows[0] ?? raise("Expected inbound message");
  return { messageId: row.id, receivedAt: row.created_at.toISOString() };
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

async function createPaidOrder(ownerUserId: string, clientUserId: string, productId: string) {
  const financePolicyId = await createFinancePolicySnapshot();
  const tariff = await runtime.pool.query<{
    tariff_series_id: string;
    tariff_version: number;
    tariff_version_digest: string;
    commission_bps_snapshot: number;
  }>(
    `select tariff_series_id, tariff_version, tariff_version_digest, commission_bps_snapshot
       from platform_tariff_subscriptions
      where owner_user_id = $1 and state = 'active'
      order by created_at desc
      limit 1`,
    [ownerUserId]
  );
  const tariffRow = tariff.rows[0] ?? raise("Expected active tariff subscription");
  const order = await runtime.pool.query<{ id: string; updated_at: Date }>(
    `insert into orders
       (client_user_id, astrologer_user_id, product_id, status, product_title_snapshot,
        gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
        astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
        finance_policy_risk_tier, finance_policy_hold_duration_hours, finance_policy_reserve_bps,
        finance_policy_reserve_release_delay_days, tariff_series_id, tariff_version,
        tariff_version_digest, tariff_commission_bps, finance_policy_provider_settlement_required,
        created_at, updated_at)
     values ($1, $2, $3, 'paid', 'QA consultation', 10000, 'RUB', 0, 'RUB',
       10000, 'RUB', $4, 'standard', 0, 0, 0, $5, $6, $7, $8, false,
       transaction_timestamp(), transaction_timestamp())
     returning id, updated_at`,
    [
      clientUserId,
      ownerUserId,
      productId,
      financePolicyId,
      tariffRow.tariff_series_id,
      tariffRow.tariff_version,
      tariffRow.tariff_version_digest,
      tariffRow.commission_bps_snapshot
    ]
  );
  const row = order.rows[0] ?? raise("Expected paid order");
  return { orderId: row.id, updatedAt: row.updated_at.toISOString() };
}

async function createFinancePolicySnapshot() {
  const version = await runtime.pool.query<{ next_version: number }>(
    "select coalesce(max(policy_version), 0) + 1 as next_version from finance_policies"
  );
  const policy = await runtime.pool.query<{ id: string }>(
    `insert into finance_policies
       (policy_version, risk_tier, hold_duration_hours, reserve_bps,
        reserve_release_delay_days, provider_settlement_required, is_active)
     values ($1, 'standard', 0, 0, 0, false, false)
     returning id`,
    [version.rows[0]?.next_version ?? 1]
  );
  return policy.rows[0]?.id ?? raise("Expected finance policy");
}

async function createClientLifecycleHistory(input: {
  readonly relationshipId: string;
  readonly sourceEventId: string;
  readonly fromStatus: "new" | "active" | "waiting_for_client" | "in_service" | "inactive";
  readonly toStatus: "new" | "active" | "waiting_for_client" | "in_service" | "inactive";
}) {
  const history = await runtime.pool.query<{ id: string; occurred_at: Date }>(
    `insert into client_lifecycle_history
       (relationship_id, source_event_id, cause_kind, before_status, after_status,
        disposition, actor_user_id, occurred_at, created_at)
     values ($1, $2, 'manual_astrologer_action', $3, $4, 'applied', null,
       transaction_timestamp(), transaction_timestamp())
     returning id, occurred_at`,
    [input.relationshipId, input.sourceEventId, input.fromStatus, input.toStatus]
  );
  const row = history.rows[0] ?? raise("Expected client lifecycle history");
  return { historyId: row.id, occurredAt: row.occurred_at.toISOString() };
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
    replay: result.replay,
    pastEnrollment: result.pastEnrollment,
    nonMatchingEnrollment: result.nonMatchingEnrollment,
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

function productPurchasedGraph(productId: string): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "purchase",
        kind: "product_purchased",
        displayTitle: "Product purchased",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [productId], enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_product_purchased" }
      }
    ],
    edges: [
      { id: "purchase-done", sourceNodeId: "purchase", targetNodeId: "done", sourceHandle: "next" }
    ]
  });
}

function firstInboundMessageGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "first-message",
        kind: "first_inbound_message",
        displayTitle: "First inbound message",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_first_inbound_message" }
      }
    ],
    edges: [
      {
        id: "first-message-done",
        sourceNodeId: "first-message",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  });
}

function clientLifecycleChangedGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "lifecycle",
        kind: "client_lifecycle_changed",
        displayTitle: "Client lifecycle changed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { fromStatus: "new", toStatus: "active", enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_client_lifecycle_changed" }
      }
    ],
    edges: [
      {
        id: "lifecycle-done",
        sourceNodeId: "lifecycle",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  });
}

function newLeadGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "new-lead",
        kind: "new_lead",
        displayTitle: "New lead",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_new_lead" }
      }
    ],
    edges: [
      { id: "new-lead-done", sourceNodeId: "new-lead", targetNodeId: "done", sourceHandle: "next" }
    ]
  });
}

function freeProductReceivedGraph(productId: string): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "free-product",
        kind: "free_product_received",
        displayTitle: "Free product received",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [productId], enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_free_product_received" }
      }
    ],
    edges: [
      {
        id: "free-product-done",
        sourceNodeId: "free-product",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  });
}

function astroEventGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "astro-event",
        kind: "astro_event",
        displayTitle: "Astro event",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { eventCodes: ["full_moon"], enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_astro_event" }
      }
    ],
    edges: [
      {
        id: "astro-event-done",
        sourceNodeId: "astro-event",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  });
}

function scheduleTimeGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "schedule",
        kind: "schedule_time",
        displayTitle: "Schedule",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { scheduleKey: "weekly_digest", enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_schedule_time" }
      }
    ],
    edges: [
      { id: "schedule-done", sourceNodeId: "schedule", targetNodeId: "done", sourceHandle: "next" }
    ]
  });
}

function reviewFirstPublishedGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "review",
        kind: "review_first_published",
        displayTitle: "Review published",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_review_first_published" }
      }
    ],
    edges: [
      { id: "review-done", sourceNodeId: "review", targetNodeId: "done", sourceHandle: "next" }
    ]
  });
}

function subscriptionEventGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "subscription",
        kind: "subscription_event",
        displayTitle: "Subscription event",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { eventTypes: ["renewed"], enrollmentPolicy: "each_occurrence" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "qa_subscription_event" }
      }
    ],
    edges: [
      {
        id: "subscription-done",
        sourceNodeId: "subscription",
        targetNodeId: "done",
        sourceHandle: "next"
      }
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
