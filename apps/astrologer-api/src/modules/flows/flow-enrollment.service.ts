import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import {
  activateFlowVersionRequestSchema,
  activateFlowVersionResponseSchema,
  flowEnrollmentDetailResponseSchema,
  pauseFlowEnrollmentRequestSchema,
  pauseFlowEnrollmentResponseSchema,
  type ActivateFlowVersionResponse,
  type FlowEnrollmentCommandRejectionResponse,
  type FlowEnrollmentDetailResponse,
  type PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";
import {
  activateFlowVersionEnrollment,
  FlowEnrollmentAuthorityIntegrityError,
  FlowEnrollmentCommandBusyError,
  FlowRuntimeIdempotencyKeyInvalidError,
  getFlowEnrollmentDetail,
  pauseFlowEnrollment as pauseFlowEnrollmentUseCase,
  type FlowEnrollmentControlStore,
  type FlowEnrollmentQueryStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FLOW_ENROLLMENT_CONTROL_STORE, FLOW_ENROLLMENT_QUERY_STORE } from "./flows.tokens";

const flowIdParamSchema = z.string().uuid();

@Injectable()
export class FlowEnrollmentService {
  constructor(
    @Inject(FLOW_ENROLLMENT_CONTROL_STORE)
    private readonly store: FlowEnrollmentControlStore,
    @Inject(FLOW_ENROLLMENT_QUERY_STORE)
    private readonly queryStore: FlowEnrollmentQueryStore
  ) {}

  async getFlowEnrollment(
    flowId: string,
    request: AstrologerSessionRequest
  ): Promise<FlowEnrollmentDetailResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const detail = await mapFlowEnrollmentErrors(() =>
      getFlowEnrollmentDetail({ store: this.queryStore, ownerUserId, flowId: parsedFlowId })
    );
    if (!detail) throw new NotFoundException({ code: "FLOW_DEFINITION_NOT_FOUND" });
    return flowEnrollmentDetailResponseSchema.parse(detail);
  }

  async activateFlowVersion(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<ActivateFlowVersionResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const command = parseContract(activateFlowVersionRequestSchema, body);
    const result = await mapFlowEnrollmentErrors(() =>
      activateFlowVersionEnrollment({
        store: this.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: parsedFlowId,
        idempotencyKey: idempotencyKey ?? "",
        request: command
      })
    );
    if (result.outcome.kind === "rejected") {
      throwFlowEnrollmentRejection(result.outcome.response);
    }
    return activateFlowVersionResponseSchema.parse(result.outcome.response.body);
  }

  async pauseFlowEnrollment(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<PauseFlowEnrollmentResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const command = parseContract(pauseFlowEnrollmentRequestSchema, body);
    const result = await mapFlowEnrollmentErrors(() =>
      pauseFlowEnrollmentUseCase({
        store: this.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: parsedFlowId,
        idempotencyKey: idempotencyKey ?? "",
        request: command
      })
    );
    if (result.outcome.kind === "rejected") {
      throwFlowEnrollmentRejection(result.outcome.response);
    }
    return pauseFlowEnrollmentResponseSchema.parse(result.outcome.response.body);
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
    throw new BadRequestException({ code: "FLOW_INVALID_REQUEST" });
  }
  return result.data;
}

async function mapFlowEnrollmentErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FlowRuntimeIdempotencyKeyInvalidError) {
      throw new BadRequestException({ code: error.code });
    }
    if (error instanceof FlowEnrollmentCommandBusyError) {
      throw new ServiceUnavailableException({ code: error.code });
    }
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) {
      throw new InternalServerErrorException({ code: error.code });
    }
    throw error;
  }
}

function throwFlowEnrollmentRejection(response: FlowEnrollmentCommandRejectionResponse): never {
  if (response.statusCode === 400) throw new BadRequestException(response.body);
  if (response.statusCode === 404) throw new NotFoundException(response.body);
  throw new ConflictException(response.body);
}
