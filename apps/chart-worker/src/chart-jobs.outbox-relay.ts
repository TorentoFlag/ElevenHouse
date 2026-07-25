import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT,
  CHART_CALCULATION_REQUESTED_EVENT
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
  readonly onError?: (error: unknown) => void;
}) {
  let accepting = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | null = null;

  const runOnce = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (inFlight) return inFlight;
    const operation = input.relayOnce().finally(() => {
      if (inFlight === operation) inFlight = null;
    });
    inFlight = operation;
    return operation;
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

export async function relayPendingChartCalculationEvents(input: {
  readonly store: OutboxRelayStore;
  readonly queue: Pick<ChartCalculationQueue, "add">;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly queueOptions: ChartCalculationQueueOptions;
  readonly logger?: Logger;
}): Promise<number> {
  const events = await input.store.claimPending({
    eventTypes: [CHART_CALCULATION_REQUESTED_EVENT, ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });

  for (const event of events) {
    try {
      if (event.eventType === CHART_CALCULATION_REQUESTED_EVENT) {
        const data = chartCalculationPayloadSchema.parse(event.payload);
        if (event.aggregateId !== data.jobId) {
          throw new Error("Chart calculation event aggregate does not match its payload");
        }
        await input.queue.add(
          chartCalculationJobName,
          data,
          toChartCalculationJobOptions({ ...input.queueOptions, jobId: data.jobId })
        );
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
            generationId: data.generationId
          })
        );
      } else {
        throw new Error(`Unsupported chart worker outbox event type: ${event.eventType}`);
      }
      await input.store.markPublished({ eventId: event.id, publishedAt: input.now });
      input.logger?.info("chart calculation outbox event published", {
        outboxEventId: event.id,
        aggregateId: event.aggregateId
      });
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error);
      await input.store.markPublishFailed({
        eventId: event.id,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage
      });
      input.logger?.error("chart calculation outbox event publish failed", {
        outboxEventId: event.id,
        attempts: event.attempts,
        errorMessage
      });
    }
  }
  return events.length;
}

function nextBackoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Chart calculation outbox relay failed";
}
