import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalChartAiConsentNoticeHashes,
  chartAiConsentPolicyVersion,
  chartAiConsentProcessorCode,
  clientDataConsentPurpose,
  ChartAiConsentRequiredError,
  completeAiUsageAttempt,
  failAiUsageAttempt,
  reconcileStaleAiUsageAttempts,
  startAiUsageAttempt
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleAiUsageStore } from "./drizzle-ai-usage-store";

const databaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const ownerSafetyId = `eh_${"a".repeat(61)}`;

describe("AI usage Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const usageIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (usageIds.length > 0) {
        await runtime.pool.query("delete from ai_usage_records where id = any($1)", [usageIds]);
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

  it("persists successful evidence with exact terminal replay and divergent rejection", async () => {
    const store = createDrizzleAiUsageStore(runtime.database);
    const id = randomUUID();
    usageIds.push(id);
    const started = await startAiUsageAttempt({
      store,
      idGenerator: () => id,
      feature: "dictionary.aiDraft",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      provider: "openai",
      ownerSafetyId,
      consentAuthorizations: [],
      processingAuthorityVersion: null,
      resourceEvidence: null,
      now: new Date("2026-08-03T12:00:00.000Z")
    });
    expect(started).toMatchObject({ status: "started", consentRecordIds: [] });
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => id,
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId,
        consentAuthorizations: [],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: new Date("2026-08-03T12:00:00.000Z")
      })
    ).resolves.toEqual(started);
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => id,
        feature: "dictionary.aiDraft.changed",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId,
        consentAuthorizations: [],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: new Date("2026-08-03T12:00:00.000Z")
      })
    ).rejects.toThrow("Started AI usage evidence does not match its command");

    const completion = {
      store,
      attemptId: id,
      model: "gpt-5.4-mini",
      finishReason: "completed",
      durationMs: 75,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      now: new Date("2026-08-03T12:00:00.075Z")
    } as const;
    const completed = await completeAiUsageAttempt(completion);
    expect(completed).toMatchObject({ status: "succeeded", totalTokens: 15 });
    await expect(completeAiUsageAttempt(completion)).resolves.toEqual(completed);
    await expect(
      completeAiUsageAttempt({ ...completion, finishReason: "length" })
    ).rejects.toThrow("Completed AI usage evidence does not match its command");
    await expect(
      failAiUsageAttempt({
        store,
        attemptId: id,
        safeErrorCode: "AI_PROVIDER_TIMEOUT",
        durationMs: 100,
        now: new Date("2026-08-03T12:00:00.100Z")
      })
    ).rejects.toThrow("Failed AI usage evidence does not match its command");

    const persisted = await runtime.pool.query<Record<string, unknown>>(
      "select * from ai_usage_records where id = $1",
      [id]
    );
    expect(persisted.rows[0]).not.toHaveProperty("prompt");
    expect(persisted.rows[0]).not.toHaveProperty("chart_data");
    expect(persisted.rows[0]).not.toHaveProperty("owner_user_id");
  });

  it("persists failed evidence with exact terminal replay and divergent rejection", async () => {
    const store = createDrizzleAiUsageStore(runtime.database);
    const id = randomUUID();
    usageIds.push(id);
    await startAiUsageAttempt({
      store,
      idGenerator: () => id,
      feature: "dictionary.aiDraft",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      provider: "openai",
      ownerSafetyId,
      consentAuthorizations: [],
      processingAuthorityVersion: null,
      resourceEvidence: null,
      now: new Date("2026-08-03T12:05:00.000Z")
    });
    const failure = {
      store,
      attemptId: id,
      safeErrorCode: "AI_PROVIDER_TIMEOUT",
      durationMs: 250,
      now: new Date("2026-08-03T12:05:00.250Z")
    } as const;

    const failed = await failAiUsageAttempt(failure);
    await expect(failAiUsageAttempt(failure)).resolves.toEqual(failed);
    await expect(
      failAiUsageAttempt({ ...failure, safeErrorCode: "AI_PROVIDER_SERVER_ERROR" })
    ).rejects.toThrow("Failed AI usage evidence does not match its command");
  });

  it("claims stale attempts without overlap and records only indeterminate safe evidence", async () => {
    const leftStore = createDrizzleAiUsageStore(runtime.database);
    const rightStore = createDrizzleAiUsageStore(runtime.database);
    const staleIds: readonly [string, string] = [randomUUID(), randomUUID()];
    const freshId = randomUUID();
    usageIds.push(...staleIds, freshId);
    for (const [id, startedAt] of [
      [staleIds[0], "2026-08-03T12:00:00.000Z"],
      [staleIds[1], "2026-08-03T12:01:00.000Z"],
      [freshId, "2026-08-03T12:10:00.000Z"]
    ] as const) {
      await startAiUsageAttempt({
        store: leftStore,
        idGenerator: () => id,
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId,
        consentAuthorizations: [],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: new Date(startedAt)
      });
    }

    const reconciliation = {
      startedBefore: new Date("2026-08-03T12:05:00.000Z"),
      now: new Date("2026-08-03T12:11:00.000Z"),
      limit: 1
    } as const;
    const claims = await Promise.all([
      reconcileStaleAiUsageAttempts({ store: leftStore, ...reconciliation }),
      reconcileStaleAiUsageAttempts({ store: rightStore, ...reconciliation })
    ]);

    expect(new Set(claims.flat().map(({ id }) => id))).toEqual(new Set(staleIds));
    expect(claims.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "indeterminate",
          safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE",
          model: null,
          finishReason: null
        })
      ])
    );
    const persisted = await runtime.pool.query<{
      id: string;
      status: string;
      safe_error_code: string | null;
    }>(
      "select id, status, safe_error_code from ai_usage_records where id = any($1::uuid[]) order by id",
      [[...staleIds, freshId]]
    );
    const staleIdSet = new Set<string>(staleIds);
    expect(persisted.rows.filter(({ id }) => staleIdSet.has(id))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "indeterminate",
          safe_error_code: "AI_USAGE_OUTCOME_INDETERMINATE"
        })
      ])
    );
    expect(persisted.rows.find(({ id }) => id === freshId)).toMatchObject({
      status: "started",
      safe_error_code: null
    });
  });

  it("rolls back the attempt when consent evidence does not exist", async () => {
    const store = createDrizzleAiUsageStore(runtime.database);
    const id = randomUUID();
    usageIds.push(id);

    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => id,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId,
        consentAuthorizations: [
          {
            consentRecordId: randomUUID(),
            clientUserId: randomUUID(),
            astrologerUserId: randomUUID()
          }
        ],
        processingAuthorityVersion: "openai-processing-authority.v1",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: randomUUID(),
          sourceChecksum: `sha256:${"b".repeat(64)}`
        },
        now: new Date("2026-08-03T12:10:00.000Z")
      })
    ).rejects.toThrow();
    const persisted = await runtime.pool.query("select id from ai_usage_records where id = $1", [
      id
    ]);
    expect(persisted.rows).toHaveLength(0);
  });

  it("atomically validates current relationship-scoped consent before recording provider usage", async () => {
    const store = createDrizzleAiUsageStore(runtime.database);
    const authorization = await createCurrentConsent();
    const successfulUsageId = randomUUID();
    const revokedUsageId = randomUUID();
    usageIds.push(successfulUsageId, revokedUsageId);

    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => successfulUsageId,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId,
        consentAuthorizations: [authorization],
        processingAuthorityVersion: "openai-processing-authority.v1",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: successfulUsageId,
          sourceChecksum: `sha256:${"c".repeat(64)}`
        },
        now: new Date("2026-08-03T12:20:00.000Z")
      })
    ).resolves.toMatchObject({
      id: successfulUsageId,
      consentRecordIds: [authorization.consentRecordId],
      processingAuthorityVersion: "openai-processing-authority.v1",
      resourceType: "chart_calculation",
      resourceId: successfulUsageId,
      sourceChecksum: `sha256:${"c".repeat(64)}`
    });

    await expect(
      runtime.pool.query(
        "update ai_usage_records set source_checksum = $2 where id = $1",
        [successfulUsageId, `sha256:${"e".repeat(64)}`]
      )
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "ai_usage_records_one_way_lifecycle"
    });
    await expect(
      runtime.pool.query(
        "delete from ai_usage_consent_records where usage_record_id = $1",
        [successfulUsageId]
      )
    ).rejects.toMatchObject({
      code: "55000",
      constraint: "ai_usage_consent_records_immutable_evidence"
    });

    await runtime.pool.query("update client_data_consents set revoked_at = $2 where id = $1", [
      authorization.consentRecordId,
      "2026-08-03T12:21:00.000Z"
    ]);
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => revokedUsageId,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId,
        consentAuthorizations: [authorization],
        processingAuthorityVersion: "openai-processing-authority.v1",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: revokedUsageId,
          sourceChecksum: `sha256:${"d".repeat(64)}`
        },
        now: new Date("2026-08-03T12:22:00.000Z")
      })
    ).rejects.toBeInstanceOf(ChartAiConsentRequiredError);
    const rejectedAttempt = await runtime.pool.query(
      "select id from ai_usage_records where id = $1",
      [revokedUsageId]
    );
    expect(rejectedAttempt.rows).toHaveLength(0);

    await runtime.pool.query("delete from ai_usage_records where id = $1", [successfulUsageId]);
    const cascadedConsentEvidence = await runtime.pool.query(
      "select usage_record_id from ai_usage_consent_records where usage_record_id = $1",
      [successfulUsageId]
    );
    expect(cascadedConsentEvidence.rows).toHaveLength(0);
  });

  async function createCurrentConsent() {
    const clientUserId = randomUUID();
    const astrologerUserId = randomUUID();
    const relationshipId = randomUUID();
    const consentRecordId = randomUUID();
    userIds.push(clientUserId, astrologerUserId);
    await runtime.pool.query(
      "insert into users (id, status) values ($1, 'active'), ($2, 'active')",
      [clientUserId, astrologerUserId]
    );
    await runtime.pool.query(
      "insert into user_role_assignments (user_id, role) values ($1, 'client'), ($2, 'astrologer')",
      [clientUserId, astrologerUserId]
    );
    await runtime.pool.query(
      "insert into client_astrologer_relationships (id, client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at, archived_at, created_at, updated_at) values ($1, $2, $3, 'direct_link', 'active', now(), now(), null, now(), now())",
      [relationshipId, clientUserId, astrologerUserId]
    );
    await runtime.pool.query(
      "insert into client_data_consents (id, relationship_id, client_user_id, astrologer_user_id, purpose, policy_version, processor_code, notice_locale, notice_sha256, granted_at, revoked_at) values ($1, $2, $3, $4, $5, $6, $7, 'ru', $8, '2026-08-03T12:00:00.000Z', null)",
      [
        consentRecordId,
        relationshipId,
        clientUserId,
        astrologerUserId,
        clientDataConsentPurpose,
        chartAiConsentPolicyVersion,
        chartAiConsentProcessorCode,
        canonicalChartAiConsentNoticeHashes.ru
      ]
    );
    return { consentRecordId, clientUserId, astrologerUserId };
  }
});

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}
