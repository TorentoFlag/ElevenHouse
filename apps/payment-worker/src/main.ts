import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer,
  parseReadinessPort,
  serializeError
} from "@elevenhouse/observability";

const service = "payment-worker";
const logger = createLogger(service);

async function startPaymentWorker(): Promise<void> {
  const readinessHost = process.env.PAYMENT_WORKER_HEALTH_HOST ?? "0.0.0.0";
  const readinessPort = parseReadinessPort(process.env.PAYMENT_WORKER_HEALTH_PORT, 3011, "PAYMENT_WORKER_HEALTH_PORT");
  const readinessServer = createBasicWorkerReadinessServer({ service });

  await listenReadinessServer({
    server: readinessServer,
    host: readinessHost,
    port: readinessPort
  });

  logger.info("payment worker ready", {
    ...createReadinessResponse(service),
    host: readinessHost,
    port: readinessPort
  });
}

startPaymentWorker().catch((error: unknown) => {
  logger.error("payment worker readiness server failed", { error: serializeError(error) });
  process.exit(1);
});
