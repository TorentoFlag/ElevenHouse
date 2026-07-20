import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createSessionToken, hashSessionToken } from "@elevenhouse/auth";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";

const apiBaseUrl = readUrl("CHART_SMOKE_API_BASE_URL", "http://127.0.0.1:3002");
const chartEngineBaseUrl = readUrl("CHART_ENGINE_BASE_URL", "http://127.0.0.1:8012");
const chartWorkerBaseUrl = readUrl("CHART_WORKER_BASE_URL", "http://127.0.0.1:3012");
const origin = readUrl("CHART_SMOKE_ORIGIN", "http://localhost:5174").origin;
const sessionCookieName =
  process.env.ASTROLOGER_API_SESSION_COOKIE_NAME ?? "elevenhouse_astrologer_session";
const csrfCookieName =
  process.env.ASTROLOGER_API_CSRF_COOKIE_NAME ?? "elevenhouse_astrologer_csrf";
const csrfHeaderName =
  process.env.ASTROLOGER_API_CSRF_HEADER_NAME?.toLowerCase() ?? "x-csrf-token";
const csrfSecret =
  process.env.ASTROLOGER_API_CSRF_SECRET ??
  "elevenhouse-dev-astrologer-api-csrf-secret-change-before-production";
const sessionTtlSeconds = Number(process.env.ASTROLOGER_API_SESSION_TTL_SECONDS ?? 604_800);
const csrfTokenTtlSeconds = Number(process.env.ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS ?? 604_800);

const runtime = createPostgresRuntime();

try {
  await assertReady(toUrl(apiBaseUrl, "/health"), "astrologer-api");
  await assertReady(toUrl(chartEngineBaseUrl, "/ready"), "chart-engine");
  await assertReady(toUrl(chartWorkerBaseUrl, "/ready"), "chart-worker");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000);
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const sessionToken = createSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const csrfToken = createCsrfToken({
    sessionTokenHash,
    now,
    sessionExpiresAt: expiresAt
  });
  const authHeaders = {
    cookie: `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${csrfToken}`,
    origin
  };
  const csrfHeaders = {
    ...authHeaders,
    [csrfHeaderName]: csrfToken
  };

  await seedSmokeData({
    astrologerUserId,
    clientUserId,
    sessionTokenHash,
    now,
    expiresAt
  });

  const createJobResponse = await requestJson(toUrl(apiBaseUrl, "/charts/natal/jobs"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...csrfHeaders
    },
    body: JSON.stringify({
      clientId: clientUserId,
      settings: {
        houseSystem: "placidus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      }
    })
  });

  if (createJobResponse.status !== "calculating" || !createJobResponse.jobId) {
    throw new Error(
      `Expected calculating chart job response, received ${JSON.stringify(createJobResponse)}`
    );
  }

  const job = await pollChartJob(createJobResponse.jobId, authHeaders);
  if (!job.calculationId) {
    throw new Error(`Succeeded chart job is missing calculationId: ${JSON.stringify(job)}`);
  }

  const calculation = await requestJson(
    toUrl(apiBaseUrl, `/charts/calculations/${job.calculationId}`),
    {
      headers: authHeaders
    }
  );
  const chartResult = calculation.result?.result;
  const points = Array.isArray(chartResult?.points) ? chartResult.points : [];
  const houses = Array.isArray(chartResult?.houses) ? chartResult.houses : [];
  const aspects = Array.isArray(chartResult?.aspects) ? chartResult.aspects : [];
  const pointIds = new Set(points.map((point) => point.id));

  assertEqual(calculation.calculationId, job.calculationId, "calculation id");
  assertEqual(calculation.result?.schemaVersion, "chart-result.v1", "chart result schema");
  assertEqual(calculation.result?.method, "natal", "chart method");
  assertEqual(calculation.result?.provider?.name, "kerykeion", "chart provider");
  assertEqual(calculation.result?.provider?.ephemeris, "swiss-ephemeris", "chart ephemeris");
  assertEqual(points.length, 14, "point count");
  assertEqual(houses.length, 12, "house count");
  if (aspects.length === 0) {
    throw new Error("Expected at least one natal aspect");
  }
  for (const requiredPoint of ["sun", "moon", "ascendant", "midheaven"]) {
    if (!pointIds.has(requiredPoint)) {
      throw new Error(`Expected chart point ${requiredPoint}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        jobId: createJobResponse.jobId,
        calculationId: job.calculationId,
        pointCount: points.length,
        houseCount: houses.length,
        aspectCount: aspects.length,
        provider: calculation.result.provider
      },
      null,
      2
    )
  );
} finally {
  await runtime.close();
}

async function seedSmokeData(input) {
  await runtime.pool.query(
    `
      insert into users (id, status, created_at, updated_at)
      values ($1, 'active', $3, $3), ($2, 'active', $3, $3)
      on conflict (id) do update set status = excluded.status, updated_at = excluded.updated_at
    `,
    [input.astrologerUserId, input.clientUserId, input.now]
  );
  await runtime.pool.query(
    `
      insert into user_role_assignments (user_id, role, assigned_at)
      values ($1, 'astrologer', $3), ($2, 'client', $3)
      on conflict (user_id, role) do nothing
    `,
    [input.astrologerUserId, input.clientUserId, input.now]
  );
  await runtime.pool.query(
    `
      insert into user_sessions (
        user_id, token_hash, status, user_agent, ip_address, created_at, expires_at
      )
      values ($1, $2, 'active', 'chart-engine-smoke', '127.0.0.1', $3, $4)
    `,
    [input.astrologerUserId, input.sessionTokenHash, input.now, input.expiresAt]
  );
  await runtime.pool.query(
    `
      insert into client_profiles (
        user_id, display_name_snapshot, preferred_locale, timezone, created_at, updated_at
      )
      values ($1, 'Smoke Client', 'ru', 'Europe/Moscow', $2, $2)
    `,
    [input.clientUserId, input.now]
  );
  await runtime.pool.query(
    `
      insert into client_birth_data (
        client_user_id,
        label,
        birth_date,
        birth_time,
        birth_time_precision,
        birth_place_text,
        birth_country_code,
        birth_city,
        birth_region,
        birth_timezone,
        birth_time_dst_occurrence,
        birth_latitude,
        birth_longitude,
        source,
        created_at,
        updated_at
      )
      values (
        $1,
        'Smoke birth data',
        '1990-07-15',
        '10:30',
        'exact',
        'Rome, Italy',
        'IT',
        'Rome',
        'Lazio',
        'Europe/Rome',
        null,
        41.9028,
        12.4964,
        'manual',
        $2,
        $2
      )
    `,
    [input.clientUserId, input.now]
  );
  await runtime.pool.query(
    `
      insert into client_astrologer_relationships (
        client_user_id,
        astrologer_user_id,
        source,
        status,
        first_linked_at,
        last_linked_at,
        archived_at,
        blocked_at,
        created_at,
        updated_at
      )
      values ($1, $2, 'manual', 'active', $3, $3, null, null, $3, $3)
    `,
    [input.clientUserId, input.astrologerUserId, input.now]
  );
}

async function pollChartJob(jobId, headers) {
  const timeoutAt = Date.now() + 30_000;

  while (Date.now() < timeoutAt) {
    const job = await requestJson(toUrl(apiBaseUrl, `/charts/jobs/${jobId}`), { headers });

    if (job.status === "succeeded") return job;
    if (job.status === "failed") {
      throw new Error(`Chart job failed: ${JSON.stringify(job)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Chart job ${jobId} did not finish within 30 seconds`);
}

async function assertReady(url, serviceName) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${serviceName} readiness failed: HTTP ${response.status}`);
  }
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${JSON.stringify(body)}`);
  }

  return body;
}

function createCsrfToken(input) {
  const expiresAtMs = Math.min(
    input.now.getTime() + csrfTokenTtlSeconds * 1000,
    input.sessionExpiresAt.getTime()
  );
  const nonce = randomBytes(16).toString("base64url");
  const signature = createHmac("sha256", csrfSecret)
    .update(["v1", input.sessionTokenHash, expiresAtMs.toString(), nonce].join("|"))
    .digest("base64url");

  return ["v1", expiresAtMs.toString(), nonce, signature].join(".");
}

function readUrl(name, fallback) {
  try {
    return new URL(process.env[name] ?? fallback);
  } catch (error) {
    throw new Error(`${name} must be a valid URL`, { cause: error });
  }
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
