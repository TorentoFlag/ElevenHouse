/* global AbortSignal, URL, console, fetch, process, setTimeout */

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createSessionToken, hashSessionToken } from "@elevenhouse/auth";
import {
  chartCalculationResponseSchema,
  chartEngineReadinessResponseSchema,
  chartExecutionProfileSchema,
  chartJobResponseSchema,
  chartNatalJobCreateResponseSchema,
  chartNatalResultV2Schema
} from "@elevenhouse/contracts";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createClient as createRedisClient } from "redis";

const expectedTables = [
  "ai_usage_records",
  "astrologer_profiles",
  "audit_log_entries",
  "calculation_artifacts",
  "calculation_client_links",
  "calculation_interpretations",
  "calculation_participants",
  "calculation_pdf_jobs",
  "calculation_records",
  "chart_calculation_jobs",
  "client_astrologer_relationships",
  "client_birth_data",
  "client_profiles",
  "idempotency_commands",
  "matrix_notes",
  "matrix_report_drafts",
  "media_assets",
  "media_variants",
  "outbox_events",
  "user_profiles",
  "user_role_assignments",
  "user_sessions",
  "users"
];
const supportedFailureStages = new Set([
  "after_seed_commit",
  "after_seed",
  "after_readiness",
  "after_job_created",
  "after_calculation_loaded"
]);
const defaultCsrfSecret = "elevenhouse-dev-astrologer-api-csrf-secret-change-before-production";
const smokeUserAgentPrefix = "eh-chart-smoke/";
const chartQueuePrefix = "bull:chart.calculation:";
const calculationPdfQueuePrefix = "bull:calculation.pdf:";
const maxOwnedChartDeliveryAttempts = 100;
const maxQueueEventScanCount = 20_000;
const safeChartJobFailureCodes = new Set([
  "chart_job_input_invalid",
  "chart_job_readiness_profile_unavailable",
  "chart_provider_timeout",
  "chart_provider_transient_failure",
  "chart_queue_job_failed",
  "chart_queue_job_stalled",
  "chart_queue_transport_failure",
  "chart_worker_shutdown",
  "retry_exhausted",
  "unexpected"
]);

class SmokeFailure extends Error {
  constructor(code, { httpStatus, detailCode, cause } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "SmokeFailure";
    this.safeCode = code;
    this.httpStatus = httpStatus;
    this.detailCode = detailCode;
  }
}

export function createSmokeConfig(environment = process.env) {
  const nodeEnv = environment.NODE_ENV ?? "development";
  const databaseUrl = required(environment.DATABASE_URL, "DATABASE_URL");
  const parsedDatabaseUrl = readUrlValue(databaseUrl, "DATABASE_URL");
  if (!new Set(["postgres:", "postgresql:"]).has(parsedDatabaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  const expectedDatabaseHost = required(
    environment.CHART_SMOKE_EXPECTED_DATABASE_HOST,
    "CHART_SMOKE_EXPECTED_DATABASE_HOST"
  );
  const expectedDatabaseName = required(
    environment.CHART_SMOKE_EXPECTED_DATABASE_NAME,
    "CHART_SMOKE_EXPECTED_DATABASE_NAME"
  );
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//u, ""));
  if (parsedDatabaseUrl.hostname !== expectedDatabaseHost) {
    throw new Error("DATABASE_URL host does not match CHART_SMOKE_EXPECTED_DATABASE_HOST");
  }
  if (databaseName !== expectedDatabaseName) {
    throw new Error("DATABASE_URL database does not match CHART_SMOKE_EXPECTED_DATABASE_NAME");
  }
  if (["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error("Chart smoke refuses PostgreSQL maintenance databases");
  }
  if (nodeEnv === "production" && environment.CHART_SMOKE_ALLOW_PRODUCTION !== "true") {
    throw new Error("Production chart smoke requires CHART_SMOKE_ALLOW_PRODUCTION=true");
  }

  const injectFailureStage = readFailureStage(environment.CHART_SMOKE_INJECT_FAILURE_STAGE);
  const injectCleanupFailure = readCleanupFailure(environment.CHART_SMOKE_INJECT_CLEANUP_FAILURE);
  if (
    nodeEnv === "production" &&
    (injectFailureStage !== null || injectCleanupFailure !== null) &&
    environment.CHART_SMOKE_ALLOW_FAILURE_INJECTION !== "true"
  ) {
    throw new Error(
      "Production failure injection requires CHART_SMOKE_ALLOW_FAILURE_INJECTION=true"
    );
  }

  const apiBaseUrl = readUrl("CHART_SMOKE_API_BASE_URL", "http://127.0.0.1:3002", environment);
  const chartEngineBaseUrl = readUrl("CHART_ENGINE_BASE_URL", "http://127.0.0.1:8012", environment);
  const chartWorkerBaseUrl = readUrl("CHART_WORKER_BASE_URL", "http://127.0.0.1:3012", environment);
  const origin = readUrl("CHART_SMOKE_ORIGIN", "http://localhost:5174", environment).origin;
  const sessionCookieName =
    environment.ASTROLOGER_API_SESSION_COOKIE_NAME ??
    (environment.ASTROLOGER_API_SESSION_COOKIE_SECURE === "true"
      ? "__Host-elevenhouse_astrologer_session"
      : "elevenhouse_astrologer_session");
  const csrfSecret = environment.ASTROLOGER_API_CSRF_SECRET ?? defaultCsrfSecret;
  if (nodeEnv === "production" && csrfSecret === defaultCsrfSecret) {
    throw new Error("Production chart smoke requires ASTROLOGER_API_CSRF_SECRET");
  }
  const storageEndpoint =
    nodeEnv === "production"
      ? required(environment.ASTROLOGER_MEDIA_STORAGE_ENDPOINT, "ASTROLOGER_MEDIA_STORAGE_ENDPOINT")
      : (environment.ASTROLOGER_MEDIA_STORAGE_ENDPOINT ?? "http://localhost:9000");
  const privateStorageBucket =
    nodeEnv === "production"
      ? required(
          environment.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET,
          "ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET"
        )
      : (environment.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET ?? "elevenhouse-local-private");
  const storageAccessKeyId =
    nodeEnv === "production"
      ? required(
          environment.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID,
          "ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID"
        )
      : (environment.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID ?? "elevenhouse");
  const storageSecretAccessKey =
    nodeEnv === "production"
      ? required(
          environment.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY,
          "ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY"
        )
      : (environment.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY ?? "elevenhouse-secret");
  const redisUrl = readRedisUrl(
    nodeEnv === "production"
      ? required(environment.REDIS_URL, "REDIS_URL")
      : (environment.REDIS_URL ?? "redis://localhost:6379")
  );

  return {
    nodeEnv,
    databaseUrl,
    expectedDatabaseHost,
    expectedDatabaseName,
    apiBaseUrl,
    chartEngineBaseUrl,
    chartWorkerBaseUrl,
    origin,
    sessionCookieName,
    csrfCookieName: environment.ASTROLOGER_API_CSRF_COOKIE_NAME ?? "elevenhouse_astrologer_csrf",
    csrfHeaderName: environment.ASTROLOGER_API_CSRF_HEADER_NAME?.toLowerCase() ?? "x-csrf-token",
    csrfSecret,
    redisUrl,
    sessionTtlSeconds: readPositiveInteger(
      environment.ASTROLOGER_API_SESSION_TTL_SECONDS,
      604_800,
      "ASTROLOGER_API_SESSION_TTL_SECONDS"
    ),
    csrfTokenTtlSeconds: readPositiveInteger(
      environment.ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS,
      604_800,
      "ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS"
    ),
    requestTimeoutMs: readPositiveInteger(
      environment.CHART_SMOKE_REQUEST_TIMEOUT_MS,
      15_000,
      "CHART_SMOKE_REQUEST_TIMEOUT_MS"
    ),
    databaseConnectTimeoutMs: readPositiveInteger(
      environment.CHART_SMOKE_DATABASE_CONNECT_TIMEOUT_MS,
      15_000,
      "CHART_SMOKE_DATABASE_CONNECT_TIMEOUT_MS"
    ),
    pollTimeoutMs: readPositiveInteger(
      environment.CHART_SMOKE_POLL_TIMEOUT_MS,
      60_000,
      "CHART_SMOKE_POLL_TIMEOUT_MS"
    ),
    cleanupSettleTimeoutMs: readPositiveInteger(
      environment.CHART_SMOKE_CLEANUP_SETTLE_TIMEOUT_MS,
      60_000,
      "CHART_SMOKE_CLEANUP_SETTLE_TIMEOUT_MS"
    ),
    injectFailureStage,
    injectCleanupFailure,
    objectStorage: {
      endpoint: readUrlValue(storageEndpoint, "ASTROLOGER_MEDIA_STORAGE_ENDPOINT")
        .toString()
        .replace(/\/$/u, ""),
      region: environment.ASTROLOGER_MEDIA_STORAGE_REGION ?? "us-east-1",
      privateBucket: privateStorageBucket,
      accessKeyId: storageAccessKeyId,
      secretAccessKey: storageSecretAccessKey,
      forcePathStyle: environment.ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE !== "false"
    }
  };
}

export function createSmokeRunContext({ config, now = new Date() }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Chart smoke start time is invalid");
  }
  const runId = randomUUID();
  const namespace = `eh-chart-smoke:${runId}`;
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const sessionId = randomUUID();
  const astrologerRoleId = randomUUID();
  const clientRoleId = randomUUID();
  const birthDataId = randomUUID();
  const relationshipId = randomUUID();
  const sessionToken = createSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(now.getTime() + config.sessionTtlSeconds * 1000);
  const context = {
    runId,
    namespace,
    startedAt: now,
    expiresAt,
    astrologerUserId,
    clientUserId,
    sessionId,
    astrologerRoleId,
    clientRoleId,
    birthDataId,
    relationshipId,
    sessionToken,
    sessionTokenHash,
    csrfToken: "",
    ownedResourceIds: new Set([
      astrologerUserId,
      clientUserId,
      sessionId,
      astrologerRoleId,
      clientRoleId,
      birthDataId,
      relationshipId
    ]),
    ownedChartQueueDeliveryIds: new Set(),
    ownedCalculationPdfQueueDeliveryIds: new Set(),
    ownedStorageObjects: []
  };
  context.csrfToken = createCsrfToken({
    config,
    sessionTokenHash,
    now,
    sessionExpiresAt: expiresAt
  });
  return context;
}

export async function executeSmokeLifecycle({
  runtime,
  config,
  context,
  runScenario,
  injectFailureStage = config.injectFailureStage
}) {
  if (!runtime?.pool || typeof runtime.pool.query !== "function") {
    throw new Error("Chart smoke requires a PostgreSQL runtime");
  }
  if (typeof runScenario !== "function") {
    throw new Error("Chart smoke scenario is required");
  }
  configureSmokePoolSafety(runtime.pool, {
    connectionTimeoutMs: config.databaseConnectTimeoutMs,
    statementTimeoutMs: config.requestTimeoutMs
  });
  const failureStage = readFailureStage(injectFailureStage);
  let cleanupRequired = false;
  let result;
  let primaryFailure = null;
  let cleanupFailure = null;

  try {
    await assertSmokeDatabaseTarget(runtime.pool, config);
    await seedSmokeData(runtime.pool, context);
    cleanupRequired = true;
    injectFailure(failureStage, "after_seed_commit");
    await assertCommittedSmokeNamespace(runtime.pool, context);
    injectFailure(failureStage, "after_seed");
    result = await runScenario({ runtime, config, context, injectFailureStage: failureStage });
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (cleanupRequired) {
      try {
        await cleanupSmokeData(runtime.pool, config, context);
      } catch (error) {
        cleanupFailure = error;
      }
    }
  }

  if (primaryFailure && cleanupFailure) {
    throw preserveSmokeFailure(primaryFailure, cleanupFailure);
  }
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
  return result;
}

export function preserveSmokeFailure(primaryFailure, cleanupFailure) {
  return new AggregateError(
    [primaryFailure, cleanupFailure],
    "Chart smoke failed and cleanup also failed",
    { cause: primaryFailure }
  );
}

export async function collectSmokeResidue(pool, context) {
  const userIds = [context.astrologerUserId, context.clientUserId];
  const resourceIds = [...context.ownedResourceIds];
  const result = await pool.query(
    `
      select
        (select count(*)::int from users where id = any($1::uuid[])) as users,
        (select count(*)::int from user_role_assignments
          where user_id = any($1::uuid[]) or id = any($3::uuid[])) as roles,
        (select count(*)::int from user_sessions
          where user_id = any($1::uuid[]) or id = any($3::uuid[])
             or user_agent = $5) as sessions,
        (select count(*)::int from user_profiles where user_id = any($1::uuid[])) as user_profiles,
        (select count(*)::int from astrologer_profiles
          where owner_user_id = $2 or public_name = $4) as astrologer_profiles,
        (select count(*)::int from client_profiles
          where user_id = $6 or display_name_snapshot = $4) as client_profiles,
        (select count(*)::int from client_birth_data
          where client_user_id = $6 or id = any($3::uuid[]) or label = $4) as birth_data,
        (select count(*)::int from client_astrologer_relationships
          where (client_user_id = $6 and astrologer_user_id = $2)
             or id = any($3::uuid[])) as relationships,
        (select count(*)::int from chart_calculation_jobs
          where owner_user_id = $2 or client_id = $6 or id = any($3::uuid[])) as chart_jobs,
        (select count(*)::int from calculation_records
          where owner_user_id = $2 or id = any($3::uuid[])) as calculations,
        (select count(*)::int from calculation_participants
          where calculation_id = any($3::uuid[]) or id = any($3::uuid[])) as participants,
        (select count(*)::int from calculation_client_links
          where calculation_id = any($3::uuid[]) or client_id = $6
             or id = any($3::uuid[])) as client_links,
        (select count(*)::int from calculation_interpretations
          where calculation_id = any($3::uuid[]) or id = any($3::uuid[])) as interpretations,
        (select count(*)::int from calculation_pdf_jobs
          where owner_user_id = $2 or calculation_id = any($3::uuid[])
             or id = any($3::uuid[])) as pdf_jobs,
        (select count(*)::int from calculation_artifacts
          where calculation_id = any($3::uuid[]) or id = any($3::uuid[])) as artifacts,
        (select count(*)::int from media_assets
          where owner_user_id = $2 or id = any($3::uuid[])) as media_assets,
        (select count(*)::int from media_variants
          where asset_id = any($3::uuid[]) or id = any($3::uuid[])) as media_variants,
        (select count(*)::int from outbox_events
          where id = any($3::uuid[]) or aggregate_id = any($3::uuid[])) as outbox,
        (select count(*)::int from audit_log_entries
          where id = any($3::uuid[]) or actor_user_id = any($1::uuid[])
             or target_id = any($7::text[]) or metadata @> jsonb_build_object('namespace', $4::text))
          as audits,
        (select count(*)::int from ai_usage_records
          where id = any($3::uuid[]) or resource_id = any($3::uuid[])) as ai_usage,
        (select count(*)::int from idempotency_commands
          where id = any($3::uuid[]) or actor_user_id = $2) as idempotency_commands,
        (select count(*)::int from matrix_notes
          where id = any($3::uuid[]) or calculation_id = any($3::uuid[])
             or owner_user_id = $2) as matrix_notes,
        (select count(*)::int from matrix_report_drafts
          where id = any($3::uuid[]) or calculation_id = any($3::uuid[])
             or owner_user_id = $2) as matrix_reports
    `,
    [
      userIds,
      context.astrologerUserId,
      resourceIds,
      context.namespace,
      `${smokeUserAgentPrefix}${context.runId}`,
      context.clientUserId,
      resourceIds
    ]
  );
  return result.rows[0] ?? {};
}

async function main(environment = process.env) {
  const config = createSmokeConfig(environment);
  const context = createSmokeRunContext({ config });
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  let outcome;
  let primaryFailure = null;
  let closeFailure = null;

  console.log(
    JSON.stringify({
      status: "started",
      namespace: context.namespace,
      astrologerUserId: context.astrologerUserId,
      clientUserId: context.clientUserId
    })
  );

  try {
    outcome = await executeSmokeLifecycle({
      runtime,
      config,
      context,
      runScenario: runRealNetworkScenario
    });
  } catch (error) {
    primaryFailure = error;
  } finally {
    try {
      await runtime.close();
    } catch (error) {
      closeFailure = error;
    }
  }

  if (primaryFailure && closeFailure) {
    throw preserveSmokeFailure(primaryFailure, closeFailure);
  }
  if (primaryFailure) throw primaryFailure;
  if (closeFailure) throw closeFailure;
  console.log(JSON.stringify(outcome, null, 2));
}

async function assertSmokeDatabaseTarget(pool, config) {
  const target = await pool.query(
    `select current_database() as database_name, current_schema() as schema_name`
  );
  const row = target.rows[0];
  if (row?.database_name !== config.expectedDatabaseName || row?.schema_name !== "public") {
    throw new Error("Connected PostgreSQL target does not match the explicit chart smoke guard");
  }
  const tables = await pool.query(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])
      order by table_name
    `,
    [expectedTables]
  );
  const actual = tables.rows.map((entry) => entry.table_name);
  if (
    actual.length !== expectedTables.length ||
    expectedTables.some((name) => !actual.includes(name))
  ) {
    throw new Error("Chart smoke requires the complete current persistence schema");
  }
  const columns = await pool.query(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (
          ('chart_calculation_jobs', 'execution_profile'),
          ('chart_calculation_jobs', 'interpretation_mode'),
          ('calculation_records', 'interpretation_mode'),
          ('calculation_client_links', 'published_interpretation_id'),
          ('calculation_client_links', 'published_result_checksum')
        )
    `
  );
  if (columns.rowCount !== 5) {
    throw new Error("Chart smoke refuses a pre-v2 or partially reconciled chart schema");
  }
}

async function seedSmokeData(pool, context) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await assertReturnedIds(
      client.query(
        `
          insert into users (id, status, created_at, updated_at)
          values ($1, 'active', $3, $3), ($2, 'active', $3, $3)
          returning id
        `,
        [context.astrologerUserId, context.clientUserId, context.startedAt]
      ),
      [context.astrologerUserId, context.clientUserId],
      "users"
    );
    await assertReturnedIds(
      client.query(
        `
          insert into user_role_assignments (id, user_id, role, assigned_at)
          values ($1, $2, 'astrologer', $5), ($3, $4, 'client', $5)
          returning id
        `,
        [
          context.astrologerRoleId,
          context.astrologerUserId,
          context.clientRoleId,
          context.clientUserId,
          context.startedAt
        ]
      ),
      [context.astrologerRoleId, context.clientRoleId],
      "role assignments"
    );
    await client.query(
      `
        insert into user_profiles (user_id, display_name, created_at, updated_at)
        values ($1, $3, $5, $5), ($2, $4, $5, $5)
      `,
      [
        context.astrologerUserId,
        context.clientUserId,
        `${context.namespace}:astrologer`,
        `${context.namespace}:client`,
        context.startedAt
      ]
    );
    await client.query(
      `
        insert into astrologer_profiles (
          owner_user_id, public_handle, public_name, timezone, locale,
          consultation_languages, visibility_status, created_at, updated_at
        ) values ($1, $2, $3, 'Europe/Moscow', 'ru', '["ru", "en"]'::jsonb,
                  'draft', $4, $4)
      `,
      [
        context.astrologerUserId,
        `eh-chart-smoke-${context.runId}`,
        context.namespace,
        context.startedAt
      ]
    );
    await assertReturnedIds(
      client.query(
        `
          insert into user_sessions (
            id, user_id, token_hash, status, user_agent, ip_address,
            created_at, expires_at
          ) values ($1, $2, $3, 'active', $4, '127.0.0.1', $5, $6)
          returning id
        `,
        [
          context.sessionId,
          context.astrologerUserId,
          context.sessionTokenHash,
          `${smokeUserAgentPrefix}${context.runId}`,
          context.startedAt,
          context.expiresAt
        ]
      ),
      [context.sessionId],
      "session"
    );
    await client.query(
      `
        insert into client_profiles (
          user_id, display_name_snapshot, preferred_locale, timezone, created_at, updated_at
        ) values ($1, $2, 'ru', 'Europe/Moscow', $3, $3)
      `,
      [context.clientUserId, context.namespace, context.startedAt]
    );
    await assertReturnedIds(
      client.query(
        `
          insert into client_birth_data (
            id, client_user_id, label, birth_date, birth_time, birth_time_precision,
            birth_place_text, birth_country_code, birth_city, birth_region,
            birth_timezone, birth_time_dst_occurrence, birth_latitude,
            birth_longitude, source, is_primary, created_at, updated_at
          ) values (
            $1, $2, $3, '1990-07-15', '10:30', 'exact', 'Rome, Italy', 'IT',
            'Rome', 'Lazio', 'Europe/Rome', null, 41.9028, 12.4964,
            'manual', true, $4, $4
          )
          returning id
        `,
        [context.birthDataId, context.clientUserId, context.namespace, context.startedAt]
      ),
      [context.birthDataId],
      "birth data"
    );
    await assertReturnedIds(
      client.query(
        `
          insert into client_astrologer_relationships (
            id, client_user_id, astrologer_user_id, source, status,
            first_linked_at, last_linked_at, created_at, updated_at
          ) values ($1, $2, $3, 'manual', 'active', $4, $4, $4, $4)
          returning id
        `,
        [context.relationshipId, context.clientUserId, context.astrologerUserId, context.startedAt]
      ),
      [context.relationshipId],
      "relationship"
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function assertCommittedSmokeNamespace(pool, context) {
  const marker = await pool.query(
    `
      select
        exists(
          select 1 from users
          where id = $1 and status = 'active'
        ) as astrologer_user,
        exists(
          select 1 from users
          where id = $2 and status = 'active'
        ) as client_user,
        exists(
          select 1 from user_role_assignments
          where id = $3 and user_id = $1 and role = 'astrologer'
        ) as astrologer_role,
        exists(
          select 1 from user_role_assignments
          where id = $4 and user_id = $2 and role = 'client'
        ) as client_role,
        exists(
          select 1 from user_profiles
          where user_id = $1 and display_name = $5
        ) as astrologer_profile,
        exists(
          select 1 from user_profiles
          where user_id = $2 and display_name = $6
        ) as client_user_profile,
        exists(
          select 1 from astrologer_profiles
          where owner_user_id = $1 and public_handle = $7 and public_name = $8
        ) as astrologer_business_profile,
        exists(
          select 1 from user_sessions
          where id = $9 and user_id = $1 and token_hash = $10 and user_agent = $11
        ) as session,
        exists(
          select 1 from client_profiles
          where user_id = $2 and display_name_snapshot = $8
        ) as client_business_profile,
        exists(
          select 1 from client_birth_data
          where id = $12 and client_user_id = $2 and label = $8
        ) as birth_data,
        exists(
          select 1 from client_astrologer_relationships
          where id = $13 and client_user_id = $2 and astrologer_user_id = $1
        ) as relationship
    `,
    [
      context.astrologerUserId,
      context.clientUserId,
      context.astrologerRoleId,
      context.clientRoleId,
      `${context.namespace}:astrologer`,
      `${context.namespace}:client`,
      `eh-chart-smoke-${context.runId}`,
      context.namespace,
      context.sessionId,
      context.sessionTokenHash,
      `${smokeUserAgentPrefix}${context.runId}`,
      context.birthDataId,
      context.relationshipId
    ]
  );
  const evidence = marker.rows[0];
  if (!evidence || Object.values(evidence).some((value) => value !== true)) {
    throw new Error("Chart smoke committed namespace marker is incomplete or drifted");
  }
}

async function cleanupSmokeData(pool, config, context) {
  const settleDeadline = Date.now() + config.cleanupSettleTimeoutMs;
  while (true) {
    const client = await pool.connect();
    let transactionOpen = false;
    let retryAfterSettle = false;
    try {
      await client.query("begin");
      transactionOpen = true;
      const remainingSettleMs = Math.max(1, settleDeadline - Date.now());
      await client.query(
        `
          select set_config('lock_timeout', $1, true),
                 set_config('statement_timeout', $2, true)
        `,
        [
          `${Math.min(100, remainingSettleMs)}ms`,
          `${Math.min(config.requestTimeoutMs, remainingSettleMs)}ms`
        ]
      );
      const resources = await discoverOwnedResources(client, context);
      const processingJobs = resources.chartJobs.filter((job) => job.status === "processing");
      const processingPdfJobs = resources.pdfJobs.filter((job) => job.status === "processing");
      const publishingOutboxEvents = resources.outboxEvents.filter(
        (event) => event.status === "publishing"
      );
      if (
        processingJobs.length > 0 ||
        processingPdfJobs.length > 0 ||
        publishingOutboxEvents.length > 0
      ) {
        await client.query("rollback");
        transactionOpen = false;
        if (Date.now() >= settleDeadline) {
          throw new SmokeFailure("CHART_SMOKE_CLEANUP_SETTLE_TIMEOUT");
        }
        retryAfterSettle = true;
      } else {
        await deleteOwnedStorageObjects(config, context, resources.storageObjects);

        await deleteIdRows(client, "ai_usage_records", resources.aiUsageIds);
        await deleteIdRows(client, "idempotency_commands", resources.idempotencyCommandIds);
        await deleteIdRows(client, "audit_log_entries", resources.auditIds);
        await deleteIdRows(client, "outbox_events", resources.outboxIds);
        await deleteIdRows(client, "calculation_pdf_jobs", resources.pdfJobIds);
        await deleteIdRows(client, "calculation_client_links", resources.clientLinkIds);
        await deleteIdRows(client, "calculation_interpretations", resources.interpretationIds);
        await deleteIdRows(client, "calculation_participants", resources.participantIds);
        await deleteIdRows(client, "matrix_notes", resources.matrixNoteIds);
        await deleteIdRows(client, "matrix_report_drafts", resources.matrixReportIds);
        await deleteIdRows(client, "calculation_artifacts", resources.artifactIds);
        await deleteIdRows(client, "chart_calculation_jobs", resources.chartJobIds);
        await deleteIdRows(client, "calculation_records", resources.calculationIds);
        await deleteIdRows(client, "media_variants", resources.mediaVariantIds);
        await deleteIdRows(client, "media_assets", resources.mediaAssetIds);
        await deleteIdRows(client, "client_birth_data", resources.birthDataIds);
        await deleteIdRows(client, "client_astrologer_relationships", resources.relationshipIds);
        await deleteIdRows(client, "user_sessions", resources.sessionIds);
        await deleteUserRows(client, "astrologer_profiles", "owner_user_id", [
          context.astrologerUserId
        ]);
        await deleteUserRows(client, "client_profiles", "user_id", [context.clientUserId]);
        await deleteUserRows(client, "user_profiles", "user_id", [
          context.astrologerUserId,
          context.clientUserId
        ]);
        await deleteIdRows(client, "user_role_assignments", resources.roleIds);
        await deleteIdRows(client, "users", [context.astrologerUserId, context.clientUserId]);
        await client.query("commit");
        transactionOpen = false;
      }
    } catch (error) {
      let rollbackFailure = null;
      if (transactionOpen) {
        try {
          await client.query("rollback");
          transactionOpen = false;
        } catch (caughtRollbackFailure) {
          rollbackFailure = caughtRollbackFailure;
        }
      }
      if (rollbackFailure) {
        throw preserveSmokeFailure(error, rollbackFailure);
      }
      if (isPostgresSettleTimeout(error)) {
        if (Date.now() >= settleDeadline) {
          throw new SmokeFailure("CHART_SMOKE_CLEANUP_SETTLE_TIMEOUT");
        }
        retryAfterSettle = true;
      } else {
        throw error;
      }
    } finally {
      client.release();
    }
    if (!retryAfterSettle) break;
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, Math.min(100, Math.max(1, settleDeadline - Date.now())))
    );
  }

  await cleanupOwnedQueueDeliveries(
    config,
    context.ownedChartQueueDeliveryIds,
    chartQueuePrefix,
    settleDeadline
  );
  await cleanupOwnedQueueDeliveries(
    config,
    context.ownedCalculationPdfQueueDeliveryIds,
    calculationPdfQueuePrefix,
    settleDeadline
  );

  const residue = await collectSmokeResidue(pool, context);
  const nonzero = Object.entries(residue).filter(([, count]) => Number(count) !== 0);
  if (nonzero.length > 0) {
    throw new Error(
      `Chart smoke cleanup left residue: ${nonzero
        .map(([name, count]) => `${name}=${count}`)
        .join(", ")}`
    );
  }
  if (config.injectCleanupFailure === "after_zero_residue") {
    throw new SmokeFailure("CHART_SMOKE_INJECTED_CLEANUP_FAILURE_AFTER_ZERO_RESIDUE");
  }
}

async function discoverOwnedResources(client, context) {
  const chartJobs = await rows(
    client,
    `
      select id, status, attempts, max_attempts
      from chart_calculation_jobs
      where owner_user_id = $1 or client_id = $2
      for update
    `,
    [context.astrologerUserId, context.clientUserId]
  );
  for (const chartJob of chartJobs) registerOwnedChartQueueDeliveries(context, chartJob);
  const calculations = await rows(
    client,
    `select id from calculation_records where owner_user_id = $1 for update`,
    [context.astrologerUserId]
  );
  const calculationIds = ids(calculations);
  const pdfJobs = await rows(
    client,
    `
      select id, status
      from calculation_pdf_jobs
      where owner_user_id = $1 or calculation_id = any($2::uuid[])
      for update
    `,
    [context.astrologerUserId, calculationIds]
  );
  for (const pdfJob of pdfJobs) registerOwnedCalculationPdfDelivery(context, "render", pdfJob.id);
  const aiUsageRows = await rows(
    client,
    `
      select id
      from ai_usage_records
      where resource_id = any($1::uuid[])
      for update
    `,
    [calculationIds]
  );
  const mediaRows = await rows(
    client,
    `
      select id, purpose, storage_bucket, storage_key
      from media_assets
      where owner_user_id = $1
      for update
    `,
    [context.astrologerUserId]
  );
  const mediaAssetIds = ids(mediaRows);
  for (const mediaAssetId of mediaAssetIds) {
    registerOwnedCalculationPdfDelivery(context, "delete", mediaAssetId);
  }
  const variantRows = await rows(
    client,
    `
      select id, storage_bucket, storage_key
      from media_variants
      where asset_id = any($1::uuid[])
      for update
    `,
    [mediaAssetIds]
  );
  const participantRows = await selectChildIds(client, "calculation_participants", calculationIds);
  const clientLinkRows = await selectChildIds(client, "calculation_client_links", calculationIds);
  const interpretationRows = await selectChildIds(
    client,
    "calculation_interpretations",
    calculationIds
  );
  const artifactRows = await selectChildIds(client, "calculation_artifacts", calculationIds);
  const matrixNoteRows = await selectChildIds(client, "matrix_notes", calculationIds);
  const matrixReportRows = await selectChildIds(client, "matrix_report_drafts", calculationIds);
  const resourceIds = unique([
    ...ids(chartJobs),
    ...calculationIds,
    ...ids(pdfJobs),
    ...ids(aiUsageRows),
    ...mediaAssetIds,
    ...ids(variantRows),
    ...ids(participantRows),
    ...ids(clientLinkRows),
    ...ids(interpretationRows),
    ...ids(artifactRows),
    ...ids(matrixNoteRows),
    ...ids(matrixReportRows),
    context.relationshipId,
    context.birthDataId,
    context.sessionId,
    context.astrologerRoleId,
    context.clientRoleId
  ]);
  for (const id of resourceIds) context.ownedResourceIds.add(id);
  const outboxRows = await rows(
    client,
    `select id, status from outbox_events where id = any($1::uuid[]) or aggregate_id = any($1::uuid[]) for update`,
    [resourceIds]
  );
  const auditRows = await rows(
    client,
    `
      select id
      from audit_log_entries
      where actor_user_id = any($1::uuid[])
         or target_id = any($2::text[])
         or metadata @> jsonb_build_object('namespace', $3::text)
      for update
    `,
    [[context.astrologerUserId, context.clientUserId], resourceIds, context.namespace]
  );
  const idempotencyRows = await rows(
    client,
    `select id from idempotency_commands where actor_user_id = $1 for update`,
    [context.astrologerUserId]
  );
  const birthRows = await rows(
    client,
    `select id from client_birth_data where client_user_id = $1 for update`,
    [context.clientUserId]
  );
  const relationshipRows = await rows(
    client,
    `
      select id
      from client_astrologer_relationships
      where client_user_id = $1 and astrologer_user_id = $2
      for update
    `,
    [context.clientUserId, context.astrologerUserId]
  );
  const sessionRows = await rows(
    client,
    `select id from user_sessions where user_id = any($1::uuid[]) for update`,
    [[context.astrologerUserId, context.clientUserId]]
  );
  const roleRows = await rows(
    client,
    `select id from user_role_assignments where user_id = any($1::uuid[]) for update`,
    [[context.astrologerUserId, context.clientUserId]]
  );
  const storageObjects = [
    ...mediaRows.map((entry) => ({
      mediaId: entry.id,
      purpose: entry.purpose,
      storageBucket: entry.storage_bucket,
      storageKey: entry.storage_key
    })),
    ...variantRows.map((entry) => ({
      mediaId: entry.id,
      purpose: "calculation_report_pdf",
      storageBucket: entry.storage_bucket,
      storageKey: entry.storage_key
    }))
  ];
  for (const storageObject of storageObjects) {
    context.ownedStorageObjects.push(storageObject);
  }
  for (const id of [
    ...ids(outboxRows),
    ...ids(auditRows),
    ...ids(idempotencyRows),
    ...ids(birthRows),
    ...ids(relationshipRows),
    ...ids(sessionRows),
    ...ids(roleRows)
  ]) {
    context.ownedResourceIds.add(id);
  }

  return {
    chartJobs,
    chartJobIds: ids(chartJobs),
    calculationIds,
    pdfJobs,
    pdfJobIds: ids(pdfJobs),
    aiUsageIds: ids(aiUsageRows),
    mediaAssetIds,
    mediaVariantIds: ids(variantRows),
    participantIds: ids(participantRows),
    clientLinkIds: ids(clientLinkRows),
    interpretationIds: ids(interpretationRows),
    artifactIds: ids(artifactRows),
    matrixNoteIds: ids(matrixNoteRows),
    matrixReportIds: ids(matrixReportRows),
    outboxEvents: outboxRows,
    outboxIds: ids(outboxRows),
    auditIds: ids(auditRows),
    idempotencyCommandIds: ids(idempotencyRows),
    birthDataIds: ids(birthRows),
    relationshipIds: ids(relationshipRows),
    sessionIds: ids(sessionRows),
    roleIds: ids(roleRows),
    storageObjects
  };
}

async function runRealNetworkScenario({ runtime, config, context, injectFailureStage }) {
  await assertReady(toUrl(config.apiBaseUrl, "/health"), "astrologer-api", config);
  const engineReadiness = chartEngineReadinessResponseSchema.parse(
    await requestJson(toUrl(config.chartEngineBaseUrl, "/ready"), {}, config)
  );
  const workerReadiness = await requestJson(toUrl(config.chartWorkerBaseUrl, "/ready"), {}, config);
  assertWorkerReadiness(workerReadiness);
  injectFailure(injectFailureStage, "after_readiness");

  const authHeaders = {
    cookie: `${config.sessionCookieName}=${context.sessionToken}; ${config.csrfCookieName}=${context.csrfToken}`,
    origin: config.origin
  };
  const csrfHeaders = {
    ...authHeaders,
    [config.csrfHeaderName]: context.csrfToken
  };
  const createJobResponse = chartNatalJobCreateResponseSchema.parse(
    await requestJson(
      toUrl(config.apiBaseUrl, "/charts/natal/jobs"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...csrfHeaders
        },
        body: JSON.stringify({
          clientId: context.clientUserId,
          interpretationMode: "adult_natal",
          settings: {
            zodiac: "tropical",
            houseSystem: "placidus",
            nodeType: "true",
            aspectPreset: "major",
            orbMultiplier: 1
          }
        })
      },
      config
    )
  );

  let calculationId;
  let jobId = null;
  if (createJobResponse.status === "calculating") {
    jobId = createJobResponse.jobId;
    context.ownedResourceIds.add(jobId);
    registerOwnedChartQueueDeliveries(context, { id: jobId, attempts: 0, max_attempts: 1 });
    injectFailure(injectFailureStage, "after_job_created");
    const job = await pollChartJob(jobId, authHeaders, config);
    calculationId = job.calculationId;
  } else {
    calculationId = createJobResponse.calculationId;
  }
  context.ownedResourceIds.add(calculationId);

  const calculation = chartCalculationResponseSchema.parse(
    await requestJson(
      toUrl(config.apiBaseUrl, `/charts/calculations/${calculationId}`),
      { headers: authHeaders },
      config
    )
  );
  const result = chartNatalResultV2Schema.parse(calculation.result);
  if (calculation.calculationId !== calculationId) {
    throw new Error("Chart calculation response identity does not match the completed job");
  }
  if (calculation.interpretationMode !== "adult_natal") {
    throw new Error("Chart calculation did not preserve adult_natal interpretation authority");
  }
  injectFailure(injectFailureStage, "after_calculation_loaded");

  const persisted = await readPersistedChartEvidence(runtime.pool, {
    ownerUserId: context.astrologerUserId,
    clientUserId: context.clientUserId,
    calculationId,
    jobId
  });
  context.ownedResourceIds.add(persisted.job.id);
  const executionProfile = chartExecutionProfileSchema.parse(persisted.job.execution_profile);
  assertProviderMatchesProfile(engineReadiness.provider, executionProfile, "engine readiness");
  assertProviderMatchesProfile(result.provider, executionProfile, "calculation result");
  if (config.nodeEnv === "production" && executionProfile.expectedEphemeris !== "swiss-ephemeris") {
    throw new Error("Production chart smoke requires the Swiss Ephemeris execution profile");
  }
  assertEqual(persisted.job.schema_version, "chart-result.v2", "persisted job schema");
  assertEqual(persisted.job.method, "natal", "persisted job method");
  assertEqual(
    persisted.job.method_version,
    "chart.natal.kerykeion-5.12.v2",
    "persisted job method version"
  );
  assertEqual(persisted.job.interpretation_mode, "adult_natal", "persisted job interpretation");
  assertEqual(persisted.job.status, "succeeded", "persisted job status");
  assertEqual(persisted.job.result_calculation_id, calculationId, "persisted job calculation");
  assertEqual(
    persisted.job.result_reproducibility_fingerprint,
    result.reproducibilityFingerprint,
    "reproducibility fingerprint"
  );
  assertEqual(
    persisted.job.result_checksum,
    persisted.calculation.result_checksum,
    "job/calculation checksum"
  );
  assertEqual(
    persisted.calculation.interpretation_mode,
    "adult_natal",
    "persisted calculation interpretation"
  );
  assertEqual(result.schemaVersion, "chart-result.v2", "chart result schema");
  assertEqual(result.method, "natal", "chart method");
  assertEqual(result.methodVersion, "chart.natal.kerykeion-5.12.v2", "chart method version");
  assertEqual(result.result.points.length, 14, "point count");
  assertEqual(result.result.houses.length, 12, "house count");
  if (result.result.aspects.length === 0) {
    throw new Error("Expected at least one strict v2 natal aspect");
  }

  return {
    status: "passed",
    namespace: context.namespace,
    jobId: persisted.job.id,
    calculationId,
    pointCount: result.result.points.length,
    houseCount: result.result.houses.length,
    aspectCount: result.result.aspects.length,
    provider: result.provider,
    executionProfile
  };
}

async function readPersistedChartEvidence(pool, input) {
  const jobResult = await pool.query(
    `
      select id, schema_version, method, interpretation_mode, method_version, status,
             execution_profile, result_calculation_id, result_checksum,
             result_reproducibility_fingerprint
      from chart_calculation_jobs
      where owner_user_id = $1 and client_id = $2
        and ($4::uuid is null or id = $4)
        and result_calculation_id = $3
    `,
    [input.ownerUserId, input.clientUserId, input.calculationId, input.jobId]
  );
  if (jobResult.rowCount !== 1) {
    throw new Error("Expected exactly one persisted chart job for the smoke namespace");
  }
  const calculationResult = await pool.query(
    `
      select id, interpretation_mode, result_checksum
      from calculation_records
      where id = $1 and owner_user_id = $2 and module = 'chart' and method_code = 'natal'
    `,
    [input.calculationId, input.ownerUserId]
  );
  if (calculationResult.rowCount !== 1) {
    throw new Error("Expected exactly one persisted natal calculation for the smoke namespace");
  }
  return { job: jobResult.rows[0], calculation: calculationResult.rows[0] };
}

async function pollChartJob(jobId, headers, config) {
  const timeoutAt = Date.now() + config.pollTimeoutMs;
  while (Date.now() < timeoutAt) {
    const job = chartJobResponseSchema.parse(
      await requestJson(toUrl(config.apiBaseUrl, `/charts/jobs/${jobId}`), { headers }, config)
    );
    if (job.id !== jobId) {
      throw new Error("Chart job response identity does not match the requested job");
    }
    if (job.interpretationMode !== "adult_natal") {
      throw new Error("Chart job did not preserve adult_natal interpretation authority");
    }
    if (job.status === "succeeded") return job;
    if (job.status === "failed") {
      throw new SmokeFailure("CHART_SMOKE_JOB_FAILED", {
        detailCode: safeChartJobFailureCodes.has(job.failureCode)
          ? job.failureCode
          : "chart_job_failure_code_redacted"
      });
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Chart job ${jobId} did not finish within ${config.pollTimeoutMs}ms`);
}

async function assertReady(url, serviceName, config) {
  const response = await fetch(url, { signal: AbortSignal.timeout(config.requestTimeoutMs) });
  if (!response.ok) {
    throw new Error(`${serviceName} readiness failed: HTTP ${response.status}`);
  }
}

async function requestJson(url, init, config) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SmokeFailure("CHART_SMOKE_HTTP_FAILURE", { httpStatus: response.status });
  }
  return response.json();
}

function assertWorkerReadiness(value) {
  if (
    !value ||
    value.service !== "chart-worker" ||
    value.status !== "ready" ||
    !value.dependencies ||
    !["postgres", "chartCalculationQueue", "chartCalculationWorker", "chartEngine"].every(
      (name) => value.dependencies[name]?.status === "ready"
    )
  ) {
    throw new Error("Chart worker readiness did not prove the complete runtime contour");
  }
}

function assertProviderMatchesProfile(provider, profile, label) {
  assertEqual(provider.name, profile.provider, `${label} provider`);
  assertEqual(provider.version, profile.kerykeionVersion, `${label} kerykeion version`);
  assertEqual(provider.pyswissephVersion, profile.pyswissephVersion, `${label} pyswisseph version`);
  assertEqual(provider.ephemeris, profile.expectedEphemeris, `${label} ephemeris`);
  assertEqual(
    provider.ephemerisDataRevision,
    profile.expectedEphemerisDataRevision,
    `${label} ephemeris revision`
  );
  const expectedFlags = [...profile.expectedEphemerisFlags].sort();
  const actualFlags = [...provider.ephemerisFlags].sort();
  if (JSON.stringify(actualFlags) !== JSON.stringify(expectedFlags)) {
    throw new Error(
      `Expected ${label} flags ${JSON.stringify(expectedFlags)}, received ${JSON.stringify(actualFlags)}`
    );
  }
}

export async function deleteOwnedStorageObjects(config, context, storageObjects) {
  if (storageObjects.length === 0) return;
  const storageConfig = config.objectStorage;
  const uniqueObjects = uniqueStorageObjects(storageObjects);
  for (const object of uniqueObjects) {
    if (object.purpose !== "calculation_report_pdf") {
      throw new Error("Chart smoke refuses to delete a non-report media object");
    }
    if (object.storageBucket !== storageConfig.privateBucket) {
      throw new Error("Chart smoke refuses to delete an object outside the private report bucket");
    }
    if (!object.storageKey.startsWith(`${context.astrologerUserId}/calculation_report_pdf/`)) {
      throw new Error("Chart smoke refuses an object key outside its exact owner prefix");
    }
  }
  const client = new S3Client({
    endpoint: storageConfig.endpoint,
    region: storageConfig.region,
    forcePathStyle: storageConfig.forcePathStyle,
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey
    }
  });
  try {
    for (const object of uniqueObjects) {
      await client.send(
        new DeleteObjectCommand({ Bucket: object.storageBucket, Key: object.storageKey }),
        { abortSignal: AbortSignal.timeout(config.requestTimeoutMs) }
      );
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: object.storageBucket, Key: object.storageKey }),
          { abortSignal: AbortSignal.timeout(config.requestTimeoutMs) }
        );
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404) continue;
        throw error;
      }
      throw new Error("Chart smoke object-storage cleanup left a report object");
    }
  } finally {
    client.destroy();
  }
}

function registerOwnedChartQueueDeliveries(context, chartJob) {
  if (!(context.ownedChartQueueDeliveryIds instanceof Set)) {
    throw new Error("Chart smoke queue ownership registry is unavailable");
  }
  if (
    typeof chartJob.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(chartJob.id)
  ) {
    throw new Error("Chart smoke refuses an invalid durable chart job identity");
  }
  const attempts = Number(chartJob.attempts);
  const maxAttempts = Number(chartJob.max_attempts);
  if (
    !Number.isSafeInteger(attempts) ||
    attempts < 0 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    attempts > maxAttempts ||
    maxAttempts > maxOwnedChartDeliveryAttempts
  ) {
    throw new Error("Chart smoke refuses an invalid durable chart delivery budget");
  }

  // Keep the exact legacy ID in the ownership set so an interrupted rollout of
  // the former queue naming convention cannot leave smoke-owned Redis data.
  context.ownedChartQueueDeliveryIds.add(`chart-calculation-${chartJob.id}`);
  const highestPossibleDelivery = Math.min(attempts, maxAttempts - 1);
  for (let deliveryAttempt = 0; deliveryAttempt <= highestPossibleDelivery; deliveryAttempt += 1) {
    context.ownedChartQueueDeliveryIds.add(
      `chart-calculation-${chartJob.id}-delivery-${deliveryAttempt}`
    );
  }
}

function registerOwnedCalculationPdfDelivery(context, operation, resourceId) {
  if (!(context.ownedCalculationPdfQueueDeliveryIds instanceof Set)) {
    throw new Error("Chart smoke PDF queue ownership registry is unavailable");
  }
  if (
    !new Set(["render", "delete"]).has(operation) ||
    typeof resourceId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(resourceId)
  ) {
    throw new Error("Chart smoke refuses an invalid calculation-PDF delivery identity");
  }
  context.ownedCalculationPdfQueueDeliveryIds.add(`calculation-pdf-${operation}-${resourceId}`);
}

async function cleanupOwnedQueueDeliveries(config, deliveryRegistry, queuePrefix, settleDeadline) {
  if (!(deliveryRegistry instanceof Set)) {
    throw new Error("Chart smoke queue ownership registry is unavailable");
  }
  if (![chartQueuePrefix, calculationPdfQueuePrefix].includes(queuePrefix)) {
    throw new Error("Chart smoke queue cleanup prefix is not allowed");
  }
  const deliveryIds = [...deliveryRegistry];
  if (deliveryIds.length === 0) return;
  const connectTimeoutMs = cleanupCommandTimeout(config, settleDeadline);
  const redis = createRedisClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: connectTimeoutMs,
      socketTimeout: connectTimeoutMs,
      reconnectStrategy: false
    },
    disableOfflineQueue: true
  });
  redis.on("error", () => undefined);

  try {
    await redis.connect();
    while (true) {
      const lockedDelivery = await runRedisCommand(
        redis,
        cleanupCommandTimeout(config, settleDeadline),
        (client) =>
          client.eval(removeExactChartQueueDeliveriesLua, {
            keys: [],
            arguments: [queuePrefix, ...deliveryIds]
          })
      );
      if (typeof lockedDelivery === "string" && lockedDelivery.length > 0) {
        if (Date.now() >= settleDeadline) {
          throw new SmokeFailure("CHART_SMOKE_QUEUE_CLEANUP_SETTLE_TIMEOUT");
        }
        await delayUntilSettle(settleDeadline);
        continue;
      }

      await removeExactQueueEvents(
        redis,
        config,
        queuePrefix,
        new Set(deliveryIds),
        settleDeadline
      );
      const stateResidue = Number(
        await runRedisCommand(redis, cleanupCommandTimeout(config, settleDeadline), (client) =>
          client.eval(countExactChartQueueDeliveryResidueLua, {
            keys: [],
            arguments: [queuePrefix, ...deliveryIds]
          })
        )
      );
      const eventResidue = await countExactQueueEvents(
        redis,
        config,
        queuePrefix,
        new Set(deliveryIds),
        settleDeadline
      );
      if (stateResidue === 0 && eventResidue === 0) return;
      if (Date.now() >= settleDeadline) {
        throw new SmokeFailure("CHART_SMOKE_QUEUE_CLEANUP_SETTLE_TIMEOUT");
      }
      await delayUntilSettle(settleDeadline);
    }
  } finally {
    if (redis.isOpen) redis.destroy();
  }
}

async function removeExactQueueEvents(redis, config, queuePrefix, deliveryIds, settleDeadline) {
  const eventIds = await findExactQueueEventIds(
    redis,
    config,
    queuePrefix,
    deliveryIds,
    settleDeadline
  );
  if (eventIds.length === 0) return;
  await runRedisCommand(redis, cleanupCommandTimeout(config, settleDeadline), (client) =>
    client.xDel(`${queuePrefix}events`, eventIds)
  );
}

async function countExactQueueEvents(redis, config, queuePrefix, deliveryIds, settleDeadline) {
  return (await findExactQueueEventIds(redis, config, queuePrefix, deliveryIds, settleDeadline))
    .length;
}

async function findExactQueueEventIds(redis, config, queuePrefix, deliveryIds, settleDeadline) {
  const result = [];
  let start = "-";
  let scanned = 0;
  while (true) {
    const page = await runRedisCommand(
      redis,
      cleanupCommandTimeout(config, settleDeadline),
      (client) => client.xRange(`${queuePrefix}events`, start, "+", { COUNT: 500 })
    );
    if (page.length === 0) return result;
    scanned += page.length;
    if (scanned > maxQueueEventScanCount) {
      throw new SmokeFailure("CHART_SMOKE_QUEUE_EVENT_SCAN_LIMIT_EXCEEDED");
    }
    for (const entry of page) {
      if (deliveryIds.has(entry.message.jobId)) result.push(entry.id);
    }
    if (page.length < 500) return result;
    start = `(${page.at(-1).id}`;
  }
}

function runRedisCommand(redis, timeoutMs, operation) {
  return operation(redis.withAbortSignal(AbortSignal.timeout(timeoutMs)));
}

function cleanupCommandTimeout(config, settleDeadline) {
  const remainingMs = settleDeadline - Date.now();
  if (remainingMs < 1) {
    throw new SmokeFailure("CHART_SMOKE_QUEUE_CLEANUP_SETTLE_TIMEOUT");
  }
  return Math.min(config.requestTimeoutMs, remainingMs);
}

function delayUntilSettle(settleDeadline) {
  return new Promise((resolveDelay) =>
    setTimeout(resolveDelay, Math.min(100, Math.max(1, settleDeadline - Date.now())))
  );
}

const removeExactChartQueueDeliveriesLua = `
local prefix = ARGV[1]
for index = 2, #ARGV do
  local job_id = ARGV[index]
  if redis.call('EXISTS', prefix .. job_id .. ':lock') == 1
     or redis.call('LPOS', prefix .. 'active', job_id) then
    return job_id
  end
end
for index = 2, #ARGV do
  local job_id = ARGV[index]
  redis.call('ZREM', prefix .. 'completed', job_id)
  redis.call('ZREM', prefix .. 'waiting-children', job_id)
  redis.call('ZREM', prefix .. 'delayed', job_id)
  redis.call('ZREM', prefix .. 'failed', job_id)
  redis.call('ZREM', prefix .. 'prioritized', job_id)
  redis.call('LREM', prefix .. 'wait', 0, job_id)
  redis.call('LREM', prefix .. 'paused', 0, job_id)
  redis.call('SREM', prefix .. 'stalled', job_id)
  local job_key = prefix .. job_id
  redis.call(
    'DEL',
    job_key,
    job_key .. ':logs',
    job_key .. ':dependencies',
    job_key .. ':processed',
    job_key .. ':failed',
    job_key .. ':unsuccessful'
  )
end
return ''
`;

const countExactChartQueueDeliveryResidueLua = `
local prefix = ARGV[1]
local residue = 0
for index = 2, #ARGV do
  local job_id = ARGV[index]
  local job_key = prefix .. job_id
  residue = residue + redis.call(
    'EXISTS',
    job_key,
    job_key .. ':logs',
    job_key .. ':dependencies',
    job_key .. ':processed',
    job_key .. ':failed',
    job_key .. ':unsuccessful',
    job_key .. ':lock'
  )
  if redis.call('ZSCORE', prefix .. 'completed', job_id) then residue = residue + 1 end
  if redis.call('ZSCORE', prefix .. 'waiting-children', job_id) then residue = residue + 1 end
  if redis.call('ZSCORE', prefix .. 'delayed', job_id) then residue = residue + 1 end
  if redis.call('ZSCORE', prefix .. 'failed', job_id) then residue = residue + 1 end
  if redis.call('ZSCORE', prefix .. 'prioritized', job_id) then residue = residue + 1 end
  if redis.call('LPOS', prefix .. 'wait', job_id) then residue = residue + 1 end
  if redis.call('LPOS', prefix .. 'paused', job_id) then residue = residue + 1 end
  if redis.call('LPOS', prefix .. 'active', job_id) then residue = residue + 1 end
  if redis.call('SISMEMBER', prefix .. 'stalled', job_id) == 1 then residue = residue + 1 end
end
return residue
`;

async function selectChildIds(client, tableName, calculationIds) {
  assertAllowedTable(tableName);
  if (calculationIds.length === 0) return [];
  return rows(
    client,
    `select id from ${tableName} where calculation_id = any($1::uuid[]) for update`,
    [calculationIds]
  );
}

async function deleteIdRows(client, tableName, rowIds) {
  assertAllowedTable(tableName);
  if (rowIds.length === 0) return;
  await client.query(`delete from ${tableName} where id = any($1::uuid[])`, [unique(rowIds)]);
}

async function deleteUserRows(client, tableName, columnName, userIds) {
  const allowed = new Set([
    "astrologer_profiles.owner_user_id",
    "client_profiles.user_id",
    "user_profiles.user_id"
  ]);
  if (!allowed.has(`${tableName}.${columnName}`)) {
    throw new Error("Chart smoke user cleanup target is not allowed");
  }
  await client.query(`delete from ${tableName} where ${columnName} = any($1::uuid[])`, [
    unique(userIds)
  ]);
}

function assertAllowedTable(tableName) {
  const allowed = new Set([
    "ai_usage_records",
    "audit_log_entries",
    "calculation_artifacts",
    "calculation_client_links",
    "calculation_interpretations",
    "calculation_participants",
    "calculation_pdf_jobs",
    "calculation_records",
    "chart_calculation_jobs",
    "client_astrologer_relationships",
    "client_birth_data",
    "idempotency_commands",
    "matrix_notes",
    "matrix_report_drafts",
    "media_assets",
    "media_variants",
    "outbox_events",
    "user_role_assignments",
    "user_sessions",
    "users"
  ]);
  if (!allowed.has(tableName)) {
    throw new Error("Chart smoke cleanup table is not allowed");
  }
}

async function rows(client, text, values) {
  return (await client.query(text, values)).rows;
}

async function assertReturnedIds(operation, expectedIds, label) {
  const returned = ids((await operation).rows).sort();
  const expected = [...expectedIds].sort();
  if (JSON.stringify(returned) !== JSON.stringify(expected)) {
    throw new Error(`Chart smoke ${label} did not return the exact created identities`);
  }
}

function ids(entries) {
  return entries.map((entry) => entry.id);
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueStorageObjects(values) {
  return [
    ...new Map(
      values.map((value) => [`${value.storageBucket}\n${value.storageKey}`, value])
    ).values()
  ];
}

function configureSmokePoolSafety(pool, { connectionTimeoutMs, statementTimeoutMs }) {
  if (!pool.options || typeof pool.options !== "object") {
    throw new Error("Chart smoke PostgreSQL pool does not expose connection safety options");
  }
  pool.options.connectionTimeoutMillis = connectionTimeoutMs;
  pool.options.statement_timeout = statementTimeoutMs;
  pool.options.query_timeout = statementTimeoutMs;
}

function isPostgresSettleTimeout(error) {
  return error instanceof Error && (error.code === "55P03" || error.code === "57014");
}

function injectFailure(configuredStage, currentStage) {
  if (configuredStage === currentStage) {
    throw new SmokeFailure(`CHART_SMOKE_INJECTED_FAILURE_${currentStage.toUpperCase()}`);
  }
}

function readFailureStage(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!supportedFailureStages.has(value)) {
    throw new Error(
      `CHART_SMOKE_INJECT_FAILURE_STAGE must be one of ${[...supportedFailureStages].join(", ")}`
    );
  }
  return value;
}

function readCleanupFailure(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value !== "after_zero_residue") {
    throw new Error(
      "CHART_SMOKE_INJECT_CLEANUP_FAILURE must equal after_zero_residue when enabled"
    );
  }
  return value;
}

function createCsrfToken(input) {
  const expiresAtMs = Math.min(
    input.now.getTime() + input.config.csrfTokenTtlSeconds * 1000,
    input.sessionExpiresAt.getTime()
  );
  const nonce = randomBytes(16).toString("base64url");
  const signature = createHmac("sha256", input.config.csrfSecret)
    .update(["v1", input.sessionTokenHash, expiresAtMs.toString(), nonce].join("|"))
    .digest("base64url");
  return ["v1", expiresAtMs.toString(), nonce, signature].join(".");
}

function readUrl(name, fallback, environment) {
  return readUrlValue(environment[name] ?? fallback, name);
}

function readUrlValue(value, name) {
  try {
    return new URL(value);
  } catch (error) {
    throw new Error(`${name} must be a valid URL`, { cause: error });
  }
}

function readRedisUrl(value) {
  const parsed = readUrlValue(value, "REDIS_URL");
  if (!new Set(["redis:", "rediss:"]).has(parsed.protocol)) {
    throw new Error("REDIS_URL must use redis or rediss");
  }
  return parsed.toString();
}

function readPositiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function required(value, name) {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required for chart smoke safety`);
  return result;
}

function toUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `Expected ${label} to be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

export function formatFailure(error) {
  if (error instanceof AggregateError) {
    return {
      code: "CHART_SMOKE_AND_CLEANUP_FAILED",
      primary: formatFailure(error.cause),
      failures: error.errors.map(formatFailure)
    };
  }
  if (error instanceof SmokeFailure) {
    return {
      code: error.safeCode,
      ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}),
      ...(typeof error.detailCode === "string" ? { detailCode: error.detailCode } : {})
    };
  }
  return { code: "CHART_SMOKE_INTERNAL_FAILURE" };
}

export function formatCliFailure(error) {
  return JSON.stringify({
    status: "failed",
    code: "CHART_SMOKE_FAILED",
    failure: formatFailure(error)
  });
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isExecutedDirectly) {
  main().catch((error) => {
    console.error(formatCliFailure(error));
    process.exitCode = 1;
  });
}
