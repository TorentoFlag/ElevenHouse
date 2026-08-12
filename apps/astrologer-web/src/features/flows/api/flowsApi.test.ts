import {
  type CreateFlowDefinitionV2Request,
  type FlowDefinitionDetail,
  type FlowDefinitionSummary,
  type FlowDefinitionTemplateDescriptorV2,
  type FlowDefinitionV2,
  flowGraphV2Schema,
  type FlowRunResponse,
  type GetFlowRunResponse,
  type FlowRuntimeAvailability,
  type FlowApproval,
  type FlowGraphV2,
  type ListFlowApprovalsResponse,
  type ListFlowDefinitionTemplatesV2Response,
  type ListFlowDefinitionsResponse,
  type ListFlowRunsResponse,
  type CreateManualClientFlowRunResponse,
  type PublishFlowDefinitionResponse,
  type ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { createFlow } from "./createFlow";
import { createManualFlowRun } from "./createManualFlowRun";
import { decideFlowApproval } from "./decideFlowApproval";
import { createNextFlowDraft } from "./createNextFlowDraft";
import { cancelFlowRun } from "./cancelFlowRun";
import { getFlowDefinition } from "./getFlowDefinition";
import { getFlowRun } from "./getFlowRun";
import { listFlowApprovals } from "./listFlowApprovals";
import { listFlowRuns } from "./listFlowRuns";
import { listFlowTemplates } from "./listFlowTemplates";
import { listFlows } from "./listFlows";
import { publishFlow } from "./publishFlow";
import { updateFlowDraft } from "./updateFlowDraft";
import { validateFlowDefinition } from "./validateFlowDefinition";

const flowId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

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
  id: flowId,
  ownerUserId,
  name: "Подготовка консультации",
  state: "draft",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  activeRunCount: 0,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  enrollment: {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "inactive",
      definitionRevision: 1,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    }
  }
} satisfies FlowDefinitionSummary;

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
  draftGraph: graphV2,
  draftPresentation: null
} satisfies FlowDefinitionDetail;

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
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "55555555-5555-4555-8555-555555555555",
      triggerNodeId: "manual",
      occurrenceKey: "66666666-6666-4666-8666-666666666666",
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-07-28T08:00:00.000Z",
      enrolledAt: "2026-07-28T08:00:00.000Z"
    },
    subject: {
      type: "booking",
      bookingId: "66666666-6666-4666-8666-666666666666",
      clientUserId: "77777777-7777-4777-8777-777777777777",
      productId: "88888888-8888-4888-8888-888888888888",
      startAt: "2026-07-29T08:00:00.000Z",
      endAt: "2026-07-29T09:00:00.000Z"
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "99999999-9999-4999-8999-999999999999"
    }
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
  artifact: null,
  revision: 1,
  snoozedUntil: null,
  expiresAt: null,
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

  it("loads lightweight definitions and a selected detail through the current JSON contract", async () => {
    const response = {
      flows: [definitionSummary],
      total: 1,
      runtime: definitionOnlyRuntime
    } satisfies ListFlowDefinitionsResponse;
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(definitionDetail);

    await expect(
      listFlows({ state: "draft", enrollmentState: "all", limit: 20, offset: 40 })
    ).resolves.toEqual(response);
    await expect(getFlowDefinition(flowId)).resolves.toEqual(definitionDetail);

    expect(get).toHaveBeenNthCalledWith(
      1,
      "/flows?state=draft&enrollmentState=all&limit=20&offset=40",
      {
        cache: "no-store"
      }
    );
    expect(get).toHaveBeenNthCalledWith(2, `/flows/${flowId}`, {
      cache: "no-store"
    });
  });

  it("rejects flow API responses that do not match shared contracts", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ flows: [{ id: "not-a-uuid" }] });

    await expect(
      listFlows({ state: "all", enrollmentState: "all", limit: 50, offset: 0 })
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
        id: "33333333-3333-4333-8333-333333333333",
        flowId,
        version: 1,
        sourceRevision: 1,
        status: "published",
        approvalMode: "manual_approve",
        graph: graphV2,
        presentation: null,
        capabilityManifest: {
          schemaVersion: "flow-capability-manifest.v2",
          executionSemanticsVersion: "flow-interpreter.v1",
          triggerMatcher: {
            kind: "manual_client",
            configSchemaVersion: 1,
            matcherContractVersion: 1,
            eventSchemaVersion: 1
          },
          nodeExecutors: [
            { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }
          ],
          requiredCapabilities: []
        },
        publishedAt: "2026-07-28T08:10:00.000Z"
      }
    } satisfies PublishFlowDefinitionResponse;
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
        headers: {
          "idempotency-key": "flow-publish-1"
        }
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

  it("validates a v2 definition through the shared fail-closed contract", async () => {
    const response = {
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
        schemaVersion: "flow-capability-manifest.v2",
        executionSemanticsVersion: "flow-interpreter.v1",
        triggerMatcher: {
          kind: "manual_client",
          configSchemaVersion: 1,
          matcherContractVersion: 1,
          eventSchemaVersion: 1
        },
        nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }],
        requiredCapabilities: []
      }
    } satisfies ValidateFlowDefinitionResponse;
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(validateFlowDefinition({ flowId, graph: graphV2 })).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/flows/${flowId}/validate`,
      { graph: graphV2 },
      {
        csrf: true
      }
    );
  });

  it("runs owner-scoped manual client enrollment through a CSRF-protected endpoint", async () => {
    const manualRequest = {
      clientUserId: "99999999-9999-4999-8999-999999999999"
    } as const;
    const manualResponse = {
      status: "enrolled",
      replayed: false,
      eventId: "66666666-6666-4666-8666-666666666666",
      runs: [
        {
          runId: run.id,
          tokenId: "77777777-7777-4777-8777-777777777777",
          flowId,
          flowVersionId: run.flowVersionId,
          activationEpochId: "88888888-8888-4888-8888-888888888888"
        }
      ]
    } satisfies CreateManualClientFlowRunResponse;
    const post = vi.spyOn(application.http, "post").mockResolvedValue(manualResponse);

    await expect(
      createManualFlowRun({
        flowId,
        body: manualRequest,
        idempotencyKey: "manual-client-run-test"
      })
    ).resolves.toEqual(manualResponse);

    expect(post).toHaveBeenCalledWith(`/flows/${flowId}/manual-runs`, manualRequest, {
      csrf: true,
      headers: { "idempotency-key": "manual-client-run-test" }
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

  it("reads a durable run trace and cancels through the owner-safe commands", async () => {
    const detail = {
      run,
      trace: [
        {
          sequence: "1",
          eventType: "run_enrolled",
          nodeId: "manual",
          summary: { source: "manual" },
          occurredAt: "2026-07-28T08:00:00.000Z"
        }
      ],
      runtime: definitionOnlyRuntime
    } satisfies GetFlowRunResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(detail);
    const post = vi.spyOn(application.http, "post").mockResolvedValue({ run });

    await expect(getFlowRun(run.id)).resolves.toEqual(detail);
    await expect(
      cancelFlowRun({ runId: run.id, idempotencyKey: "flow-run-cancel-test" })
    ).resolves.toEqual({ run });

    expect(get).toHaveBeenCalledWith(`/flow-runs/${run.id}`);
    expect(post).toHaveBeenCalledWith(
      `/flow-runs/${run.id}/cancel`,
      {},
      { csrf: true, headers: { "idempotency-key": "flow-run-cancel-test" } }
    );
  });

  it("posts approval decisions with CSRF and validates the response", async () => {
    const response = {
      approval: { ...approval, status: "approved", decidedAt: "2026-07-28T08:02:00.000Z" }
    };
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      decideFlowApproval({
        approvalId: approval.id,
        body: { expectedRevision: 1, decision: "approved", note: "Проверено" },
        idempotencyKey: "flow-approval-decision-1"
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/flow-approvals/${approval.id}/decision`,
      { expectedRevision: 1, decision: "approved", note: "Проверено" },
      { csrf: true, headers: { "idempotency-key": "flow-approval-decision-1" } }
    );
  });
});
