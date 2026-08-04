import { createServer, type Server } from "node:http";
import {
  chartEngineReadinessResponseSchema,
  chartExecutionProfileSchema,
  type ChartEngineReadinessResponse,
  type ChartExecutionProfile
} from "@elevenhouse/contracts";

type Dependency = { readonly status: "ready" | "unready"; readonly error?: string };
export type WorkerReadiness = {
  readonly service: string;
  readonly status: "ready" | "unready";
  readonly timestamp: string;
  readonly dependencies: {
    readonly postgres: Dependency;
    readonly chartCalculationQueue: Dependency;
    readonly chartCalculationWorker: Dependency;
    readonly chartEngine: Dependency;
  };
};

export async function createWorkerReadiness(input: {
  readonly service: string;
  readonly acceptingWork: boolean;
  readonly checkTimeoutMs: number;
  readonly expectedExecutionProfile: ChartExecutionProfile;
  readonly checks: {
    readonly postgres: () => Promise<void>;
    readonly chartCalculationQueue: () => Promise<void>;
    readonly chartCalculationWorker: () => Promise<void>;
    readonly chartEngine: () => Promise<unknown>;
  };
  readonly now?: Date;
}): Promise<WorkerReadiness> {
  const [postgres, chartCalculationQueue, chartCalculationWorker, chartEngine] = await Promise.all([
    run(input.checks.postgres, "PostgreSQL readiness check failed", input.checkTimeoutMs),
    run(
      input.checks.chartCalculationQueue,
      "Chart queue readiness check failed",
      input.checkTimeoutMs
    ),
    input.acceptingWork
      ? run(
          input.checks.chartCalculationWorker,
          "Chart worker readiness check failed",
          input.checkTimeoutMs
        )
      : Promise.resolve({
          status: "unready" as const,
          error: "Chart worker is not accepting work"
        }),
    runChartEngine(input.checks.chartEngine, input.expectedExecutionProfile, input.checkTimeoutMs)
  ]);
  const dependencies = {
    postgres,
    chartCalculationQueue,
    chartCalculationWorker,
    chartEngine
  };
  return {
    service: input.service,
    status: Object.values(dependencies).every((dependency) => dependency.status === "ready")
      ? "ready"
      : "unready",
    timestamp: (input.now ?? new Date()).toISOString(),
    dependencies
  };
}

async function runChartEngine(
  check: () => Promise<unknown>,
  expectedExecutionProfile: ChartExecutionProfile,
  timeoutMs: number
): Promise<Dependency> {
  return run(
    async () => {
      const readiness = chartEngineReadinessResponseSchema.parse(await check());
      const profile = chartExecutionProfileSchema.parse(expectedExecutionProfile);
      if (!providerMatchesProfile(readiness.provider, profile)) {
        throw new Error("Chart engine readiness profile does not match worker execution profile");
      }
    },
    "Chart engine readiness check failed",
    timeoutMs
  );
}

function providerMatchesProfile(
  provider: ChartEngineReadinessResponse["provider"],
  profile: ChartExecutionProfile
): boolean {
  return (
    provider.name === profile.provider &&
    provider.version === profile.kerykeionVersion &&
    provider.pyswissephVersion === profile.pyswissephVersion &&
    provider.ephemeris === profile.expectedEphemeris &&
    equalStringSets(provider.ephemerisFlags, profile.expectedEphemerisFlags) &&
    provider.ephemerisDataRevision === profile.expectedEphemerisDataRevision
  );
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

export function createWorkerReadinessServer(input: {
  readonly getReadiness: () => Promise<WorkerReadiness>;
}): Server {
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path === "/live") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "alive" }));
      return;
    }
    if (path !== "/ready") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    try {
      const readiness = await input.getReadiness();
      response.writeHead(readiness.status === "ready" ? 200 : 503, {
        "content-type": "application/json"
      });
      response.end(JSON.stringify(readiness));
    } catch {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "unready", error: "Readiness check failed" }));
    }
  });
}

async function run(
  check: () => Promise<void>,
  safeError: string,
  timeoutMs: number
): Promise<Dependency> {
  try {
    await withReadinessDeadline(check(), timeoutMs);
    return { status: "ready" };
  } catch (error) {
    return {
      status: "unready",
      error:
        error instanceof Error &&
        error.message === "Chart engine readiness profile does not match worker execution profile"
          ? error.message
          : safeError
    };
  }
}

async function withReadinessDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("CHART_WORKER_READINESS_TIMEOUT_INVALID");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("CHART_WORKER_READINESS_DEADLINE_EXCEEDED")),
          timeoutMs
        );
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
