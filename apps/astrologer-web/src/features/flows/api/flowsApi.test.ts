import type {
  CreateFlowRequest,
  FlowResponse,
  FlowRunResponse,
  FlowRuntimeAvailability,
  FlowApproval,
  FlowTemplate,
  ListFlowApprovalsResponse,
  ListFlowRunsResponse,
  ListFlowTemplatesResponse,
  ListFlowsResponse,
  ManualFlowRunResponse,
  PublishFlowResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { activateFlow } from "./activateFlow";
import { createFlow } from "./createFlow";
import { createManualFlowRun } from "./createManualFlowRun";
import { decideFlowApproval } from "./decideFlowApproval";
import { listFlowApprovals } from "./listFlowApprovals";
import { listFlowRuns } from "./listFlowRuns";
import { listFlowTemplates } from "./listFlowTemplates";
import { listFlows } from "./listFlows";
import { pauseFlow } from "./pauseFlow";
import { publishFlow } from "./publishFlow";
import { simulateFlowRun } from "./simulateFlowRun";
import { updateFlowDraft } from "./updateFlowDraft";

const flowId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

const graph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "lead-created",
      category: "trigger",
      kind: "lead_created",
      title: "Новый лид",
      config: {}
    },
    {
      id: "draft-reply",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "Черновик ответа",
      config: {}
    }
  ],
  edges: [{ id: "edge-1", fromNodeId: "lead-created", toNodeId: "draft-reply" }]
} satisfies CreateFlowRequest["graph"];

const flowResponse = {
  id: flowId,
  ownerUserId,
  name: "Лид-магнит",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: graph,
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
} satisfies FlowResponse;

const template = {
  key: "session-prep",
  name: "Подготовка к сессии",
  description: "Собрать данные и подготовить AI-бриф до консультации.",
  category: "service_delivery",
  recommendedApprovalMode: "manual_approve",
  requiredCapabilities: ["booking_confirmed", "request_birth_data"],
  graph
} satisfies FlowTemplate;

const run = {
  id: "44444444-4444-4444-8444-444444444444",
  flowId,
  flowVersionId: "33333333-3333-4333-8333-333333333333",
  ownerUserId,
  sourceEventId: "manual:test",
  status: "approval_required",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v1",
    flowVersionId: "33333333-3333-4333-8333-333333333333",
    sourceEventId: "manual:test",
    subjectType: "manual",
    subjectId: flowId,
    occurredAt: "2026-07-28T08:00:00.000Z",
    timeZone: "Europe/Moscow",
    consent: {},
    channels: {},
    payload: {}
  },
  currentNodeId: "draft-reply",
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  completedAt: null
} satisfies FlowRunResponse;

const approval = {
  id: "55555555-5555-4555-8555-555555555555",
  flowRunId: run.id,
  stepRunId: null,
  status: "pending",
  kind: "ai_output",
  title: "Проверить AI-черновик",
  preview: "Сообщение клиенту ожидает подтверждения.",
  createdAt: "2026-07-28T08:01:00.000Z",
  decidedAt: null
} satisfies FlowApproval;

describe("flows API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads flow templates and validates the shared response contract", async () => {
    const response = { templates: [template] } satisfies ListFlowTemplatesResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(listFlowTemplates()).resolves.toEqual(response);

    expect(get).toHaveBeenCalledWith("/flow-templates");
  });

  it("loads flows with serialized filters through the shared response contract", async () => {
    const response = {
      flows: [flowResponse],
      total: 1,
      runtime: definitionOnlyRuntime
    } satisfies ListFlowsResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(listFlows({ status: "draft", limit: 20, offset: 40 })).resolves.toEqual(
      response
    );

    expect(get).toHaveBeenCalledWith("/flows?status=draft&limit=20&offset=40");
  });

  it("rejects flow API responses that do not match shared contracts", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ flows: [{ id: "not-a-uuid" }] });

    await expect(listFlows({ status: "all", limit: 50, offset: 0 })).rejects.toThrow();
  });

  it("creates, updates and publishes flows through CSRF-protected endpoints", async () => {
    const createRequest = {
      name: " Лид-магнит ",
      approvalMode: "manual_approve",
      graph
    } satisfies CreateFlowRequest;
    const publishResponse = {
      flow: { ...flowResponse, status: "published", publishedVersion: 1 },
      version: {
        id: "33333333-3333-4333-8333-333333333333",
        flowId,
        version: 1,
        status: "published",
        approvalMode: "manual_approve",
        graph,
        publishedAt: "2026-07-28T08:10:00.000Z"
      }
    } satisfies PublishFlowResponse;
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(flowResponse)
      .mockResolvedValueOnce(publishResponse);
    const patch = vi.spyOn(application.http, "patch").mockResolvedValue({
      ...flowResponse,
      name: "Лид-магнит 2"
    });

    await expect(createFlow(createRequest)).resolves.toEqual(flowResponse);
    await expect(
      updateFlowDraft({ flowId, body: { name: " Лид-магнит 2 " } })
    ).resolves.toMatchObject({
      id: flowId,
      name: "Лид-магнит 2"
    });
    await expect(publishFlow(flowId)).resolves.toEqual(publishResponse);

    expect(post).toHaveBeenNthCalledWith(1, "/flows", { ...createRequest, name: "Лид-магнит" }, {
      csrf: true
    });
    expect(patch).toHaveBeenCalledWith(`/flows/${flowId}/draft`, { name: "Лид-магнит 2" }, {
      csrf: true
    });
    expect(post).toHaveBeenNthCalledWith(2, `/flows/${flowId}/publish`, undefined, {
      csrf: true
    });
  });

  it("activates and pauses flow automation through CSRF-protected endpoints", async () => {
    const activeFlow = {
      ...flowResponse,
      status: "active",
      publishedVersionId: "33333333-3333-4333-8333-333333333333",
      publishedVersion: 1,
      publishedAt: "2026-07-28T08:10:00.000Z"
    } satisfies FlowResponse;
    const pausedFlow = { ...activeFlow, status: "paused" } satisfies FlowResponse;
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(activeFlow)
      .mockResolvedValueOnce(pausedFlow);

    await expect(activateFlow(flowId)).resolves.toEqual(activeFlow);
    await expect(pauseFlow(flowId)).resolves.toEqual(pausedFlow);

    expect(post).toHaveBeenNthCalledWith(1, `/flows/${flowId}/activate`, undefined, {
      csrf: true
    });
    expect(post).toHaveBeenNthCalledWith(2, `/flows/${flowId}/pause`, undefined, {
      csrf: true
    });
  });

  it("runs simulation and manual run commands through CSRF-protected endpoints", async () => {
    const request = {
      source: "manual",
      subjectType: "manual",
      subjectId: flowId,
      occurredAt: "2026-07-28T08:00:00.000Z",
      timeZone: "Europe/Moscow",
      payload: {}
    } as const;
    const simulationResponse = {
      flowId,
      flowVersionId: run.flowVersionId,
      plannedSteps: [{ nodeId: "draft-reply", status: "approval_required", reason: null }],
      warnings: []
    };
    const manualResponse = {
      status: "created",
      event: {
        id: "66666666-6666-4666-8666-666666666666",
        ownerUserId,
        source: "manual",
        sourceEventId: "manual:test",
        dedupeKey: "manual:test",
        subjectType: "manual",
        subjectId: flowId,
        occurredAt: "2026-07-28T08:00:00.000Z",
        payload: {}
      },
      run,
      stepRuns: [],
      approvals: [approval]
    } satisfies ManualFlowRunResponse;
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(simulationResponse)
      .mockResolvedValueOnce(manualResponse);

    await expect(simulateFlowRun({ flowId, body: request })).resolves.toEqual(simulationResponse);
    await expect(createManualFlowRun({ flowId, body: request })).resolves.toEqual(manualResponse);

    expect(post).toHaveBeenNthCalledWith(1, `/flows/${flowId}/simulate`, request, {
      csrf: true
    });
    expect(post).toHaveBeenNthCalledWith(2, `/flows/${flowId}/manual-runs`, request, {
      csrf: true
    });
  });

  it("loads runtime runs and approvals through shared response contracts", async () => {
    const runsResponse = {
      runs: [run],
      total: 1,
      runtime: definitionOnlyRuntime
    } satisfies ListFlowRunsResponse;
    const approvalsResponse = {
      approvals: [approval],
      total: 1,
      runtime: definitionOnlyRuntime
    } satisfies ListFlowApprovalsResponse;
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce(runsResponse)
      .mockResolvedValueOnce(approvalsResponse);

    await expect(listFlowRuns({ flowId, query: { status: "all", limit: 20, offset: 0 } })).resolves.toEqual(
      runsResponse
    );
    await expect(listFlowApprovals({ status: "pending", limit: 50, offset: 0 })).resolves.toEqual(
      approvalsResponse
    );

    expect(get).toHaveBeenNthCalledWith(1, `/flows/${flowId}/runs?status=all&limit=20&offset=0`);
    expect(get).toHaveBeenNthCalledWith(2, "/flow-approvals?status=pending&limit=50&offset=0");
  });

  it("posts approval decisions with CSRF and validates the response", async () => {
    const response = { approval: { ...approval, status: "approved", decidedAt: "2026-07-28T08:02:00.000Z" } };
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      decideFlowApproval({
        approvalId: approval.id,
        body: { decision: "approved", note: "Проверено" }
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/flow-approvals/${approval.id}/decision`,
      { decision: "approved", note: "Проверено" },
      { csrf: true }
    );
  });
});
