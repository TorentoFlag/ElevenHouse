/// <reference types="node" />

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBasicWorkerReadinessServer,
  createReadinessResponse,
  parseReadinessPort,
  serializeError
} from "./readiness";

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(closeServer));
});

describe("createReadinessResponse", () => {
  it("returns a stable ready response", () => {
    expect(createReadinessResponse("payment-worker", new Date("2026-07-07T00:00:00.000Z"))).toEqual({
      service: "payment-worker",
      status: "ready",
      timestamp: "2026-07-07T00:00:00.000Z"
    });
  });
});

describe("createBasicWorkerReadinessServer", () => {
  it("returns liveness JSON from /live", async () => {
    const server = createBasicWorkerReadinessServer({ service: "workers" });

    await expect(requestJson(server, "/live")).resolves.toEqual({
      status: 200,
      body: { status: "alive" }
    });
  });

  it("returns readiness JSON from /ready", async () => {
    const server = createBasicWorkerReadinessServer({
      service: "payment-worker",
      getReadiness: () => createReadinessResponse("payment-worker", new Date("2026-07-07T00:00:00.000Z"))
    });

    await expect(requestJson(server, "/ready")).resolves.toEqual({
      status: 200,
      body: {
        service: "payment-worker",
        status: "ready",
        timestamp: "2026-07-07T00:00:00.000Z"
      }
    });
  });

  it("returns not_found JSON from unknown routes", async () => {
    const server = createBasicWorkerReadinessServer({ service: "chart-worker" });

    await expect(requestJson(server, "/missing")).resolves.toEqual({
      status: 404,
      body: { error: "not_found" }
    });
  });

  it("returns unready JSON with serialized errors when readiness throws", async () => {
    const error = new Error(" Redis connection refused ");
    Object.assign(error, { code: "ECONNREFUSED" });
    const server = createBasicWorkerReadinessServer({
      service: "payment-worker",
      getReadiness: () => {
        throw error;
      }
    });

    const response = await requestJson(server, "/ready");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      service: "payment-worker",
      status: "unready",
      error: {
        name: "Error",
        message: "Redis connection refused",
        code: "ECONNREFUSED"
      }
    });
    expect(Date.parse((response.body as { timestamp: string }).timestamp)).not.toBeNaN();
  });
});

describe("parseReadinessPort", () => {
  it("uses the fallback when the environment value is unset or empty", () => {
    expect(parseReadinessPort(undefined, 3010, "WORKERS_HEALTH_PORT")).toBe(3010);
    expect(parseReadinessPort("", 3010, "WORKERS_HEALTH_PORT")).toBe(3010);
    expect(parseReadinessPort("   ", 3010, "WORKERS_HEALTH_PORT")).toBe(3010);
  });

  it("accepts integer ports in range", () => {
    expect(parseReadinessPort("1", 3010, "WORKERS_HEALTH_PORT")).toBe(1);
    expect(parseReadinessPort("3010", 3011, "WORKERS_HEALTH_PORT")).toBe(3010);
    expect(parseReadinessPort("65535", 3010, "WORKERS_HEALTH_PORT")).toBe(65535);
  });

  it("rejects malformed or out-of-range ports", () => {
    for (const value of ["3010abc", "3010.5", "0", "65536", "abc"]) {
      expect(() => parseReadinessPort(value, 3010, "WORKERS_HEALTH_PORT")).toThrow(
        `WORKERS_HEALTH_PORT must be an integer port in range 1..65535`
      );
    }
  });
});

describe("serializeError", () => {
  it("returns useful fields for Error objects with optional codes", () => {
    const error = new Error(" listen EADDRINUSE ");
    Object.assign(error, { code: "EADDRINUSE" });

    expect(serializeError(error)).toEqual({
      name: "Error",
      message: "listen EADDRINUSE",
      code: "EADDRINUSE"
    });
  });
});

async function requestJson(server: Server, path: string): Promise<{ status: number; body: unknown }> {
  await listenOnEphemeralPort(server);
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);

  return {
    status: response.status,
    body: await response.json()
  };
}

function listenOnEphemeralPort(server: Server): Promise<void> {
  openServers.push(server);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
