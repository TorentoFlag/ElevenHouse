import type { Logger } from "@elevenhouse/observability";

type QueueTelemetrySource = {
  readonly getJobCounts: (
    ...types: ["waiting", "active", "delayed", "failed"]
  ) => Promise<Record<string, number>>;
  readonly getJobs: (
    types: ("waiting" | "delayed")[],
    start: number,
    end: number,
    ascending: boolean
  ) => Promise<readonly { readonly timestamp: number }[]>;
};

type PeriodicQueueTelemetry = {
  readonly runOnce: () => Promise<void>;
  readonly start: () => void;
  readonly stop: () => Promise<void>;
};

type QueueTelemetryObservation = { terminal: boolean };

export function createChartQueueTelemetry(input: {
  readonly queue: QueueTelemetrySource;
  readonly intervalMs: number;
  readonly operationTimeoutMs: number;
  readonly logger: Pick<Logger, "info" | "error">;
  readonly now?: () => number;
}): PeriodicQueueTelemetry {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1) {
    throw new Error("CHART_QUEUE_TELEMETRY_INTERVAL_INVALID");
  }
  if (!Number.isSafeInteger(input.operationTimeoutMs) || input.operationTimeoutMs < 1) {
    throw new Error("CHART_QUEUE_TELEMETRY_TIMEOUT_INVALID");
  }
  const now = input.now ?? Date.now;
  let accepting = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | null = null;
  let inFlightObservation: QueueTelemetryObservation | null = null;

  const runOnce = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (inFlight) {
      if (inFlightObservation === null) {
        input.logger.error("chart calculation queue telemetry failed", {
          errorCode: "chart_queue_telemetry_state_invalid"
        });
        return Promise.reject(new Error("CHART_QUEUE_TELEMETRY_STATE_INVALID"));
      }
      return withObservedTelemetryDeadline(inFlight, inFlightObservation);
    }
    const observation: QueueTelemetryObservation = { terminal: false };
    const operation = collect(observation);
    inFlight = operation;
    inFlightObservation = observation;
    void operation.then(
      () => {
        if (inFlight === operation) {
          inFlight = null;
          inFlightObservation = null;
        }
      },
      () => {
        if (inFlight === operation) {
          inFlight = null;
          inFlightObservation = null;
        }
      }
    );
    return withObservedTelemetryDeadline(operation, observation);
  };

  const withObservedTelemetryDeadline = async (
    operation: Promise<void>,
    observation: QueueTelemetryObservation
  ): Promise<void> => {
    try {
      await withTelemetryDeadline(operation, input.operationTimeoutMs);
    } catch (error) {
      if (
        isErrorCode(error, "CHART_QUEUE_TELEMETRY_DEADLINE_EXCEEDED") &&
        markTerminal(observation)
      ) {
        input.logger.error("chart calculation queue telemetry failed", {
          errorCode: "chart_queue_telemetry_deadline_exceeded"
        });
      }
      throw error;
    }
  };

  async function collect(observation: QueueTelemetryObservation): Promise<void> {
    try {
      const [counts, waitingJobs, delayedJobs] = await Promise.all([
        input.queue.getJobCounts("waiting", "active", "delayed", "failed"),
        input.queue.getJobs(["waiting"], 0, 0, true),
        input.queue.getJobs(["delayed"], 0, 0, true)
      ]);
      const observedAt = now();
      const fields = {
        waitingDepth: toDepth(counts.waiting),
        activeDepth: toDepth(counts.active),
        delayedDepth: toDepth(counts.delayed),
        failedDepth: toDepth(counts.failed),
        oldestWaitingAgeMs: toAge(waitingJobs[0]?.timestamp, observedAt),
        oldestDelayedAgeMs: toAge(delayedJobs[0]?.timestamp, observedAt)
      };
      if (markTerminal(observation)) {
        input.logger.info("chart calculation queue telemetry", fields);
      }
    } catch (error) {
      if (markTerminal(observation)) {
        input.logger.error("chart calculation queue telemetry failed", {
          errorCode: "chart_queue_telemetry_failed"
        });
      }
      throw error;
    }
  }

  return {
    runOnce,
    start: () => {
      if (timer || !accepting) return;
      timer = setInterval(() => {
        runOnce().catch(() => undefined);
      }, input.intervalMs);
      timer.unref();
    },
    stop: async () => {
      accepting = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      await inFlight;
    }
  };
}

function toDepth(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value === undefined || value < 0) {
    throw new Error("CHART_QUEUE_TELEMETRY_DEPTH_INVALID");
  }
  return value;
}

function toAge(timestamp: number | undefined, now: number): number | null {
  if (timestamp === undefined) return null;
  if (
    !Number.isSafeInteger(timestamp) ||
    !Number.isSafeInteger(now) ||
    timestamp < 0 ||
    now < 0 ||
    timestamp > now
  ) {
    throw new Error("CHART_QUEUE_TELEMETRY_TIMESTAMP_INVALID");
  }
  return now - timestamp;
}

async function withTelemetryDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("CHART_QUEUE_TELEMETRY_DEADLINE_EXCEEDED")),
          timeoutMs
        );
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function markTerminal(observation: QueueTelemetryObservation): boolean {
  if (observation.terminal) return false;
  observation.terminal = true;
  return true;
}
