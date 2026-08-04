import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authorizeChartAiParticipants,
  canonicalChartAiConsentNoticeHashes,
  ChartAiConsentRequiredError,
  chartAiConsentPolicyVersion,
  ClientConsentNotFoundError,
  ClientConsentRelationshipInactiveError,
  ClientConsentRelationshipRequiredError,
  currentChartAiConsentPolicy,
  grantChartAiConsent,
  revokeClientDataConsent,
  startAiUsageAttempt
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleAiUsageStore } from "../ai/drizzle-ai-usage-store";
import { createDrizzleClientConsentStore } from "./drizzle-client-consent-store";

const databaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const now = new Date("2026-08-03T12:00:00.000Z");

describe("client consent Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const userIds: string[] = [];
  const auditIds: string[] = [];
  const usageIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (usageIds.length > 0) {
        await runtime.pool.query("delete from ai_usage_records where id = any($1)", [usageIds]);
      }
      if (auditIds.length > 0) {
        await runtime.pool.query("delete from audit_log_entries where id = any($1)", [auditIds]);
      }
      if (userIds.length > 0) {
        await runtime.pool.query(
          "delete from client_data_consents where client_user_id = any($1)",
          [userIds]
        );
        await runtime.pool.query(
          "delete from client_astrologer_relationships where client_user_id = any($1) or astrologer_user_id = any($1)",
          [userIds]
        );
        await runtime.pool.query("delete from users where id = any($1)", [userIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("serializes concurrent exact grants into one current row and one audit entry", async () => {
    const store = createDrizzleClientConsentStore(runtime.database);
    const relationship = await createRelationship("active");
    const firstIds = [randomUUID(), randomUUID()] as const;
    const secondIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(firstIds[1], secondIds[1]);

    const [first, second] = await Promise.all([
      grantChartAiConsent({
        store,
        clientUserId: relationship.clientUserId,
        astrologerUserId: relationship.astrologerUserId,
        request: grantRequest(),
        now,
        idGenerator: sequence(firstIds)
      }),
      grantChartAiConsent({
        store,
        clientUserId: relationship.clientUserId,
        astrologerUserId: relationship.astrologerUserId,
        request: grantRequest(),
        now,
        idGenerator: sequence(secondIds)
      })
    ]);

    expect(first.id).toBe(second.id);
    const rows = await runtime.pool.query<{ id: string }>(
      "select id from client_data_consents where relationship_id = $1 and revoked_at is null",
      [relationship.id]
    );
    expect(rows.rows).toEqual([{ id: first.id }]);
    const audits = await runtime.pool.query<{ action: string }>(
      "select action from audit_log_entries where target_id = $1",
      [first.id]
    );
    expect(audits.rows).toEqual([{ action: "client.consent.granted" }]);
  });

  it("treats the current row as authority even when revoked history has a later timestamp", async () => {
    const store = createDrizzleClientConsentStore(runtime.database);
    const relationship = await createRelationship("active");
    const historicalConsentId = randomUUID();
    const currentConsentId = randomUUID();
    await runtime.pool.query(
      `insert into client_data_consents
         (id, relationship_id, client_user_id, astrologer_user_id, purpose, policy_version,
          processor_code, notice_locale, notice_sha256, granted_at, revoked_at)
       values
         ($1, $3, $4, $5, $6, $7, 'openai', 'en', $8, '2026-08-04T12:00:00.000Z', '2026-08-05T12:00:00.000Z'),
         ($2, $3, $4, $5, $6, $7, 'openai', 'ru', $9, '2026-08-03T12:00:00.000Z', null)`,
      [
        historicalConsentId,
        currentConsentId,
        relationship.id,
        relationship.clientUserId,
        relationship.astrologerUserId,
        currentChartAiConsentPolicy.purpose,
        currentChartAiConsentPolicy.policyVersion,
        canonicalChartAiConsentNoticeHashes.en,
        canonicalChartAiConsentNoticeHashes.ru
      ]
    );

    await expect(
      grantChartAiConsent({
        store,
        clientUserId: relationship.clientUserId,
        astrologerUserId: relationship.astrologerUserId,
        request: grantRequest(),
        now: new Date("2026-08-06T12:00:00.000Z"),
        idGenerator: sequence([randomUUID(), randomUUID()])
      })
    ).resolves.toMatchObject({ id: currentConsentId, revokedAt: null });
  });

  it("keeps revoke owner-scoped/idempotent and creates new immutable evidence on re-grant", async () => {
    const store = createDrizzleClientConsentStore(runtime.database);
    const relationship = await createRelationship("active");
    const grantIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(grantIds[1]);
    const granted = await grantChartAiConsent({
      store,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      request: grantRequest(),
      now,
      idGenerator: sequence(grantIds)
    });
    const unrelatedClientId = await createUser("client");

    await expect(
      revokeClientDataConsent({
        store,
        clientUserId: unrelatedClientId,
        consentId: granted.id,
        now,
        idGenerator: () => randomUUID()
      })
    ).rejects.toBeInstanceOf(ClientConsentNotFoundError);

    const revokeAuditId = randomUUID();
    auditIds.push(revokeAuditId);
    const revoked = await revokeClientDataConsent({
      store,
      clientUserId: relationship.clientUserId,
      consentId: granted.id,
      now: new Date("2026-08-03T12:05:00.000Z"),
      idGenerator: () => revokeAuditId
    });
    expect(revoked.revokedAt).toBe("2026-08-03T12:05:00.000Z");
    await expect(
      revokeClientDataConsent({
        store,
        clientUserId: relationship.clientUserId,
        consentId: granted.id,
        now: new Date("2026-08-03T12:06:00.000Z"),
        idGenerator: () => randomUUID()
      })
    ).resolves.toEqual(revoked);

    const regrantIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(regrantIds[1]);
    const regranted = await grantChartAiConsent({
      store,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      request: grantRequest(),
      now: new Date("2026-08-03T12:10:00.000Z"),
      idGenerator: sequence(regrantIds)
    });
    expect(regranted.id).not.toBe(granted.id);
    const history = await runtime.pool.query<{ id: string; revoked_at: Date | null }>(
      "select id, revoked_at from client_data_consents where relationship_id = $1 order by granted_at",
      [relationship.id]
    );
    expect(history.rows).toHaveLength(2);
    expect(history.rows.filter((row) => row.revoked_at === null).map((row) => row.id)).toEqual([
      regranted.id
    ]);
    const regrantAudit = await runtime.pool.query<{
      metadata: { noticeSha256?: string; supersededConsentId?: string | null };
    }>("select metadata from audit_log_entries where target_id = $1", [regranted.id]);
    expect(regrantAudit.rows).toEqual([
      {
        metadata: expect.objectContaining({
          noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
          supersededConsentId: granted.id
        })
      }
    ]);

    await expect(
      runtime.pool.query(
        "update client_data_consents set policy_version = 'tampered.v1' where id = $1",
        [regranted.id]
      )
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "client_data_consents_immutable_evidence"
    });
    const unchanged = await runtime.pool.query<{ policy_version: string; revoked_at: Date | null }>(
      "select policy_version, revoked_at from client_data_consents where id = $1",
      [regranted.id]
    );
    expect(unchanged.rows).toEqual([
      { policy_version: chartAiConsentPolicyVersion, revoked_at: null }
    ]);
  });

  it("requires every active owner relationship and rolls consent/audit back atomically", async () => {
    const store = createDrizzleClientConsentStore(runtime.database);
    const relationship = await createRelationship("active");
    const grantIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(grantIds[1]);
    const granted = await grantChartAiConsent({
      store,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      request: grantRequest(),
      now,
      idGenerator: sequence(grantIds)
    });
    await expect(
      authorizeChartAiParticipants({
        store,
        astrologerUserId: relationship.astrologerUserId,
        participants: [{ clientUserId: relationship.clientUserId }]
      })
    ).resolves.toEqual([{ clientUserId: relationship.clientUserId, consentId: granted.id }]);

    await runtime.pool.query(
      "update client_astrologer_relationships set status = 'archived', archived_at = now() where id = $1",
      [relationship.id]
    );
    await expect(
      authorizeChartAiParticipants({
        store,
        astrologerUserId: relationship.astrologerUserId,
        participants: [{ clientUserId: relationship.clientUserId }]
      })
    ).rejects.toBeInstanceOf(ClientConsentRelationshipInactiveError);
    const otherAstrologerId = await createUser("astrologer");
    await expect(
      authorizeChartAiParticipants({
        store,
        astrologerUserId: otherAstrologerId,
        participants: [{ clientUserId: relationship.clientUserId }]
      })
    ).rejects.toBeInstanceOf(ClientConsentRelationshipRequiredError);

    const rollbackRelationship = await createRelationship("active");
    const duplicateAuditId = randomUUID();
    auditIds.push(duplicateAuditId);
    await runtime.pool.query(
      "insert into audit_log_entries (id, actor_user_id, action, target_type, target_id, occurred_at, metadata) values ($1, $2, 'test.reserved', 'test', 'reserved', now(), '{}'::jsonb)",
      [duplicateAuditId, rollbackRelationship.clientUserId]
    );
    const rollbackConsentId = randomUUID();
    await expect(
      grantChartAiConsent({
        store,
        clientUserId: rollbackRelationship.clientUserId,
        astrologerUserId: rollbackRelationship.astrologerUserId,
        request: grantRequest(),
        now,
        idGenerator: sequence([rollbackConsentId, duplicateAuditId])
      })
    ).rejects.toThrow();
    const rolledBack = await runtime.pool.query(
      "select id from client_data_consents where id = $1",
      [rollbackConsentId]
    );
    expect(rolledBack.rows).toHaveLength(0);
  });

  it("serializes revoke against AI start and rejects stale authorization after consent changes", async () => {
    const consentStore = createDrizzleClientConsentStore(runtime.database);
    const aiUsageStore = createDrizzleAiUsageStore(runtime.database);
    const relationship = await createRelationship("active");
    const grantIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(grantIds[1]);
    const granted = await grantChartAiConsent({
      store: consentStore,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      request: grantRequest(),
      now,
      idGenerator: sequence(grantIds)
    });
    const [authorization] = await authorizeChartAiParticipants({
      store: consentStore,
      astrologerUserId: relationship.astrologerUserId,
      participants: [{ clientUserId: relationship.clientUserId }]
    });
    expect(authorization).toEqual({
      clientUserId: relationship.clientUserId,
      consentId: granted.id
    });

    const racingUsageId = randomUUID();
    const rejectedAfterRevokeUsageId = randomUUID();
    const rejectedAfterChangeUsageId = randomUUID();
    const currentUsageId = randomUUID();
    usageIds.push(
      racingUsageId,
      rejectedAfterRevokeUsageId,
      rejectedAfterChangeUsageId,
      currentUsageId
    );
    const revokeAuditId = randomUUID();
    auditIds.push(revokeAuditId);
    const completionOrder: string[] = [];
    const start = startConsentBoundUsage({
      store: aiUsageStore,
      usageId: racingUsageId,
      consentRecordId: authorization!.consentId,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      checksumCharacter: "b"
    }).then(
      (value) => {
        completionOrder.push("start_committed");
        return value;
      },
      (error: unknown) => {
        completionOrder.push("start_rejected");
        throw error;
      }
    );
    const revoke = revokeClientDataConsent({
      store: consentStore,
      clientUserId: relationship.clientUserId,
      consentId: granted.id,
      now: new Date("2026-08-03T12:05:00.000Z"),
      idGenerator: () => revokeAuditId
    }).then((value) => {
      completionOrder.push("revoke_committed");
      return value;
    });

    const [startOutcome, revokeOutcome] = await Promise.allSettled([start, revoke]);
    expect(revokeOutcome.status).toBe("fulfilled");
    if (revokeOutcome.status !== "fulfilled") raise("Revoke unexpectedly failed");
    expect(revokeOutcome.value.revokedAt).toBe("2026-08-03T12:05:00.000Z");
    const racingUsage = await runtime.pool.query<{ consent_record_id: string }>(
      `select evidence.consent_record_id
       from ai_usage_records usage
       join ai_usage_consent_records evidence on evidence.usage_record_id = usage.id
       where usage.id = $1`,
      [racingUsageId]
    );
    if (startOutcome.status === "fulfilled") {
      expect(completionOrder).toEqual(["start_committed", "revoke_committed"]);
      expect(racingUsage.rows).toEqual([{ consent_record_id: granted.id }]);
    } else {
      expect(startOutcome.reason).toBeInstanceOf(ChartAiConsentRequiredError);
      expect(completionOrder).toEqual(["revoke_committed", "start_rejected"]);
      expect(racingUsage.rows).toHaveLength(0);
    }

    await expect(
      startConsentBoundUsage({
        store: aiUsageStore,
        usageId: rejectedAfterRevokeUsageId,
        consentRecordId: granted.id,
        clientUserId: relationship.clientUserId,
        astrologerUserId: relationship.astrologerUserId,
        checksumCharacter: "c"
      })
    ).rejects.toBeInstanceOf(ChartAiConsentRequiredError);

    const regrantIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(regrantIds[1]);
    const regranted = await grantChartAiConsent({
      store: consentStore,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      request: {
        accepted: true,
        policyVersion: chartAiConsentPolicyVersion,
        noticeSha256: canonicalChartAiConsentNoticeHashes.en,
        locale: "en"
      },
      now: new Date("2026-08-03T12:10:00.000Z"),
      idGenerator: sequence(regrantIds)
    });
    expect(regranted.id).not.toBe(granted.id);
    await expect(
      startConsentBoundUsage({
        store: aiUsageStore,
        usageId: rejectedAfterChangeUsageId,
        consentRecordId: granted.id,
        clientUserId: relationship.clientUserId,
        astrologerUserId: relationship.astrologerUserId,
        checksumCharacter: "d"
      })
    ).rejects.toBeInstanceOf(ChartAiConsentRequiredError);

    const [currentAuthorization] = await authorizeChartAiParticipants({
      store: consentStore,
      astrologerUserId: relationship.astrologerUserId,
      participants: [{ clientUserId: relationship.clientUserId }]
    });
    expect(currentAuthorization?.consentId).toBe(regranted.id);
    await expect(
      startConsentBoundUsage({
        store: aiUsageStore,
        usageId: currentUsageId,
        consentRecordId: currentAuthorization!.consentId,
        clientUserId: relationship.clientUserId,
        astrologerUserId: relationship.astrologerUserId,
        checksumCharacter: "e"
      })
    ).resolves.toMatchObject({
      id: currentUsageId,
      consentRecordIds: [regranted.id],
      status: "started"
    });
    const rejectedUsage = await runtime.pool.query<{ id: string }>(
      "select id from ai_usage_records where id = any($1::uuid[]) order by id",
      [[rejectedAfterRevokeUsageId, rejectedAfterChangeUsageId]]
    );
    expect(rejectedUsage.rows).toHaveLength(0);
  });

  it("rejects AI start when a concurrent revoke already owns the consent row lock", async () => {
    const consentStore = createDrizzleClientConsentStore(runtime.database);
    const aiUsageStore = createDrizzleAiUsageStore(runtime.database);
    const relationship = await createRelationship("active");
    const grantIds = [randomUUID(), randomUUID()] as const;
    auditIds.push(grantIds[1]);
    const granted = await grantChartAiConsent({
      store: consentStore,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      request: grantRequest(),
      now,
      idGenerator: sequence(grantIds)
    });
    const revokeAuditId = randomUUID();
    const usageId = randomUUID();
    auditIds.push(revokeAuditId);
    usageIds.push(usageId);
    const auditBarrier = await runtime.pool.connect();
    let barrierTransactionOpen = false;
    let revokeOutcomePromise:
      | ReturnType<typeof settle<Awaited<ReturnType<typeof revokeClientDataConsent>>>>
      | undefined;
    let startOutcomePromise:
      | ReturnType<typeof settle<Awaited<ReturnType<typeof startConsentBoundUsage>>>>
      | undefined;

    try {
      await auditBarrier.query("begin");
      barrierTransactionOpen = true;
      await auditBarrier.query(
        `insert into audit_log_entries
           (id, actor_user_id, action, target_type, target_id, occurred_at, metadata)
         values ($1, $2, 'test.client-consent-race-barrier', 'test', $3, now(), '{}'::jsonb)`,
        [revokeAuditId, relationship.clientUserId, granted.id]
      );
      const barrierBackend = await auditBarrier.query<{ pid: number }>(
        "select pg_backend_pid() as pid"
      );
      const barrierBackendPid = barrierBackend.rows[0]?.pid;
      if (!barrierBackendPid) raise("PostgreSQL barrier backend pid is missing");

      revokeOutcomePromise = settle(
        revokeClientDataConsent({
          store: consentStore,
          clientUserId: relationship.clientUserId,
          consentId: granted.id,
          now: new Date("2026-08-03T12:05:00.000Z"),
          idGenerator: () => revokeAuditId
        })
      );
      const revokeBackendPid = await waitForDatabaseWaiter({
        blockingBackendPid: barrierBackendPid,
        queryPattern: "%audit_log_entries%"
      });

      startOutcomePromise = settle(
        startConsentBoundUsage({
          store: aiUsageStore,
          usageId,
          consentRecordId: granted.id,
          clientUserId: relationship.clientUserId,
          astrologerUserId: relationship.astrologerUserId,
          checksumCharacter: "f"
        })
      );
      await waitForDatabaseWaiter({
        blockingBackendPid: revokeBackendPid,
        queryPattern: "%client_data_consents%"
      });

      await auditBarrier.query("rollback");
      barrierTransactionOpen = false;
      const [revokeOutcome, startOutcome] = await Promise.all([
        revokeOutcomePromise,
        startOutcomePromise
      ]);
      expect(revokeOutcome).toMatchObject({
        status: "fulfilled",
        value: { id: granted.id, revokedAt: "2026-08-03T12:05:00.000Z" }
      });
      expect(startOutcome.status).toBe("rejected");
      if (startOutcome.status !== "rejected") raise("AI start unexpectedly committed");
      expect(startOutcome.reason).toBeInstanceOf(ChartAiConsentRequiredError);
      const usage = await runtime.pool.query<{ id: string }>(
        "select id from ai_usage_records where id = $1",
        [usageId]
      );
      expect(usage.rows).toHaveLength(0);
    } finally {
      if (barrierTransactionOpen) await auditBarrier.query("rollback");
      auditBarrier.release();
      await Promise.all(
        [revokeOutcomePromise, startOutcomePromise].filter(
          (promise): promise is NonNullable<typeof promise> => promise !== undefined
        )
      );
    }
  });

  async function waitForDatabaseWaiter(input: {
    readonly blockingBackendPid: number;
    readonly queryPattern: string;
  }): Promise<number> {
    const deadline = Date.now() + 5_000;
    while (Date.now() <= deadline) {
      const result = await runtime.pool.query<{ pid: number }>(
        `select pid
         from pg_stat_activity
         where datname = current_database()
           and wait_event_type = 'Lock'
           and $1::integer = any(pg_blocking_pids(pid))
           and query ilike $2
         order by pid
         limit 1`,
        [input.blockingBackendPid, input.queryPattern]
      );
      const waiterBackendPid = result.rows[0]?.pid;
      if (waiterBackendPid) return waiterBackendPid;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `Timed out waiting for PostgreSQL backend blocked by ${input.blockingBackendPid}`
    );
  }

  async function createRelationship(status: "active" | "archived") {
    const clientUserId = await createUser("client");
    const astrologerUserId = await createUser("astrologer");
    const id = randomUUID();
    await runtime.pool.query(
      "insert into client_astrologer_relationships (id, client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at, archived_at, created_at, updated_at) values ($1, $2, $3, 'direct_link', $4, now(), now(), case when $4 = 'archived' then now() else null end, now(), now())",
      [id, clientUserId, astrologerUserId, status]
    );
    return { id, clientUserId, astrologerUserId };
  }

  async function createUser(role: "client" | "astrologer") {
    const id = randomUUID();
    userIds.push(id);
    await runtime.pool.query("insert into users (id, status) values ($1, 'active')", [id]);
    await runtime.pool.query("insert into user_role_assignments (user_id, role) values ($1, $2)", [
      id,
      role
    ]);
    if (role === "astrologer") {
      await runtime.pool.query(
        "insert into astrologer_profiles (owner_user_id, public_handle, public_name, timezone, locale, consultation_languages) values ($1, $2, 'Test Astrologer', 'UTC', 'en', '[\"en\"]'::jsonb)",
        [id, `test-${id}`]
      );
    }
    return id;
  }
});

function grantRequest() {
  return {
    accepted: true as const,
    policyVersion: chartAiConsentPolicyVersion,
    noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
    locale: "ru" as const
  };
}

function sequence(values: readonly string[]): () => string {
  let index = 0;
  return () => values[index++] ?? raise("ID sequence exhausted");
}

function startConsentBoundUsage(input: {
  readonly store: Parameters<typeof startAiUsageAttempt>[0]["store"];
  readonly usageId: string;
  readonly consentRecordId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly checksumCharacter: string;
}) {
  return startAiUsageAttempt({
    store: input.store,
    idGenerator: () => input.usageId,
    feature: "chart.interpretationDraft",
    promptId: "chart.interpretationDraft",
    promptVersion: 3,
    provider: "openai",
    ownerSafetyId: `eh_${"a".repeat(61)}`,
    consentAuthorizations: [
      {
        consentRecordId: input.consentRecordId,
        clientUserId: input.clientUserId,
        astrologerUserId: input.astrologerUserId
      }
    ],
    processingAuthorityVersion: "openai-processing-authority.v1",
    resourceEvidence: {
      resourceType: "chart_calculation",
      resourceId: input.usageId,
      sourceChecksum: `sha256:${input.checksumCharacter.repeat(64)}`
    },
    now: new Date("2026-08-03T12:04:00.000Z")
  });
}

function settle<T>(
  promise: Promise<T>
): Promise<
  | { readonly status: "fulfilled"; readonly value: T }
  | { readonly status: "rejected"; readonly reason: unknown }
> {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason })
  );
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
