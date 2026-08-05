import {
  FLOW_DEFINITION_DETAIL_V3_MEDIA_TYPE,
  FLOW_DEFINITION_LIST_V3_MEDIA_TYPE,
  FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE,
  FLOW_PUBLICATION_V3_MEDIA_TYPE,
  type FlowDefinitionDetailV3,
  type FlowDefinitionSummaryV3,
  type FlowCapabilityManifestV2,
  type FlowGraphV2,
  type PublishFlowDefinitionV3Response,
  type ValidateFlowDefinitionResponseV2
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { application } from "../../../Application";
import { getFlowDefinition } from "./getFlowDefinition";
import { listFlows } from "./listFlows";
import { publishFlow } from "./publishFlow";
import { validateFlowDefinition } from "./validateFlowDefinition";

const flowId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";

const graph: FlowGraphV2 = {
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

describe("flow definition V3 API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads strict V3 list/detail projections with enrollment authority", async () => {
    const summary = definitionSummary();
    const detail = definitionDetail();
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce({
        schemaVersion: "flow-definition-list.v3",
        flows: [summary],
        total: 1
      })
      .mockResolvedValueOnce(detail);

    await expect(
      listFlows({ state: "draft", enrollmentState: "inactive", limit: 20, offset: 40 })
    ).resolves.toMatchObject({ flows: [{ enrollment: { authority: "enrollment_v1" } }] });
    await expect(getFlowDefinition(flowId)).resolves.toEqual(detail);

    expect(get).toHaveBeenNthCalledWith(
      1,
      "/flows?state=draft&enrollmentState=inactive&limit=20&offset=40",
      {
        cache: "no-store",
        headers: { accept: FLOW_DEFINITION_LIST_V3_MEDIA_TYPE }
      }
    );
    expect(get).toHaveBeenNthCalledWith(2, `/flows/${flowId}`, {
      cache: "no-store",
      headers: { accept: FLOW_DEFINITION_DETAIL_V3_MEDIA_TYPE }
    });
  });

  it("rejects V2/default JSON fallback on the V3 read path", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({
      schemaVersion: "flow-definition-list.v2",
      flows: [],
      total: 0,
      runtime: {
        mode: "definition_only",
        executionAvailable: false,
        reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        historySemantics: "legacy_preview"
      }
    });

    await expect(
      listFlows({ state: "all", enrollmentState: "all", limit: 50, offset: 0 })
    ).rejects.toThrow();
  });

  it("publishes strict V3 and validates strict V2 without compatibility fallback", async () => {
    const publication = publishedDefinition();
    const validation = validationResponse();
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(publication)
      .mockResolvedValueOnce(validation);

    await expect(
      publishFlow({
        flowId,
        body: { expectedRevision: 1 },
        idempotencyKey: "flows:publish:attempt-1"
      })
    ).resolves.toEqual(publication);
    await expect(validateFlowDefinition({ flowId, graph })).resolves.toEqual(validation);

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/flows/${flowId}/publish`,
      { expectedRevision: 1 },
      {
        csrf: true,
        headers: {
          accept: FLOW_PUBLICATION_V3_MEDIA_TYPE,
          "idempotency-key": "flows:publish:attempt-1"
        }
      }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/flows/${flowId}/validate`,
      { graph },
      {
        csrf: true,
        headers: { accept: FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE }
      }
    );
  });
});

function definitionSummary(): Extract<
  FlowDefinitionSummaryV3,
  { graphSchemaVersion: "flow-graph.v2" }
> {
  return {
    schemaVersion: "flow-definition-summary.v3",
    id: flowId,
    ownerUserId,
    name: "Подготовка консультации",
    state: "draft",
    approvalMode: "manual_approve",
    revision: 1,
    draftBaseVersionId: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: "2026-08-04T18:00:00.000Z",
    updatedAt: "2026-08-04T18:00:00.000Z",
    publishedAt: null,
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
  };
}

function definitionDetail(): FlowDefinitionDetailV3 {
  return {
    ...definitionSummary(),
    schemaVersion: "flow-definition-detail.v3",
    draftGraph: graph,
    draftPresentation: null
  };
}

function capabilityManifest(): FlowCapabilityManifestV2 {
  return {
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
  };
}

function publishedDefinition(): PublishFlowDefinitionV3Response {
  return {
    flow: {
      schemaVersion: "flow-definition.v2",
      id: flowId,
      ownerUserId,
      name: "Подготовка консультации",
      origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
      state: "versioned",
      approvalMode: "manual_approve",
      revision: 2,
      draftBaseVersionId: null,
      draftGraph: graph,
      draftPresentation: null,
      latestPublishedVersionId: versionId,
      latestPublishedVersion: 1,
      createdAt: "2026-08-04T18:00:00.000Z",
      updatedAt: "2026-08-04T18:05:00.000Z",
      publishedAt: "2026-08-04T18:05:00.000Z"
    },
    version: {
      schemaVersion: "flow-published-version.v3",
      id: versionId,
      flowId,
      version: 1,
      sourceRevision: 1,
      status: "published",
      approvalMode: "manual_approve",
      graph,
      presentation: null,
      capabilityManifest: capabilityManifest(),
      publishedAt: "2026-08-04T18:05:00.000Z"
    }
  };
}

function validationResponse(): ValidateFlowDefinitionResponseV2 {
  return {
    schemaVersion: "flow-definition-validation.v2",
    graphSchemaVersion: "flow-graph.v2",
    publishable: true,
    activatable: false,
    issues: [],
    activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
    normalizedGraph: graph,
    capabilityManifest: capabilityManifest()
  };
}
