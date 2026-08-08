import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  createManualClientFlowRunRequestSchema,
  createManualClientFlowRunResponseSchema,
  type CreateManualClientFlowRunResponse
} from "@elevenhouse/contracts";
import {
  FlowManualClientEnrollmentIdempotencyConflictError,
  FlowManualClientEnrollmentIntegrityError,
  FlowManualClientEnrollmentSubjectUnavailableError,
  type FlowManualClientEnrollmentStore,
  type FlowRuntimeAvailabilityReader
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  FLOW_MANUAL_CLIENT_ENROLLMENT_STORE,
  FLOW_RUNTIME_AVAILABILITY_READER
} from "./flows.tokens";

const flowIdSchema = z.string().uuid();

@Injectable()
export class FlowManualClientRunsService {
  constructor(
    @Inject(FLOW_MANUAL_CLIENT_ENROLLMENT_STORE)
    private readonly store: FlowManualClientEnrollmentStore,
    @Inject(FLOW_RUNTIME_AVAILABILITY_READER)
    private readonly runtimeAvailabilityReader: FlowRuntimeAvailabilityReader
  ) {}

  async create(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<CreateManualClientFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdSchema, flowId);
    const parsedBody = parseContract(createManualClientFlowRunRequestSchema, body);
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({ code: "FLOW_MANUAL_CLIENT_ENROLLMENT_IDEMPOTENCY_REQUIRED" });
    }
    const runtime = await this.runtimeAvailabilityReader.readForOwner({ ownerUserId });
    if (!runtime.executionAvailable) {
      throw new ConflictException({
        code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        reasonCode: runtime.reasonCode
      });
    }

    try {
      return createManualClientFlowRunResponseSchema.parse(
        await this.store.enrollManualClient({
          ownerUserId,
          flowId: parsedFlowId,
          clientUserId: parsedBody.clientUserId,
          idempotencyKey: idempotencyKey.trim()
        })
      );
    } catch (error) {
      if (error instanceof FlowManualClientEnrollmentSubjectUnavailableError) {
        throw new NotFoundException({ code: error.code });
      }
      if (error instanceof FlowManualClientEnrollmentIdempotencyConflictError) {
        throw new ConflictException({ code: error.code });
      }
      if (error instanceof FlowManualClientEnrollmentIntegrityError) {
        throw new InternalServerErrorException({ code: error.code });
      }
      throw error;
    }
  }
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      statusCode: 400,
      error: "FLOW_INVALID_REQUEST",
      code: "FLOW_INVALID_REQUEST",
      message: "Invalid manual Flow client run request"
    });
  }
  return result.data;
}
