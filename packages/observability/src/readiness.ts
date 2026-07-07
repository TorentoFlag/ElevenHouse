/// <reference types="node" />

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type BasicWorkerReadiness = {
  readonly service: string;
  readonly status: "ready";
  readonly timestamp: string;
};

export type SerializedError = {
  readonly name: string;
  readonly message: string;
  readonly code?: string | number;
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
        error: serializeError(error)
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

export function parseReadinessPort(
  value: string | undefined,
  fallback: number,
  envName: string
): number {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return fallback;
  }

  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error(`${envName} must be an integer port in range 1..65535`);
  }

  const port = Number(normalizedValue);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${envName} must be an integer port in range 1..65535`);
  }

  return port;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return withOptionalCode({
      error,
      name: normalizeText(error.name, "Error"),
      message: normalizeText(error.message, "readiness check failed")
    });
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: normalizeText(error, "readiness check failed")
    };
  }

  if (isRecord(error)) {
    return withOptionalCode({
      error,
      name: normalizeText(error.name, "Error"),
      message: normalizeText(error.message, "readiness check failed")
    });
  }

  return {
    name: "Error",
    message: "readiness check failed"
  };
}

function getRequestPathname(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();

  return normalized ? normalized.slice(0, 500) : fallback;
}

function withOptionalCode(input: {
  readonly error: Error | Record<string, unknown>;
  readonly name: string;
  readonly message: string;
}): SerializedError {
  const code = (input.error as Record<string, unknown>).code;

  if (typeof code === "string" || typeof code === "number") {
    return {
      name: input.name,
      message: input.message,
      code
    };
  }

  return {
    name: input.name,
    message: input.message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
