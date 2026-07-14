import { MATRIX_PDF_REQUESTED_EVENT } from "@elevenhouse/domain";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import type { Logger } from "@elevenhouse/observability";
import { z } from "@elevenhouse/validation";
import {
  matrixPdfJobName,
  toMatrixPdfJobOptions,
  type MatrixPdfQueue,
  type MatrixPdfQueueOptions
} from "./matrix-pdf.queue";

const payloadSchema = z.object({
  jobId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  calculationId: z.string().uuid()
});

export async function relayPendingMatrixPdfEvents(input: {
  readonly store: OutboxRelayStore;
  readonly queue: MatrixPdfQueue;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly queueOptions: MatrixPdfQueueOptions;
  readonly logger?: Logger;
}): Promise<number> {
  const events = await input.store.claimPending({
    eventTypes: [MATRIX_PDF_REQUESTED_EVENT],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });

  for (const event of events) {
    try {
      if (event.eventType !== MATRIX_PDF_REQUESTED_EVENT) {
        throw new Error(`Unsupported Matrix PDF event type: ${event.eventType}`);
      }
      const payload = payloadSchema.parse(event.payload);
      if (event.aggregateId !== payload.jobId) {
        throw new Error("Matrix PDF event aggregate does not match its job");
      }
      await input.queue.add(
        matrixPdfJobName,
        { jobId: payload.jobId },
        toMatrixPdfJobOptions({ ...input.queueOptions, jobId: payload.jobId })
      );
      await input.store.markPublished({ eventId: event.id, publishedAt: input.now });
      input.logger?.info("matrix PDF outbox event published", {
        outboxEventId: event.id,
        jobId: payload.jobId
      });
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error);
      await input.store.markPublishFailed({
        eventId: event.id,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage
      });
      input.logger?.error("matrix PDF outbox event publish failed", {
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
  return "Matrix PDF outbox relay failed";
}
