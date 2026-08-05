import {
  flowExecutableNodeKindV2Schema,
  flowRunSnapshotV2Schema,
  flowWorkItemQueueEntrySchema,
  type FlowWorkItem,
  type FlowWorkItemQueueEntry
} from "@elevenhouse/contracts";
import {
  FlowBookingLifecycleIntegrityError,
  FlowExecutionIntegrityError,
  formatFlowNodeExecutorKey,
  projectCurrentBookingScheduleOntoFlowRunSnapshot,
  resolveFlowWorkItemDueAt,
  resolveFlowWorkItemNodePolicy,
  resolvePinnedFlowExecutionNode
} from "@elevenhouse/domain";

export type FlowWorkItemQueueProjectionEvidence = {
  readonly workItem: FlowWorkItem;
  readonly flow: {
    readonly id: string;
    readonly currentName: string;
  };
  readonly definition: {
    readonly flowVersionId: string;
    readonly nodeId: string;
    readonly nodeKind: string;
    readonly configSchemaVersion: number;
    readonly executorContractVersion: number;
    readonly executorKey: string;
    readonly graph: unknown;
    readonly capabilityManifest: unknown;
  };
  readonly runSnapshot: unknown;
  readonly event: {
    readonly subjectType: string;
    readonly subjectId: string;
  };
  readonly deadlineBasis: {
    readonly duePolicyKind: string;
    readonly dueLeadTimeMinutes: number | null;
    readonly dueBookingLifecycleRevision: number | null;
  };
  readonly booking: {
    readonly id: string;
    readonly clientUserId: string;
    readonly productId: string;
    readonly lifecycleRevision: number;
    readonly state: string;
    readonly currentStartAt: Date;
    readonly currentEndAt: Date;
    readonly timeZoneSnapshot: string;
    readonly productTitleSnapshot: string;
  } | null;
  readonly bookingLifecycleHead: {
    readonly bookingId: string;
    readonly appliedRevision: number;
    readonly state: string;
    readonly currentStartAt: Date | null;
    readonly currentEndAt: Date | null;
    readonly currentTimeZone: string | null;
  } | null;
  readonly clientCurrentDisplayName: string | null;
};

export type FlowWorkItemBookingFreshnessEvidence = {
  readonly workItem: Pick<FlowWorkItem, "status" | "dueAt">;
  readonly runSnapshot: unknown;
  readonly deadlineBasis: FlowWorkItemQueueProjectionEvidence["deadlineBasis"];
  readonly duePolicy: ReturnType<typeof resolveFlowWorkItemNodePolicy>["duePolicy"];
  readonly booking: NonNullable<FlowWorkItemQueueProjectionEvidence["booking"]>;
  readonly bookingLifecycleHead: FlowWorkItemQueueProjectionEvidence["bookingLifecycleHead"];
};

export type FlowWorkItemBookingFreshness =
  | {
      readonly kind: "current";
      readonly lifecycleRevision: number;
      readonly state: "confirmed";
      readonly schedule: {
        readonly startAt: Date;
        readonly endAt: Date;
        readonly timeZone: string;
      };
    }
  | {
      readonly kind: "pending";
      readonly bookingId: string;
      readonly appliedRevision: number;
      readonly aggregateRevision: number;
    }
  | { readonly kind: "integrity_error" };

export function projectFlowWorkItemQueueEntry(
  evidence: FlowWorkItemQueueProjectionEvidence
): FlowWorkItemQueueEntry {
  const snapshot = flowRunSnapshotV2Schema.safeParse(evidence.runSnapshot);
  const nodePolicy = resolveNodePolicy(evidence);
  const booking = evidence.booking;
  if (
    !snapshot.success ||
    nodePolicy === null ||
    booking === null ||
    evidence.event.subjectType !== "booking" ||
    evidence.event.subjectId !== booking.id ||
    snapshot.data.subject.bookingId !== booking.id ||
    snapshot.data.enrollment.occurrenceKey !== booking.id ||
    snapshot.data.subject.clientUserId !== booking.clientUserId ||
    snapshot.data.subject.productId !== booking.productId
  ) {
    return integrityError(evidence.workItem);
  }

  const freshness = resolveFlowWorkItemBookingFreshness({
    workItem: evidence.workItem,
    runSnapshot: evidence.runSnapshot,
    deadlineBasis: evidence.deadlineBasis,
    duePolicy: nodePolicy.duePolicy,
    booking,
    bookingLifecycleHead: evidence.bookingLifecycleHead
  });
  if (freshness.kind === "pending") {
    return bookingContextPending(
      evidence.workItem,
      freshness.bookingId,
      freshness.appliedRevision,
      freshness.aggregateRevision
    );
  }
  if (freshness.kind === "integrity_error") {
    return integrityError(evidence.workItem);
  }

  const projected = flowWorkItemQueueEntrySchema.safeParse({
    workItem: evidence.workItem,
    context: {
      status: "available",
      subjectType: "booking",
      completionRequirements: nodePolicy.completionRequirements,
      flow: evidence.flow,
      booking: {
        id: booking.id,
        lifecycleRevision: freshness.lifecycleRevision,
        state: freshness.state,
        currentStartAt: freshness.schedule.startAt.toISOString(),
        currentEndAt: freshness.schedule.endAt.toISOString(),
        timeZoneSnapshot: freshness.schedule.timeZone
      },
      client: {
        userId: booking.clientUserId,
        currentDisplayName: evidence.clientCurrentDisplayName
      },
      product: {
        id: booking.productId,
        titleSnapshot: booking.productTitleSnapshot
      }
    }
  });
  return projected.success ? projected.data : integrityError(evidence.workItem);
}

export function resolveFlowWorkItemBookingFreshness(
  evidence: FlowWorkItemBookingFreshnessEvidence
): FlowWorkItemBookingFreshness {
  const booking = evidence.booking;
  const head = evidence.bookingLifecycleHead;
  if (booking.lifecycleRevision < 1) return { kind: "integrity_error" };
  if (head === null) {
    return {
      kind: "pending",
      bookingId: booking.id,
      appliedRevision: 0,
      aggregateRevision: booking.lifecycleRevision
    };
  }
  if (head.bookingId !== booking.id || head.appliedRevision < 1) {
    return { kind: "integrity_error" };
  }
  if (booking.lifecycleRevision > head.appliedRevision) {
    return {
      kind: "pending",
      bookingId: booking.id,
      appliedRevision: head.appliedRevision,
      aggregateRevision: booking.lifecycleRevision
    };
  }
  if (
    booking.lifecycleRevision < head.appliedRevision ||
    booking.state !== head.state ||
    head.state !== "confirmed" ||
    head.currentStartAt === null ||
    head.currentEndAt === null ||
    head.currentTimeZone === null ||
    booking.currentStartAt.getTime() !== head.currentStartAt.getTime() ||
    booking.currentEndAt.getTime() !== head.currentEndAt.getTime() ||
    booking.timeZoneSnapshot !== head.currentTimeZone ||
    !hasCoherentDeadlineBasis(evidence, head)
  ) {
    return { kind: "integrity_error" };
  }
  return {
    kind: "current",
    lifecycleRevision: head.appliedRevision,
    state: "confirmed",
    schedule: {
      startAt: head.currentStartAt,
      endAt: head.currentEndAt,
      timeZone: head.currentTimeZone
    }
  };
}

function resolveNodePolicy(evidence: FlowWorkItemQueueProjectionEvidence) {
  const definition = evidence.definition;
  const nodeKind = flowExecutableNodeKindV2Schema.safeParse(definition.nodeKind);
  if (
    !nodeKind.success ||
    definition.flowVersionId !== evidence.workItem.flowVersionId ||
    definition.nodeId !== evidence.workItem.nodeId
  ) {
    return null;
  }

  try {
    const node = resolvePinnedFlowExecutionNode({
      flowVersionId: definition.flowVersionId,
      nodeId: definition.nodeId,
      nodeKind: nodeKind.data,
      configSchemaVersion: definition.configSchemaVersion,
      executorContractVersion: definition.executorContractVersion,
      graph: definition.graph,
      capabilityManifest: definition.capabilityManifest
    });
    if (
      node.kind !== "astrologer_work_item" ||
      formatFlowNodeExecutorKey(node) !== definition.executorKey
    ) {
      return null;
    }
    return resolveFlowWorkItemNodePolicy(node);
  } catch (error) {
    if (error instanceof FlowExecutionIntegrityError) return null;
    throw error;
  }
}

function hasCoherentDeadlineBasis(
  evidence: FlowWorkItemBookingFreshnessEvidence,
  head: NonNullable<FlowWorkItemQueueProjectionEvidence["bookingLifecycleHead"]>
): boolean {
  const basis = evidence.deadlineBasis;
  const duePolicy = evidence.duePolicy;
  if (basis.duePolicyKind !== duePolicy.kind) return false;
  if (duePolicy.kind === "none") {
    return (
      basis.dueLeadTimeMinutes === null &&
      basis.dueBookingLifecycleRevision === null &&
      evidence.workItem.dueAt === null
    );
  }
  if (basis.dueLeadTimeMinutes !== duePolicy.leadTimeMinutes || evidence.workItem.dueAt === null) {
    return false;
  }
  if (
    isActiveWorkItem(evidence.workItem) &&
    basis.dueBookingLifecycleRevision !== head.appliedRevision
  ) {
    return false;
  }

  try {
    const effectiveSnapshot = projectCurrentBookingScheduleOntoFlowRunSnapshot({
      runSnapshot: evidence.runSnapshot,
      bookingId: head.bookingId,
      schedule: {
        startAt: head.currentStartAt!.toISOString(),
        endAt: head.currentEndAt!.toISOString(),
        timeZone: head.currentTimeZone!
      }
    });
    return (
      !isActiveWorkItem(evidence.workItem) ||
      resolveFlowWorkItemDueAt(duePolicy, effectiveSnapshot) === evidence.workItem.dueAt
    );
  } catch (error) {
    if (
      error instanceof FlowBookingLifecycleIntegrityError ||
      error instanceof FlowExecutionIntegrityError ||
      error instanceof TypeError
    ) {
      return false;
    }
    throw error;
  }
}

function isActiveWorkItem(workItem: Pick<FlowWorkItem, "status">): boolean {
  return (
    workItem.status === "pending" ||
    workItem.status === "in_progress" ||
    workItem.status === "snoozed"
  );
}

function bookingContextPending(
  workItem: FlowWorkItem,
  bookingId: string,
  appliedRevision: number,
  aggregateRevision: number
): FlowWorkItemQueueEntry {
  return flowWorkItemQueueEntrySchema.parse({
    workItem,
    context: {
      status: "context_pending",
      code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
      bookingId,
      appliedRevision,
      aggregateRevision
    }
  });
}

function integrityError(workItem: FlowWorkItem): FlowWorkItemQueueEntry {
  return flowWorkItemQueueEntrySchema.parse({
    workItem,
    context: {
      status: "integrity_error",
      code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
    }
  });
}
