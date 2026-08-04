import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  assertStoredChartCalculationIntegrity,
  CalculationInterpretationIdempotencyConflictError,
  CalculationInterpretationModeUnavailableError,
  CalculationNotFoundError,
  CalculationResultChangedError,
  ChartStoredResultIntegrityError,
  CalculationValidationError,
  getCalculation,
  linkCalculationToClient,
  listCalculations,
  publishCalculationToClient,
  saveCalculationInterpretation,
  type CalculationRecord,
  type CalculationStore
} from "@elevenhouse/domain";
import {
  approveCalculationInterpretationRequestSchema,
  calculationIdParamSchema,
  calculationInterpretationIdParamSchema,
  calculationRecordResponseSchema,
  linkCalculationClientRequestSchema,
  listCalculationsQuerySchema,
  listCalculationsResponseSchema,
  publishCalculationRequestSchema,
  saveCalculationInterpretationRequestSchema,
  type CalculationRecordResponse,
  type ListCalculationsResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ChartExecutionProfileProvider } from "../charts/chart-execution-profile.provider";
import { CALCULATION_STORE } from "./calculations.tokens";

@Injectable()
export class CalculationsService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    private readonly clock: SystemClock,
    private readonly chartExecutionProfile: ChartExecutionProfileProvider
  ) {}

  async listCalculations(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListCalculationsResponse> {
    const parsedQuery = parseContract(listCalculationsQuerySchema, query);
    const ownerUserId = requireOwnerUserId(request);
    return mapCalculationErrors(async () => {
      const result = await listCalculations({
        store: this.store,
        ownerUserId,
        module: parsedQuery.module,
        status: parsedQuery.status,
        limit: parsedQuery.limit,
        offset: parsedQuery.offset
      });

      return listCalculationsResponseSchema.parse({
        calculations: result.calculations.map((record) =>
          toReadableCalculationResponse(record, this.chartExecutionProfile.getProfile())
        ),
        total: result.total
      });
    });
  }

  async getCalculation(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toReadableCalculationResponse(
        await getCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId
        }),
        this.chartExecutionProfile.getProfile()
      )
    );
  }

  async linkClient(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const parsedBody = parseContract(linkCalculationClientRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await linkCalculationToClient({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          clientId: parsedBody.clientId,
          expectedChartExecutionProfile: this.chartExecutionProfile.getProfile(),
          now: this.clock.now()
        })
      )
    );
  }

  async publish(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const parsedBody = parseContract(publishCalculationRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await publishCalculationToClient({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          clientId: parsedBody.clientId,
          expectedResultChecksum: parsedBody.expectedResultChecksum,
          expectedChartExecutionProfile: this.chartExecutionProfile.getProfile(),
          now: this.clock.now()
        })
      )
    );
  }

  async saveManualInterpretation(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest,
    idempotencyKey: unknown
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationInterpretationIdParamSchema, {
      calculationId,
      interpretationId: idempotencyKey
    });
    const parsedBody = parseContract(saveCalculationInterpretationRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await saveCalculationInterpretation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          expectedResultChecksum: parsedBody.expectedResultChecksum,
          source: "manual",
          text: parsedBody.text,
          modelId: null,
          promptVersion: null,
          interpretationIdGenerator: () => params.interpretationId,
          now: this.clock.now()
        })
      )
    );
  }

  async approveInterpretation(
    calculationId: string,
    interpretationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationInterpretationIdParamSchema, {
      calculationId,
      interpretationId
    });
    parseContract(approveCalculationInterpretationRequestSchema, body ?? {});
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await approveCalculationInterpretation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          interpretationId: params.interpretationId,
          now: this.clock.now()
        })
      )
    );
  }

  async archive(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await archiveCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          now: this.clock.now()
        })
      )
    );
  }
}

export function toCalculationResponse(record: CalculationRecord): CalculationRecordResponse {
  return calculationRecordResponseSchema.parse({
    ...record,
    interpretations: record.interpretations.map(({ id, status, text }) => ({ id, status, text }))
  });
}

function toReadableCalculationResponse(
  record: CalculationRecord,
  expectedChartExecutionProfile: ReturnType<ChartExecutionProfileProvider["getProfile"]>
): CalculationRecordResponse {
  if (record.module === "chart") {
    assertStoredChartCalculationIntegrity({
      calculation: record,
      expectedExecutionProfile: expectedChartExecutionProfile
    });
  }
  return toCalculationResponse(record);
}

export function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return ownerUserId;
}

export function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid calculation request");
  }

  return result.data;
}

export async function mapCalculationErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CalculationNotFoundError) {
      throw new NotFoundException("Calculation not found");
    }
    if (error instanceof CalculationResultChangedError) {
      throw new ConflictException(error.message);
    }
    if (error instanceof CalculationInterpretationIdempotencyConflictError) {
      throw new ConflictException({
        statusCode: 409,
        error: error.code,
        code: error.code,
        message: error.message
      });
    }
    if (error instanceof CalculationInterpretationModeUnavailableError) {
      throw new ConflictException({
        statusCode: 409,
        error: error.code,
        code: error.code,
        message: error.message
      });
    }
    if (error instanceof CalculationValidationError) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof ChartStoredResultIntegrityError) {
      throw new ConflictException(error.message);
    }

    throw error;
  }
}
