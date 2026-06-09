import { createLogger } from "@elevenhouse/observability";
import { createWorkerReadiness } from "./readiness";

const logger = createLogger("workers");

logger.info("worker process ready", createWorkerReadiness("workers"));
