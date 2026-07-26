import {
  astroCalendarGenerationRequestSchema,
  astroCalendarRangeQuerySchema,
  astroCalendarRangeResponseSchema,
  type AstroCalendarGenerationRequest,
  type AstroCalendarRangeQuery,
  type AstroCalendarRangeResponse
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import { application } from "../../../Application";

const generationIdSchema = z.string().uuid();

export async function getAstroCalendarRange(
  query: AstroCalendarRangeQuery
): Promise<AstroCalendarRangeResponse> {
  const parsed = astroCalendarRangeQuerySchema.parse(query);
  const search = new URLSearchParams({
    start: parsed.start,
    end: parsed.end,
    timeZone: parsed.timeZone,
    scope: parsed.scope
  });

  if (parsed.clientIds.length > 0) {
    search.set("clientIds", parsed.clientIds.join(","));
  }

  if (parsed.eventTypes.length > 0) {
    search.set("eventTypes", parsed.eventTypes.join(","));
  }

  return astroCalendarRangeResponseSchema.parse(
    await application.http.get(`/astro-calendar/range?${search.toString()}`)
  );
}

export async function createAstroCalendarGeneration(
  input: AstroCalendarGenerationRequest
): Promise<AstroCalendarRangeResponse> {
  const body = astroCalendarGenerationRequestSchema.parse(input);

  return astroCalendarRangeResponseSchema.parse(
    await application.http.post("/astro-calendar/generations", body, { csrf: true })
  );
}

export async function retryAstroCalendarGeneration(
  generationId: string
): Promise<AstroCalendarRangeResponse> {
  const parsedGenerationId = generationIdSchema.parse(generationId);

  return astroCalendarRangeResponseSchema.parse(
    await application.http.post(
      `/astro-calendar/generations/${parsedGenerationId}/retry`,
      undefined,
      { csrf: true }
    )
  );
}
