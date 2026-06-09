import { createLogger } from "@elevenhouse/observability";
import { createWorkerReadiness } from "./readiness";

const logger = createLogger("notification-worker");

logger.info("notification worker ready", createWorkerReadiness("notification-worker"));
