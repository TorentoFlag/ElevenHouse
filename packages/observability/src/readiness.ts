/// <reference types="node" />

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type BasicWorkerReadiness = {
  readonly service: string;
  readonly status: "ready";
  readonly timestamp: string;
};

export function createReadinessResponse(
  service: string,
  now: Date = new Date()
): BasicWorkerReadiness {
  return {
    service,
    status: "ready",
    timestamp: now.toISOString()
  };
}

export function createBasicWorkerReadinessServer(input: {
  readonly service: string;
  readonly getReadiness?: () => Promise<BasicWorkerReadiness> | BasicWorkerReadiness;
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
      const readiness = await (input.getReadiness?.() ?? createReadinessResponse(input.service));
      writeJson(response, 200, readiness);
    } catch (error) {
      writeJson(response, 503, {
        service: input.service,
        status: "unready",
        timestamp: new Date().toISOString(),
        error: normalizeErrorMessage(error)
      });
    }
  });
}

export function listenReadinessServer(input: {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    input.server.once("error", reject);
    input.server.listen(input.port, input.host, () => {
      input.server.off("error", reject);
      resolve();
    });
  });
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
