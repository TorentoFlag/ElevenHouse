import {
  flowDefinitionV2Schema,
  flowGraphSchema,
  flowGraphV2Schema,
  flowPresentationV1Schema,
  migrateFlowDefinitionV2ResponseSchema,
  type FlowDefinitionCommandRejectionResponse,
  type FlowDefinitionMigrationIssue,
  type FlowGraph,
  type FlowGraphV2,
  type FlowPresentationV1,
  type MigrateFlowDefinitionV2Request,
  type MigrateFlowDefinitionV2Response
} from "@elevenhouse/contracts";

import {
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson
} from "../calculations/canonical-json";
import type {
  FlowDefinitionControlRecord,
  FlowDefinitionPublishedVersionRecord
} from "./flow-definition-control-plane";

export type FlowDefinitionMigrationPreparation =
  | { readonly kind: "accepted"; readonly value: MigrateFlowDefinitionV2Response }
  | {
      readonly kind: "rejected";
      readonly response: FlowDefinitionCommandRejectionResponse;
    }
  | { readonly kind: "integrity_failure" };

export function prepareFlowDefinitionV1Migration(input: {
  readonly current: FlowDefinitionControlRecord;
  readonly latestVersion: FlowDefinitionPublishedVersionRecord | null;
  readonly request: MigrateFlowDefinitionV2Request;
  readonly now: string;
}): FlowDefinitionMigrationPreparation {
  if (input.current.draftGraph.schemaVersion === "flow-graph.v2") {
    const definition = flowDefinitionV2Schema.safeParse({
      schemaVersion: "flow-definition.v2",
      ...input.current
    });
    return definition.success
      ? rejected(409, { code: "FLOW_GRAPH_ALREADY_V2" })
      : { kind: "integrity_failure" };
  }

  const currentGraph = flowGraphSchema.safeParse(input.current.draftGraph);
  if (!currentGraph.success || input.current.origin !== null) return { kind: "integrity_failure" };
  const lifecycle = validateLegacyLifecycle(input.current, input.latestVersion, currentGraph.data);
  if (lifecycle.kind === "integrity_failure") return lifecycle;
  if (input.current.state === "archived") {
    return rejected(409, {
      code: "FLOW_DEFINITION_MIGRATION_NOT_ALLOWED",
      state: input.current.state
    });
  }
  if (input.current.revision !== input.request.expectedRevision) {
    return rejected(409, {
      code: "FLOW_DRAFT_REVISION_CONFLICT",
      expectedRevision: input.request.expectedRevision,
      currentRevision: input.current.revision
    });
  }

  const sourceGraph = lifecycle.sourceGraph;
  const converted = convertLegacyGraph(sourceGraph);
  if (converted.kind === "blocked") {
    return rejected(422, {
      code: "FLOW_GRAPH_MIGRATION_BLOCKED",
      issues: converted.issues
    });
  }

  const sourceVersionId = lifecycle.sourceVersionId;
  const flow = flowDefinitionV2Schema.safeParse({
    schemaVersion: "flow-definition.v2",
    id: input.current.id,
    ownerUserId: input.current.ownerUserId,
    name: input.current.name,
    origin: {
      schemaVersion: "flow-definition-origin.v1",
      type: "migration",
      sourceGraphSchemaVersion: "flow-graph.v1",
      sourceVersionId
    },
    state: "draft",
    approvalMode: input.current.approvalMode,
    revision: input.current.revision + 1,
    draftBaseVersionId: sourceVersionId,
    draftGraph: converted.graph,
    draftPresentation: converted.presentation,
    latestPublishedVersionId: input.current.latestPublishedVersionId,
    latestPublishedVersion: input.current.latestPublishedVersion,
    createdAt: input.current.createdAt,
    updatedAt: input.now,
    publishedAt: input.current.publishedAt
  });
  if (!flow.success) return { kind: "integrity_failure" };

  const response = migrateFlowDefinitionV2ResponseSchema.safeParse({
    flow: flow.data,
    migration: {
      schemaVersion: "flow-definition-migration.v1",
      sourceGraphSchemaVersion: "flow-graph.v1",
      targetGraphSchemaVersion: "flow-graph.v2",
      sourceVersionId,
      sourceRevision: input.current.revision,
      sourceGraphHash: sha256CanonicalJson(sourceGraph as unknown as CanonicalJson),
      migratedAt: input.now
    }
  });
  return response.success
    ? { kind: "accepted", value: response.data }
    : { kind: "integrity_failure" };
}

function validateLegacyLifecycle(
  current: FlowDefinitionControlRecord,
  latestVersion: FlowDefinitionPublishedVersionRecord | null,
  currentGraph: FlowGraph
):
  | {
      readonly kind: "valid";
      readonly sourceGraph: FlowGraph;
      readonly sourceVersionId: string | null;
    }
  | { readonly kind: "integrity_failure" } {
  if (current.draftPresentation !== null) return { kind: "integrity_failure" };

  const hasCompletePointer =
    current.latestPublishedVersionId !== null &&
    current.latestPublishedVersion !== null &&
    current.publishedAt !== null;
  const hasNoPointer =
    current.latestPublishedVersionId === null &&
    current.latestPublishedVersion === null &&
    current.publishedAt === null;
  if (!hasCompletePointer && !hasNoPointer) return { kind: "integrity_failure" };
  if (
    current.draftBaseVersionId !== null &&
    current.draftBaseVersionId !== current.latestPublishedVersionId
  ) {
    return { kind: "integrity_failure" };
  }

  if (current.state === "draft") {
    return hasNoPointer && current.draftBaseVersionId === null && latestVersion === null
      ? { kind: "valid", sourceGraph: currentGraph, sourceVersionId: null }
      : { kind: "integrity_failure" };
  }

  if (current.state === "versioned") {
    if (!hasCompletePointer || current.draftBaseVersionId !== null || !latestVersion) {
      return { kind: "integrity_failure" };
    }
    const versionGraph = flowGraphSchema.safeParse(latestVersion.graph);
    if (
      !versionGraph.success ||
      latestVersion.id !== current.latestPublishedVersionId ||
      latestVersion.flowId !== current.id ||
      latestVersion.version !== current.latestPublishedVersion ||
      latestVersion.publishedAt !== current.publishedAt ||
      latestVersion.sourceRevision !== null ||
      latestVersion.presentation !== null ||
      latestVersion.capabilityManifest !== null ||
      latestVersion.approvalMode !== current.approvalMode ||
      stableJson(versionGraph.data as unknown as CanonicalJson) !==
        stableJson(currentGraph as unknown as CanonicalJson)
    ) {
      return { kind: "integrity_failure" };
    }
    return {
      kind: "valid",
      sourceGraph: versionGraph.data,
      sourceVersionId: latestVersion.id
    };
  }

  if (current.state === "archived") {
    if (hasNoPointer) {
      return current.draftBaseVersionId === null && latestVersion === null
        ? { kind: "valid", sourceGraph: currentGraph, sourceVersionId: null }
        : { kind: "integrity_failure" };
    }
    if (!latestVersion || latestVersion.id !== current.latestPublishedVersionId) {
      return { kind: "integrity_failure" };
    }
    const versionGraph = flowGraphSchema.safeParse(latestVersion.graph);
    return versionGraph.success
      ? {
          kind: "valid",
          sourceGraph: versionGraph.data,
          sourceVersionId: latestVersion.id
        }
      : { kind: "integrity_failure" };
  }

  return { kind: "integrity_failure" };
}

function convertLegacyGraph(graph: FlowGraph):
  | {
      readonly kind: "converted";
      readonly graph: FlowGraphV2;
      readonly presentation: FlowPresentationV1 | null;
    }
  | { readonly kind: "blocked"; readonly issues: readonly FlowDefinitionMigrationIssue[] } {
  const issues: FlowDefinitionMigrationIssue[] = [];
  for (const node of graph.nodes) {
    const exactManualTrigger =
      node.category === "trigger" &&
      node.kind === "manual" &&
      Object.keys(node.config).length === 0;
    if (!exactManualTrigger) {
      issues.push({
        code: "unsupported_node",
        path: `nodes.${node.id}`,
        message: `Legacy ${node.category}:${node.kind} has no lossless V2 mapping.`
      });
    }
  }
  for (const edge of graph.edges) {
    issues.push({
      code: "unsupported_edge",
      path: `edges.${edge.id}`,
      message: "Legacy edges cannot be migrated without exact V2 outcome semantics."
    });
  }
  if (issues.length > 0) return { kind: "blocked", issues };

  const source = graph.nodes[0];
  if (!source || source.category !== "trigger" || source.kind !== "manual") {
    return {
      kind: "blocked",
      issues: [
        {
          code: "invalid_legacy_graph",
          path: "nodes",
          message: "Legacy graph does not contain the exact supported manual trigger."
        }
      ]
    };
  }
  const convertedGraph = flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: source.id,
        kind: "manual_client",
        displayTitle: source.title,
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      }
    ],
    edges: []
  });
  const presentation = source.position
    ? flowPresentationV1Schema.parse({
        schemaVersion: "flow-presentation.v1",
        nodes: [{ nodeId: source.id, position: source.position }],
        viewport: { x: 0, y: 0, zoom: 1 }
      })
    : null;
  return { kind: "converted", graph: convertedGraph, presentation };
}

function rejected(
  statusCode: FlowDefinitionCommandRejectionResponse["statusCode"],
  body: FlowDefinitionCommandRejectionResponse["body"]
): FlowDefinitionMigrationPreparation {
  return { kind: "rejected", response: { statusCode, body } };
}
