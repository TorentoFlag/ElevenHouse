import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphV2Schema, type FlowGraphRead, type FlowPresentationV1 } from "@elevenhouse/contracts";
import {
  createFlowDefinitionV2,
  createNextFlowDraftV2,
  compileFlowGraphV2,
  FlowDefinitionIdempotencyConflictError,
  FlowDefinitionIdempotencyExpiredError,
  FlowDefinitionIntegrityError,
  FlowDefinitionRevisionConflictError,
  publishFlowDefinitionV2,
  sha256CanonicalJson,
  type CanonicalJson,
  updateFlowDefinitionDraftV2
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reconcileFlowEnrollmentControl } from "../../../scripts/flow-enrollment-control-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowDefinitionControlStore } from "./drizzle-flow-definition-control-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_definition_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

const graph = flowGraphV2Schema.parse({
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

describe("flow definition control store Drizzle/PostgreSQL integration", () => {
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
    const reconciliationClient = new Client({ connectionString: isolatedDatabaseUrl });
    await reconciliationClient.connect();
    try {
      await reconciliationClient.query("BEGIN");
      await reconcileFlowRuntimeControlAuthority(reconciliationClient);
      await reconcileFlowEnrollmentControl(reconciliationClient);
      await reconciliationClient.query("COMMIT");
    } catch (error) {
      await reconciliationClient.query("ROLLBACK");
      throw error;
    } finally {
      await reconciliationClient.end();
    }
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("creates one V2 aggregate and replays the exact 201 response", async () => {
    const ownerUserId = await createUser();
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);
    const input = {
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      request: {
        schemaVersion: "flow-definition-create.v2",
        name: "Новая воронка",
        locale: "ru",
        source: { type: "blank" }
      },
      idempotencyKey: "flow-create-exact-replay",
      now: "2026-08-02T19:30:00.000Z"
    } as const;

    const created = await Promise.all([
      createFlowDefinitionV2(input),
      createFlowDefinitionV2(input)
    ]);
    const laterReplay = await createFlowDefinitionV2({
      ...input,
      now: "2026-08-02T19:31:00.000Z"
    });

    expect(created[0]).toEqual(created[1]);
    expect(laterReplay).toEqual(created[0]);
    expect(created[0]).toMatchObject({
      ownerUserId,
      name: "Новая воронка",
      origin: { type: "blank" },
      state: "draft",
      revision: 1
    });
    const persisted = await selectFlow(created[0].id);
    expect(persisted).toMatchObject({
      origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
      definition_state: "draft",
      revision: 1
    });
    expect(await selectCommands(ownerUserId)).toMatchObject([
      { state: "succeeded", response_status: 201 }
    ]);
    await expect(selectEnrollmentReadAuthority(ownerUserId)).resolves.toEqual({
      subjects: "1",
      quotas: "1"
    });
  });

  it("serializes two publish keys and rolls the losing version write back", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);
    const publish = (idempotencyKey: string) =>
      publishFlowDefinitionV2({
        store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 1 },
        idempotencyKey,
        now: "2026-08-02T19:50:00.000Z"
      });

    const race = await Promise.allSettled([
      publish("flow-publish-race-a"),
      publish("flow-publish-race-b")
    ]);

    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.any(FlowDefinitionRevisionConflictError)
    });
    await expect(selectVersions(flowId)).resolves.toHaveLength(1);
    expect((await selectCommands(flowId)).map((row) => row.response_status).sort()).toEqual([
      200, 409
    ]);
  });

  it("rolls back the version, aggregate pointer and command when fresh-response validation fails", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);
    const compiled = compileFlowGraphV2(graph);
    if (!compiled.normalizedGraph || !compiled.capabilityManifest) {
      throw new Error("Expected a publishable graph fixture");
    }

    await expect(
      store.executePublish({
        command: {
          apiSurface: "astrologer-api",
          routeTemplate: "/flows/:flowId/publish",
          scope: "flows.definition.publish.v2",
          actorUserId: ownerUserId,
          ownerUserId,
          resourceId: flowId,
          expectedRevision: 1,
          idempotencyKey: "flow-publish-precommit-guard",
          requestHash: sha256CanonicalJson({ expectedRevision: 1 }),
          now: "2026-08-02T19:55:00.000Z"
        },
        prepare: () => ({
          kind: "accepted",
          value: {
            sourceRevision: 1,
            approvalMode: "manual_approve",
            graph: compiled.normalizedGraph!,
            presentation,
            capabilityManifest: compiled.capabilityManifest!
          }
        }),
        assertCreatedResponse: () => {
          throw new FlowDefinitionIntegrityError();
        }
      })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);

    await expect(selectVersions(flowId)).resolves.toHaveLength(0);
    await expect(selectCommands(flowId)).resolves.toHaveLength(0);
    await expect(selectFlow(flowId)).resolves.toMatchObject({
      revision: 1,
      definition_state: "draft"
    });
  });

  it("keeps an expired key occupied without replaying or retaining its outcome", async () => {
    const ownerUserId = await createUser();
    const request = {
      schemaVersion: "flow-definition-create.v2",
      name: "Просроченная команда",
      locale: "ru",
      approvalMode: "manual_approve",
      source: { type: "blank" }
    } as const;
    const idempotencyKey = "flow-create-expired-replay";
    const command = await insertExpiredCreateCommand(ownerUserId, idempotencyKey, request);
    await runtime.pool.query(
      `insert into flow_definition_command_outcomes
        (command_id, response_status, response_body, created_at)
       select id, 201, '{}'::jsonb, completed_at
         from flow_definition_commands
        where id = $1`,
      [command.id]
    );

    await expect(
      createFlowDefinitionV2({
        store: createDrizzleFlowDefinitionControlStore(runtime.database),
        actorUserId: ownerUserId,
        ownerUserId,
        request,
        idempotencyKey,
        now: "2026-08-03T19:55:00.000Z"
      })
    ).rejects.toBeInstanceOf(FlowDefinitionIdempotencyExpiredError);

    await runtime.pool.query("delete from flow_definition_command_outcomes where command_id = $1", [
      command.id
    ]);
    expect(await selectCommands(ownerUserId)).toMatchObject([
      { state: "succeeded", response_status: null, response_body: null }
    ]);
    await expect(selectFlowsByOwner(ownerUserId)).resolves.toHaveLength(0);
  });

  it("rolls back an immutable version that is not installed as the aggregate pointer", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const capabilityManifest =
      compileFlowGraphV2(graph).capabilityManifest ?? raise("Expected publishable graph fixture");

    await expect(
      runtime.pool.query(
        `insert into flow_versions
          (flow_id, owner_user_id, version, source_revision, approval_mode,
           graph_schema_version, graph, presentation, capability_manifest, published_at)
         values ($1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4, $5,
           transaction_timestamp())`,
        [flowId, ownerUserId, graph, presentation, capabilityManifest]
      )
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_publication_pointer_consistency"
    });
    await expect(selectVersions(flowId)).resolves.toHaveLength(0);
  });

  it("rejects direct mutation of published versions and command replay records", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);
    const published = await publishFlowDefinitionV2({
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 1 },
      idempotencyKey: "flow-publish-immutable-records",
      now: "2026-08-02T20:10:00.000Z"
    });
    const versionId = published?.version.id ?? raise("Expected published version");
    const commandId = await selectOnlyCommandId(flowId);

    await expect(
      runtime.pool.query("update flow_versions set graph = graph where id = $1", [versionId])
    ).rejects.toMatchObject({ code: "55000", constraint: "flow_versions_immutable_update" });
    await expect(
      runtime.pool.query("delete from flow_versions where id = $1", [versionId])
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "flow_versions_delete_with_aggregate_only"
    });
    await expect(
      runtime.pool.query(
        "update flow_definition_commands set request_hash = request_hash where id = $1",
        [commandId]
      )
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "flow_definition_commands_immutable_identity"
    });
    await expect(
      runtime.pool.query(
        "update flow_definition_command_outcomes set response_body = response_body where command_id = $1",
        [commandId]
      )
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "flow_definition_command_outcomes_retention"
    });
    await expect(
      runtime.pool.query("delete from flow_definition_commands where id = $1", [commandId])
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "flow_definition_commands_immutable_identity"
    });
  });

  it("allows owner erasure to cascade through versions and definition commands", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);

    await updateFlowDefinitionDraftV2({
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 1, graph, presentation },
      idempotencyKey: "flow-owner-erasure-update",
      now: "2026-08-02T19:50:30.000Z"
    });
    await publishFlowDefinitionV2({
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 2 },
      idempotencyKey: "flow-owner-erasure-publish",
      now: "2026-08-02T19:51:00.000Z"
    });

    await runtime.pool.query("delete from users where id = $1", [ownerUserId]);

    const remaining = await runtime.pool.query<{ count: string }>(
      `select (
        (select count(*) from flows where owner_user_id = $1)
        + (select count(*) from flow_versions where owner_user_id = $1)
        + (select count(*) from flow_definition_commands where owner_user_id = $1)
      )::text as count`,
      [ownerUserId]
    );
    expect(remaining.rows[0]?.count).toBe("0");
  });

  it("serializes two keys on one revision and persists the losing conflict", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);

    const race = await Promise.allSettled([
      updateDraft(store, ownerUserId, flowId, "flow-update-race-a", "Версия A", 1),
      updateDraft(store, ownerUserId, flowId, "flow-update-race-b", "Версия B", 1)
    ]);

    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.any(FlowDefinitionRevisionConflictError)
    });
    const flow = await selectFlow(flowId);
    expect(flow).toMatchObject({ revision: 2, definition_state: "draft" });
    expect(["Версия A", "Версия B"]).toContain(flow?.name);
    const commands = await selectCommands(flowId);
    expect(commands.map((row) => [row.state, row.response_status]).sort()).toEqual([
      ["failed", 409],
      ["succeeded", 200]
    ]);
  });

  it("replays the exact old response and rejects changed-payload key reuse", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);
    const key = "flow-update-exact-replay";

    const parallel = await Promise.all([
      updateDraft(store, ownerUserId, flowId, key, "Первая версия", 1),
      updateDraft(store, ownerUserId, flowId, key, "Первая версия", 1)
    ]);
    expect(parallel[0]).toEqual(parallel[1]);
    expect(parallel[0]).toMatchObject({ revision: 2, name: "Первая версия" });

    await updateDraft(store, ownerUserId, flowId, "flow-update-later-state", "Поздняя версия", 2);
    await expect(updateDraft(store, ownerUserId, flowId, key, "Первая версия", 1)).resolves.toEqual(
      parallel[0]
    );
    await expect(
      updateDraft(store, ownerUserId, flowId, key, "Другой payload", 1)
    ).rejects.toBeInstanceOf(FlowDefinitionIdempotencyConflictError);
    await expect(selectCommands(flowId)).resolves.toHaveLength(2);
  });

  it("publishes one immutable version and creates one explicit next draft", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);
    const publishInput = {
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 1 },
      idempotencyKey: "flow-publish-exact-replay",
      now: "2026-08-02T20:00:00.000Z"
    } as const;

    const publications = await Promise.all([
      publishFlowDefinitionV2(publishInput),
      publishFlowDefinitionV2(publishInput)
    ]);
    expect(publications[0]).toEqual(publications[1]);
    const published = publications[0] ?? raise("Expected published flow");
    const replayed = await publishFlowDefinitionV2(publishInput);
    expect(replayed).toEqual(published);
    expect(published.version.schemaVersion).toBe("flow-published-version.v3");
    expect(published.flow).toMatchObject({ state: "versioned", revision: 2 });
    expect(published.version).toMatchObject({ version: 1, sourceRevision: 1 });
    await expect(selectVersions(flowId)).resolves.toMatchObject([
      {
        version: 1,
        capability_manifest: { schemaVersion: "flow-capability-manifest.v2" }
      }
    ]);

    const nextInput = {
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 2, baseVersionId: published.version.id },
      idempotencyKey: "flow-next-draft-replay",
      now: "2026-08-02T20:01:00.000Z"
    } as const;
    const nextDrafts = await Promise.all([
      createNextFlowDraftV2(nextInput),
      createNextFlowDraftV2(nextInput)
    ]);
    expect(nextDrafts[0]).toEqual(nextDrafts[1]);
    expect(nextDrafts[0]).toMatchObject({
      state: "draft",
      revision: 3,
      draftBaseVersionId: published.version.id,
      latestPublishedVersionId: published.version.id
    });
    await expect(selectVersions(flowId)).resolves.toHaveLength(1);
  });

  it("returns the same no-leak not-found result for foreign and missing resources", async () => {
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    const foreignFlowId = await createFlow(otherOwnerUserId);
    const missingFlowId = randomUUID();
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);

    await expect(
      updateDraft(store, ownerUserId, foreignFlowId, "flow-update-foreign", "Недоступно", 1)
    ).resolves.toBeNull();
    await expect(
      updateDraft(store, ownerUserId, missingFlowId, "flow-update-missing", "Недоступно", 1)
    ).resolves.toBeNull();

    for (const resourceId of [foreignFlowId, missingFlowId]) {
      const commands = await selectCommands(resourceId);
      expect(commands).toMatchObject([
        {
          owner_user_id: ownerUserId,
          state: "failed",
          response_status: 404,
          response_body: { code: "FLOW_DEFINITION_NOT_FOUND" }
        }
      ]);
    }
  });

  it("rolls back the ledger when persisted definition integrity is invalid", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    await runtime.pool.query("update flows set draft_presentation = $2 where id = $1", [
      flowId,
      {
        ...presentation,
        nodes: presentation.nodes.slice(0, 1)
      }
    ]);
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);

    await expect(
      updateDraft(store, ownerUserId, flowId, "flow-update-integrity", "Нельзя", 1)
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
    await expect(selectCommands(flowId)).resolves.toHaveLength(0);
    await expect(selectFlow(flowId)).resolves.toMatchObject({ revision: 1 });
  });

  it("rolls back instead of persisting a stale conflict for a corrupt V2 definition", async () => {
    const ownerUserId = await createUser();
    const flowId = await createFlow(ownerUserId);
    await runtime.pool.query(
      "update flows set revision = 2, draft_presentation = $2 where id = $1",
      [
        flowId,
        {
          ...presentation,
          nodes: presentation.nodes.slice(0, 1)
        }
      ]
    );
    const store = createDrizzleFlowDefinitionControlStore(runtime.database);

    await expect(
      updateDraft(store, ownerUserId, flowId, "flow-update-corrupt-stale", "Нельзя", 1)
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
    await expect(selectCommands(flowId)).resolves.toHaveLength(0);
    await expect(selectFlow(flowId)).resolves.toMatchObject({ revision: 2 });
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function createFlow(
    ownerUserId: string,
    draftGraph: FlowGraphRead = graph
  ): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      `insert into flows
        (owner_user_id, name, status, definition_state, approval_mode, revision,
         origin, draft_graph, draft_presentation, created_at, updated_at)
       values ($1, 'Подготовка', 'draft', 'draft', 'manual_approve', 1,
         $2, $3, $4, '2026-08-02T19:00:00.000Z', '2026-08-02T19:00:00.000Z')
       returning id`,
      [
        ownerUserId,
        { schemaVersion: "flow-definition-origin.v1", type: "blank" },
        draftGraph,
        presentation
      ]
    );
    return result.rows[0]?.id ?? raise("Expected flow id");
  }

  function updateDraft(
    store: ReturnType<typeof createDrizzleFlowDefinitionControlStore>,
    ownerUserId: string,
    flowId: string,
    idempotencyKey: string,
    name: string,
    expectedRevision: number
  ) {
    return updateFlowDefinitionDraftV2({
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision, name },
      idempotencyKey,
      now: "2026-08-02T20:00:00.000Z"
    });
  }

  async function selectFlow(flowId: string) {
    const result = await runtime.pool.query<{
      name: string;
      origin: Record<string, unknown> | null;
      revision: number;
      definition_state: string;
    }>("select name, origin, revision, definition_state from flows where id = $1", [flowId]);
    return result.rows[0] ?? null;
  }

  async function selectVersions(flowId: string) {
    const result = await runtime.pool.query(
      `select id, version, source_revision, capability_manifest
         from flow_versions
        where flow_id = $1
        order by version`,
      [flowId]
    );
    return result.rows;
  }

  async function selectEnrollmentReadAuthority(ownerUserId: string) {
    const result = await runtime.pool.query<{ subjects: string; quotas: string }>(
      `SELECT
         (SELECT count(*)::text FROM flow_runtime_owner_subjects
           WHERE owner_user_id = $1 AND state = 'active') AS subjects,
         (SELECT count(*)::text
            FROM flow_automation_quota_authorities quota
            JOIN flow_runtime_owner_subjects subject USING (owner_subject_id)
           WHERE subject.owner_user_id = $1) AS quotas`,
      [ownerUserId]
    );
    return result.rows[0] ?? raise("Expected enrollment read authority counts");
  }

  async function selectCommands(resourceId: string) {
    const result = await runtime.pool.query<{
      owner_user_id: string;
      state: string;
      response_status: number;
      response_body: Record<string, unknown>;
    }>(
      `select command.owner_user_id,
              command.state,
              outcome.response_status,
              outcome.response_body
         from flow_definition_commands command
         left join flow_definition_command_outcomes outcome
           on outcome.command_id = command.id
        where command.resource_id = $1
        order by command.created_at, command.id`,
      [resourceId]
    );
    return result.rows;
  }

  async function selectFlowsByOwner(ownerUserId: string) {
    const result = await runtime.pool.query("select id from flows where owner_user_id = $1", [
      ownerUserId
    ]);
    return result.rows;
  }

  async function selectOnlyCommandId(resourceId: string): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "select id from flow_definition_commands where resource_id = $1 order by created_at, id",
      [resourceId]
    );
    return result.rows[0]?.id ?? raise("Expected command id");
  }

  async function insertExpiredCreateCommand(
    ownerUserId: string,
    idempotencyKey: string,
    request: CanonicalJson
  ): Promise<{ readonly id: string }> {
    const requestHash = sha256CanonicalJson({
      schemaVersion: "flow-definition-command.v1",
      apiSurface: "astrologer-api",
      routeTemplate: "/flows",
      scope: "flows.definition.create.v2",
      actorUserId: ownerUserId,
      ownerUserId,
      resourceId: ownerUserId,
      request
    });
    const result = await runtime.pool.query<{ id: string; completed_at: Date }>(
      `insert into flow_definition_commands
        (api_surface, actor_user_id, owner_user_id, route_template, resource_id,
         command_scope, idempotency_key, request_hash, state, completed_at,
         replay_until, created_at, updated_at)
       values (
         'astrologer-api', $1, $1, '/flows', $1,
         'flows.definition.create.v2', $2, $3, 'succeeded',
         transaction_timestamp() - interval '48 hours',
         transaction_timestamp() - interval '25 hours',
         transaction_timestamp() - interval '49 hours',
         transaction_timestamp() - interval '48 hours'
       )
       returning id, completed_at`,
      [ownerUserId, idempotencyKey, requestHash]
    );
    const row = result.rows[0] ?? raise("Expected expired command");
    return { id: row.id };
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
