import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  CalculationNotFoundError,
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
import { randomUUID } from "node:crypto";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { CALCULATION_STORE } from "./calculations.tokens";

@Injectable()
export class CalculationsService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    private readonly clock: SystemClock
  ) {}

  async listCalculations(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListCalculationsResponse> {
    const parsedQuery = parseContract(listCalculationsQuerySchema, query);
    const ownerUserId = requireOwnerUserId(request);
    const result = await listCalculations({
      store: this.store,
      ownerUserId,
      module: parsedQuery.module,
      status: parsedQuery.status,
      limit: parsedQuery.limit,
      offset: parsedQuery.offset
    });

    return listCalculationsResponseSchema.parse({
      calculations: result.calculations.map(toCalculationResponse),
      total: result.total
    });
  }

  async getCalculation(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await getCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId
        })
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
          now: this.clock.now()
        })
      )
    );
  }

  async saveManualInterpretation(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationRecordResponse> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const parsedBody = parseContract(saveCalculationInterpretationRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapCalculationErrors(async () =>
      toCalculationResponse(
        await saveCalculationInterpretation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          versionId: parsedBody.versionId,
          source: "manual",
          text: parsedBody.text,
          modelId: null,
          promptVersion: null,
          interpretationIdGenerator: randomUUID,
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
  return calculationRecordResponseSchema.parse(record);
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
    if (error instanceof CalculationValidationError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
