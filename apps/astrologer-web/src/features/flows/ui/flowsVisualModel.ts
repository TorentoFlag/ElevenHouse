import type { FlowResponse, FlowTemplate } from "@elevenhouse/contracts";
import {
  flowApprovalModeLabelRu,
  flowStatusLabelRu,
  summarizeFlowGraph,
  type FlowGraphSummary
} from "../model/flowDisplay";

export type FlowRuntimeMetricValue = number | null;

export type FlowGalleryCardModel = {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly approvalModeLabel: string;
  readonly triggerTitle: string | null;
  readonly pathPreview: readonly string[];
  readonly metrics: {
    readonly activeRuns: FlowRuntimeMetricValue;
    readonly waitingApprovals: FlowRuntimeMetricValue;
    readonly completedRuns: FlowRuntimeMetricValue;
    readonly conversionRate: FlowRuntimeMetricValue;
  };
};

export type FlowTemplateCardModel = {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly approvalModeLabel: string;
  readonly triggerTitle: string | null;
  readonly pathPreview: readonly string[];
};

export function buildFlowGalleryCard(flow: FlowResponse): FlowGalleryCardModel {
  const graph = summarizeFlowGraph(flow.draftGraph);

  return {
    id: flow.id,
    title: flow.name,
    statusLabel: flowStatusLabelRu[flow.status],
    approvalModeLabel: flowApprovalModeLabelRu[flow.approvalMode],
    triggerTitle: graph.triggerTitle,
    pathPreview: graph.pathPreview,
    metrics: emptyRuntimeMetrics()
  };
}

export function buildFlowTemplateCard(template: FlowTemplate): FlowTemplateCardModel {
  const graph = summarizeFlowGraph(template.graph);

  return {
    key: template.key,
    title: template.name,
    description: template.description,
    approvalModeLabel: flowApprovalModeLabelRu[template.recommendedApprovalMode],
    triggerTitle: graph.triggerTitle,
    pathPreview: graph.pathPreview
  };
}

function emptyRuntimeMetrics(): FlowGalleryCardModel["metrics"] {
  return {
    activeRuns: null,
    waitingApprovals: null,
    completedRuns: null,
    conversionRate: null
  };
}

export type { FlowGraphSummary };
