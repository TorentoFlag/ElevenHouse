import { ChartEnginePermanentError } from "@elevenhouse/chart-engine-client";
import {
  astroCalendarClientInputSnapshotSchema,
  astroCalendarEventTypeSchema,
  astroCalendarRangeResponseSchema,
  astroCalendarScopeSchema,
  chartSettingsSchema,
  type AstroCalendarGenerationRequest,
  type AstroCalendarRangeResponse
} from "@elevenhouse/contracts";
import type { AstroCalendarGenerationStore } from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";
import { UnrecoverableError } from "bullmq";

export type AstroCalendarEngineClient = {
  readonly calculateAstroCalendarRange: (
    payload: AstroCalendarGenerationRequest
  ) => Promise<AstroCalendarRangeResponse>;
};

const requestSnapshotSchema = z
  .object({
    range: z
      .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .strict(),
    scope: astroCalendarScopeSchema,
    clientIds: z.array(z.string().uuid()),
    clients: z.array(astroCalendarClientInputSnapshotSchema).max(500).optional().default([]),
    eventTypes: z.array(astroCalendarEventTypeSchema)
  })
  .strict();

export async function processAstroCalendarGenerationJob(input: {
  readonly generationId: string;
  readonly finalAttempt: boolean;
  readonly store: AstroCalendarGenerationStore;
  readonly engine: AstroCalendarEngineClient;
  readonly now: Date;
  readonly storageOperationTimeoutMs: number;
}): Promise<void> {
  let current: Awaited<ReturnType<AstroCalendarGenerationStore["findById"]>>;
  try {
    current = await runAstroCalendarStorageOperation(
      () => input.store.findById({ generationId: input.generationId }),
      input.storageOperationTimeoutMs
    );
  } catch {
    throw new Error("ASTRO_CALENDAR_STORAGE_FAILURE");
  }
  if (!current) throw new UnrecoverableError("ASTRO_CALENDAR_GENERATION_NOT_FOUND");
  if (current.generation.status === "ready") return;
  if (current.generation.status !== "calculating") {
    throw new UnrecoverableError("ASTRO_CALENDAR_GENERATION_NOT_CALCULATING");
  }

  try {
    const request = toChartEngineRequest(current.generation);
    const response = astroCalendarRangeResponseSchema.parse(
      await input.engine.calculateAstroCalendarRange(request)
    );
    if (
      response.generation.status !== "ready" ||
      response.generation.provider === null ||
      response.generation.generatedAt === null
    ) {
      throw new ChartEnginePermanentError("CHART_ENGINE_RESPONSE_INVALID_SCHEMA");
    }
    const provider = response.generation.provider;
    const generatedAt = response.generation.generatedAt;
    const completed = await runAstroCalendarStorageOperation(
      () =>
        input.store.markReady({
          ownerUserId: current.generation.ownerUserId,
          generationId: current.generation.id,
          provider,
          readinessSummary: current.generation.readinessSummary,
          summary: response.summary,
          warnings: [...current.generation.warnings, ...response.warnings],
          events: response.events.map((event) => ({
            eventId: event.id,
            source: event.source,
            type: event.type,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            payload: event,
            dictionaryCodes: event.dictionaryCodes
          })),
          generatedAt,
          now: input.now.toISOString()
        }),
      input.storageOperationTimeoutMs
    );
    if (!completed) throw new Error("ASTRO_CALENDAR_COMPLETION_REJECTED");
  } catch (error) {
    if (
      error instanceof ChartEnginePermanentError ||
      error instanceof z.ZodError ||
      error instanceof UnrecoverableError
    ) {
      if (error instanceof UnrecoverableError) throw error;
      try {
        await runAstroCalendarStorageOperation(
          () =>
            input.store.markFailed({
              ownerUserId: current.generation.ownerUserId,
              generationId: current.generation.id,
              errorCode:
                error instanceof ChartEnginePermanentError
                  ? "provider_invalid_result"
                  : "job_input_invalid",
              errorMessage:
                error instanceof ChartEnginePermanentError
                  ? "Chart engine returned an invalid AstroCalendar result"
                  : "AstroCalendar job input is invalid",
              now: input.now.toISOString()
            }),
          input.storageOperationTimeoutMs
        );
      } catch {
        throw new Error("ASTRO_CALENDAR_STORAGE_FAILURE");
      }
      throw createUnrecoverableError(
        error instanceof ChartEnginePermanentError
          ? "ASTRO_CALENDAR_PROVIDER_INVALID_RESULT"
          : "ASTRO_CALENDAR_JOB_INPUT_INVALID"
      );
    }
    if (input.finalAttempt) {
      try {
        await runAstroCalendarStorageOperation(
          () =>
            input.store.markFailed({
              ownerUserId: current.generation.ownerUserId,
              generationId: current.generation.id,
              errorCode: "retry_exhausted",
              errorMessage: "AstroCalendar generation failed after configured retries",
              now: input.now.toISOString()
            }),
          input.storageOperationTimeoutMs
        );
      } catch {
        throw new Error("ASTRO_CALENDAR_STORAGE_FAILURE");
      }
    }
    throw createAstroCalendarTransientError();
  }
}

function toChartEngineRequest(
  generation: Awaited<ReturnType<AstroCalendarGenerationStore["createCalculating"]>>
): AstroCalendarGenerationRequest {
  const requestSnapshot = requestSnapshotSchema.parse(generation.requestSnapshot);
  return {
    start: requestSnapshot.range.start,
    end: requestSnapshot.range.end,
    timeZone: generation.timeZone,
    scope: requestSnapshot.scope,
    clientIds: requestSnapshot.clientIds,
    clients: requestSnapshot.clients,
    eventTypes: requestSnapshot.eventTypes,
    settings: chartSettingsSchema.parse(generation.settingsSnapshot)
  };
}

function createUnrecoverableError(code: string): UnrecoverableError {
  return new UnrecoverableError(code);
}

function createAstroCalendarTransientError(): Error {
  return new Error("ASTRO_CALENDAR_TRANSIENT_FAILURE");
}

async function runAstroCalendarStorageOperation<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("ASTRO_CALENDAR_STORAGE_DEADLINE_EXCEEDED")),
          timeoutMs
        );
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
