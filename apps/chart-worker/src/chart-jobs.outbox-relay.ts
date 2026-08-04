import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT,
  CHART_CALCULATION_REQUESTED_EVENT,
  type ChartJobProcessingStore
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { z } from "@elevenhouse/validation";
import {
  astroCalendarGenerationJobName,
  chartCalculationJobName,
  toAstroCalendarGenerationJobOptions,
  toChartCalculationJobOptions,
  type ChartCalculationQueue,
  type ChartCalculationQueueOptions
} from "./chart-jobs.queue";

const chartCalculationPayloadSchema = z.object({ jobId: z.string().uuid() }).strict();
const astroCalendarGenerationPayloadSchema = z.object({ generationId: z.string().uuid() }).strict();

export function createChartCalculationOutboxRelay(input: {
  readonly relayOnce: () => Promise<void>;
  readonly intervalMs: number;
  readonly operationTimeoutMs: number;
  readonly onError?: (error: unknown) => void;
}) {
  let accepting = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | null = null;

  const runOnce = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (inFlight) return withRelayDeadline(inFlight, input.operationTimeoutMs);
    const operation = Promise.resolve().then(input.relayOnce);
    inFlight = operation;
    void operation.then(
      () => {
        if (inFlight === operation) inFlight = null;
      },
      () => {
        if (inFlight === operation) inFlight = null;
      }
    );
    return withRelayDeadline(operation, input.operationTimeoutMs);
  };

  return {
    runOnce,
    start: () => {
      if (timer || !accepting) return;
      timer = setInterval(() => {
        runOnce().catch((error: unknown) => input.onError?.(error));
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

async function withRelayDeadline(operation: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("CHART_OUTBOX_RELAY_DEADLINE_EXCEEDED")),
          timeoutMs
        );
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function relayPendingChartCalculationEvents(input: {
  readonly store: OutboxRelayStore;
  readonly chartJobs: Pick<ChartJobProcessingStore, "getQueueDispatch">;
  readonly queue: Pick<ChartCalculationQueue, "add">;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly queueOptions: ChartCalculationQueueOptions;
  readonly astroCalendarAttempts: number;
  readonly logger?: Logger;
}): Promise<number> {
  const events = await input.store.claimPending({
    eventTypes: [CHART_CALCULATION_REQUESTED_EVENT, ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });

  for (const event of events) {
    let noLongerDispatchable = false;
    try {
      if (event.eventType === CHART_CALCULATION_REQUESTED_EVENT) {
        const data = chartCalculationPayloadSchema.parse(event.payload);
        if (event.aggregateId !== data.jobId) {
          throw new Error("Chart calculation event aggregate does not match its payload");
        }
        const dispatch = await input.chartJobs.getQueueDispatch(data.jobId);
        if (dispatch === null) {
          noLongerDispatchable = true;
        } else {
          const delivery = await input.queue.add(
            chartCalculationJobName,
            data,
            toChartCalculationJobOptions({
              ...input.queueOptions,
              jobId: data.jobId,
              durableAttempts: dispatch.attempts,
              maxAttempts: dispatch.maxAttempts
            })
          );
          const deliveryState = await delivery.getState();
          if (deliveryState === "failed" || deliveryState === "completed") {
            await delivery.retry(deliveryState, {
              resetAttemptsMade: true,
              resetAttemptsStarted: true
            });
          }
        }
      } else if (event.eventType === ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT) {
        const data = astroCalendarGenerationPayloadSchema.parse(event.payload);
        if (event.aggregateId !== data.generationId) {
          throw new Error("Astro calendar event aggregate does not match its payload");
        }
        await input.queue.add(
          astroCalendarGenerationJobName,
          data,
          toAstroCalendarGenerationJobOptions({
            ...input.queueOptions,
            generationId: data.generationId,
            attempts: input.astroCalendarAttempts
          })
        );
      } else {
        throw new Error(`Unsupported chart worker outbox event type: ${event.eventType}`);
      }
    } catch {
      const errorMessage = "Chart calculation delivery could not be published";
      await input.store.markPublishFailed({
        eventId: event.id,
        claimFence: event.claimFence,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage
      });
      input.logger?.error("chart calculation outbox event publish failed", {
        outboxEventId: event.id,
        attempts: event.attempts,
        errorCode: "chart_outbox_publish_failed"
      });
      continue;
    }

    await input.store.markPublished({
      eventId: event.id,
      claimFence: event.claimFence,
      publishedAt: input.now
    });
    if (noLongerDispatchable) {
      input.logger?.warn("chart calculation outbox event is no longer dispatchable", {
        outboxEventId: event.id,
        aggregateId: event.aggregateId
      });
    } else {
      input.logger?.info("chart calculation outbox event published", {
        outboxEventId: event.id,
        aggregateId: event.aggregateId
      });
    }
  }
  return events.length;
}

function nextBackoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}
