import {
  flowGraphV2Schema,
  type FlowGraphV2,
  type FlowNodeKindV2,
  type FlowSourceHandleV2
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import {
  classifyFlowExecutionFailure,
  createBuiltInFlowNodeExecutorRegistry,
  createFlowNodeExecutorRegistry,
  FlowExecutionIntegrityError,
  FlowNodeExecutionError,
  FlowNodeExecutorUnavailableError,
  formatFlowNodeExecutorKey,
  interpretFlowExecutionClaim,
  parseFlowExecutionDecision,
  parseFlowRuntimeTraceSummary,
  type FlowExecutionClaim
} from "./flow-execution-interpreter";
import { compileFlowGraphV2, projectFlowCapabilityManifestV1 } from "./flow-graph-v2-compiler";

describe("flow execution interpreter", () => {
  it("returns an explicit completed decision for the capability-free terminal executor", async () => {
    const node = completedNode();
    const graph = terminalGraph(node);

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({ graph, nodeId: node.id, nodeKind: node.kind }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).resolves.toEqual({
      kind: "terminal",
      sourceNodeId: node.id,
      terminalStatus: "completed",
      resultCode: "consultation_prepared",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: node.kind,
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: "consultation_prepared"
      }
    });
  });

  it("executes a downstream node pinned by a v2 manifest with a separate trigger matcher", async () => {
    const node = completedNode();
    const graph = terminalGraph(node);

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: node.id,
          nodeKind: node.kind,
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
          }
        }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).resolves.toMatchObject({
      kind: "terminal",
      sourceNodeId: node.id,
      resultCode: "consultation_prepared"
    });
  });

  it.each([
    {
      mismatch: "trigger matcher",
      capabilityManifest: {
        schemaVersion: "flow-capability-manifest.v2",
        executionSemanticsVersion: "flow-interpreter.v1",
        triggerMatcher: {
          kind: "booking_confirmed",
          configSchemaVersion: 1,
          matcherContractVersion: 1,
          eventSchemaVersion: 1
        },
        nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }],
        requiredCapabilities: []
      }
    },
    {
      mismatch: "executor set",
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
          { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
          { kind: "suppressed", configSchemaVersion: 1, executorContractVersion: 1 }
        ],
        requiredCapabilities: []
      }
    },
    {
      mismatch: "capability set",
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
        requiredCapabilities: ["products.read"]
      }
    }
  ] as const)(
    "rejects a v2 manifest with a mismatched $mismatch",
    async ({ capabilityManifest }) => {
      const node = completedNode();

      await expect(
        interpretFlowExecutionClaim({
          claim: claim({
            graph: terminalGraph(node),
            nodeId: node.id,
            nodeKind: node.kind,
            capabilityManifest
          }),
          registry: createBuiltInFlowNodeExecutorRegistry()
        })
      ).rejects.toEqual(
        expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
          name: "FlowExecutionIntegrityError",
          code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
        })
      );
    }
  );

  it("rejects a historical v1 manifest that is not the exact graph projection", async () => {
    const node = completedNode();

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph: terminalGraph(node),
          nodeId: node.id,
          nodeKind: node.kind,
          capabilityManifest: {
            schemaVersion: "flow-capability-manifest.v1",
            executionSemanticsVersion: "flow-interpreter.v1",
            nodeExecutors: [
              { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }
            ],
            requiredCapabilities: []
          }
        }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
      })
    );
  });

  it("resolves one executor-selected handle to an explicit pinned-graph advance", async () => {
    const graph = birthDataConditionGraph();

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "birth-data",
          nodeKind: "birth_data_available"
        }),
        registry: advancingRegistry("true")
      })
    ).resolves.toEqual({
      kind: "advance",
      sourceNodeId: "birth-data",
      sourceHandle: "true",
      selectedEdgeId: "birth-yes",
      targetNodeId: "completed",
      targetNodeKind: "completed",
      resultCode: "FLOW_TOKEN_ADVANCED",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "advanced",
        nodeKind: "birth_data_available",
        reasonCode: "FLOW_EDGE_SELECTED",
        resultCode: "FLOW_TOKEN_ADVANCED",
        sourceHandle: "true",
        selectedEdgeId: "birth-yes",
        targetNodeId: "completed",
        targetNodeKind: "completed"
      }
    });
  });

  it("fails closed when a corrupted pinned graph has two targets for one selected handle", async () => {
    const validGraph = birthDataConditionGraph();
    const graph = flowGraphV2Schema.parse({
      ...validGraph,
      edges: [
        ...validGraph.edges,
        {
          id: "birth-yes-duplicate",
          sourceNodeId: "birth-data",
          targetNodeId: "suppressed",
          sourceHandle: "true"
        }
      ]
    });

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "birth-data",
          nodeKind: "birth_data_available"
        }),
        registry: advancingRegistry("true")
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_GRAPH_INVALID"
      })
    );
  });

  it("fails closed when the selected handle has no pinned edge", async () => {
    const validGraph = birthDataConditionGraph();
    const graph = flowGraphV2Schema.parse({
      ...validGraph,
      edges: validGraph.edges.filter((edge) => edge.sourceHandle !== "true")
    });

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({ graph, nodeId: "birth-data", nodeKind: "birth_data_available" }),
        registry: advancingRegistry("true")
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_GRAPH_INVALID"
      })
    );
  });

  it("fails closed when the pinned manifest omits selected target execution authority", async () => {
    const graph = birthDataConditionGraph();

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "birth-data",
          nodeKind: "birth_data_available",
          capabilityManifest: {
            schemaVersion: "flow-capability-manifest.v1",
            executionSemanticsVersion: "flow-interpreter.v1",
            nodeExecutors: [
              {
                kind: "birth_data_available",
                configSchemaVersion: 1,
                executorContractVersion: 1
              }
            ],
            requiredCapabilities: []
          }
        }),
        registry: advancingRegistry("true")
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
      })
    );
  });

  it("rejects an advance that targets an enrollment trigger", async () => {
    const graph = flowGraphV2Schema.parse({
      schemaVersion: "flow-graph.v2",
      nodes: [
        {
          id: "birth-data",
          kind: "birth_data_available",
          displayTitle: "Есть данные рождения?",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: { purpose: "service_preparation" }
        },
        {
          id: "manual",
          kind: "manual_client",
          displayTitle: "Клиент выбран вручную",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: {}
        }
      ],
      edges: [
        {
          id: "birth-manual",
          sourceNodeId: "birth-data",
          targetNodeId: "manual",
          sourceHandle: "true"
        }
      ]
    });

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({ graph, nodeId: "birth-data", nodeKind: "birth_data_available" }),
        registry: advancingRegistry("true")
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_GRAPH_INVALID"
      })
    );
  });

  it("fails closed when the persisted token metadata does not match the pinned graph node", async () => {
    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph: terminalGraph(completedNode()),
          nodeId: "completed",
          nodeKind: "manual_client"
        }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_TOKEN_NODE_METADATA_MISMATCH"
      })
    );
  });

  it("rejects a trigger token even when a historical v1 manifest lists the trigger", async () => {
    const graph = terminalGraph(completedNode());

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({ graph, nodeId: "manual", nodeKind: "manual_client" }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowExecutionIntegrityError>>({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_TOKEN_NODE_METADATA_MISMATCH"
      })
    );
  });

  it("fails closed when the pinned node executor is not registered", async () => {
    const graph = birthDataConditionGraph();

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "birth-data",
          nodeKind: "birth_data_available"
        }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<FlowNodeExecutorUnavailableError>>({
        name: "FlowNodeExecutorUnavailableError",
        code: "FLOW_NODE_EXECUTOR_UNAVAILABLE",
        executorKey: "birth_data_available:1:1"
      })
    );
  });

  it("fails closed before persistence when an executor returns a malformed decision", async () => {
    const node = completedNode();
    const graph = terminalGraph(node);
    const registry = createFlowNodeExecutorRegistry([
      {
        kind: "completed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        evaluate: async () =>
          ({
            kind: "terminal",
            sourceNodeId: "different-node",
            terminalStatus: "completed",
            resultCode: "consultation_prepared",
            trace: {
              schemaVersion: "flow-runtime-trace.v1",
              outcome: "terminal",
              nodeKind: "completed",
              reasonCode: "FLOW_GOAL_REACHED",
              resultCode: "consultation_prepared"
            }
          }) as never
      }
    ]);

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({ graph, nodeId: node.id, nodeKind: node.kind }),
        registry
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "FlowRuntimeTraceValidationError",
        code: "FLOW_RUNTIME_TRACE_INVALID"
      })
    );
  });

  it("rejects a terminal decision from a non-terminal persisted node", async () => {
    const graph = birthDataConditionGraph();
    const registry = createFlowNodeExecutorRegistry([
      {
        kind: "birth_data_available",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        evaluate: async (node) => ({
          kind: "terminal",
          sourceNodeId: node.id,
          terminalStatus: "completed",
          resultCode: "invalid_early_completion",
          trace: {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "terminal",
            nodeKind: "birth_data_available",
            reasonCode: "FLOW_GOAL_REACHED",
            resultCode: "invalid_early_completion"
          }
        })
      }
    ]);

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "birth-data",
          nodeKind: "birth_data_available"
        }),
        registry
      })
    ).rejects.toThrow("FLOW_RUNTIME_TRACE_INVALID");
  });

  it("rejects an unknown execution decision discriminator at runtime", () => {
    expect(() =>
      parseFlowExecutionDecision({
        kind: "waiting",
        sourceNodeId: "completed",
        resultCode: "FLOW_TOKEN_WAITING",
        trace: {}
      })
    ).toThrow("FLOW_RUNTIME_TRACE_INVALID");
  });

  it("rejects a decision whose redacted trace disagrees with its result", async () => {
    const node = completedNode();
    const graph = terminalGraph(node);
    const registry = createFlowNodeExecutorRegistry([
      {
        kind: "completed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        evaluate: async () =>
          ({
            kind: "terminal",
            sourceNodeId: node.id,
            terminalStatus: "completed",
            resultCode: "consultation_prepared",
            trace: {
              schemaVersion: "flow-runtime-trace.v1",
              outcome: "terminal",
              nodeKind: "completed",
              reasonCode: "FLOW_GOAL_REACHED",
              resultCode: "different-result"
            }
          }) as never
      }
    ]);

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({ graph, nodeId: node.id, nodeKind: node.kind }),
        registry
      })
    ).rejects.toThrow("FLOW_RUNTIME_TRACE_INVALID");
  });

  it("fails closed when the pinned capability manifest omits the token executor", async () => {
    const graph = terminalGraph(completedNode());

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "completed",
          nodeKind: "completed",
          capabilityManifest: {
            schemaVersion: "flow-capability-manifest.v1",
            executionSemanticsVersion: "flow-interpreter.v1",
            nodeExecutors: [
              {
                kind: "manual_client",
                configSchemaVersion: 1,
                executorContractVersion: 1
              }
            ],
            requiredCapabilities: []
          }
        }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
      })
    );
  });

  it("fails closed when the pinned interpreter semantics are unsupported", async () => {
    const graph = terminalGraph(completedNode());

    await expect(
      interpretFlowExecutionClaim({
        claim: claim({
          graph,
          nodeId: "completed",
          nodeKind: "completed",
          capabilityManifest: {
            schemaVersion: "flow-capability-manifest.v1",
            executionSemanticsVersion: "flow-interpreter.v2",
            nodeExecutors: [
              { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }
            ],
            requiredCapabilities: []
          }
        }),
        registry: createBuiltInFlowNodeExecutorRegistry()
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "FlowExecutionIntegrityError",
        code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
      })
    );
  });

  it("publishes only exact versioned keys for the built-in pure executors", () => {
    const registry = createBuiltInFlowNodeExecutorRegistry();

    expect(registry.executorKeys).toEqual(["completed:1:1"]);
    expect(
      formatFlowNodeExecutorKey({
        kind: "completed",
        configSchemaVersion: 1,
        executorContractVersion: 1
      })
    ).toBe("completed:1:1");
  });

  it("accepts the minimal redacted owner-cancellation trace", () => {
    expect(
      parseFlowRuntimeTraceSummary({
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "canceled",
        nodeKind: "completed",
        reasonCode: "FLOW_RUN_CANCELED_BY_OWNER",
        resultCode: "FLOW_RUN_CANCELED"
      })
    ).toEqual({
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "canceled",
      nodeKind: "completed",
      reasonCode: "FLOW_RUN_CANCELED_BY_OWNER",
      resultCode: "FLOW_RUN_CANCELED"
    });
  });

  it("rejects an execution trace attributed to an enrollment trigger", () => {
    expect(() =>
      parseFlowRuntimeTraceSummary({
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "canceled",
        nodeKind: "manual_client",
        reasonCode: "FLOW_RUN_CANCELED_BY_OWNER",
        resultCode: "FLOW_RUN_CANCELED"
      })
    ).toThrow("FLOW_RUNTIME_TRACE_INVALID");
  });

  it("classifies deterministic integrity failures as permanent allowlisted outcomes", () => {
    expect(
      classifyFlowExecutionFailure(
        new FlowExecutionIntegrityError(
          "FLOW_TOKEN_NODE_METADATA_MISMATCH",
          "sensitive diagnostic must not cross the boundary"
        )
      )
    ).toEqual({
      classification: "permanent",
      reasonCode: "FLOW_TOKEN_NODE_METADATA_MISMATCH"
    });
  });

  it("supports explicit executor retryability without persisting an error message", () => {
    expect(
      classifyFlowExecutionFailure(new FlowNodeExecutionError("FLOW_NODE_EXECUTION_RETRYABLE"))
    ).toEqual({
      classification: "retryable",
      reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
    });
    expect(
      classifyFlowExecutionFailure(new FlowNodeExecutionError("FLOW_NODE_EXECUTION_REJECTED"))
    ).toEqual({
      classification: "permanent",
      reasonCode: "FLOW_NODE_EXECUTION_REJECTED"
    });
  });

  it("maps an unknown thrown value to one bounded retry code without copying its content", () => {
    const failure = classifyFlowExecutionFailure(
      new Error("private client content must never enter durable trace")
    );

    expect(failure).toEqual({
      classification: "retryable",
      reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
    });
    expect(JSON.stringify(failure)).not.toContain("private client content");
  });

  it.each([
    {
      outcome: "retry_scheduled",
      reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE",
      resultCode: "FLOW_EXECUTION_RETRY_SCHEDULED"
    },
    {
      outcome: "failed",
      reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE",
      resultCode: "FLOW_EXECUTION_RETRY_EXHAUSTED"
    },
    {
      outcome: "failed",
      reasonCode: "FLOW_TOKEN_NODE_METADATA_MISMATCH",
      resultCode: "FLOW_EXECUTION_FAILED_TERMINAL"
    }
  ] as const)("accepts a strict redacted $outcome execution trace", (trace) => {
    expect(
      parseFlowRuntimeTraceSummary({
        schemaVersion: "flow-runtime-trace.v1",
        nodeKind: "completed",
        ...trace
      })
    ).toEqual({
      schemaVersion: "flow-runtime-trace.v1",
      nodeKind: "completed",
      ...trace
    });
  });

  it("rejects non-allowlisted failure reasons and diagnostic fields", () => {
    expect(() =>
      parseFlowRuntimeTraceSummary({
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "failed",
        nodeKind: "completed",
        reasonCode: "PRIVATE_PROVIDER_MESSAGE",
        resultCode: "FLOW_EXECUTION_FAILED_TERMINAL",
        message: "private content"
      })
    ).toThrow("FLOW_RUNTIME_TRACE_INVALID");
  });
});

function claim(input: {
  readonly graph: FlowGraphV2;
  readonly nodeId: string;
  readonly nodeKind: FlowNodeKindV2;
  readonly capabilityManifest?: unknown;
}): FlowExecutionClaim {
  const compilation = compileFlowGraphV2(input.graph);
  const defaultCapabilityManifest = compilation.capabilityManifest
    ? projectFlowCapabilityManifestV1(compilation.capabilityManifest)
    : {
        schemaVersion: "flow-capability-manifest.v1" as const,
        executionSemanticsVersion: "flow-interpreter.v1" as const,
        nodeExecutors: input.graph.nodes.map((node) => ({
          kind: node.kind,
          configSchemaVersion: node.configSchemaVersion,
          executorContractVersion: node.executorContractVersion
        })),
        requiredCapabilities: []
      };
  const persistedClaim = {
    tokenId: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    runId: "33333333-3333-4333-8333-333333333333",
    flowId: "44444444-4444-4444-8444-444444444444",
    flowVersionId: "55555555-5555-4555-8555-555555555555",
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    configSchemaVersion: 1,
    executorContractVersion: 1,
    graph: input.graph,
    capabilityManifest: input.capabilityManifest ?? defaultCapabilityManifest,
    leaseOwner: "flows-worker-1",
    nodeActivationSequence: 1n,
    attemptNumber: 1n,
    fencingToken: 7n,
    claimedAt: "2026-08-03T11:00:00.000Z",
    leaseExpiresAt: "2026-08-03T11:00:30.000Z"
  };
  return persistedClaim as unknown as FlowExecutionClaim;
}

function terminalGraph(node: ReturnType<typeof completedNode>): FlowGraphV2 {
  return flowGraphV2Schema.parse({
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
      node
    ],
    edges: [
      {
        id: "manual-completed",
        sourceNodeId: "manual",
        targetNodeId: node.id,
        sourceHandle: "next"
      }
    ]
  });
}

function completedNode() {
  return {
    id: "completed",
    kind: "completed" as const,
    displayTitle: "Подготовка завершена",
    configSchemaVersion: 1 as const,
    executorContractVersion: 1 as const,
    config: { goalKey: "consultation_prepared" }
  };
}

function birthDataConditionGraph(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
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
        id: "birth-data",
        kind: "birth_data_available",
        displayTitle: "Есть данные рождения?",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { purpose: "service_preparation" }
      },
      {
        id: "completed",
        kind: "completed",
        displayTitle: "Подготовка завершена",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
      },
      {
        id: "suppressed",
        kind: "suppressed",
        displayTitle: "Нет данных",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "birth_data_missing" }
      }
    ],
    edges: [
      {
        id: "manual-birth",
        sourceNodeId: "manual",
        targetNodeId: "birth-data",
        sourceHandle: "next"
      },
      {
        id: "birth-yes",
        sourceNodeId: "birth-data",
        targetNodeId: "completed",
        sourceHandle: "true"
      },
      {
        id: "birth-no",
        sourceNodeId: "birth-data",
        targetNodeId: "suppressed",
        sourceHandle: "false"
      }
    ]
  });
}

function advancingRegistry(sourceHandle: FlowSourceHandleV2) {
  return createFlowNodeExecutorRegistry([
    {
      kind: "birth_data_available",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      evaluate: async (node) =>
        ({
          kind: "advance",
          sourceNodeId: node.id,
          sourceHandle
        }) as never
    }
  ]);
}
