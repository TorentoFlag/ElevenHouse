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
}): Promise<void> {
  const current = await input.store.findById({ generationId: input.generationId });
  if (!current) throw new UnrecoverableError("Astro calendar generation was not found");
  if (current.generation.status === "ready") return;
  if (current.generation.status !== "calculating") {
    throw new UnrecoverableError("Astro calendar generation is not calculating");
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
      throw new ChartEnginePermanentError("Chart engine did not return a ready astro calendar");
    }
    const completed = await input.store.markReady({
      ownerUserId: current.generation.ownerUserId,
      generationId: current.generation.id,
      provider: response.generation.provider,
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
      generatedAt: response.generation.generatedAt,
      now: input.now.toISOString()
    });
    if (!completed) throw new Error("Astro calendar generation completion could not be persisted");
  } catch (error) {
    if (error instanceof ChartEnginePermanentError || error instanceof UnrecoverableError) {
      if (error instanceof ChartEnginePermanentError) {
        await input.store.markFailed({
          ownerUserId: current.generation.ownerUserId,
          generationId: current.generation.id,
          errorCode: "provider_invalid_result",
          errorMessage: normalizeErrorMessage(error),
          now: input.now.toISOString()
        });
      }
      throw createUnrecoverableError(error);
    }
    if (input.finalAttempt) {
      await input.store.markFailed({
        ownerUserId: current.generation.ownerUserId,
        generationId: current.generation.id,
        errorCode: "retry_exhausted",
        errorMessage: normalizeErrorMessage(error),
        now: input.now.toISOString()
      });
    }
    throw error;
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

function createUnrecoverableError(error: Error): UnrecoverableError {
  if (error instanceof UnrecoverableError) return error;
  const unrecoverableError = new UnrecoverableError(error.message);
  unrecoverableError.cause = error;
  return unrecoverableError;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Astro calendar generation failed";
}
