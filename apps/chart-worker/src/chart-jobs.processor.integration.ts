import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chartEngineCapabilities,
  chartMethodVersions,
  type ChartExecutionProfile
} from "@elevenhouse/contracts";
import { ChartEngineHttpClient } from "@elevenhouse/chart-engine-client";
import {
  createDrizzleChartCalculationJobStore,
  createDrizzleChartWorkerJobStore
} from "@elevenhouse/db/charts";
import { assertDevelopmentDatabaseUrl } from "@elevenhouse/db/connection";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { buildChartJobRequestFingerprint } from "@elevenhouse/domain";
import { DelayedError } from "bullmq";
import { processChartCalculationJob } from "./chart-jobs.processor";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const isolatedDatabaseName = `elevenhouse_chart_worker_${process.pid}_${randomUUID()
  .replaceAll("-", "")
  .slice(0, 8)}`;
const isolatedDatabaseUrl = withDatabaseName(databaseUrl, isolatedDatabaseName);
const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

describe("chart worker PostgreSQL/HTTP integration", () => {
  const adminRuntime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
  let providerServer: Server | null = null;

  beforeAll(async () => {
    await adminRuntime.pool.query(`CREATE DATABASE "${isolatedDatabaseName}"`);
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    if (providerServer !== null) await closeServer(providerServer);
    try {
      await runtime.close();
    } finally {
      try {
        await adminRuntime.pool.query(
          `DROP DATABASE IF EXISTS "${isolatedDatabaseName}" WITH (FORCE)`
        );
      } finally {
        await adminRuntime.close();
      }
    }
  }, 30_000);

  it("defers a second worker while a real HTTP calculation holds provider readiness", async () => {
    const calculationStarted = createDeferred<void>();
    const releaseCalculation = createDeferred<void>();
    let calculationActive = false;
    let readinessRequestCount = 0;
    let calculationRequestCount = 0;

    providerServer = createServer((request, response) => {
      void handleProviderRequest(request, response, {
        isCalculationActive: () => calculationActive,
        onReadiness: () => {
          readinessRequestCount += 1;
        },
        onCalculation: async () => {
          calculationRequestCount += 1;
          if (calculationActive) return;
          calculationActive = true;
          calculationStarted.resolve();
          await releaseCalculation.promise;
          calculationActive = false;
        }
      }).catch(() => response.destroy());
    });
    const baseUrl = await listen(providerServer);
    const engine = new ChartEngineHttpClient({ baseUrl });
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database, {
      operationTimeoutMs: 500
    });
    const firstJobId = await createNatalJob(jobStore, "First subject", "1990-07-15");
    const secondJobId = await createNatalJob(jobStore, "Second subject", "1992-08-11");
    const firstDelivery = createDelivery();
    const secondDelivery = createDelivery();

    const firstWorker = processChartCalculationJob({
      jobId: firstJobId,
      workerId: "chart-worker:http-first",
      leaseMs: 5_000,
      calculationTimeoutMs: 5_000,
      storageOperationTimeoutMs: 500,
      retryDelayMs: 250,
      retryJitter: 0,
      delivery: firstDelivery.control,
      shutdownSignal: new AbortController().signal,
      store: workerStore,
      engine,
      logger: silentLogger
    });
    await withWatchdog(calculationStarted.promise);

    const secondWorkerError = await processChartCalculationJob({
      jobId: secondJobId,
      workerId: "chart-worker:http-second",
      leaseMs: 5_000,
      calculationTimeoutMs: 5_000,
      storageOperationTimeoutMs: 500,
      retryDelayMs: 250,
      retryJitter: 0,
      delivery: secondDelivery.control,
      shutdownSignal: new AbortController().signal,
      store: workerStore,
      engine,
      logger: silentLogger
    }).catch((error: unknown) => error);

    try {
      expect(secondWorkerError).toBeInstanceOf(DelayedError);
      expect(secondDelivery.delays).toEqual([250]);
      expect(await readJobState(secondJobId)).toMatchObject({
        status: "queued",
        attempts: 0,
        lease_generation: 0,
        locked_by: null,
        locked_until: null,
        last_error_code: null,
        last_error_message: null
      });
      expect(readinessRequestCount).toBe(2);
      expect(calculationRequestCount).toBe(1);
    } finally {
      releaseCalculation.resolve();
    }

    await firstWorker;
    expect(firstDelivery.delays).toEqual([]);
    expect(await readJobState(firstJobId)).toMatchObject({
      status: "queued",
      attempts: 1,
      lease_generation: 1,
      locked_by: null,
      locked_until: null,
      last_error_code: "chart_provider_transient_failure"
    });
    expect(await readJobState(secondJobId)).toMatchObject({
      status: "queued",
      attempts: 0,
      lease_generation: 0,
      locked_by: null,
      locked_until: null,
      last_error_code: null
    });
  }, 15_000);

  async function createNatalJob(
    store: ReturnType<typeof createDrizzleChartCalculationJobStore>,
    displayName: string,
    birthDate: string
  ): Promise<string> {
    const ownerUserId = await createUser();
    const clientId = await createUser();
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot, created_at, updated_at)
       values ($1, $2, clock_timestamp(), clock_timestamp())`,
      [clientId, displayName]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at,
         created_at, updated_at
       ) values (
         $1, $2, 'manual', 'active', clock_timestamp(), clock_timestamp(),
         clock_timestamp(), clock_timestamp()
       )`,
      [clientId, ownerUserId]
    );
    const inputSnapshot = {
      birthDate,
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact" as const
    };
    const settingsSnapshot = {
      zodiac: "tropical" as const,
      houseSystem: "placidus" as const,
      nodeType: "true" as const,
      aspectPreset: "major" as const,
      orbMultiplier: 1
    };
    const participants = [{ role: "subject" as const, clientId }];
    const input = {
      ownerUserId,
      clientId,
      interpretationMode: "adult_natal" as const,
      methodVersion: chartMethodVersions.natal,
      executionProfile,
      participants,
      maxAttempts: 3,
      targetCalculationId: null,
      expectedSourceChecksum: null,
      inputSnapshot,
      settingsSnapshot,
      inputFingerprint: buildChartJobRequestFingerprint({
        ownerUserId,
        method: "natal",
        methodVersion: chartMethodVersions.natal,
        executionProfile,
        settings: settingsSnapshot,
        inputSnapshot,
        participants,
        targetCalculationId: null,
        expectedSourceChecksum: null
      })
    };
    const created = await store.createOrReuseNatalJob(input);
    if (created.kind !== "active_job") throw new Error("Expected a new chart job");
    return created.jobId;
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user insert");
  }

  async function readJobState(jobId: string) {
    const result = await runtime.pool.query(
      `select status, attempts, lease_generation, locked_by, locked_until,
              last_error_code, last_error_message
         from chart_calculation_jobs
        where id = $1`,
      [jobId]
    );
    return result.rows[0] ?? raise("Expected chart job row");
  }
});

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function handleProviderRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: {
    readonly isCalculationActive: () => boolean;
    readonly onReadiness: () => void;
    readonly onCalculation: () => Promise<void>;
  }
): Promise<void> {
  if (request.method === "GET" && request.url === "/ready") {
    state.onReadiness();
    if (state.isCalculationActive()) {
      respondText(response, 503, "PROVIDER_READINESS_TIMEOUT");
      return;
    }
    respondJson(response, {
      service: "chart-engine",
      status: "ready",
      provider: {
        name: "kerykeion",
        version: "5.12.9",
        pyswissephVersion: "2.10.3.2",
        ephemeris: "moshier",
        ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
        ephemerisDataRevision: null
      },
      capabilities: chartEngineCapabilities
    });
    return;
  }
  if (request.method === "POST" && request.url === "/v1/natal") {
    request.resume();
    if (state.isCalculationActive()) {
      respondText(response, 503, "PROVIDER_BUSY");
      return;
    }
    await state.onCalculation();
    respondText(response, 503, "PROVIDER_CALCULATION_FAILED");
    return;
  }
  respondText(response, 404, "NOT_FOUND");
}

function createDelivery() {
  const delays: number[] = [];
  return {
    delays,
    control: {
      deferFor: async (delayMs: number): Promise<never> => {
        delays.push(delayMs);
        throw new DelayedError();
      }
    }
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function withWatchdog<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("HTTP provider calculation did not start")),
          2_000
        );
        timer.unref();
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function respondJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function respondText(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/plain" });
  response.end(value);
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Invalid integration database name");
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function raise(message: string): never {
  throw new Error(message);
}
