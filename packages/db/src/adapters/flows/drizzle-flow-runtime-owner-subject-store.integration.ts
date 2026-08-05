import { randomUUID } from "node:crypto";

import { FlowRuntimeControlIntegrityError } from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowRuntimeOwnerSubjectStore } from "./drizzle-flow-runtime-owner-subject-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_subjects_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

describe("flow runtime owner subject store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
  });

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  });

  beforeEach(async () => {
    await runtime.pool.query("DROP SCHEMA public CASCADE");
    await runtime.pool.query("CREATE SCHEMA public");
    await runtime.pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await reconcileAuditActorSubjects(client as unknown as Client);
      await reconcileFlowRuntimeControlAuthority(client as unknown as Client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("creates canonical subjects once and exact-replays the complete owner set", async () => {
    const firstOwnerUserId = randomUUID();
    const secondOwnerUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1), ($2)", [
      firstOwnerUserId,
      secondOwnerUserId
    ]);
    const store = createDrizzleFlowRuntimeOwnerSubjectStore(runtime.database);

    const created = await store.resolveOrCreateActive({
      ownerUserIds: [secondOwnerUserId.toUpperCase(), firstOwnerUserId]
    });
    const replayed = await store.resolveOrCreateActive({
      ownerUserIds: [firstOwnerUserId, secondOwnerUserId]
    });

    expect(created).toEqual(replayed);
    expect(created.map((mapping) => mapping.ownerUserId)).toEqual(
      [firstOwnerUserId, secondOwnerUserId].sort()
    );
    const count = await runtime.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM flow_runtime_owner_subjects"
    );
    expect(count.rows[0]?.count).toBe("2");
  });

  it("fails the whole resolution when any owner is absent without partial mappings", async () => {
    const existingOwnerUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1)", [existingOwnerUserId]);
    const store = createDrizzleFlowRuntimeOwnerSubjectStore(runtime.database);

    await expect(
      store.resolveOrCreateActive({
        ownerUserIds: [existingOwnerUserId, randomUUID()]
      })
    ).rejects.toBeInstanceOf(FlowRuntimeControlIntegrityError);
    const count = await runtime.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM flow_runtime_owner_subjects"
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("keeps an erased subject detached and fails closed after owner deletion", async () => {
    const ownerUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1)", [ownerUserId]);
    const store = createDrizzleFlowRuntimeOwnerSubjectStore(runtime.database);
    const [mapping] = await store.resolveOrCreateActive({ ownerUserIds: [ownerUserId] });

    await runtime.pool.query("DELETE FROM users WHERE id = $1", [ownerUserId]);
    await expect(
      store.resolveOrCreateActive({ ownerUserIds: [ownerUserId] })
    ).rejects.toBeInstanceOf(FlowRuntimeControlIntegrityError);
    const erased = await runtime.pool.query<{
      owner_subject_id: string;
      owner_user_id: string | null;
      state: string;
    }>(
      "SELECT owner_subject_id, owner_user_id, state FROM flow_runtime_owner_subjects"
    );
    expect(erased.rows).toEqual([
      {
        owner_subject_id: mapping?.ownerSubjectId,
        owner_user_id: null,
        state: "erased"
      }
    ]);
  });
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}
