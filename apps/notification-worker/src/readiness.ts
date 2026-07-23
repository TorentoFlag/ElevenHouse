import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type WorkerReadinessStatus = "ready" | "unready";

export type WorkerReadinessDependency = {
  readonly status: WorkerReadinessStatus;
  readonly error?: string;
};

export type WorkerReadiness = {
  readonly service: string;
  readonly status: WorkerReadinessStatus;
  readonly timestamp: string;
  readonly dependencies: Record<string, WorkerReadinessDependency>;
};

export type WorkerReadinessChecks = Record<string, () => Promise<void>>;

export async function createWorkerReadiness(input: {
  readonly service: string;
  readonly checks: WorkerReadinessChecks;
  readonly now?: Date;
}): Promise<WorkerReadiness> {
  const dependencies: Record<string, WorkerReadinessDependency> = {};
  await Promise.all(
    Object.entries(input.checks).map(async ([name, check]) => {
      dependencies[name] = await runReadinessCheck(check);
    })
  );

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
    const pathname = getRequestPathname(request);

    if (pathname === "/live") {
      writeJson(response, 200, { status: "alive" });
      return;
    }

    if (pathname !== "/ready") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    try {
      const readiness = await input.getReadiness();
      writeJson(response, readiness.status === "ready" ? 200 : 503, readiness);
    } catch (error) {
      writeJson(response, 503, {
        service: "notification-worker",
        status: "unready",
        timestamp: new Date().toISOString(),
        error: normalizeErrorMessage(error)
      });
    }
  });
}

async function runReadinessCheck(check: () => Promise<void>): Promise<WorkerReadinessDependency> {
  try {
    await check();
    return { status: "ready" };
  } catch (error) {
    return {
      status: "unready",
      error: normalizeErrorMessage(error)
    };
  }
}

function getRequestPathname(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim().slice(0, 500);
  }

  return "readiness check failed";
}
