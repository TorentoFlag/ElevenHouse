import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer
} from "@elevenhouse/observability";

const service = "payment-worker";
const logger = createLogger(service);
const readinessHost = process.env.PAYMENT_WORKER_HEALTH_HOST ?? "0.0.0.0";
const readinessPort = Number.parseInt(process.env.PAYMENT_WORKER_HEALTH_PORT ?? "3011", 10);
const readinessServer = createBasicWorkerReadinessServer({ service });

listenReadinessServer({
  server: readinessServer,
  host: readinessHost,
  port: readinessPort
})
  .then(() => {
    logger.info("payment worker ready", {
      ...createReadinessResponse(service),
      host: readinessHost,
      port: readinessPort
    });
  })
  .catch((error: unknown) => {
    logger.error("payment worker readiness server failed", { error });
    process.exit(1);
  });
