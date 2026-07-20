import type { Server } from "node:http";
import type { Logger } from "@elevenhouse/observability";

type Closable = { readonly close: () => Promise<unknown> };
type ReadyCheck = { readonly waitUntilReady: () => Promise<unknown> };

export function createChartWorkerRuntime(input: {
  readonly readinessServer: Pick<Server, "listen" | "once" | "off" | "close" | "listening">;
  readonly readinessPort: number;
  readonly readinessHost: string;
  readonly relay: {
    readonly runOnce: () => Promise<unknown>;
    readonly start: () => void;
    readonly stop: () => Promise<unknown>;
  };
  readonly queue: Closable & ReadyCheck;
  readonly worker: Closable & ReadyCheck & { readonly on: unknown; readonly off: unknown };
  readonly postgres: Closable & { readonly pool: { readonly query: (sql: string) => Promise<unknown> } };
  readonly chartEngine: { readonly checkReady: () => Promise<unknown> };
  readonly logger: Pick<Logger, "info" | "error" | "warn">;
}) {
  let shutdownPromise: Promise<void> | null = null;

  async function startup(): Promise<void> {
    await Promise.all([
      input.postgres.pool.query("select 1"),
      input.queue.waitUntilReady(),
      input.worker.waitUntilReady(),
      input.chartEngine.checkReady()
    ]);
    await new Promise<void>((resolve, reject) => {
      input.readinessServer.once("error", reject);
      input.readinessServer.listen(input.readinessPort, input.readinessHost, () => {
        input.readinessServer.off("error", reject);
        resolve();
      });
    });
    await input.relay.runOnce();
    input.relay.start();
    input.logger.info("chart worker ready", {
      host: input.readinessHost,
      port: input.readinessPort
    });
  }

  function shutdown(): Promise<void> {
    shutdownPromise ??= shutdownOnce();
    return shutdownPromise;
  }

  async function shutdownOnce(): Promise<void> {
    await input.relay.stop();
    if (input.readinessServer.listening) {
      await new Promise<void>((resolve, reject) =>
        input.readinessServer.close((error?: Error) => (error ? reject(error) : resolve()))
      );
    }
    await input.worker.close();
    await input.queue.close();
    await input.postgres.close();
  }

  return { startup, shutdown };
}
