import { createServer, type Server } from "node:http";

type Dependency = { readonly status: "ready" | "unready"; readonly error?: string };
export type WorkerReadiness = {
  readonly service: string;
  readonly status: "ready" | "unready";
  readonly timestamp: string;
  readonly dependencies: {
    readonly postgres: Dependency;
    readonly calculationPdfQueue: Dependency;
    readonly calculationPdfWorker: Dependency;
    readonly privateObjectStorage: Dependency;
    readonly flowExecutionRuntime: Dependency;
    readonly flowWorkerControl: Dependency;
  };
};

export async function createWorkerReadiness(input: {
  readonly service: string;
  readonly checks: {
    readonly postgres: () => Promise<void>;
    readonly calculationPdfQueue: () => Promise<void>;
    readonly calculationPdfWorker: () => Promise<void>;
    readonly privateObjectStorage: () => Promise<void>;
    readonly flowExecutionRuntime: () => Promise<void>;
    readonly flowWorkerControl: () => Promise<void>;
  };
  readonly now?: Date;
}): Promise<WorkerReadiness> {
  const [
    postgres,
    calculationPdfQueue,
    calculationPdfWorker,
    privateObjectStorage,
    flowExecutionRuntime,
    flowWorkerControl
  ] = await Promise.all([
    run(input.checks.postgres),
    run(input.checks.calculationPdfQueue),
    run(input.checks.calculationPdfWorker),
    run(input.checks.privateObjectStorage),
    run(input.checks.flowExecutionRuntime),
    run(input.checks.flowWorkerControl)
  ]);
  const dependencies = {
    postgres,
    calculationPdfQueue,
    calculationPdfWorker,
    privateObjectStorage,
    flowExecutionRuntime,
    flowWorkerControl
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
    } catch (error) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "unready", error: normalize(error) }));
    }
  });
}

async function run(check: () => Promise<void>): Promise<Dependency> {
  try {
    await check();
    return { status: "ready" };
  } catch (error) {
    return { status: "unready", error: normalize(error) };
  }
}

function normalize(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 500)
    : "readiness check failed";
}
