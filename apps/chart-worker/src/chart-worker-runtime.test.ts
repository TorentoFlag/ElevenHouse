import { describe, expect, it, vi } from "vitest";
import { createChartWorkerRuntime } from "./chart-worker-runtime";

describe("createChartWorkerRuntime", () => {
  it("runs relay once on startup and closes resources on shutdown", async () => {
    const relay = {
      runOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
    const runtime = createChartWorkerRuntime({
      readinessServer: {
        listen: vi.fn((_port, _host, cb) => cb()),
        once: vi.fn(),
        off: vi.fn(),
        close: vi.fn((cb) => cb()),
        listening: true
      } as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      relay,
      queue: { close: vi.fn(), waitUntilReady: vi.fn() },
      worker: { close: vi.fn(), waitUntilReady: vi.fn(), on: vi.fn(), off: vi.fn() },
      postgres: { close: vi.fn(), pool: { query: vi.fn() } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });

    await runtime.startup();
    await runtime.shutdown();

    expect(relay.runOnce).toHaveBeenCalled();
    expect(relay.start).toHaveBeenCalled();
    expect(relay.stop).toHaveBeenCalled();
  });
});
