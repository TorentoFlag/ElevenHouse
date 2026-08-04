import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertFlowCapabilityManifestSafety,
  reconcileFlowCapabilityManifestSafety
} from "../scripts/flow-capability-manifest-safety-reconciliation";
import { assertDevelopmentDatabaseUrl } from "./connection";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_manifest_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const databaseClient = new Client({ connectionString: isolatedDatabaseUrl });

describe("flow capability-manifest safety PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    await databaseClient.connect();
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient.end();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await databaseClient.query("DROP TABLE IF EXISTS flow_versions");
    await databaseClient.query(predecessorFixtureDdl);
  });

  it("adds and validates the typed manifest boundary without rewriting immutable versions", async () => {
    await insertVersion(null);
    await insertVersion(capabilityManifestV1);
    await insertVersion(capabilityManifestV2);
    const before = await readRows();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).resolves.toBe(
        "reconciled"
      );
      await expect(assertFlowCapabilityManifestSafety(databaseClient)).resolves.toBeUndefined();
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(readRows()).resolves.toEqual(before);
    await expect(readManifestConstraint()).resolves.toEqual({ count: "1", validated: true });

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).resolves.toBe(
        "already_current"
      );
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
  });

  it("fails closed and rolls back when an immutable version has an unknown manifest", async () => {
    await insertVersion({
      schemaVersion: "flow-capability-manifest.forged",
      executionSemanticsVersion: "flow-interpreter.v1",
      nodeExecutors: [],
      requiredCapabilities: []
    });
    const before = await readRows();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readRows()).resolves.toEqual(before);
    await expect(readManifestConstraint()).resolves.toEqual({ count: "0", validated: null });
  });

  it("rejects missing event pins, unknown top-level keys and wrong matcher version types", async () => {
    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).resolves.toBe(
        "reconciled"
      );
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(
      insertVersion({
        ...capabilityManifestV2,
        triggerMatcher: withoutEventSchema(capabilityManifestV2.triggerMatcher)
      })
    ).rejects.toThrow(/flow_versions_capability_manifest_schema_check/);
    await expect(insertVersion({ ...capabilityManifestV1, unknown: true })).rejects.toThrow(
      /flow_versions_capability_manifest_schema_check/
    );
    await expect(
      insertVersion({
        ...capabilityManifestV2,
        triggerMatcher: {
          ...capabilityManifestV2.triggerMatcher,
          eventSchemaVersion: "1"
        }
      })
    ).rejects.toThrow(/flow_versions_capability_manifest_schema_check/);
  });

  it.each([
    {
      name: "legacy metadata around a graph without the V1 schema marker",
      row: {
        sourceRevision: null,
        graphSchemaVersion: null,
        graph: {},
        capabilityManifest: null
      }
    },
    {
      name: "a V2 revision without a capability manifest",
      row: {
        sourceRevision: 1,
        graphSchemaVersion: "flow-graph.v2",
        graph: { schemaVersion: "flow-graph.v2" },
        capabilityManifest: null
      }
    },
    {
      name: "a V2 revision without a graph schema version",
      row: {
        sourceRevision: 1,
        graphSchemaVersion: null,
        graph: { schemaVersion: "flow-graph.v2" },
        capabilityManifest: capabilityManifestV2
      }
    },
    {
      name: "a V2 revision whose graph omits its schema version",
      row: {
        sourceRevision: 1,
        graphSchemaVersion: "flow-graph.v2",
        graph: {},
        capabilityManifest: capabilityManifestV2
      }
    }
  ])("fails reconciliation for $name instead of accepting SQL UNKNOWN", async ({ row }) => {
    await insertRawVersion(row);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readManifestConstraint()).resolves.toEqual({ count: "0", validated: null });
  });

  it("rejects malformed, forged and duplicate manifest array elements", async () => {
    await reconcileAndCommit();

    const invalidManifests = [
      {
        ...capabilityManifestV2,
        nodeExecutors: [null, { kind: "forged" }]
      },
      {
        ...capabilityManifestV2,
        nodeExecutors: [{ kind: "completed", configSchemaVersion: 1 }]
      },
      {
        ...capabilityManifestV2,
        nodeExecutors: [
          {
            kind: "completed",
            configSchemaVersion: 1,
            executorContractVersion: 1,
            unknown: true
          }
        ]
      },
      {
        ...capabilityManifestV2,
        nodeExecutors: [
          { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
          { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }
        ]
      },
      {
        ...capabilityManifestV2,
        requiredCapabilities: ["flows.forged"]
      },
      {
        ...capabilityManifestV2,
        requiredCapabilities: [
          "bookings.events.booking_confirmed",
          "bookings.events.booking_confirmed"
        ]
      }
    ];

    for (const manifest of invalidManifests) {
      await expect(insertVersion(manifest)).rejects.toThrow(
        /flow_versions_capability_manifest_schema_check/
      );
    }
  });

  it.each([
    {
      name: "V1 graph marker without nodes and edges",
      row: {
        sourceRevision: null,
        graphSchemaVersion: null,
        graph: { schemaVersion: "flow-graph.v1" },
        capabilityManifest: null
      }
    },
    {
      name: "V2 graph marker without nodes and edges",
      row: {
        sourceRevision: 1,
        graphSchemaVersion: "flow-graph.v2",
        graph: { schemaVersion: "flow-graph.v2" },
        capabilityManifest: capabilityManifestV2
      }
    },
    {
      name: "V2 graph with an empty node array",
      row: {
        sourceRevision: 1,
        graphSchemaVersion: "flow-graph.v2",
        graph: { schemaVersion: "flow-graph.v2", nodes: [], edges: [] },
        capabilityManifest: capabilityManifestV2
      }
    }
  ])("rejects $name during reconciliation", async ({ row }) => {
    await insertRawVersion(row);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }
  });

  it("enforces the graph envelope on new immutable versions", async () => {
    await reconcileAndCommit();

    await expect(
      insertRawVersion({
        sourceRevision: 1,
        graphSchemaVersion: "flow-graph.v2",
        graph: { schemaVersion: "flow-graph.v2" },
        capabilityManifest: capabilityManifestV2
      })
    ).rejects.toThrow(/flow_versions_capability_manifest_schema_check/);
  });

  it("fails reconciliation when a structurally valid graph cannot be parsed by the domain contract", async () => {
    await insertRawVersion({
      sourceRevision: 1,
      graphSchemaVersion: "flow-graph.v2",
      graph: {
        ...graphV2,
        nodes: graphV2.nodes.map((node) =>
          node.kind === "completed" ? { ...node, config: {} } : node
        )
      },
      capabilityManifest: capabilityManifestV2
    });

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
        /not domain-readable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readManifestConstraint()).resolves.toEqual({ count: "0", validated: null });
  });

  it("re-audits domain readability when the safety catalog is already current", async () => {
    await reconcileAndCommit();
    await insertRawVersion({
      sourceRevision: 1,
      graphSchemaVersion: "flow-graph.v2",
      graph: {
        ...graphV2,
        nodes: graphV2.nodes.map((node) =>
          node.kind === "completed" ? { ...node, config: {} } : node
        )
      },
      capabilityManifest: capabilityManifestV2
    });

    await expect(assertFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
      /not domain-readable/
    );

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
        /not domain-readable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readManifestConstraint()).resolves.toEqual({ count: "1", validated: true });
  });

  it("rejects an unapproved constraint definition instead of treating it as current", async () => {
    await databaseClient.query(`
      ALTER TABLE flow_versions
        ADD CONSTRAINT flow_versions_capability_manifest_schema_check
        CHECK (capability_manifest IS NULL OR jsonb_typeof(capability_manifest) = 'object')
    `);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowCapabilityManifestSafety(databaseClient)).rejects.toThrow(
        /partial or drifted/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }
  });
});

async function insertVersion(capabilityManifest: unknown): Promise<void> {
  const isLegacy = capabilityManifest === null;
  await insertRawVersion({
    sourceRevision: isLegacy ? null : 1,
    graphSchemaVersion: isLegacy ? null : "flow-graph.v2",
    graph: isLegacy ? graphV1 : graphV2,
    capabilityManifest
  });
}

async function insertRawVersion(input: {
  readonly sourceRevision: number | null;
  readonly graphSchemaVersion: string | null;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
}): Promise<void> {
  await databaseClient.query(
    `INSERT INTO flow_versions (
       id, source_revision, graph_schema_version, graph, presentation, capability_manifest
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      input.sourceRevision,
      input.graphSchemaVersion,
      input.graph,
      null,
      input.capabilityManifest
    ]
  );
}

async function reconcileAndCommit(): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await reconcileFlowCapabilityManifestSafety(databaseClient);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function readRows(): Promise<readonly Record<string, unknown>[]> {
  const result = await databaseClient.query(
    `SELECT id::text, source_revision, graph_schema_version, graph, presentation,
            capability_manifest
       FROM flow_versions
      ORDER BY id`
  );
  return result.rows;
}

async function readManifestConstraint(): Promise<{
  readonly count: string;
  readonly validated: boolean | null;
}> {
  const result = await databaseClient.query<{ count: string; validated: boolean | null }>(`
    SELECT count(*)::text AS count, bool_and(convalidated) AS validated
      FROM pg_constraint
     WHERE conrelid = 'flow_versions'::regclass
       AND conname = 'flow_versions_capability_manifest_schema_check'
  `);
  return result.rows[0] ?? { count: "0", validated: null };
}

function withoutEventSchema(value: {
  readonly kind: string;
  readonly configSchemaVersion: number;
  readonly matcherContractVersion: number;
  readonly eventSchemaVersion: number;
}): Omit<typeof value, "eventSchemaVersion"> {
  return {
    kind: value.kind,
    configSchemaVersion: value.configSchemaVersion,
    matcherContractVersion: value.matcherContractVersion
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  assertDevelopmentDatabaseUrl(normalized);
  return normalized;
}

function withDatabaseName(databaseUrl: string, targetDatabaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}

const capabilityManifestV1 = {
  schemaVersion: "flow-capability-manifest.v1",
  executionSemanticsVersion: "flow-interpreter.v1",
  nodeExecutors: [
    { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 },
    { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }
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

const graphV1 = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "manual",
      title: "Manual enrollment",
      category: "trigger",
      kind: "manual",
      config: {}
    }
  ],
  edges: []
} as const;

const graphV2 = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Manual enrollment",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Completed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "completed" }
    }
  ],
  edges: [
    {
      id: "manual-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
} as const;

const predecessorFixtureDdl = `
  CREATE TABLE flow_versions (
    id uuid PRIMARY KEY,
    source_revision integer,
    graph_schema_version text,
    graph jsonb NOT NULL,
    presentation jsonb,
    capability_manifest jsonb,
    CONSTRAINT flow_versions_v2_metadata_check CHECK (
      (
        source_revision IS NULL
        AND graph_schema_version IS NULL
        AND capability_manifest IS NULL
      ) OR (
        source_revision > 0
        AND graph_schema_version = 'flow-graph.v2'
        AND graph->>'schemaVersion' = 'flow-graph.v2'
        AND jsonb_typeof(capability_manifest) = 'object'
      )
    )
  );
`;
