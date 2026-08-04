import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "./flows";
import {
  createFlowDefinitionV2RequestSchema,
  createNextFlowDraftV2RequestSchema,
  flowCapabilityManifestV1Schema,
  flowDefinitionCommandRejectionResponseSchema,
  flowDefinitionDetailV2Schema,
  flowDefinitionSummaryV2Schema,
  flowDefinitionTemplateDescriptorV2Schema,
  flowDefinitionV2Schema,
  flowGraphReadSchema,
  flowGraphV2Schema,
  flowPresentationV1Schema,
  flowPublishedVersionCompatibleSchema,
  flowPublishedVersionV2Schema,
  flowPublishedVersionV3Schema,
  listFlowDefinitionTemplatesV2QuerySchema,
  listFlowDefinitionTemplatesV2ResponseSchema,
  listFlowDefinitionsV2QuerySchema,
  listFlowDefinitionsV2ResponseSchema,
  migrateFlowDefinitionV2RequestSchema,
  migrateFlowDefinitionV2ResponseSchema,
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionV2ResponseSchema,
  publishFlowDefinitionV3ResponseSchema,
  publishFlowDefinitionCompatibleResponseSchema,
  updateFlowDefinitionDraftV2RequestSchema,
  validateFlowDefinitionRequestSchema,
  validateFlowDefinitionResponseV1Schema,
  validateFlowDefinitionResponseV2Schema,
  validateFlowDefinitionCompatibleResponseSchema,
  validateFlowDefinitionResponseSchema,
  type FlowGraphV2
} from "./flows-v2";

const manualClientGraph = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "trigger-manual-client",
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
      config: {
        goalKey: "consultation_prepared"
      }
    }
  ],
  edges: [
    {
      id: "trigger-to-completed",
      sourceNodeId: "trigger-manual-client",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
} satisfies FlowGraphV2;

const legacyGraph = flowGraphSchema.parse({
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "trigger-booking",
      category: "trigger",
      kind: "booking_confirmed",
      title: "Запись подтверждена",
      config: {}
    }
  ],
  edges: []
});

describe("flow graph v2 contracts", () => {
  it("parses a minimal strict executable graph", () => {
    expect(flowGraphV2Schema.parse(manualClientGraph)).toEqual(manualClientGraph);
  });

  it("keeps v1 and v2 readable through an explicit read union", () => {
    expect(flowGraphReadSchema.parse(legacyGraph)).toEqual(legacyGraph);
    expect(flowGraphReadSchema.parse(manualClientGraph)).toEqual(manualClientGraph);
  });

  it("keeps list summaries lightweight and discriminates readable V1 from editable V2", () => {
    const common = {
      schemaVersion: "flow-definition-summary.v2",
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      name: "Consultation preparation",
      state: "draft",
      runtimeStatus: "draft",
      approvalMode: "manual_approve",
      revision: 1,
      draftBaseVersionId: null,
      latestPublishedVersionId: null,
      latestPublishedVersion: null,
      createdAt: "2026-08-02T18:00:00.000Z",
      updatedAt: "2026-08-02T18:00:00.000Z",
      publishedAt: null
    } as const;
    const legacy = {
      ...common,
      graphSchemaVersion: "flow-graph.v1",
      origin: null,
      migrationRequired: true
    } as const;
    const current = {
      ...common,
      id: "44444444-4444-4444-8444-444444444444",
      graphSchemaVersion: "flow-graph.v2",
      origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
      migrationRequired: false
    } as const;

    expect(flowDefinitionSummaryV2Schema.parse(legacy)).toEqual(legacy);
    expect(flowDefinitionSummaryV2Schema.parse(current)).toEqual(current);
    expect(
      flowDefinitionSummaryV2Schema.safeParse({
        ...legacy,
        draftGraph: legacyGraph
      }).success
    ).toBe(false);
    expect(
      flowDefinitionSummaryV2Schema.safeParse({
        ...current,
        latestPublishedVersionId: "33333333-3333-4333-8333-333333333333"
      }).success
    ).toBe(false);
    expect(
      listFlowDefinitionsV2QuerySchema.parse({ state: "draft", runtimeStatus: "all" })
    ).toEqual({ state: "draft", runtimeStatus: "all", limit: 50, offset: 0 });
    expect(listFlowDefinitionsV2QuerySchema.safeParse({ status: "draft" }).success).toBe(false);
    expect(
      listFlowDefinitionsV2ResponseSchema.parse({
        schemaVersion: "flow-definition-list.v2",
        flows: [legacy, current],
        total: 2,
        runtime: {
          mode: "definition_only",
          executionAvailable: false,
          reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
          historySemantics: "legacy_preview"
        }
      }).flows
    ).toHaveLength(2);
    expect(
      listFlowDefinitionsV2ResponseSchema.safeParse({
        schemaVersion: "flow-definition-list.v2",
        flows: [legacy, current],
        total: 1,
        runtime: {
          mode: "definition_only",
          executionAvailable: false,
          reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
          historySemantics: "legacy_preview"
        }
      }).success
    ).toBe(false);
    expect(
      listFlowDefinitionsV2ResponseSchema.safeParse({
        schemaVersion: "flow-definition-list.v2",
        flows: [legacy, legacy],
        total: 2,
        runtime: {
          mode: "definition_only",
          executionAvailable: false,
          reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
          historySemantics: "legacy_preview"
        }
      }).success
    ).toBe(false);
  });

  it("returns a full detail while making V1 migration and V2 editability explicit", () => {
    const common = {
      schemaVersion: "flow-definition-detail.v2",
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      name: "Consultation preparation",
      state: "draft",
      runtimeStatus: "draft",
      approvalMode: "manual_approve",
      revision: 1,
      draftBaseVersionId: null,
      latestPublishedVersionId: null,
      latestPublishedVersion: null,
      createdAt: "2026-08-02T18:00:00.000Z",
      updatedAt: "2026-08-02T18:00:00.000Z",
      publishedAt: null
    } as const;
    const legacy = {
      ...common,
      graphSchemaVersion: "flow-graph.v1",
      origin: null,
      migrationRequired: true,
      draftGraph: legacyGraph,
      draftPresentation: null
    } as const;
    const current = {
      ...common,
      graphSchemaVersion: "flow-graph.v2",
      origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
      migrationRequired: false,
      draftGraph: manualClientGraph,
      draftPresentation: {
        schemaVersion: "flow-presentation.v1",
        nodes: [
          { nodeId: "trigger-manual-client", position: { x: 80, y: 120 } },
          { nodeId: "completed", position: { x: 400, y: 120 } }
        ],
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    } as const;

    expect(flowDefinitionDetailV2Schema.parse(legacy)).toEqual(legacy);
    expect(flowDefinitionDetailV2Schema.parse(current)).toEqual(current);
    expect(
      flowDefinitionDetailV2Schema.safeParse({
        ...legacy,
        migrationRequired: false
      }).success
    ).toBe(false);
    expect(
      flowDefinitionDetailV2Schema.safeParse({
        ...current,
        draftPresentation: {
          ...current.draftPresentation,
          nodes: current.draftPresentation.nodes.slice(0, 1)
        }
      }).success
    ).toBe(false);
  });

  it("rejects presentation state inside the executable graph", () => {
    const result = flowGraphV2Schema.safeParse({
      ...manualClientGraph,
      nodes: [
        {
          ...manualClientGraph.nodes[0],
          position: { x: 80, y: 240 }
        },
        manualClientGraph.nodes[1]
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "nodes.0")).toBe(true);
  });

  it("rejects unknown config fields instead of silently stripping them", () => {
    const result = flowGraphV2Schema.safeParse({
      ...manualClientGraph,
      nodes: [
        {
          ...manualClientGraph.nodes[0],
          config: { guessedClientId: "client-1" }
        },
        manualClientGraph.nodes[1]
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "nodes.0.config")).toBe(
      true
    );
  });

  it("rejects unavailable node kinds and untyped edge outcomes", () => {
    expect(
      flowGraphV2Schema.safeParse({
        ...manualClientGraph,
        nodes: [
          {
            ...manualClientGraph.nodes[0],
            kind: "repeat_until"
          },
          manualClientGraph.nodes[1]
        ]
      }).success
    ).toBe(false);

    expect(
      flowGraphV2Schema.safeParse({
        ...manualClientGraph,
        edges: [{ ...manualClientGraph.edges[0], sourceHandle: "completed" }]
      }).success
    ).toBe(false);
  });

  it("requires explicit versioned configs for every initial node kind", () => {
    const nodes = [
      {
        id: "booking",
        kind: "booking_confirmed",
        displayTitle: "Запись подтверждена",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: ["11111111-1111-4111-8111-111111111111"] }
      },
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Клиент выбран вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "birth-data",
        kind: "birth_data_available",
        displayTitle: "Данные рождения доступны",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { purpose: "service_preparation" }
      },
      {
        id: "work-item",
        kind: "astrologer_work_item",
        displayTitle: "Подготовить консультацию",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          taskKind: "consultation_preparation",
          taskTitle: "Подготовить консультацию",
          instructions: "Проверьте исходные данные и ключевые тезисы.",
          priority: "normal"
        }
      },
      {
        id: "approval",
        kind: "astrologer_approval",
        displayTitle: "Проверить материал",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          approvalKind: "ai_output",
          approvalTitle: "Подтвердить материал",
          expiresAfterMinutes: 1_440
        }
      },
      {
        id: "completed",
        kind: "completed",
        displayTitle: "Завершено",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
      },
      {
        id: "suppressed",
        kind: "suppressed",
        displayTitle: "Остановлено политикой",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "birth_data_access_denied" }
      },
      {
        id: "failed",
        kind: "failed",
        displayTitle: "Ошибка выполнения",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { errorCode: "preparation_failed" }
      }
    ];

    for (const node of nodes) {
      const result = flowGraphV2Schema.safeParse({
        schemaVersion: "flow-graph.v2",
        nodes: [node],
        edges: []
      });
      expect(result.success, node.kind).toBe(true);
    }
  });

  it("rejects duplicate booking product filters", () => {
    const productId = "11111111-1111-4111-8111-111111111111";
    const result = flowGraphV2Schema.safeParse({
      schemaVersion: "flow-graph.v2",
      nodes: [
        {
          id: "booking",
          kind: "booking_confirmed",
          displayTitle: "Запись подтверждена",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: { productIds: [productId, productId] }
        }
      ],
      edges: []
    });

    expect(result.success).toBe(false);
  });
});

describe("flow presentation v1 contracts", () => {
  it("stores canvas state separately from business execution", () => {
    const presentation = {
      schemaVersion: "flow-presentation.v1",
      nodes: [
        {
          nodeId: "trigger-manual-client",
          position: { x: 80, y: 240 },
          collapsed: false
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    };

    expect(flowPresentationV1Schema.parse(presentation)).toEqual(presentation);
    expect(
      flowPresentationV1Schema.safeParse({ ...presentation, selectedNodeId: "completed" }).success
    ).toBe(false);
  });
});

describe("flow definition validation contracts", () => {
  const capabilityManifest = {
    schemaVersion: "flow-capability-manifest.v1",
    executionSemanticsVersion: "flow-interpreter.v1",
    nodeExecutors: [
      { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
      { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
    ],
    requiredCapabilities: []
  } as const;
  const capabilityManifestV2 = {
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
  } as const;

  it("accepts either readable graph version as validation input", () => {
    expect(validateFlowDefinitionRequestSchema.parse({ graph: legacyGraph })).toEqual({
      graph: legacyGraph
    });
    expect(validateFlowDefinitionRequestSchema.parse({ graph: manualClientGraph })).toEqual({
      graph: manualClientGraph
    });
  });

  it("keeps the historical V1 validation envelope readable for consumer-first rollout", () => {
    const response = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: manualClientGraph,
      capabilityManifest
    } as const;

    expect(flowCapabilityManifestV1Schema.parse(capabilityManifest)).toEqual(capabilityManifest);
    expect(validateFlowDefinitionResponseV1Schema.parse(response)).toEqual(response);
    expect(validateFlowDefinitionResponseSchema.parse(response)).toEqual(response);
    expect(validateFlowDefinitionCompatibleResponseSchema.parse(response)).toEqual(response);
    expect(validateFlowDefinitionResponseV2Schema.safeParse(response).success).toBe(false);
  });

  it("accepts a versioned trigger matcher without treating the trigger as a worker executor", () => {
    const response = {
      schemaVersion: "flow-definition-validation.v2",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: manualClientGraph,
      capabilityManifest: capabilityManifestV2
    } as const;

    expect(validateFlowDefinitionResponseV2Schema.parse(response)).toEqual(response);
    expect(validateFlowDefinitionCompatibleResponseSchema.parse(response)).toEqual(response);
    expect(validateFlowDefinitionResponseSchema.safeParse(response).success).toBe(false);
    expect(validateFlowDefinitionResponseV1Schema.safeParse(response).success).toBe(false);
    expect(
      validateFlowDefinitionCompatibleResponseSchema.safeParse({
        ...response,
        capabilityManifest: {
          ...capabilityManifestV2,
          nodeExecutors: [
            ...capabilityManifestV2.nodeExecutors,
            { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
          ]
        }
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionCompatibleResponseSchema.safeParse({
        ...response,
        capabilityManifest: {
          ...capabilityManifestV2,
          triggerMatcher: {
            kind: "completed",
            configSchemaVersion: 1,
            matcherContractVersion: 1,
            eventSchemaVersion: 1
          }
        }
      }).success
    ).toBe(false);
    const { eventSchemaVersion: _eventSchemaVersion, ...unpinnedMatcher } =
      capabilityManifestV2.triggerMatcher;
    expect(
      validateFlowDefinitionCompatibleResponseSchema.safeParse({
        ...response,
        capabilityManifest: {
          ...capabilityManifestV2,
          triggerMatcher: unpinnedMatcher
        }
      }).success
    ).toBe(false);
  });

  it("parses an explicit v1 migration blocker", () => {
    const response = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v1",
      publishable: false,
      activatable: false,
      issues: [
        {
          code: "migration_required",
          severity: "error",
          blocking: true,
          path: "schemaVersion",
          message: "Flow graph v1 requires explicit migration before publishing."
        }
      ],
      activationBlockers: ["FLOW_GRAPH_MIGRATION_REQUIRED", "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: null,
      capabilityManifest: null
    } as const;

    expect(validateFlowDefinitionResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects contradictory publish and activation claims", () => {
    const missingCompiledSnapshot = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: null,
      capabilityManifest: null
    };
    expect(validateFlowDefinitionResponseSchema.safeParse(missingCompiledSnapshot).success).toBe(
      false
    );

    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...missingCompiledSnapshot,
        normalizedGraph: manualClientGraph,
        capabilityManifest,
        activatable: true
      }).success
    ).toBe(false);
  });

  it("rejects partial compile artifacts and version-specific blocker contradictions", () => {
    const compilerIssue = {
      code: "missing_required_source_handle",
      severity: "error",
      blocking: true,
      path: "nodes.manual",
      message: "Manual trigger requires a next edge."
    } as const;
    const migrationIssue = {
      code: "migration_required",
      severity: "error",
      blocking: true,
      path: "schemaVersion",
      message: "Migration required."
    } as const;
    const invalidV2 = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: false,
      activatable: false,
      issues: [compilerIssue],
      activationBlockers: ["FLOW_GRAPH_NOT_PUBLISHABLE"],
      normalizedGraph: null,
      capabilityManifest: null
    } as const;

    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...invalidV2,
        normalizedGraph: manualClientGraph
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...invalidV2,
        activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"]
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...invalidV2,
        issues: [migrationIssue],
        activationBlockers: ["FLOW_GRAPH_MIGRATION_REQUIRED"]
      }).success
    ).toBe(false);

    const validV1 = {
      ...invalidV2,
      graphSchemaVersion: "flow-graph.v1",
      issues: [migrationIssue],
      activationBlockers: ["FLOW_GRAPH_MIGRATION_REQUIRED"]
    } as const;
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...validV1,
        activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"]
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...validV1,
        issues: [compilerIssue]
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...validV1,
        capabilityManifest
      }).success
    ).toBe(false);
  });
});

describe("flow definition v2 lifecycle contracts", () => {
  const presentation = {
    schemaVersion: "flow-presentation.v1",
    nodes: manualClientGraph.nodes.map((node, index) => ({
      nodeId: node.id,
      position: { x: index * 320, y: 120 }
    })),
    viewport: { x: 0, y: 0, zoom: 1 }
  } as const;
  const definition = {
    schemaVersion: "flow-definition.v2",
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    name: "Подготовка к консультации",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    state: "draft",
    approvalMode: "manual_approve",
    revision: 3,
    draftBaseVersionId: null,
    draftGraph: manualClientGraph,
    draftPresentation: presentation,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: "2026-08-02T18:00:00.000Z",
    updatedAt: "2026-08-02T18:05:00.000Z",
    publishedAt: null
  } as const;
  const capabilityManifest = {
    schemaVersion: "flow-capability-manifest.v1",
    executionSemanticsVersion: "flow-interpreter.v1",
    nodeExecutors: [
      { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
      { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
    ],
    requiredCapabilities: []
  } as const;
  const capabilityManifestV2 = {
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
  } as const;
  const version = {
    schemaVersion: "flow-published-version.v2",
    id: "33333333-3333-4333-8333-333333333333",
    flowId: definition.id,
    version: 1,
    sourceRevision: definition.revision,
    status: "published",
    approvalMode: "manual_approve",
    graph: manualClientGraph,
    presentation,
    capabilityManifest,
    publishedAt: "2026-08-02T18:10:00.000Z"
  } as const;
  const currentVersion = {
    ...version,
    schemaVersion: "flow-published-version.v3",
    capabilityManifest: capabilityManifestV2
  } as const;
  const publishedDefinition = {
    ...definition,
    state: "versioned",
    revision: definition.revision + 1,
    latestPublishedVersionId: version.id,
    latestPublishedVersion: version.version,
    updatedAt: version.publishedAt,
    publishedAt: version.publishedAt
  } as const;

  it("parses revisioned drafts and immutable compiled versions", () => {
    expect(flowDefinitionV2Schema.parse(definition)).toEqual(definition);
    expect(flowPublishedVersionV2Schema.parse(version)).toEqual(version);
    expect(flowPublishedVersionV2Schema.safeParse(currentVersion).success).toBe(false);
    expect(flowPublishedVersionV3Schema.parse(currentVersion)).toEqual(currentVersion);
    expect(flowPublishedVersionCompatibleSchema.parse(version)).toEqual(version);
    expect(flowPublishedVersionCompatibleSchema.parse(currentVersion)).toEqual(currentVersion);
    expect(
      publishFlowDefinitionV2ResponseSchema.parse({ flow: publishedDefinition, version })
    ).toEqual({ flow: publishedDefinition, version });
    expect(
      publishFlowDefinitionV3ResponseSchema.parse({
        flow: publishedDefinition,
        version: currentVersion
      })
    ).toEqual({ flow: publishedDefinition, version: currentVersion });
    expect(
      publishFlowDefinitionCompatibleResponseSchema.parse({ flow: publishedDefinition, version })
    ).toEqual({ flow: publishedDefinition, version });
    expect(
      publishFlowDefinitionCompatibleResponseSchema.parse({
        flow: publishedDefinition,
        version: currentVersion
      })
    ).toEqual({ flow: publishedDefinition, version: currentVersion });
  });

  it("requires a mutation field and positive expected revision", () => {
    expect(
      updateFlowDefinitionDraftV2RequestSchema.safeParse({ expectedRevision: 3 }).success
    ).toBe(false);
    expect(
      updateFlowDefinitionDraftV2RequestSchema.safeParse({
        expectedRevision: 3,
        name: "Новая версия"
      }).success
    ).toBe(true);
    expect(publishFlowDefinitionV2RequestSchema.safeParse({ expectedRevision: 0 }).success).toBe(
      false
    );
    expect(
      createNextFlowDraftV2RequestSchema.safeParse({
        expectedRevision: 3,
        baseVersionId: version.id
      }).success
    ).toBe(true);
    expect(createNextFlowDraftV2RequestSchema.safeParse({ expectedRevision: 3 }).success).toBe(
      false
    );
  });

  it("rejects partial publication pointers and presentation drift", () => {
    expect(
      flowDefinitionV2Schema.safeParse({
        ...definition,
        latestPublishedVersionId: version.id
      }).success
    ).toBe(false);
    expect(
      flowDefinitionV2Schema.safeParse({
        ...definition,
        draftPresentation: {
          ...presentation,
          nodes: presentation.nodes.slice(0, 1)
        }
      }).success
    ).toBe(false);
    expect(
      updateFlowDefinitionDraftV2RequestSchema.safeParse({
        expectedRevision: 3,
        graph: manualClientGraph,
        presentation: {
          ...presentation,
          nodes: presentation.nodes.slice(0, 1)
        }
      }).success
    ).toBe(false);
  });

  it("rejects contradictory definition lifecycle and publish snapshots", () => {
    expect(
      flowDefinitionV2Schema.safeParse({
        ...definition,
        state: "versioned"
      }).success
    ).toBe(false);
    expect(
      flowDefinitionV2Schema.safeParse({
        ...definition,
        draftBaseVersionId: version.id
      }).success
    ).toBe(false);
    expect(
      flowDefinitionV2Schema.parse({
        ...publishedDefinition,
        state: "draft",
        draftBaseVersionId: version.id
      })
    ).toMatchObject({
      state: "draft",
      draftBaseVersionId: version.id,
      latestPublishedVersionId: version.id
    });
    expect(
      flowDefinitionV2Schema.safeParse({
        ...publishedDefinition,
        state: "draft",
        draftBaseVersionId: "44444444-4444-4444-8444-444444444444"
      }).success
    ).toBe(false);
    expect(
      publishFlowDefinitionV2ResponseSchema.safeParse({
        flow: publishedDefinition,
        version: { ...version, sourceRevision: 1 }
      }).success
    ).toBe(false);
    expect(
      publishFlowDefinitionV2ResponseSchema.safeParse({
        flow: publishedDefinition,
        version: { ...version, approvalMode: "draft_only" }
      }).success
    ).toBe(false);
    expect(
      publishFlowDefinitionV2ResponseSchema.safeParse({
        flow: publishedDefinition,
        version: {
          ...version,
          graph: {
            ...manualClientGraph,
            nodes: manualClientGraph.nodes.map((node) =>
              node.id === "completed" ? { ...node, displayTitle: "Другой результат" } : node
            )
          }
        }
      }).success
    ).toBe(false);
  });

  it("validates exact persisted command rejection envelopes", () => {
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 400,
        body: { code: "FLOW_IDEMPOTENCY_KEY_INVALID" }
      })
    ).toMatchObject({ statusCode: 400 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: { code: "FLOW_IDEMPOTENCY_KEY_REUSED" }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: {
          code: "FLOW_DRAFT_REVISION_CONFLICT",
          expectedRevision: 2,
          currentRevision: 3
        }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 404,
        body: { code: "FLOW_DEFINITION_NOT_FOUND" }
      })
    ).toMatchObject({ statusCode: 404 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.safeParse({
        statusCode: 409,
        body: { code: "FLOW_IDEMPOTENCY_KEY_INVALID" }
      }).success
    ).toBe(false);
    expect(
      flowDefinitionCommandRejectionResponseSchema.safeParse({
        statusCode: 500,
        body: { code: "FLOW_DEFINITION_NOT_FOUND" }
      }).success
    ).toBe(false);
    expect(
      flowDefinitionCommandRejectionResponseSchema.safeParse({
        statusCode: 422,
        body: {
          code: "FLOW_DRAFT_REVISION_CONFLICT",
          expectedRevision: 2,
          currentRevision: 3
        }
      }).success
    ).toBe(false);
  });
});

describe("flow definition v2 create, template and migration contracts", () => {
  const availableTemplate = {
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
  } as const;
  const legacyTemplate = {
    ...availableTemplate,
    key: "session-prep",
    name: "Подготовка к живой сессии",
    description: "Legacy-сценарий требует явной миграции и недоступен для создания.",
    availability: "legacy_read_only",
    requiredCapabilities: ["chart_engine"],
    blockerCode: "FLOW_TEMPLATE_LEGACY_GRAPH_ONLY"
  } as const;

  it("exposes versioned template descriptors without client-owned graphs", () => {
    expect(listFlowDefinitionTemplatesV2QuerySchema.parse({ locale: "en" })).toEqual({
      locale: "en"
    });
    expect(flowDefinitionTemplateDescriptorV2Schema.parse(availableTemplate)).toEqual(
      availableTemplate
    );
    expect(
      listFlowDefinitionTemplatesV2ResponseSchema.parse({
        schemaVersion: "flow-definition-template-catalog.v2",
        catalogVersion: 1,
        locale: "ru",
        templates: [availableTemplate, legacyTemplate]
      })
    ).toMatchObject({ templates: [availableTemplate, legacyTemplate] });
    expect(
      flowDefinitionTemplateDescriptorV2Schema.safeParse({
        ...availableTemplate,
        graph: manualClientGraph
      }).success
    ).toBe(false);
    expect(
      flowDefinitionTemplateDescriptorV2Schema.safeParse({
        ...availableTemplate,
        blockerCode: "FLOW_TEMPLATE_CAPABILITY_UNAVAILABLE"
      }).success
    ).toBe(false);
    expect(
      flowDefinitionTemplateDescriptorV2Schema.safeParse({
        ...legacyTemplate,
        blockerCode: null
      }).success
    ).toBe(false);
  });

  it("accepts only server-owned blank or template V2 creation sources", () => {
    expect(
      createFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-create.v2",
        name: "Новая воронка",
        locale: "ru",
        source: { type: "blank" }
      })
    ).toMatchObject({ approvalMode: "manual_approve", source: { type: "blank" } });
    expect(
      createFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-create.v2",
        name: "Consultation preparation",
        locale: "en",
        approvalMode: "manual_approve",
        source: {
          type: "template",
          templateKey: availableTemplate.key,
          templateVersion: 99,
          parameters: {}
        }
      })
    ).toMatchObject({ source: { templateVersion: 99 } });
    expect(
      createFlowDefinitionV2RequestSchema.safeParse({
        schemaVersion: "flow-definition-create.v2",
        name: "Подменённая воронка",
        locale: "ru",
        source: { type: "blank" },
        graph: manualClientGraph
      }).success
    ).toBe(false);
    expect(
      createFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-create.v2",
        name: "Параметры вне версии контракта",
        locale: "ru",
        source: {
          type: "template",
          templateKey: availableTemplate.key,
          templateVersion: 1,
          parameters: { product_id: "33333333-3333-4333-8333-333333333333" }
        }
      })
    ).toMatchObject({ source: { parameters: { product_id: expect.any(String) } } });
  });

  it("requires an exact legacy revision and validates migration evidence", () => {
    expect(
      migrateFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-migrate.v2",
        expectedRevision: 3,
        targetGraphSchemaVersion: "flow-graph.v2"
      })
    ).toMatchObject({ expectedRevision: 3, targetGraphSchemaVersion: "flow-graph.v2" });
    expect(
      migrateFlowDefinitionV2RequestSchema.safeParse({
        schemaVersion: "flow-definition-migrate.v2",
        expectedRevision: 0,
        targetGraphSchemaVersion: "flow-graph.v2"
      }).success
    ).toBe(false);

    const migratedFlow = flowDefinitionV2Schema.parse({
      schemaVersion: "flow-definition.v2",
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      name: "Legacy draft",
      origin: {
        schemaVersion: "flow-definition-origin.v1",
        type: "migration",
        sourceGraphSchemaVersion: "flow-graph.v1",
        sourceVersionId: null
      },
      state: "draft",
      approvalMode: "manual_approve",
      revision: 4,
      draftBaseVersionId: null,
      draftGraph: {
        schemaVersion: "flow-graph.v2",
        nodes: [manualClientGraph.nodes[0]],
        edges: []
      },
      draftPresentation: {
        schemaVersion: "flow-presentation.v1",
        nodes: [{ nodeId: manualClientGraph.nodes[0]!.id, position: { x: 80, y: 120 } }],
        viewport: { x: 0, y: 0, zoom: 1 }
      },
      latestPublishedVersionId: null,
      latestPublishedVersion: null,
      createdAt: "2026-08-02T18:00:00.000Z",
      updatedAt: "2026-08-02T18:10:00.000Z",
      publishedAt: null
    });
    const migration = {
      schemaVersion: "flow-definition-migration.v1",
      sourceGraphSchemaVersion: "flow-graph.v1",
      targetGraphSchemaVersion: "flow-graph.v2",
      sourceVersionId: null,
      sourceRevision: 3,
      sourceGraphHash: `sha256:${"a".repeat(64)}`,
      migratedAt: "2026-08-02T18:10:00.000Z"
    } as const;

    expect(migrateFlowDefinitionV2ResponseSchema.parse({ flow: migratedFlow, migration })).toEqual({
      flow: migratedFlow,
      migration
    });
    expect(
      migrateFlowDefinitionV2ResponseSchema.safeParse({
        flow: migratedFlow,
        migration: { ...migration, sourceRevision: 2 }
      }).success
    ).toBe(false);
  });

  it("binds template and migration failures to exact persisted HTTP statuses", () => {
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: {
          code: "FLOW_TEMPLATE_VERSION_CONFLICT",
          templateKey: availableTemplate.key,
          requestedVersion: 2,
          currentVersion: 1
        }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: {
          code: "FLOW_TEMPLATE_NOT_AVAILABLE",
          templateKey: legacyTemplate.key,
          reasonCode: "FLOW_TEMPLATE_LEGACY_GRAPH_ONLY"
        }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 404,
        body: {
          code: "FLOW_TEMPLATE_NOT_FOUND",
          templateKey: "unknown-template"
        }
      })
    ).toMatchObject({ statusCode: 404 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 422,
        body: {
          code: "FLOW_TEMPLATE_PARAMETERS_INVALID",
          templateKey: availableTemplate.key,
          parameterPaths: ["product_id"]
        }
      })
    ).toMatchObject({ statusCode: 422 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 422,
        body: {
          code: "FLOW_GRAPH_MIGRATION_BLOCKED",
          issues: [
            {
              code: "unsupported_node",
              path: "nodes.send-message",
              message: "Legacy send_message has no lossless V2 mapping."
            }
          ]
        }
      })
    ).toMatchObject({ statusCode: 422 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: { code: "FLOW_GRAPH_ALREADY_V2" }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: { code: "FLOW_DEFINITION_MIGRATION_NOT_ALLOWED", state: "archived" }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowDefinitionCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: { code: "FLOW_IDEMPOTENCY_KEY_EXPIRED" }
      })
    ).toMatchObject({ statusCode: 409 });
  });
});
