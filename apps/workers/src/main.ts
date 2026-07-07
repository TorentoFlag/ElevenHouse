import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer
} from "@elevenhouse/observability";

const service = "workers";
const logger = createLogger(service);
const readinessHost = process.env.WORKERS_HEALTH_HOST ?? "0.0.0.0";
const readinessPort = Number.parseInt(process.env.WORKERS_HEALTH_PORT ?? "3010", 10);
const readinessServer = createBasicWorkerReadinessServer({ service });

listenReadinessServer({
  server: readinessServer,
  host: readinessHost,
  port: readinessPort
})
  .then(() => {
    logger.info("worker process ready", {
      ...createReadinessResponse(service),
      host: readinessHost,
      port: readinessPort
    });
  })
  .catch((error: unknown) => {
    logger.error("worker readiness server failed", { error });
    process.exit(1);
  });
