import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer,
  parseReadinessPort,
  serializeError
} from "@elevenhouse/observability";

const service = "workers";
const logger = createLogger(service);

async function startWorkers(): Promise<void> {
  const readinessHost = process.env.WORKERS_HEALTH_HOST ?? "0.0.0.0";
  const readinessPort = parseReadinessPort(process.env.WORKERS_HEALTH_PORT, 3010, "WORKERS_HEALTH_PORT");
  const readinessServer = createBasicWorkerReadinessServer({ service });

  await listenReadinessServer({
    server: readinessServer,
    host: readinessHost,
    port: readinessPort
  });

  logger.info("worker process ready", {
    ...createReadinessResponse(service),
    host: readinessHost,
    port: readinessPort
  });
}

startWorkers().catch((error: unknown) => {
  logger.error("worker readiness server failed", { error: serializeError(error) });
  process.exit(1);
});
