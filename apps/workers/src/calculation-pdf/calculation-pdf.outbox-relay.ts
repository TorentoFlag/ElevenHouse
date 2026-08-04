import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  CALCULATION_PDF_REQUESTED_EVENT
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { z } from "@elevenhouse/validation";
import {
  calculationPdfDeleteJobName,
  calculationPdfRenderJobName,
  toCalculationPdfJobOptions,
  type CalculationPdfDeleteJobData,
  type CalculationPdfQueue,
  type CalculationPdfQueueOptions,
  type CalculationPdfRenderJobData
} from "./calculation-pdf.queue";

const renderPayloadSchema = z.object({ jobId: z.string().uuid() }).strict();
const deletePayloadSchema = z.object({ mediaAssetId: z.string().uuid() }).strict();

export function createCalculationPdfOutboxRelay(input: {
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

export async function relayPendingCalculationPdfEvents(input: {
  readonly store: OutboxRelayStore;
  readonly queue: CalculationPdfQueue;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly queueOptions: CalculationPdfQueueOptions;
  readonly logger?: Logger;
}): Promise<number> {
  const events = await input.store.claimPending({
    eventTypes: [CALCULATION_PDF_REQUESTED_EVENT, CALCULATION_PDF_DELETE_REQUESTED_EVENT],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });

  for (const event of events) {
    try {
      const queueJob = parseQueueJob(event.eventType, event.aggregateId, event.payload);
      const jobOptions =
        queueJob.name === calculationPdfRenderJobName
          ? toCalculationPdfJobOptions({
              ...input.queueOptions,
              jobName: queueJob.name,
              data: queueJob.data
            })
          : toCalculationPdfJobOptions({
              ...input.queueOptions,
              jobName: queueJob.name,
              data: queueJob.data
            });
      await input.queue.add(queueJob.name, queueJob.data, jobOptions);
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error);
      await input.store.markPublishFailed({
        eventId: event.id,
        claimFence: event.claimFence,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage
      });
      input.logger?.error("calculation PDF outbox event publish failed", {
        outboxEventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts,
        errorMessage
      });
      continue;
    }

    await input.store.markPublished({
      eventId: event.id,
      claimFence: event.claimFence,
      publishedAt: input.now
    });
    input.logger?.info("calculation PDF outbox event published", {
      outboxEventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId
    });
  }
  return events.length;
}

function parseQueueJob(
  eventType: string,
  aggregateId: string,
  payload: unknown
):
  | {
      readonly name: typeof calculationPdfRenderJobName;
      readonly data: CalculationPdfRenderJobData;
    }
  | {
      readonly name: typeof calculationPdfDeleteJobName;
      readonly data: CalculationPdfDeleteJobData;
    } {
  if (eventType === CALCULATION_PDF_REQUESTED_EVENT) {
    const data = renderPayloadSchema.parse(payload);
    assertAggregateMatches(aggregateId, data.jobId);
    return { name: calculationPdfRenderJobName, data };
  }
  if (eventType === CALCULATION_PDF_DELETE_REQUESTED_EVENT) {
    const data = deletePayloadSchema.parse(payload);
    assertAggregateMatches(aggregateId, data.mediaAssetId);
    return { name: calculationPdfDeleteJobName, data };
  }
  throw new Error("Unsupported calculation PDF event type");
}

function assertAggregateMatches(aggregateId: string, payloadId: string): void {
  if (aggregateId !== payloadId) {
    throw new Error("Calculation PDF event aggregate does not match its payload");
  }
}

function nextBackoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Calculation PDF outbox relay failed";
}
