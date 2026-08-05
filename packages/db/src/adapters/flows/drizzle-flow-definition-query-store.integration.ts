import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphV2Schema, type FlowGraphRead, type FlowPresentationV1 } from "@elevenhouse/contracts";
import { compileFlowGraphV2, FlowDefinitionIntegrityError } from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowDefinitionQueryStore } from "./drizzle-flow-definition-query-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_query_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

const currentGraph = flowGraphV2Schema.parse({
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
});

const presentation: FlowPresentationV1 = {
  schemaVersion: "flow-presentation.v1",
  nodes: [
    { nodeId: "manual", position: { x: 80, y: 120 } },
    { nodeId: "completed", position: { x: 400, y: 120 } }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

const capabilityManifest =
  compileFlowGraphV2(currentGraph).capabilityManifest ?? raise("Expected V2 capability manifest");

describe("flow definition query store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("lists V2 summaries with independent lifecycle filters", async () => {
    const ownerUserId = await createUser();
    const foreignOwnerUserId = await createUser();
    const draftFlowId = await createFlow({
      ownerUserId,
      name: "Current draft",
      graph: currentGraph,
      updatedAt: "2026-08-03T09:00:00.000Z"
    });
    const published = await createPublishedFlow(ownerUserId);
    await createFlow({
      ownerUserId: foreignOwnerUserId,
      name: "Foreign",
      graph: currentGraph,
      updatedAt: "2026-08-03T11:00:00.000Z"
    });
    const store = createDrizzleFlowDefinitionQueryStore(runtime.database);

    const page = await store.listByOwner({
      ownerUserId,
      query: { state: "all", runtimeStatus: "all", limit: 50, offset: 0 }
    });
    expect(page.total).toBe(2);
    expect(page.flows.map((flow) => flow.id)).toEqual([
      published.flowId,
      draftFlowId
    ]);
    expect(page.flows).toMatchObject([
      {
        id: published.flowId,
        state: "versioned",
        runtimeStatus: "published",
        latestPublishedVersionId: published.versionId,
        latestPublishedVersion: 1,
        graphSchemaVersion: "flow-graph.v2"
      },
      {
        id: draftFlowId,
        state: "draft",
        runtimeStatus: "draft",
        graphSchemaVersion: "flow-graph.v2"
      }
    ]);
    expect(page.flows.every((flow) => !("draftGraph" in flow))).toBe(true);

    await expect(
      store.listByOwner({
        ownerUserId,
        query: { state: "versioned", runtimeStatus: "published", limit: 1, offset: 0 }
      })
    ).resolves.toMatchObject({ total: 1, flows: [{ id: published.flowId }] });
  });

  it("returns full owner-scoped detail without leaking foreign existence", async () => {
    const ownerUserId = await createUser();
    const foreignOwnerUserId = await createUser();
    const currentFlowId = await createFlow({
      ownerUserId,
      name: "Current detail",
      graph: currentGraph,
      updatedAt: "2026-08-03T09:00:00.000Z"
    });
    const store = createDrizzleFlowDefinitionQueryStore(runtime.database);

    await expect(store.getByOwner({ ownerUserId, flowId: currentFlowId })).resolves.toMatchObject({
      graphSchemaVersion: "flow-graph.v2",
      draftGraph: currentGraph,
      draftPresentation: presentation,
      origin: { type: "blank" }
    });
    await expect(
      store.getByOwner({ ownerUserId: foreignOwnerUserId, flowId: currentFlowId })
    ).resolves.toBeNull();
    await expect(
      store.getByOwner({ ownerUserId, flowId: "99999999-9999-4999-8999-999999999999" })
    ).resolves.toBeNull();
  });

  it("fails observably when persisted JSON violates the shared read contract", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow({
      ownerUserId,
      name: "Corrupt detail",
      graph: currentGraph,
      updatedAt: "2026-08-03T08:00:00.000Z"
    });
    await runtime.pool.query("update flows set draft_graph = $2 where id = $1", [
      flowId,
      { schemaVersion: "flow-graph.v2", nodes: [], edges: [] }
    ]);
    const store = createDrizzleFlowDefinitionQueryStore(runtime.database);

    await expect(store.getByOwner({ ownerUserId, flowId })).rejects.toBeInstanceOf(
      FlowDefinitionIntegrityError
    );
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function createFlow(input: {
    readonly ownerUserId: string;
    readonly name: string;
    readonly graph: FlowGraphRead;
    readonly updatedAt: string;
  }): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      `insert into flows
        (owner_user_id, name, status, definition_state, approval_mode, revision,
         origin, draft_graph, draft_presentation, created_at, updated_at)
       values ($1, $2, 'draft', 'draft', 'manual_approve', 1, $3, $4, $5, $6, $6)
       returning id`,
      [
        input.ownerUserId,
        input.name,
        { schemaVersion: "flow-definition-origin.v1", type: "blank" },
        input.graph,
        presentation,
        input.updatedAt
      ]
    );
    return result.rows[0]?.id ?? raise("Expected flow id");
  }

  async function createPublishedFlow(
    ownerUserId: string
  ): Promise<{ readonly flowId: string; readonly versionId: string }> {
    const flowId = await createFlow({
      ownerUserId,
      name: "Published",
      graph: currentGraph,
      updatedAt: "2026-08-03T10:00:00.000Z"
    });
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      const version = await client.query<{ id: string }>(
        `insert into flow_versions
          (flow_id, owner_user_id, version, source_revision, approval_mode,
           graph_schema_version, graph, presentation, capability_manifest, published_at)
         values ($1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4, $5, $6)
         returning id`,
        [
          flowId,
          ownerUserId,
          currentGraph,
          presentation,
          capabilityManifest,
          "2026-08-03T10:00:00.000Z"
        ]
      );
      const versionId = version.rows[0]?.id ?? raise("Expected version id");
      await client.query(
        `update flows
            set status = 'published', definition_state = 'versioned', revision = 2,
                published_version_id = $2, published_at = $3
          where id = $1`,
        [flowId, versionId, "2026-08-03T10:00:00.000Z"]
      );
      await client.query("COMMIT");
      return { flowId, versionId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function raise(message: string): never {
  throw new Error(message);
}
