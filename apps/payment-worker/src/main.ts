import { createLogger } from "@elevenhouse/observability";
import { createWorkerReadiness } from "./readiness";

const logger = createLogger("payment-worker");

logger.info("payment worker ready", createWorkerReadiness("payment-worker"));
