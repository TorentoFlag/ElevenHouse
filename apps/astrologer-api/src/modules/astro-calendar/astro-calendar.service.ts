import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  astroCalendarEventSchema,
  astroCalendarEventTypeValues,
  astroCalendarGenerationRequestSchema,
  astroCalendarRangeQuerySchema,
  astroCalendarRangeResponseSchema,
  type AstroCalendarEvent,
  type AstroCalendarEventType,
  type AstroCalendarRangeQuery,
  type AstroCalendarRangeResponse,
  type AstroCalendarSummary,
  type AstroCalendarWarning as ContractAstroCalendarWarning,
  type ChartSettings
} from "@elevenhouse/contracts";
import {
  buildAstroCalendarFingerprint,
  planAstroCalendarGeneration,
  type AstroCalendarGenerationRecord,
  type AstroCalendarGenerationStore,
  type AstroCalendarGenerationWithEvents,
  type AstroCalendarStoredEvent,
  type AstroCalendarWarning as DomainAstroCalendarWarning,
  type ClientStore
} from "@elevenhouse/domain";
import type { CanonicalJson } from "@elevenhouse/domain";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ASTRO_CALENDAR_GENERATION_STORE } from "./astro-calendar.tokens";

const defaultChartSettings: ChartSettings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
};
const maxHydratedClients = 500;
const generationIdParamSchema =
  astroCalendarRangeResponseSchema.shape.generation.shape.generationId.unwrap();

@Injectable()
export class AstroCalendarService {
  constructor(
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(ASTRO_CALENDAR_GENERATION_STORE)
    private readonly generationStore: AstroCalendarGenerationStore,
    private readonly clock: SystemClock
  ) {}

  async getRange(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<AstroCalendarRangeResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(astroCalendarRangeQuerySchema, query);
    const context = await this.resolveGenerationContext(
      ownerUserId,
      parsedQuery,
      defaultChartSettings
    );
    const current = await this.generationStore.findByFingerprint({
      ownerUserId,
      inputFingerprint: context.fingerprint
    });
    if (current) return toRangeResponse(current, parsedQuery, context.fingerprint);

    const latest = await this.generationStore.findLatestForRange({
      ownerUserId,
      rangeStart: parsedQuery.start,
      rangeEnd: parsedQuery.end,
      timeZone: parsedQuery.timeZone
    });

    return astroCalendarRangeResponseSchema.parse({
      schemaVersion: "astro-calendar-range.v1",
      timeZone: parsedQuery.timeZone,
      range: { start: parsedQuery.start, end: parsedQuery.end },
      generation: {
        status: "stale",
        generationId: latest?.generation.id ?? null,
        fingerprint: context.fingerprint,
        generatedAt: null,
        provider: null
      },
      events: [],
      readiness: context.readiness,
      summary: emptySummary(),
      dictionaryCodes: [],
      warnings: context.warnings
    });
  }

  async createGeneration(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<AstroCalendarRangeResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedBody = parseContract(astroCalendarGenerationRequestSchema, body);
    const context = await this.resolveGenerationContext(
      ownerUserId,
      parsedBody,
      parsedBody.settings
    );
    const generation = await this.generationStore.createCalculating({
      ownerUserId,
      inputFingerprint: context.fingerprint,
      rangeStart: parsedBody.start,
      rangeEnd: parsedBody.end,
      timeZone: parsedBody.timeZone,
      requestSnapshot: {
        range: { start: parsedBody.start, end: parsedBody.end },
        scope: parsedBody.scope,
        clientIds: context.clientIds,
        eventTypes: context.eventTypes
      },
      settingsSnapshot: parsedBody.settings,
      readinessSummary: context.readiness,
      warnings: context.warnings,
      now: this.clock.now().toISOString()
    });

    return toRangeResponse({ generation, events: [] }, parsedBody, context.fingerprint);
  }

  async retryGeneration(
    generationId: string,
    request: AstrologerSessionRequest
  ): Promise<AstroCalendarRangeResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedGenerationId = parseContract(generationIdParamSchema, generationId);
    const generation = await this.generationStore.markCalculating({
      ownerUserId,
      generationId: parsedGenerationId,
      now: this.clock.now().toISOString()
    });
    if (!generation) {
      throw new NotFoundException({
        statusCode: 404,
        error: "ASTRO_CALENDAR_GENERATION_NOT_RETRYABLE",
        code: "ASTRO_CALENDAR_GENERATION_NOT_RETRYABLE",
        message: "Astro calendar generation was not found or is not retryable"
      });
    }

    return toRangeResponse(
      { generation, events: [] },
      rangeFromGeneration(generation),
      generation.inputFingerprint
    );
  }

  private async resolveGenerationContext(
    ownerUserId: string,
    input: AstroCalendarRangeQuery,
    settings: ChartSettings
  ) {
    const eventTypes = normalizeEventTypes(input.scope, input.eventTypes);
    const { clients, warnings } = await this.resolveClients(ownerUserId, input);
    const generationPlan = planAstroCalendarGeneration({
      clients: clients.map((client) => ({
        clientId: client.clientUserId,
        displayName: client.displayName ?? "Клиент",
        birthDate: client.birthData?.birthDate ?? null,
        birthTime: client.birthData?.birthTime ?? null,
        birthTimePrecision: client.birthData?.birthTimePrecision ?? "unknown",
        birthTimezone: client.birthData?.birthTimezone ?? null,
        birthLatitude: client.birthData?.birthLatitude ?? null,
        birthLongitude: client.birthData?.birthLongitude ?? null
      }))
    });
    const clientIds = clients.map((client) => client.clientUserId);
    const fingerprint = buildAstroCalendarFingerprint({
      astrologerId: ownerUserId,
      range: { start: input.start, end: input.end },
      timeZone: input.timeZone,
      clientIds,
      eventTypes,
      settings: settings as unknown as CanonicalJson
    }).value;

    return {
      clientIds,
      eventTypes,
      fingerprint,
      readiness: generationPlan.readiness,
      warnings: [...generationPlan.warnings, ...warnings]
    };
  }

  private async resolveClients(ownerUserId: string, input: AstroCalendarRangeQuery) {
    if (input.scope === "global") {
      return { clients: [], warnings: [] as DomainAstroCalendarWarning[] };
    }

    if (input.clientIds.length > 0) {
      const clients = await Promise.all(
        input.clientIds.map((clientUserId) =>
          this.clientStore.getAstrologerClient({ astrologerUserId: ownerUserId, clientUserId })
        )
      );
      if (clients.some((client) => client === null)) {
        throw new ForbiddenException({
          statusCode: 403,
          error: "ASTRO_CALENDAR_CLIENT_FORBIDDEN",
          code: "ASTRO_CALENDAR_CLIENT_FORBIDDEN",
          message: "Client is outside the astrologer scope"
        });
      }
      return {
        clients: clients.filter((client) => client !== null),
        warnings: [] as DomainAstroCalendarWarning[]
      };
    }

    const list = await this.clientStore.listAstrologerClients({
      astrologerUserId: ownerUserId,
      query: "",
      limit: maxHydratedClients,
      offset: 0
    });
    const warnings: DomainAstroCalendarWarning[] =
      list.total > list.clients.length
        ? [
            {
              code: "CLIENT_SCOPE_TRUNCATED",
              severity: "warning",
              message: "Список клиентов для astro calendar ограничен первыми 500 записями.",
              clientId: null,
              eventId: null,
              dictionaryCode: null,
              action: null
            }
          ]
        : [];
    return { clients: list.clients, warnings };
  }
}

function normalizeEventTypes(
  scope: AstroCalendarRangeQuery["scope"],
  requested: readonly AstroCalendarEventType[]
): readonly AstroCalendarEventType[] {
  const selected = requested.length > 0 ? requested : astroCalendarEventTypeValues;
  if (scope === "global") return selected.filter((type) => type.startsWith("global."));
  if (scope === "client") return selected.filter((type) => type.startsWith("client."));
  return selected;
}

function toRangeResponse(
  stored: AstroCalendarGenerationWithEvents,
  range: { readonly start: string; readonly end: string; readonly timeZone: string },
  fingerprint: string
): AstroCalendarRangeResponse {
  const events = stored.generation.status === "ready" ? stored.events.map(toContractEvent) : [];
  const warnings = [
    ...(stored.generation.warnings as readonly ContractAstroCalendarWarning[]),
    ...failedWarning(stored.generation)
  ];
  return astroCalendarRangeResponseSchema.parse({
    schemaVersion: "astro-calendar-range.v1",
    timeZone: range.timeZone,
    range: { start: range.start, end: range.end },
    generation: {
      status: stored.generation.status,
      generationId: stored.generation.id,
      fingerprint,
      generatedAt: stored.generation.generatedAt,
      provider: stored.generation.provider
    },
    events,
    readiness: stored.generation.readinessSummary,
    summary: stored.generation.status === "ready" ? stored.generation.summary : emptySummary(),
    dictionaryCodes: collectDictionaryCodes(events, warnings),
    warnings
  });
}

function toContractEvent(event: AstroCalendarStoredEvent): AstroCalendarEvent {
  return astroCalendarEventSchema.parse(event.payload);
}

function failedWarning(
  generation: AstroCalendarGenerationRecord
): readonly ContractAstroCalendarWarning[] {
  if (generation.status !== "failed") return [];
  return [
    {
      code: "GENERATION_FAILED",
      severity: "error",
      message: generation.errorMessage ?? "Расчет astro calendar завершился ошибкой.",
      clientId: null,
      eventId: null,
      dictionaryCode: null,
      action: null
    }
  ];
}

function collectDictionaryCodes(
  events: readonly AstroCalendarEvent[],
  warnings: readonly ContractAstroCalendarWarning[]
): readonly string[] {
  return [
    ...new Set([
      ...events.flatMap((event) => event.dictionaryCodes),
      ...warnings.flatMap((warning) => (warning.dictionaryCode ? [warning.dictionaryCode] : []))
    ])
  ];
}

function emptySummary(): AstroCalendarSummary {
  return {
    eventCount: 0,
    globalEventCount: 0,
    clientEventCount: 0,
    byType: {},
    byTone: {}
  };
}

function rangeFromGeneration(generation: AstroCalendarGenerationRecord) {
  return {
    start: generation.rangeStart,
    end: generation.rangeEnd,
    timeZone: generation.timeZone
  };
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      statusCode: 400,
      error: "ASTRO_CALENDAR_INVALID_REQUEST",
      code: "ASTRO_CALENDAR_INVALID_REQUEST",
      message: "Invalid astro calendar request"
    });
  }
  return result.data;
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return ownerUserId;
}
