import type { FlowResponse, FlowRunResponse, MessagingThread } from "@elevenhouse/contracts";

export type FlowInboxContext = {
  readonly threadId: string;
  readonly flowName: string;
  readonly currentStepTitle: string;
};

type BuildInboxFlowContextsInput = {
  readonly threads: readonly MessagingThread[];
  readonly flows: readonly FlowResponse[];
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
  runsByFlowId
}: BuildInboxFlowContextsInput): FlowInboxContext[] {
  const flowsById = new Map(flows.map((flow) => [flow.id, flow]));
  const activeRuns = Object.values(runsByFlowId)
    .flat()
    .filter((run) => run.snapshot.subjectType === "client" && !terminalRunStatuses.has(run.status))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return threads.flatMap((thread) => {
    const clientUserId = thread.clientUserId;
    if (!clientUserId) return [];

    const run = activeRuns.find((candidate) => candidate.snapshot.subjectId === clientUserId);
    if (!run) return [];

    const flow = flowsById.get(run.flowId);
    if (!flow) return [];

    return [
      {
        threadId: thread.id,
        flowName: flow.name,
        currentStepTitle: currentStepTitle(flow, run)
      }
    ];
  });
}

function currentStepTitle(flow: FlowResponse, run: FlowRunResponse): string {
  const currentNodeId = run.currentNodeId;
  const node = currentNodeId
    ? flow.draftGraph.nodes.find((candidate) => candidate.id === currentNodeId)
    : null;

  return node?.title ?? flowRunStatusLabel(run.status);
}

function flowRunStatusLabel(status: FlowRunResponse["status"]): string {
  if (status === "pending") return "Ожидает запуска";
  if (status === "running") return "Выполняется";
  if (status === "waiting") return "Ожидает события";
  if (status === "approval_required") return "Ожидает подтверждения";
  if (status === "failed_retryable") return "Нужен повтор";
  return "Статус воронки обновлен";
}
