import { createLogger } from "@elevenhouse/observability";
import { createWorkerReadiness } from "./readiness";

const logger = createLogger("chart-worker");

logger.info("chart worker ready", createWorkerReadiness("chart-worker"));
