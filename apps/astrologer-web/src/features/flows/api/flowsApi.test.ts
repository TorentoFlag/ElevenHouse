import {
  type CreateFlowDefinitionV2Request,
  type FlowDefinitionDetailV2,
  type FlowDefinitionSummaryV2,
  type FlowDefinitionTemplateDescriptorV2,
  type FlowDefinitionV2,
  flowGraphV2Schema,
  type CreateFlowRequest,
  type FlowResponse,
  type FlowRunResponse,
  type FlowRuntimeAvailability,
  type FlowApproval,
  type FlowGraphV2,
  type ListFlowApprovalsResponse,
  type ListFlowDefinitionTemplatesV2Response,
  type ListFlowDefinitionsV2Response,
  type ListFlowRunsResponse,
  type ManualFlowRunResponse,
  type MigrateFlowDefinitionV2Response,
  type PublishFlowDefinitionV2Response,
  type ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { activateFlow } from "./activateFlow";
import { createFlow } from "./createFlow";
import { createManualFlowRun } from "./createManualFlowRun";
import { decideFlowApproval } from "./decideFlowApproval";
import { createNextFlowDraft } from "./createNextFlowDraft";
import { getFlowDefinition } from "./getFlowDefinition";
import { listFlowApprovals } from "./listFlowApprovals";
import { listFlowRuns } from "./listFlowRuns";
import { listFlowTemplates } from "./listFlowTemplates";
import { listFlows } from "./listFlows";
import { migrateFlowDefinition } from "./migrateFlowDefinition";
import { pauseFlow } from "./pauseFlow";
import { publishFlow } from "./publishFlow";
import { simulateFlowRun } from "./simulateFlowRun";
import { updateFlowDraft } from "./updateFlowDraft";
import { validateFlowDefinition } from "./validateFlowDefinition";

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

const graphV2: FlowGraphV2 = {
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
      id: "manual-to-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
};

const definitionSummary = {
  schemaVersion: "flow-definition-summary.v2",
  id: flowId,
  ownerUserId,
  name: "Подготовка консультации",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  migrationRequired: false
} satisfies FlowDefinitionSummaryV2;

const definition = {
  schemaVersion: "flow-definition.v2",
  id: flowId,
  ownerUserId,
  name: definitionSummary.name,
  origin: definitionSummary.origin,
  state: "draft",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  draftGraph: graphV2,
  draftPresentation: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: definitionSummary.createdAt,
  updatedAt: definitionSummary.updatedAt,
  publishedAt: null
} satisfies FlowDefinitionV2;

const definitionDetail = {
  ...definitionSummary,
  schemaVersion: "flow-definition-detail.v2",
  draftGraph: graphV2,
  draftPresentation: null
} satisfies FlowDefinitionDetailV2;

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
  schemaVersion: "flow-definition-template.v2",
  key: "manual-consultation-preparation",
  version: 1,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу подготовки и завершить её вручную.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
} satisfies FlowDefinitionTemplateDescriptorV2;

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

  it("loads the localized V2 template catalog without embedding executable graphs", async () => {
    const response = {
      schemaVersion: "flow-definition-template-catalog.v2",
      catalogVersion: 1,
      locale: "ru",
      templates: [template]
    } satisfies ListFlowDefinitionTemplatesV2Response;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(listFlowTemplates("ru")).resolves.toEqual(response);

    expect(get).toHaveBeenCalledWith("/flow-templates?locale=ru");
  });

  it("loads lightweight V2 definitions and a selected detail through shared contracts", async () => {
    const response = {
      schemaVersion: "flow-definition-list.v2",
      flows: [definitionSummary],
      total: 1,
      runtime: definitionOnlyRuntime
    } satisfies ListFlowDefinitionsV2Response;
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(definitionDetail);

    await expect(
      listFlows({ state: "draft", runtimeStatus: "all", limit: 20, offset: 40 })
    ).resolves.toEqual(response);
    await expect(getFlowDefinition(flowId)).resolves.toEqual(definitionDetail);

    expect(get).toHaveBeenNthCalledWith(
      1,
      "/flows?state=draft&runtimeStatus=all&limit=20&offset=40"
    );
    expect(get).toHaveBeenNthCalledWith(2, `/flows/${flowId}`);
  });

  it("rejects flow API responses that do not match shared contracts", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ flows: [{ id: "not-a-uuid" }] });

    await expect(
      listFlows({ state: "all", runtimeStatus: "all", limit: 50, offset: 0 })
    ).rejects.toThrow();
  });

  it("creates, updates, publishes and opens the next draft with revision and idempotency", async () => {
    const createRequest = {
      schemaVersion: "flow-definition-create.v2",
      name: " Подготовка консультации ",
      locale: "ru",
      approvalMode: "manual_approve",
      source: {
        type: "template",
        templateKey: template.key,
        templateVersion: template.version,
        parameters: {}
      }
    } satisfies CreateFlowDefinitionV2Request;
    const publishedFlow = {
      ...definition,
      state: "versioned",
      revision: 2,
      latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
      latestPublishedVersion: 1,
      updatedAt: "2026-07-28T08:10:00.000Z",
      publishedAt: "2026-07-28T08:10:00.000Z"
    } satisfies FlowDefinitionV2;
    const publishResponse = {
      flow: publishedFlow,
      version: {
        schemaVersion: "flow-published-version.v2",
        id: "33333333-3333-4333-8333-333333333333",
        flowId,
        version: 1,
        sourceRevision: 1,
        status: "published",
        approvalMode: "manual_approve",
        graph: graphV2,
        presentation: null,
        capabilityManifest: {
          schemaVersion: "flow-capability-manifest.v1",
          executionSemanticsVersion: "flow-interpreter.v1",
          nodeExecutors: [
            { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
            { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
          ],
          requiredCapabilities: []
        },
        publishedAt: "2026-07-28T08:10:00.000Z"
      }
    } satisfies PublishFlowDefinitionV2Response;
    const nextDraft = {
      ...publishedFlow,
      state: "draft",
      revision: 3,
      draftBaseVersionId: publishedFlow.latestPublishedVersionId,
      updatedAt: "2026-07-28T08:11:00.000Z"
    } satisfies FlowDefinitionV2;
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce(publishResponse)
      .mockResolvedValueOnce(nextDraft);
    const patch = vi.spyOn(application.http, "patch").mockResolvedValue({
      ...definition,
      revision: 2,
      name: "Подготовка консультации 2"
    });

    await expect(
      createFlow({ body: createRequest, idempotencyKey: "flow-create-1" })
    ).resolves.toEqual(definition);
    await expect(
      updateFlowDraft({
        flowId,
        body: { expectedRevision: 1, name: " Подготовка консультации 2 " },
        idempotencyKey: "flow-update-1"
      })
    ).resolves.toMatchObject({
      id: flowId,
      revision: 2,
      name: "Подготовка консультации 2"
    });
    await expect(
      publishFlow({
        flowId,
        body: { expectedRevision: 1 },
        idempotencyKey: "flow-publish-1"
      })
    ).resolves.toEqual(publishResponse);
    await expect(
      createNextFlowDraft({
        flowId,
        body: {
          expectedRevision: 2,
          baseVersionId: publishedFlow.latestPublishedVersionId
        },
        idempotencyKey: "flow-next-draft-1"
      })
    ).resolves.toEqual(nextDraft);

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/flows",
      { ...createRequest, name: "Подготовка консультации" },
      {
        csrf: true,
        headers: { "idempotency-key": "flow-create-1" }
      }
    );
    expect(patch).toHaveBeenCalledWith(
      `/flows/${flowId}/draft`,
      { expectedRevision: 1, name: "Подготовка консультации 2" },
      {
        csrf: true,
        headers: { "idempotency-key": "flow-update-1" }
      }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/flows/${flowId}/publish`,
      { expectedRevision: 1 },
      {
        csrf: true,
        headers: { "idempotency-key": "flow-publish-1" }
      }
    );
    expect(post).toHaveBeenNthCalledWith(
      3,
      `/flows/${flowId}/next-draft`,
      { expectedRevision: 2, baseVersionId: publishedFlow.latestPublishedVersionId },
      {
        csrf: true,
        headers: { "idempotency-key": "flow-next-draft-1" }
      }
    );
  });

  it("migrates a legacy definition explicitly and validates migration evidence", async () => {
    const migrated = {
      flow: {
        ...definition,
        revision: 2,
        origin: {
          schemaVersion: "flow-definition-origin.v1",
          type: "migration",
          sourceGraphSchemaVersion: "flow-graph.v1",
          sourceVersionId: null
        },
        updatedAt: "2026-07-28T08:12:00.000Z"
      },
      migration: {
        schemaVersion: "flow-definition-migration.v1",
        sourceGraphSchemaVersion: "flow-graph.v1",
        targetGraphSchemaVersion: "flow-graph.v2",
        sourceVersionId: null,
        sourceRevision: 1,
        sourceGraphHash: `sha256:${"a".repeat(64)}`,
        migratedAt: "2026-07-28T08:12:00.000Z"
      }
    } satisfies MigrateFlowDefinitionV2Response;
    const post = vi.spyOn(application.http, "post").mockResolvedValue(migrated);

    await expect(
      migrateFlowDefinition({
        flowId,
        body: {
          schemaVersion: "flow-definition-migrate.v2",
          expectedRevision: 1,
          targetGraphSchemaVersion: "flow-graph.v2"
        },
        idempotencyKey: "flow-migrate-1"
      })
    ).resolves.toEqual(migrated);

    expect(post).toHaveBeenCalledWith(
      `/flows/${flowId}/migrations/v2`,
      {
        schemaVersion: "flow-definition-migrate.v2",
        expectedRevision: 1,
        targetGraphSchemaVersion: "flow-graph.v2"
      },
      {
        csrf: true,
        headers: { "idempotency-key": "flow-migrate-1" }
      }
    );
  });

  it("validates a v2 definition through the shared fail-closed contract", async () => {
    const response = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: flowGraphV2Schema.parse({
        ...graphV2,
        nodes: [...graphV2.nodes].reverse()
      }),
      capabilityManifest: {
        schemaVersion: "flow-capability-manifest.v1",
        executionSemanticsVersion: "flow-interpreter.v1",
        nodeExecutors: [
          { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
          { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
        ],
        requiredCapabilities: []
      }
    } satisfies ValidateFlowDefinitionResponse;
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(validateFlowDefinition({ flowId, graph: graphV2 })).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/flows/${flowId}/validate`,
      { graph: graphV2 },
      { csrf: true }
    );
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

    await expect(
      listFlowRuns({ flowId, query: { status: "all", limit: 20, offset: 0 } })
    ).resolves.toEqual(runsResponse);
    await expect(listFlowApprovals({ status: "pending", limit: 50, offset: 0 })).resolves.toEqual(
      approvalsResponse
    );

    expect(get).toHaveBeenNthCalledWith(1, `/flows/${flowId}/runs?status=all&limit=20&offset=0`);
    expect(get).toHaveBeenNthCalledWith(2, "/flow-approvals?status=pending&limit=50&offset=0");
  });

  it("posts approval decisions with CSRF and validates the response", async () => {
    const response = {
      approval: { ...approval, status: "approved", decidedAt: "2026-07-28T08:02:00.000Z" }
    };
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
