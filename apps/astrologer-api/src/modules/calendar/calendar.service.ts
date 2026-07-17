import { HttpException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  AvailabilityScheduleNotFoundError,
  CalendarRangeValidationError,
  IdempotencyKeyReuseError,
  ManualCalendarBlockConflictError,
  ManualCalendarBlockNotFoundError,
  ManualCalendarBlockValidationError,
  createManualCalendarBlock,
  getDefaultAvailabilitySchedule,
  projectAvailabilityBackgrounds,
  readCalendarRange,
  releaseManualCalendarBlock,
  type AvailabilityStore,
  type CalendarReadStore,
  type ManualCalendarBlock,
  type ManualCalendarBlockCommandStore
} from "@elevenhouse/domain";
import {
  calendarRangeQuerySchema,
  calendarRangeResponseSchema,
  createManualBlockRequestSchema,
  manualBlockParamsSchema,
  manualBlockResponseSchema,
  type CalendarRangeResponse,
  type ManualBlockResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AVAILABILITY_STORE } from "../availability/availability.tokens";
import { CALENDAR_READ_STORE, MANUAL_BLOCK_COMMAND_STORE } from "./calendar.tokens";

@Injectable()
export class CalendarService {
  constructor(
    @Inject(AVAILABILITY_STORE) private readonly availabilityStore: AvailabilityStore,
    @Inject(CALENDAR_READ_STORE) private readonly readStore: CalendarReadStore,
    @Inject(MANUAL_BLOCK_COMMAND_STORE)
    private readonly commandStore: ManualCalendarBlockCommandStore,
    private readonly clock: SystemClock
  ) {}

  getRange(query: unknown, request: AstrologerSessionRequest): Promise<CalendarRangeResponse> {
    return mapCalendarErrors(async () => {
      const range = parseContract(calendarRangeQuerySchema, query, "Invalid calendar range");
      const ownerUserId = requireOwnerUserId(request);
      const [readModel, schedule] = await Promise.all([
        readCalendarRange({
          store: this.readStore,
          ownerUserId,
          startAt: range.start,
          endAt: range.end
        }),
        getDefaultAvailabilitySchedule({ store: this.availabilityStore, ownerUserId })
      ]);
      return calendarRangeResponseSchema.parse({
        timeZone: range.timeZone,
        range: { start: range.start, end: range.end },
        entries: readModel.entries,
        availability: projectAvailabilityBackgrounds({
          schedule,
          rangeStartAt: range.start,
          rangeEndAt: range.end
        }),
        summary: readModel.summary
      });
    });
  }

  createBlock(
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<ManualBlockResponse> {
    return mapCalendarErrors(async () => {
      const parsedBody = parseContract(
        createManualBlockRequestSchema,
        body,
        "Invalid manual block request"
      );
      const result = await createManualCalendarBlock({
        availabilityStore: this.availabilityStore,
        commandStore: this.commandStore,
        ownerUserId: requireOwnerUserId(request),
        idempotencyKey: idempotencyKey ?? "",
        input: parsedBody,
        now: this.clock.now()
      });
      return manualBlockResponseSchema.parse({
        block: toBlockResponse(result.block),
        replayed: result.replayed
      });
    });
  }

  releaseBlock(blockId: string, request: AstrologerSessionRequest): Promise<ManualBlockResponse> {
    return mapCalendarErrors(async () => {
      const params = parseContract(
        manualBlockParamsSchema,
        { blockId },
        "Invalid manual block identifier"
      );
      const block = await releaseManualCalendarBlock({
        commandStore: this.commandStore,
        ownerUserId: requireOwnerUserId(request),
        blockId: params.blockId,
        now: this.clock.now()
      });
      return manualBlockResponseSchema.parse({ block: toBlockResponse(block), replayed: false });
    });
  }
}

function toBlockResponse(block: ManualCalendarBlock) {
  return {
    id: block.id,
    reservationId: block.reservationId,
    title: block.title,
    state: block.state,
    startAt: block.startAt,
    endAt: block.endAt,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt
  };
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw calendarHttpError(400, "invalid_request", message);
  return result.data;
}

async function mapCalendarErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof AvailabilityScheduleNotFoundError) {
      throw calendarHttpError(404, error.code, error.message);
    }
    if (error instanceof ManualCalendarBlockNotFoundError) {
      throw calendarHttpError(404, error.code, error.message);
    }
    if (error instanceof ManualCalendarBlockConflictError) {
      throw calendarHttpError(409, error.code, error.message);
    }
    if (error instanceof IdempotencyKeyReuseError) {
      throw calendarHttpError(409, error.code, error.message);
    }
    if (
      error instanceof ManualCalendarBlockValidationError ||
      error instanceof CalendarRangeValidationError
    ) {
      throw calendarHttpError(400, error.code, error.message);
    }
    throw error;
  }
}

function calendarHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
