import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer,
  parseReadinessPort,
  serializeError
} from "@elevenhouse/observability";

const service = "chart-worker";
const logger = createLogger(service);

async function startChartWorker(): Promise<void> {
  const readinessHost = process.env.CHART_WORKER_HEALTH_HOST ?? "0.0.0.0";
  const readinessPort = parseReadinessPort(process.env.CHART_WORKER_HEALTH_PORT, 3012, "CHART_WORKER_HEALTH_PORT");
  const readinessServer = createBasicWorkerReadinessServer({ service });

  await listenReadinessServer({
    server: readinessServer,
    host: readinessHost,
    port: readinessPort
  });

  logger.info("chart worker ready", {
    ...createReadinessResponse(service),
    host: readinessHost,
    port: readinessPort
  });
}

startChartWorker().catch((error: unknown) => {
  logger.error("chart worker readiness server failed", { error: serializeError(error) });
  process.exit(1);
});
