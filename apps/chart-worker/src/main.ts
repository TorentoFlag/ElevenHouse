import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer
} from "@elevenhouse/observability";

const service = "chart-worker";
const logger = createLogger(service);
const readinessHost = process.env.CHART_WORKER_HEALTH_HOST ?? "0.0.0.0";
const readinessPort = Number.parseInt(process.env.CHART_WORKER_HEALTH_PORT ?? "3012", 10);
const readinessServer = createBasicWorkerReadinessServer({ service });

listenReadinessServer({
  server: readinessServer,
  host: readinessHost,
  port: readinessPort
})
  .then(() => {
    logger.info("chart worker ready", {
      ...createReadinessResponse(service),
      host: readinessHost,
      port: readinessPort
    });
  })
  .catch((error: unknown) => {
    logger.error("chart worker readiness server failed", { error });
    process.exit(1);
  });
