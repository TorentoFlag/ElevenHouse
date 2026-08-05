import type {
  FlowDefinitionSummaryV3,
  FlowRunResponse,
  FlowRuntimeAvailability,
  MessagingThread
} from "@elevenhouse/contracts";
import { canProjectLiveFlowRuntime } from "./flowRuntimePresentation";
import { flowRunClientUserId } from "./flowRunSnapshotModel";

export type FlowInboxContext = {
  readonly threadId: string;
  readonly flowName: string;
  readonly currentStepTitle: string;
};

type BuildInboxFlowContextsInput = {
  readonly threads: readonly MessagingThread[];
  readonly flows: readonly FlowDefinitionSummaryV3[];
  readonly runtimeAvailabilityByFlowId: Readonly<
    Record<string, FlowRuntimeAvailability | null | undefined>
  >;
  readonly runsByFlowId: Readonly<Record<string, readonly FlowRunResponse[]>>;
};

const terminalRunStatuses = new Set([
  "completed",
  "skipped",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
]);

export function buildInboxFlowContexts({
  threads,
  flows,
  runtimeAvailabilityByFlowId,
  runsByFlowId
}: BuildInboxFlowContextsInput): FlowInboxContext[] {
  const flowsById = new Map(flows.map((flow) => [flow.id, flow]));
  const activeRuns = Object.values(runsByFlowId)
    .flat()
    .flatMap((run) => {
      const clientUserId = flowRunClientUserId(run.snapshot);
      return clientUserId && !terminalRunStatuses.has(run.status)
        ? [{ run, clientUserId }]
        : [];
    })
    .sort(
      (left, right) => Date.parse(right.run.updatedAt) - Date.parse(left.run.updatedAt)
    );

  return threads.flatMap((thread) => {
    const clientUserId = thread.clientUserId;
    if (!clientUserId) return [];

    const activeRun = activeRuns.find((candidate) => candidate.clientUserId === clientUserId);
    if (!activeRun) return [];
    const { run } = activeRun;

    const flow = flowsById.get(run.flowId);
    if (!flow) return [];
    if (!canProjectLiveFlowRuntime(runtimeAvailabilityByFlowId[flow.id])) return [];

    return [
      {
        threadId: thread.id,
        flowName: flow.name,
        currentStepTitle: flowRunStatusLabel(run.status)
      }
    ];
  });
}

function flowRunStatusLabel(status: FlowRunResponse["status"]): string {
  if (status === "pending") return "Ожидает запуска";
  if (status === "running") return "Выполняется";
  if (status === "waiting") return "Ожидает события";
  if (status === "approval_required") return "Ожидает подтверждения";
  if (status === "failed_retryable") return "Нужен повтор";
  return "Статус воронки обновлен";
}
