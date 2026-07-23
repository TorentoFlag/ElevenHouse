import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";

describe("notification-worker readiness", () => {
  const servers: ReturnType<typeof createWorkerReadinessServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          })
      )
    );
    servers.length = 0;
  });

  it("returns ready only when Postgres, queue, and worker checks pass", async () => {
    await expect(
      createWorkerReadiness({
        service: "notification-worker",
        now: new Date("2026-06-18T10:00:00.000Z"),
        checks: {
          postgres: vi.fn(async () => undefined),
          authCodeDeliveryQueue: vi.fn(async () => undefined),
          authCodeDeliveryWorker: vi.fn(async () => undefined)
        }
      })
    ).resolves.toEqual({
      service: "notification-worker",
      status: "ready",
      timestamp: "2026-06-18T10:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        authCodeDeliveryQueue: { status: "ready" },
        authCodeDeliveryWorker: { status: "ready" }
      }
    });
  });

  it("returns unready with the failed dependency error", async () => {
    await expect(
      createWorkerReadiness({
        service: "notification-worker",
        now: new Date("2026-06-18T10:00:00.000Z"),
        checks: {
          postgres: vi.fn(async () => undefined),
          authCodeDeliveryQueue: vi.fn(async () => {
            throw new Error("redis unavailable");
          }),
          authCodeDeliveryWorker: vi.fn(async () => undefined)
        }
      })
    ).resolves.toEqual({
      service: "notification-worker",
      status: "unready",
      timestamp: "2026-06-18T10:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        authCodeDeliveryQueue: { status: "unready", error: "redis unavailable" },
        authCodeDeliveryWorker: { status: "ready" }
      }
    });
  });

  it("includes optional dependency checks in the readiness response", async () => {
    await expect(
      createWorkerReadiness({
        service: "notification-worker",
        now: new Date("2026-06-18T10:00:00.000Z"),
        checks: {
          postgres: vi.fn(async () => undefined),
          authCodeDeliveryQueue: vi.fn(async () => undefined),
          authCodeDeliveryWorker: vi.fn(async () => undefined),
          messagingDeliveryQueue: vi.fn(async () => undefined)
        }
      })
    ).resolves.toEqual({
      service: "notification-worker",
      status: "ready",
      timestamp: "2026-06-18T10:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        authCodeDeliveryQueue: { status: "ready" },
        authCodeDeliveryWorker: { status: "ready" },
        messagingDeliveryQueue: { status: "ready" }
      }
    });
  });

  it("serves live and ready HTTP probes", async () => {
    const server = createWorkerReadinessServer({
      getReadiness: async () => ({
        service: "notification-worker",
        status: "ready",
        timestamp: "2026-06-18T10:00:00.000Z",
        dependencies: {
          postgres: { status: "ready" },
          authCodeDeliveryQueue: { status: "ready" },
          authCodeDeliveryWorker: { status: "ready" }
        }
      })
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const baseUrl = getServerUrl(server);

    await expect(readJson(`${baseUrl}/live`)).resolves.toEqual({
      status: 200,
      body: { status: "alive" }
    });
    await expect(readJson(`${baseUrl}/ready`)).resolves.toEqual({
      status: 200,
      body: {
        service: "notification-worker",
        status: "ready",
        timestamp: "2026-06-18T10:00:00.000Z",
        dependencies: {
          postgres: { status: "ready" },
          authCodeDeliveryQueue: { status: "ready" },
          authCodeDeliveryWorker: { status: "ready" }
        }
      }
    });
  });

  it("returns HTTP 503 when readiness is unready", async () => {
    const server = createWorkerReadinessServer({
      getReadiness: async () => ({
        service: "notification-worker",
        status: "unready",
        timestamp: "2026-06-18T10:00:00.000Z",
        dependencies: {
          postgres: { status: "ready" },
          authCodeDeliveryQueue: { status: "unready", error: "redis unavailable" },
          authCodeDeliveryWorker: { status: "ready" }
        }
      })
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    await expect(readJson(`${getServerUrl(server)}/ready`)).resolves.toEqual({
      status: 503,
      body: {
        service: "notification-worker",
        status: "unready",
        timestamp: "2026-06-18T10:00:00.000Z",
        dependencies: {
          postgres: { status: "ready" },
          authCodeDeliveryQueue: { status: "unready", error: "redis unavailable" },
          authCodeDeliveryWorker: { status: "ready" }
        }
      }
    });
  });
});

function getServerUrl(server: ReturnType<typeof createWorkerReadinessServer>): string {
  const address = server.address() as AddressInfo | null;
  return `http://127.0.0.1:${address?.port ?? 0}`;
}

async function readJson(url: string): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.json()
  };
}
