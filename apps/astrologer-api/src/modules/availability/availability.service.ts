import { HttpException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  AvailabilityProductNotBookableError,
  AvailabilityScheduleNotFoundError,
  AvailabilityValidationError,
  AvailabilityVersionConflictError,
  getDefaultAvailabilitySchedule,
  putDefaultAvailabilitySchedule,
  type AvailabilityProductReader,
  type AvailabilitySchedule,
  type AvailabilityStore
} from "@elevenhouse/domain";
import {
  availabilityScheduleResponseSchema,
  putDefaultAvailabilityScheduleRequestSchema,
  type AvailabilityScheduleResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AVAILABILITY_PRODUCT_READER, AVAILABILITY_STORE } from "./availability.tokens";

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(AVAILABILITY_STORE) private readonly store: AvailabilityStore,
    @Inject(AVAILABILITY_PRODUCT_READER)
    private readonly productReader: AvailabilityProductReader,
    private readonly clock: SystemClock
  ) {}

  getDefaultSchedule(request: AstrologerSessionRequest): Promise<AvailabilityScheduleResponse> {
    return mapAvailabilityErrors(async () => {
      const schedule = await getDefaultAvailabilitySchedule({
        store: this.store,
        ownerUserId: requireOwnerUserId(request)
      });
      return availabilityScheduleResponseSchema.parse({ schedule: toResponse(schedule) });
    });
  }

  putDefaultSchedule(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<AvailabilityScheduleResponse> {
    return mapAvailabilityErrors(async () => {
      const parsedBody = parseContract(putDefaultAvailabilityScheduleRequestSchema, body);
      const schedule = await putDefaultAvailabilitySchedule({
        store: this.store,
        productReader: this.productReader,
        ownerUserId: requireOwnerUserId(request),
        input: parsedBody,
        now: this.clock.now()
      });
      return availabilityScheduleResponseSchema.parse({ schedule: toResponse(schedule) });
    });
  }
}

function toResponse(schedule: AvailabilitySchedule) {
  return {
    id: schedule.id,
    name: schedule.name,
    version: schedule.version,
    timeZone: schedule.timeZone,
    startIntervalMinutes: schedule.startIntervalMinutes,
    bufferBeforeMinutes: schedule.bufferBeforeMinutes,
    bufferAfterMinutes: schedule.bufferAfterMinutes,
    minimumNoticeMinutes: schedule.minimumNoticeMinutes,
    bookingHorizonDays: schedule.bookingHorizonDays,
    maximumBookingsPerDay: schedule.maximumBookingsPerDay,
    weeklyPeriods: schedule.weeklyPeriods,
    dateOverrides: schedule.dateOverrides,
    productIds: schedule.productIds
  };
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw schedulingHttpError(400, "invalid_request", "Invalid availability request");
  return result.data;
}

async function mapAvailabilityErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof AvailabilityScheduleNotFoundError) {
      throw schedulingHttpError(404, error.code, error.message);
    }
    if (error instanceof AvailabilityVersionConflictError) {
      throw new HttpException(
        {
          statusCode: 409,
          error: error.code,
          code: error.code,
          message: error.message,
          currentVersion: error.currentVersion
        },
        409
      );
    }
    if (error instanceof AvailabilityProductNotBookableError) {
      throw new HttpException(
        {
          statusCode: 422,
          error: error.code,
          code: error.code,
          message: error.message,
          productId: error.productId
        },
        422
      );
    }
    if (error instanceof AvailabilityValidationError) {
      throw schedulingHttpError(400, error.code, error.message);
    }
    throw error;
  }
}

function schedulingHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
