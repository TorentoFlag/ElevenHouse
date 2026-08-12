import {
  FLOW_GRAPH_V2_MAX_EDGES,
  FLOW_GRAPH_V2_MAX_NODES,
  flowCapabilityRequirementValues,
  flowExecutableNodeKindV2Values,
  flowNodeKindV2Values,
  flowSourceHandleV2Values,
  flowTriggerNodeKindV2Values,
} from "@elevenhouse/contracts";

const capabilityManifestColumn = "capability_manifest";
const nodeExecutors = `${capabilityManifestColumn}->'nodeExecutors'`;
const requiredCapabilities = `${capabilityManifestColumn}->'requiredCapabilities'`;
const graphNodes = "graph->'nodes'";
const graphEdges = "graph->'edges'";
const triggerMatcherKinds = flowTriggerNodeKindV2Values.map((kind) => `'${kind}'`).join(", ");

const graphV2Predicate = graphEnvelopePredicate(
  "flow-graph.v2",
  graphNodeArrayPredicate({
    requiredFields: [
      "id",
      "kind",
      "displayTitle",
      "configSchemaVersion",
      "executorContractVersion",
      "config"
    ],
    stringFields: ["id", "kind", "displayTitle"],
    numberOneFields: ["configSchemaVersion", "executorContractVersion"],
    objectFields: ["config"],
    allowedFields: [
      "id",
      "kind",
      "displayTitle",
      "configSchemaVersion",
      "executorContractVersion",
      "config"
    ],
    enumFields: { kind: flowNodeKindV2Values }
  }),
  graphEdgeArrayPredicate({
    requiredFields: ["id", "sourceNodeId", "targetNodeId", "sourceHandle"],
    stringFields: ["id", "sourceNodeId", "targetNodeId", "sourceHandle"],
    allowedFields: ["id", "sourceNodeId", "targetNodeId", "sourceHandle"],
    enumFields: { sourceHandle: flowSourceHandleV2Values }
  })
);

const v2ExecutorArrayPredicate = executorArrayPredicate(flowExecutableNodeKindV2Values);
const capabilityArrayPredicate = enumArrayPredicate(
  requiredCapabilities,
  flowCapabilityRequirementValues,
  50
);

export const flowCapabilityManifestSchemaPredicate = `(
  source_revision > 0
  AND graph_schema_version = 'flow-graph.v2'
  AND ${graphV2Predicate}
  AND jsonb_typeof(capability_manifest) = 'object'
  AND capability_manifest->>'schemaVersion' = 'flow-capability-manifest.v2'
          AND capability_manifest ?& ARRAY[
            'schemaVersion', 'executionSemanticsVersion', 'triggerMatcher', 'nodeExecutors',
            'requiredCapabilities'
          ]::text[]
          AND capability_manifest - ARRAY[
            'schemaVersion', 'executionSemanticsVersion', 'triggerMatcher', 'nodeExecutors',
            'requiredCapabilities'
          ]::text[] = '{}'::jsonb
          AND jsonb_typeof(capability_manifest->'schemaVersion') = 'string'
          AND jsonb_typeof(capability_manifest->'executionSemanticsVersion') = 'string'
          AND capability_manifest->>'executionSemanticsVersion' = 'flow-interpreter.v1'
          AND ${v2ExecutorArrayPredicate}
          AND ${capabilityArrayPredicate}
          AND jsonb_typeof(capability_manifest->'triggerMatcher') = 'object'
          AND (capability_manifest->'triggerMatcher') ?& ARRAY[
            'kind', 'configSchemaVersion', 'matcherContractVersion', 'eventSchemaVersion'
          ]::text[]
          AND (capability_manifest->'triggerMatcher') - ARRAY[
            'kind', 'configSchemaVersion', 'matcherContractVersion', 'eventSchemaVersion'
          ]::text[] = '{}'::jsonb
          AND jsonb_typeof(capability_manifest->'triggerMatcher'->'kind') = 'string'
          AND capability_manifest->'triggerMatcher'->>'kind'
            IN (${triggerMatcherKinds})
          AND jsonb_typeof(
            capability_manifest->'triggerMatcher'->'configSchemaVersion'
          ) = 'number'
          AND capability_manifest->'triggerMatcher'->>'configSchemaVersion' = '1'
          AND jsonb_typeof(
            capability_manifest->'triggerMatcher'->'matcherContractVersion'
          ) = 'number'
          AND capability_manifest->'triggerMatcher'->>'matcherContractVersion' = '1'
          AND jsonb_typeof(
            capability_manifest->'triggerMatcher'->'eventSchemaVersion'
          ) = 'number'
          AND capability_manifest->'triggerMatcher'->>'eventSchemaVersion' = '1'

) IS TRUE`;

function executorArrayPredicate(allowedKinds: readonly string[]): string {
  const allowedExecutors = allowedKinds.map((kind) => ({
    kind,
    configSchemaVersion: 1,
    executorContractVersion: 1
  }));
  const fieldCountPredicates = ["kind", "configSchemaVersion", "executorContractVersion"].map(
    (field) =>
      `jsonb_array_length(jsonb_path_query_array(${nodeExecutors}, ${sqlLiteral(`$[*].${field}`)}))
        = jsonb_array_length(${nodeExecutors})`
  );
  const uniqueKindPredicates = allowedKinds.map(
    (kind) =>
      `jsonb_array_length(jsonb_path_query_array(
        ${nodeExecutors},
        ${sqlLiteral(`$[*] ? (@.kind == ${JSON.stringify(kind)})`)}
      )) <= 1`
  );

  return `CASE
    WHEN jsonb_typeof(${nodeExecutors}) = 'array' THEN
      jsonb_array_length(${nodeExecutors}) <= ${FLOW_GRAPH_V2_MAX_NODES}
      AND ${nodeExecutors} <@ ${sqlLiteral(JSON.stringify(allowedExecutors))}::jsonb
      AND ${[...fieldCountPredicates, ...uniqueKindPredicates].join("\n      AND ")}
    ELSE FALSE
  END`;
}

function enumArrayPredicate(
  expression: string,
  allowedValues: readonly string[],
  maxItems: number
): string {
  const uniqueValuePredicates = allowedValues.map(
    (value) =>
      `jsonb_array_length(jsonb_path_query_array(
        ${expression},
        ${sqlLiteral(`$[*] ? (@ == ${JSON.stringify(value)})`)}
      )) <= 1`
  );
  return `CASE
    WHEN jsonb_typeof(${expression}) = 'array' THEN
      jsonb_array_length(${expression}) <= ${maxItems}
      AND ${expression} <@ ${sqlLiteral(JSON.stringify(allowedValues))}::jsonb
      AND ${uniqueValuePredicates.join("\n      AND ")}
    ELSE FALSE
  END`;
}

type JsonArrayObjectPredicateOptions = {
  readonly requiredFields: readonly string[];
  readonly stringFields: readonly string[];
  readonly optionalStringFields?: readonly string[];
  readonly optionalNullableStringFields?: readonly string[];
  readonly numberOneFields?: readonly string[];
  readonly objectFields?: readonly string[];
  readonly optionalObjectFields?: readonly string[];
  readonly allowedFields: readonly string[];
  readonly enumFields?: Readonly<Record<string, readonly string[]>>;
};

function graphEnvelopePredicate(
  schemaVersion: "flow-graph.v2",
  nodeArrayPredicate: string,
  edgeArrayPredicate: string
): string {
  return `(
    jsonb_typeof(graph) = 'object'
    AND graph ?& ARRAY['schemaVersion', 'nodes', 'edges']::text[]
    AND graph - ARRAY['schemaVersion', 'nodes', 'edges']::text[] = '{}'::jsonb
    AND jsonb_typeof(graph->'schemaVersion') = 'string'
    AND graph->>'schemaVersion' = '${schemaVersion}'
    AND ${nodeArrayPredicate}
    AND ${edgeArrayPredicate}
  )`;
}

function graphNodeArrayPredicate(options: JsonArrayObjectPredicateOptions): string {
  return jsonArrayObjectPredicate(graphNodes, 1, FLOW_GRAPH_V2_MAX_NODES, options);
}

function graphEdgeArrayPredicate(options: JsonArrayObjectPredicateOptions): string {
  return jsonArrayObjectPredicate(graphEdges, 0, FLOW_GRAPH_V2_MAX_EDGES, options);
}

function jsonArrayObjectPredicate(
  expression: string,
  minItems: number,
  maxItems: number,
  options: JsonArrayObjectPredicateOptions
): string {
  const itemCount = `jsonb_array_length(${expression})`;
  const predicates = [
    `${itemCount} BETWEEN ${minItems} AND ${maxItems}`,
    pathCountEquals(expression, `$[*] ? (@.type() == "object")`, itemCount),
    ...options.requiredFields.map((field) =>
      pathCountEquals(expression, `$[*].${field}`, itemCount)
    ),
    ...options.stringFields.map((field) =>
      pathCountEquals(expression, `$[*].${field} ? (@.type() == "string")`, itemCount)
    ),
    ...(options.optionalStringFields ?? []).map((field) =>
      optionalPathHasTypes(expression, field, ["string"])
    ),
    ...(options.optionalNullableStringFields ?? []).map((field) =>
      optionalPathHasTypes(expression, field, ["string", "null"])
    ),
    ...(options.numberOneFields ?? []).flatMap((field) => [
      pathCountEquals(expression, `$[*].${field} ? (@.type() == "number")`, itemCount),
      `jsonb_path_query_array(${expression}, ${sqlLiteral(`$[*].${field}`)}) <@ '[1]'::jsonb`
    ]),
    ...(options.objectFields ?? []).map((field) =>
      pathCountEquals(expression, `$[*].${field} ? (@.type() == "object")`, itemCount)
    ),
    ...(options.optionalObjectFields ?? []).map((field) =>
      optionalPathHasTypes(expression, field, ["object"])
    ),
    `jsonb_path_query_array(${expression}, '$[*].keyvalue().key') <@ ${sqlLiteral(
      JSON.stringify(options.allowedFields)
    )}::jsonb`,
    ...Object.entries(options.enumFields ?? {}).map(
      ([field, values]) =>
        `jsonb_path_query_array(${expression}, ${sqlLiteral(`$[*].${field}`)}) <@ ${sqlLiteral(
          JSON.stringify(values)
        )}::jsonb`
    )
  ];
  return `CASE
    WHEN jsonb_typeof(${expression}) = 'array' THEN
      ${predicates.join("\n      AND ")}
    ELSE FALSE
  END`;
}

function pathCountEquals(expression: string, path: string, expected: string): string {
  return `jsonb_array_length(jsonb_path_query_array(${expression}, ${sqlLiteral(path)}))
        = ${expected}`;
}

function optionalPathHasTypes(
  expression: string,
  field: string,
  expectedTypes: readonly ("null" | "object" | "string")[]
): string {
  const typePredicate = expectedTypes
    .map((expectedType) => `@.type() == "${expectedType}"`)
    .join(" || ");
  return `jsonb_array_length(jsonb_path_query_array(${expression}, ${sqlLiteral(`$[*].${field}`)}))
        = jsonb_array_length(jsonb_path_query_array(
          ${expression},
          ${sqlLiteral(`$[*].${field} ? (${typePredicate})`)}
        ))`;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
