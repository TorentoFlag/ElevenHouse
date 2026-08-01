import { useMemo, useState } from "react";
import type {
  CreateFlowRequest,
  FlowGraph,
  FlowApprovalDecision,
  FlowResponse,
  FlowTemplate,
  SimulateFlowRunRequest
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { useActivateFlowMutation } from "../../features/flows/model/useActivateFlowMutation";
import { useCreateManualFlowRunMutation } from "../../features/flows/model/useCreateManualFlowRunMutation";
import { useFlowApprovalsQuery } from "../../features/flows/model/useFlowApprovalsQuery";
import { useFlowListQuery } from "../../features/flows/model/useFlowListQuery";
import { useFlowRunsQuery } from "../../features/flows/model/useFlowRunsQuery";
import { useFlowTemplatesQuery } from "../../features/flows/model/useFlowTemplatesQuery";
import { usePauseFlowMutation } from "../../features/flows/model/usePauseFlowMutation";
import { useCreateFlowMutation } from "../../features/flows/model/useCreateFlowMutation";
import { useDecideFlowApprovalMutation } from "../../features/flows/model/useDecideFlowApprovalMutation";
import { usePublishFlowMutation } from "../../features/flows/model/usePublishFlowMutation";
import { useSimulateFlowRunMutation } from "../../features/flows/model/useSimulateFlowRunMutation";
import { useUpdateFlowDraftMutation } from "../../features/flows/model/useUpdateFlowDraftMutation";
import { FlowsPageView } from "./FlowsPageView";

export function FlowsPage() {
  useDocumentTitle("Воронки");
  const flowsQuery = useFlowListQuery({ status: "all", limit: 50, offset: 0 });
  const templatesQuery = useFlowTemplatesQuery();
  const createFlowMutation = useCreateFlowMutation();
  const updateDraftMutation = useUpdateFlowDraftMutation();
  const publishMutation = usePublishFlowMutation();
  const activateFlowMutation = useActivateFlowMutation();
  const pauseFlowMutation = usePauseFlowMutation();
  const simulateMutation = useSimulateFlowRunMutation();
  const manualRunMutation = useCreateManualFlowRunMutation();
  const decideApprovalMutation = useDecideFlowApprovalMutation();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [createdFlow, setCreatedFlow] = useState<FlowResponse | null>(null);
  const selectedRuntimeFlowId = selectedFlowId ?? createdFlow?.id ?? null;
  const runsQuery = useFlowRunsQuery(selectedRuntimeFlowId, { status: "all", limit: 20, offset: 0 });
  const approvalsQuery = useFlowApprovalsQuery({ status: "pending", limit: 50, offset: 0 });
  const simulation =
    simulateMutation.data?.flowId === selectedRuntimeFlowId ? simulateMutation.data : null;
  const astroCalendarHandoff = useMemo(
    () => parseAstroCalendarFlowHandoff(getCurrentLocationSearch()),
    []
  );

  const openFlow = (flowId: string) => {
    simulateMutation.reset();
    setCreatedFlow(null);
    setSelectedFlowId(flowId);
  };

  const createFlow = () => {
    createFlowMutation.mutate(
      createFlowRequest({
        templates: templatesQuery.data?.templates ?? [],
        astroCalendarHandoff
      }),
      {
        onSuccess: (flow) => {
          simulateMutation.reset();
          setCreatedFlow(flow);
          setSelectedFlowId(flow.id);
        }
      }
    );
  };

  const simulateFlow = (flowId: string) => {
    simulateMutation.mutate({ flowId, body: createManualRuntimeRequest(flowId) });
  };

  const createManualRun = (flowId: string) => {
    manualRunMutation.mutate({ flowId, body: createManualRuntimeRequest(flowId) });
  };

  const decideApproval = (approvalId: string, decision: FlowApprovalDecision) => {
    decideApprovalMutation.mutate({ approvalId, body: { decision } });
  };

  const toggleAutomation = (flowId: string, activate: boolean) => {
    simulateMutation.reset();
    if (activate) {
      activateFlowMutation.mutate(flowId);
    } else {
      pauseFlowMutation.mutate(flowId);
    }
  };

  return (
    <FlowsPageView
      flows={flowsQuery.data?.flows ?? []}
      templates={templatesQuery.data?.templates ?? []}
      isLoading={flowsQuery.isLoading || templatesQuery.isLoading}
      isError={flowsQuery.isError || templatesQuery.isError}
      selectedFlow={createdFlow}
      selectedFlowId={selectedFlowId}
      onCreateFlow={createFlow}
      onOpenFlow={openFlow}
      onAutomationToggle={toggleAutomation}
      onCloseBuilder={() => {
        simulateMutation.reset();
        setCreatedFlow(null);
        setSelectedFlowId(null);
      }}
      onUpdateDraft={(flowId, graph) => updateDraftMutation.mutate({ flowId, body: { graph } })}
      onPublish={(flowId, graph) =>
        updateDraftMutation.mutate(
          { flowId, body: { graph } },
          {
            onSuccess: () =>
              publishMutation.mutate(flowId, {
                onSuccess: (result) => setCreatedFlow(result.flow)
              })
          }
        )
      }
      runs={runsQuery.data?.runs ?? []}
      approvals={approvalsQuery.data?.approvals ?? []}
      simulation={simulation}
      onSimulate={simulateFlow}
      onCreateManualRun={createManualRun}
      onApprovalDecision={decideApproval}
      isLoadingRuns={runsQuery.isLoading}
      isLoadingApprovals={approvalsQuery.isLoading}
      createError={createFlowMutation.error}
      draftUpdateError={updateDraftMutation.error}
      publishError={publishMutation.error}
      runtimeError={simulateMutation.error ?? manualRunMutation.error ?? (runsQuery.error as Error | null)}
      approvalsError={decideApprovalMutation.error ?? (approvalsQuery.error as Error | null)}
      isCreating={createFlowMutation.isPending}
      isUpdatingDraft={updateDraftMutation.isPending}
      isPublishing={publishMutation.isPending}
      isTogglingAutomation={activateFlowMutation.isPending || pauseFlowMutation.isPending}
      isSimulating={simulateMutation.isPending}
      isCreatingManualRun={manualRunMutation.isPending}
      isDecidingApproval={decideApprovalMutation.isPending}
    />
  );
}

function createManualRuntimeRequest(flowId: string): SimulateFlowRunRequest {
  return {
    source: "manual",
    subjectType: "manual",
    subjectId: flowId,
    occurredAt: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    payload: {}
  };
}

const newFlowRequest = {
  name: "Новая воронка",
  approvalMode: "manual_approve",
  graph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "manual_trigger",
        category: "trigger",
        kind: "manual",
        title: "Ручной запуск",
        config: {},
        position: { x: 80, y: 120 }
      }
    ],
    edges: []
  }
} satisfies CreateFlowRequest;

type AstroCalendarFlowHandoff = {
  readonly source: "astro_calendar";
  readonly eventId: string;
  readonly suggestedTemplateKey: string;
  readonly clientId?: string;
};

function createFlowRequest(input: {
  readonly templates: readonly FlowTemplate[];
  readonly astroCalendarHandoff: AstroCalendarFlowHandoff | null;
}): CreateFlowRequest {
  if (!input.astroCalendarHandoff) {
    return newFlowRequest;
  }

  const template = input.templates.find(
    (candidate) => candidate.key === input.astroCalendarHandoff?.suggestedTemplateKey
  );

  if (!template) {
    return newFlowRequest;
  }

  return {
    name: `Астрокалендарь · ${template.name}`,
    approvalMode: template.recommendedApprovalMode,
    graph: applyAstroCalendarContext(template.graph, input.astroCalendarHandoff)
  };
}

function applyAstroCalendarContext(
  graph: FlowGraph,
  handoff: AstroCalendarFlowHandoff
): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.category !== "trigger" || node.kind !== "astro_event") {
        return node;
      }

      return {
        ...node,
        config: {
          ...node.config,
          source: handoff.source,
          eventId: handoff.eventId,
          ...(handoff.clientId ? { clientId: handoff.clientId } : {})
        }
      };
    })
  };
}

function parseAstroCalendarFlowHandoff(search: string): AstroCalendarFlowHandoff | null {
  const searchParams = new URLSearchParams(search);

  if (searchParams.get("source") !== "astro_calendar") {
    return null;
  }

  const eventId = searchParams.get("eventId")?.trim();
  const suggestedTemplateKey = searchParams.get("suggestedTemplateKey")?.trim();

  if (!eventId || !suggestedTemplateKey) {
    return null;
  }

  const clientId = searchParams.get("clientId")?.trim();

  return {
    source: "astro_calendar",
    eventId,
    suggestedTemplateKey,
    ...(clientId ? { clientId } : {})
  };
}

function getCurrentLocationSearch(): string {
  return typeof globalThis.location?.search === "string" ? globalThis.location.search : "";
}
