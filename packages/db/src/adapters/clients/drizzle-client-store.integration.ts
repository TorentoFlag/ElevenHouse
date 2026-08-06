import { createHash, randomUUID } from "node:crypto";
import { claimClientJoinIntent, type ClientJoinIntentClaimStore } from "@elevenhouse/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleClientStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const linkedAt = "2026-08-03T10:00:00.000Z";

describe("client store Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    const userIds = createdUserIds.splice(0);
    await runtime.pool.query(
      `delete from outbox_events
       where event_type = 'client.birth_profile.updated.v1'
         and payload ->> 'clientUserId' = any($1::text[])`,
      [userIds]
    );
    await runtime.pool.query(
      `delete from client_join_intents
       where astrologer_user_id = any($1::uuid[])
          or claimed_by_client_user_id = any($1::uuid[])`,
      [userIds]
    );
    await runtime.pool.query(
      "alter table client_birth_data_history disable trigger client_birth_data_history_append_only"
    );
    try {
      await runtime.pool.query("delete from users where id = any($1::uuid[])", [userIds]);
    } finally {
      await runtime.pool.query(
        "alter table client_birth_data_history enable trigger client_birth_data_history_append_only"
      );
    }
  });

  afterAll(async () => {
    await runtime.close();
  });

  it("creates the durable client projection from the canonical user profile before linking", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Direct Link Client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Direct Link Astrologer"
    });

    const relationship = await createDrizzleClientStore(runtime.database).ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now: linkedAt
    });

    const profile = await runtime.pool.query<{
      user_id: string;
      display_name_snapshot: string | null;
      preferred_locale: string | null;
      timezone: string | null;
    }>(
      `select user_id, display_name_snapshot, preferred_locale, timezone
       from client_profiles
       where user_id = $1`,
      [clientUserId]
    );

    expect(relationship).toMatchObject({ clientUserId, astrologerUserId, status: "active" });
    expect(profile.rows).toEqual([
      {
        user_id: clientUserId,
        display_name_snapshot: "Direct Link Client",
        preferred_locale: null,
        timezone: null
      }
    ]);
  });

  it("preserves an existing richer client profile while relinking", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Canonical Name" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Projection Astrologer"
    });
    const existingUpdatedAt = new Date("2026-07-01T09:00:00.000Z");
    await runtime.pool.query(
      `insert into client_profiles (
         user_id, display_name_snapshot, preferred_locale, timezone, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $5)`,
      [clientUserId, "Preferred Client Name", "ru", "Europe/Moscow", existingUpdatedAt]
    );

    await createDrizzleClientStore(runtime.database).ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now: linkedAt
    });

    const profile = await runtime.pool.query<{
      display_name_snapshot: string | null;
      preferred_locale: string | null;
      timezone: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `select display_name_snapshot, preferred_locale, timezone, created_at, updated_at
       from client_profiles
       where user_id = $1`,
      [clientUserId]
    );

    expect(profile.rows).toEqual([
      {
        display_name_snapshot: "Preferred Client Name",
        preferred_locale: "ru",
        timezone: "Europe/Moscow",
        created_at: existingUpdatedAt,
        updated_at: existingUpdatedAt
      }
    ]);
  });

  it("repairs a legacy null name from the canonical profile without replacing preferences", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Canonical Repair" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Repair Astrologer"
    });
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot, preferred_locale, timezone)
       values ($1, null, 'en', 'America/New_York')`,
      [clientUserId]
    );

    await createDrizzleClientStore(runtime.database).ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now: linkedAt
    });

    const profile = await runtime.pool.query<{
      display_name_snapshot: string | null;
      preferred_locale: string | null;
      timezone: string | null;
    }>(
      `select display_name_snapshot, preferred_locale, timezone
       from client_profiles
       where user_id = $1`,
      [clientUserId]
    );
    expect(profile.rows).toEqual([
      {
        display_name_snapshot: "Canonical Repair",
        preferred_locale: "en",
        timezone: "America/New_York"
      }
    ]);
  });

  it("rejects a missing canonical user profile without persisting a relationship", async () => {
    const clientUserId = await createUser({ role: "client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Projection Astrologer"
    });

    await expect(
      createDrizzleClientStore(runtime.database).ensureRelationship({
        clientUserId,
        astrologerUserId,
        source: "direct_link",
        now: linkedAt
      })
    ).rejects.toMatchObject({ name: "ClientProfileProjectionError" });

    const persisted = await runtime.pool.query<{ relationship_count: string }>(
      `select count(*)::text as relationship_count
       from client_astrologer_relationships
       where client_user_id = $1 and astrologer_user_id = $2`,
      [clientUserId, astrologerUserId]
    );
    expect(persisted.rows).toEqual([{ relationship_count: "0" }]);
  });

  it("creates the projection when called through an existing unit-of-work transaction", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Transactional Client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Transactional Astrologer"
    });

    await runtime.database.transaction(async (transaction) => {
      await createDrizzleClientStore(transaction).ensureRelationship({
        clientUserId,
        astrologerUserId,
        source: "direct_link",
        now: linkedAt
      });
    });

    const persisted = await runtime.pool.query<{
      profile_count: string;
      relationship_count: string;
    }>(
      `select
         (select count(*) from client_profiles where user_id = $1)::text as profile_count,
         (select count(*) from client_astrologer_relationships
          where client_user_id = $1 and astrologer_user_id = $2)::text as relationship_count`,
      [clientUserId, astrologerUserId]
    );
    expect(persisted.rows).toEqual([{ profile_count: "1", relationship_count: "1" }]);
  });

  it("fails closed without modifying a blocked relationship", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Blocked Client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Blocked Astrologer"
    });
    const blockedAt = new Date("2026-07-02T08:00:00.000Z");
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot)
       values ($1, 'Blocked Client')`,
      [clientUserId]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at,
         blocked_at, created_at, updated_at
       ) values ($1, $2, 'direct_link', 'blocked', $3, $3, $3, $3, $3)`,
      [clientUserId, astrologerUserId, blockedAt]
    );

    await expect(
      createDrizzleClientStore(runtime.database).ensureRelationship({
        clientUserId,
        astrologerUserId,
        source: "direct_link",
        now: linkedAt
      })
    ).rejects.toMatchObject({ name: "ClientAstrologerRelationshipBlockedError" });

    const relationship = await runtime.pool.query<{
      status: string;
      blocked_at: Date | null;
      last_linked_at: Date;
      updated_at: Date;
    }>(
      `select status, blocked_at, last_linked_at, updated_at
       from client_astrologer_relationships
       where client_user_id = $1 and astrologer_user_id = $2`,
      [clientUserId, astrologerUserId]
    );
    expect(relationship.rows).toEqual([
      {
        status: "blocked",
        blocked_at: blockedAt,
        last_linked_at: blockedAt,
        updated_at: blockedAt
      }
    ]);
  });

  it("reactivates an archived relationship and clears terminal markers", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Archived Client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Archived Astrologer"
    });
    const terminalAt = new Date("2026-07-03T08:00:00.000Z");
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot)
       values ($1, 'Archived Client')`,
      [clientUserId]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at,
         archived_at, blocked_at, created_at, updated_at
       ) values ($1, $2, 'direct_link', 'archived', $3, $3, $3, $3, $3, $3)`,
      [clientUserId, astrologerUserId, terminalAt]
    );

    const result = await createDrizzleClientStore(runtime.database).ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now: linkedAt
    });

    expect(result).toMatchObject({
      status: "active",
      archivedAt: null,
      blockedAt: null,
      lastLinkedAt: linkedAt,
      updatedAt: linkedAt
    });
  });

  it("allows only one client to claim a one-time join intent under a concurrent race", async () => {
    const firstClientUserId = await createUser({
      role: "client",
      displayName: "First Claimant"
    });
    const secondClientUserId = await createUser({
      role: "client",
      displayName: "Second Claimant"
    });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Claim Race Astrologer"
    });
    const token = `join_${randomUUID().replaceAll("-", "")}`;
    const tokenHash = hashJoinToken(token);
    const intentId = randomUUID();
    await createDrizzleClientStore(runtime.database).createJoinIntent({
      id: intentId,
      astrologerUserId,
      tokenHash,
      publicHandleSnapshot: "claim-race-astrologer",
      expiresAt: "2026-08-03T11:00:00.000Z",
      now: linkedAt
    });
    const afterBothReads = createBarrier(2);

    const claim = (clientUserId: string) =>
      runtime.database.transaction(async (transaction) => {
        const store = createDrizzleClientStore(transaction);
        const synchronizedStore: ClientJoinIntentClaimStore = {
          ...store,
          findJoinIntentByTokenHash: async (input) => {
            const intent = await store.findJoinIntentByTokenHash(input);
            await afterBothReads();
            return intent;
          }
        };
        return claimClientJoinIntent({
          store: synchronizedStore,
          token,
          tokenHasher: hashJoinToken,
          clientUserId,
          now: new Date(linkedAt)
        });
      });

    const outcomes = await Promise.allSettled([
      claim(firstClientUserId),
      claim(secondClientUserId)
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

    const [intent] = (
      await runtime.pool.query<{
        status: string;
        claimed_by_client_user_id: string | null;
      }>(
        `select status, claimed_by_client_user_id
         from client_join_intents
         where id = $1`,
        [intentId]
      )
    ).rows;
    expect(intent).toMatchObject({ status: "claimed" });
    expect([firstClientUserId, secondClientUserId]).toContain(intent?.claimed_by_client_user_id);
    const relationships = await runtime.pool.query<{
      client_user_id: string;
      status: string;
    }>(
      `select client_user_id, status
       from client_astrologer_relationships
       where astrologer_user_id = $1`,
      [astrologerUserId]
    );
    expect(relationships.rows).toEqual([
      {
        client_user_id: intent?.claimed_by_client_user_id,
        status: "active"
      }
    ]);
  });

  it("shares the relationship-first lock order with chart completion without deadlocking", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Lock Order Client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Lock Order Astrologer"
    });
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot)
       values ($1, 'Lock Order Client')`,
      [clientUserId]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
       ) values ($1, $2, 'direct_link', 'active', $3, $3)`,
      [clientUserId, astrologerUserId, linkedAt]
    );

    const applicationName = `client-store-lock-order-${randomUUID()}`;
    const ensureRuntime = createPostgresRuntime({
      DATABASE_URL: withApplicationName(databaseUrl, applicationName)
    });
    const chartTransaction = await runtime.pool.connect();
    let chartProfileLockError: unknown;

    try {
      await chartTransaction.query("begin");
      await chartTransaction.query(
        `select id
         from client_astrologer_relationships
         where client_user_id = $1 and astrologer_user_id = $2
         for update`,
        [clientUserId, astrologerUserId]
      );

      const ensureResultPromise = createDrizzleClientStore(ensureRuntime.database)
        .ensureRelationship({
          clientUserId,
          astrologerUserId,
          source: "direct_link",
          now: linkedAt
        })
        .then(
          (value) => ({ kind: "resolved" as const, value }),
          (error: unknown) => ({ kind: "rejected" as const, error })
        );

      await waitForApplicationLock(runtime, applicationName);
      try {
        await chartTransaction.query(
          "select user_id from client_profiles where user_id = $1 for update",
          [clientUserId]
        );
      } catch (error) {
        chartProfileLockError = error;
      }

      await chartTransaction.query(chartProfileLockError ? "rollback" : "commit");
      const ensureResult = await ensureResultPromise;

      if (chartProfileLockError) throw chartProfileLockError;
      if (ensureResult.kind === "rejected") throw ensureResult.error;
      expect(ensureResult.value).toMatchObject({
        clientUserId,
        astrologerUserId,
        status: "active"
      });
      const persisted = await runtime.pool.query<{
        relationship_status: string;
        display_name_snapshot: string | null;
      }>(
        `select relationship.status as relationship_status, profile.display_name_snapshot
         from client_astrologer_relationships as relationship
         join client_profiles as profile on profile.user_id = relationship.client_user_id
         where relationship.client_user_id = $1 and relationship.astrologer_user_id = $2`,
        [clientUserId, astrologerUserId]
      );
      expect(persisted.rows).toEqual([
        { relationship_status: "active", display_name_snapshot: "Lock Order Client" }
      ]);
    } finally {
      await chartTransaction.query("rollback").catch(() => undefined);
      chartTransaction.release();
      await ensureRuntime.close();
    }
  });

  it("does not link after a concurrent client-role revocation commits", async () => {
    const clientUserId = await createUser({ role: "client", displayName: "Revoked Client" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Revocation Astrologer"
    });
    const applicationName = `client-store-role-lock-${randomUUID()}`;
    const ensureRuntime = createPostgresRuntime({
      DATABASE_URL: withApplicationName(databaseUrl, applicationName)
    });
    const profileBlocker = await runtime.pool.connect();
    const roleRevoker = await runtime.pool.connect();

    try {
      await profileBlocker.query("begin");
      await profileBlocker.query(
        "select user_id from user_profiles where user_id = $1 for update",
        [clientUserId]
      );
      await roleRevoker.query("begin");
      await roleRevoker.query(
        "delete from user_role_assignments where user_id = $1 and role = 'client'",
        [clientUserId]
      );

      const ensureResultPromise = createDrizzleClientStore(ensureRuntime.database)
        .ensureRelationship({
          clientUserId,
          astrologerUserId,
          source: "direct_link",
          now: linkedAt
        })
        .then(
          (value) => ({ kind: "resolved" as const, value }),
          (error: unknown) => ({ kind: "rejected" as const, error })
        );

      await waitForApplicationLock(runtime, applicationName);
      await roleRevoker.query("commit");
      await profileBlocker.query("commit");
      const ensureResult = await ensureResultPromise;

      expect(ensureResult).toMatchObject({
        kind: "rejected",
        error: { name: "ClientAstrologerRelationshipRoleError" }
      });
      const relationshipCount = await runtime.pool.query<{ value: string }>(
        `select count(*)::text as value
         from client_astrologer_relationships
         where client_user_id = $1 and astrologer_user_id = $2`,
        [clientUserId, astrologerUserId]
      );
      expect(relationshipCount.rows).toEqual([{ value: "0" }]);
    } finally {
      await roleRevoker.query("rollback").catch(() => undefined);
      await profileBlocker.query("rollback").catch(() => undefined);
      roleRevoker.release();
      profileBlocker.release();
      await ensureRuntime.close();
    }
  });

  it("lists one client with its only birth profile", async () => {
    const { clientUserId, astrologerUserId, birthDataId } =
      await createLinkedClientWithBirthProfile();

    const result = await createDrizzleClientStore(runtime.database).listAstrologerClients({
      astrologerUserId,
      query: "",
      limit: 20,
      offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0]).toMatchObject({
      clientUserId,
      birthData: { id: birthDataId, label: "Primary", revision: 1 }
    });
  });

  it("gets the only birth profile for an active relationship", async () => {
    const { clientUserId, astrologerUserId, birthDataId } =
      await createLinkedClientWithBirthProfile();

    const result = await createDrizzleClientStore(runtime.database).getAstrologerClient({
      astrologerUserId,
      clientUserId
    });

    expect(result).toMatchObject({
      clientUserId,
      birthData: { id: birthDataId, label: "Primary", revision: 1 }
    });
  });

  it("records immutable birth-profile revisions and rejects stale compare-and-swap writes", async () => {
    const { clientUserId, astrologerUserId, birthDataId } = await createLinkedClientWithBirthProfile();
    const store = createDrizzleClientStore(runtime.database);

    await expect(
      store.writeClientBirthProfile({
        clientUserId,
        actor: { userId: clientUserId, role: "client" },
        expectedRevision: 1,
        data: {
          label: "Corrected",
          birthDate: "1991-03-03",
          birthTime: null,
          birthTimePrecision: "unknown",
          birthPlaceText: null,
          birthCountryCode: null,
          birthCity: null,
          birthRegion: null,
          birthTimezone: null,
          birthTimeDstOccurrence: null,
          birthLatitude: null,
          birthLongitude: null,
          source: "client_profile"
        },
        now: "2026-08-03T10:05:00.000Z"
      })
    ).resolves.toMatchObject({ kind: "written", profile: { revision: 2 } });

    await expect(
      store.writeClientBirthProfile({
        clientUserId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: 1,
        data: {
          label: "Stale",
          birthDate: "1992-04-04",
          birthTime: null,
          birthTimePrecision: "unknown",
          birthPlaceText: null,
          birthCountryCode: null,
          birthCity: null,
          birthRegion: null,
          birthTimezone: null,
          birthTimeDstOccurrence: null,
          birthLatitude: null,
          birthLongitude: null,
          source: "manual"
        },
        now: "2026-08-03T10:10:00.000Z"
      })
    ).resolves.toEqual({ kind: "conflict" });

    const history = await runtime.pool.query<{
      revision: number;
      actor_user_id: string;
      snapshot_birth_date: string;
    }>(
      `select revision, actor_user_id, snapshot ->> 'birthDate' as snapshot_birth_date
       from client_birth_data_history
       where birth_data_id = $1
       order by revision`,
      [birthDataId]
    );
    expect(history.rows).toEqual([
      { revision: 1, actor_user_id: astrologerUserId, snapshot_birth_date: "1990-02-02" },
      { revision: 2, actor_user_id: clientUserId, snapshot_birth_date: "1991-03-03" }
    ]);

    const events = await runtime.pool.query<{
      aggregate_id: string;
      payload: {
        readonly schemaVersion: string;
        readonly birthDataHistoryId: string;
        readonly birthDataId: string;
        readonly clientUserId: string;
        readonly revision: number;
        readonly actorUserId: string;
        readonly actorRole: string;
        readonly occurredAt: string;
      };
    }>(
      `select aggregate_id, payload
       from outbox_events
       where event_type = 'client.birth_profile.updated.v1'
         and payload ->> 'clientUserId' = $1
       order by (payload ->> 'revision')::integer`,
      [clientUserId]
    );
    expect(events.rows).toHaveLength(2);
    expect(events.rows).toEqual([
      expect.objectContaining({
        aggregate_id: events.rows[0]?.payload.birthDataHistoryId,
        payload: {
          schemaVersion: "client-birth-profile-updated.v1",
          birthDataHistoryId: events.rows[0]?.aggregate_id,
          birthDataId,
          clientUserId,
          revision: 1,
          actorUserId: astrologerUserId,
          actorRole: "astrologer",
          occurredAt: linkedAt
        }
      }),
      expect.objectContaining({
        aggregate_id: events.rows[1]?.payload.birthDataHistoryId,
        payload: {
          schemaVersion: "client-birth-profile-updated.v1",
          birthDataHistoryId: events.rows[1]?.aggregate_id,
          birthDataId,
          clientUserId,
          revision: 2,
          actorUserId: clientUserId,
          actorRole: "client",
          occurredAt: "2026-08-03T10:05:00.000Z"
        }
      })
    ]);
    expect(JSON.stringify(events.rows)).not.toContain("1990-02-02");
    expect(JSON.stringify(events.rows)).not.toContain("1991-03-03");
  });

  async function createUser(input: {
    readonly role: "client" | "astrologer";
    readonly displayName?: string;
  }): Promise<string> {
    const userId = randomUUID();
    createdUserIds.push(userId);
    await runtime.pool.query("insert into users (id, status) values ($1, 'active')", [userId]);
    if (input.displayName !== undefined) {
      await runtime.pool.query(
        "insert into user_profiles (user_id, display_name) values ($1, $2)",
        [userId, input.displayName]
      );
    }
    await runtime.pool.query("insert into user_role_assignments (user_id, role) values ($1, $2)", [
      userId,
      input.role
    ]);
    return userId;
  }

  async function createLinkedClientWithBirthProfile(): Promise<{
    readonly clientUserId: string;
    readonly astrologerUserId: string;
    readonly birthDataId: string;
  }> {
    const clientUserId = await createUser({ role: "client", displayName: "Birth Profile" });
    const astrologerUserId = await createUser({
      role: "astrologer",
      displayName: "Profiles Astrologer"
    });
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot)
       values ($1, 'Birth Profile')`,
      [clientUserId]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
       ) values ($1, $2, 'direct_link', 'active', $3, $3)`,
      [clientUserId, astrologerUserId, linkedAt]
    );
    const write = await createDrizzleClientStore(runtime.database).writeClientBirthProfile({
      clientUserId,
      actor: { userId: astrologerUserId, role: "astrologer" },
      expectedRevision: null,
      data: {
        label: "Primary",
        birthDate: "1990-02-02",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthPlaceText: null,
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthTimeDstOccurrence: null,
        birthLatitude: null,
        birthLongitude: null,
        source: "manual"
      },
      now: linkedAt
    });
    if (write.kind !== "written") throw new Error("Expected birth profile write");
    return { clientUserId, astrologerUserId, birthDataId: write.profile.id };
  }
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withApplicationName(databaseUrl: string, applicationName: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

function hashJoinToken(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

function createBarrier(participantCount: number): () => Promise<void> {
  let arrived = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === participantCount) release?.();
    await ready;
  };
}

async function waitForApplicationLock(
  runtime: ReturnType<typeof createPostgresRuntime>,
  applicationName: string
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await runtime.pool.query<{ waiting: boolean }>(
      `select exists (
         select 1
         from pg_stat_activity
         where application_name = $1 and wait_event_type = 'Lock'
       ) as waiting`,
      [applicationName]
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for PostgreSQL lock: ${applicationName}`);
}
