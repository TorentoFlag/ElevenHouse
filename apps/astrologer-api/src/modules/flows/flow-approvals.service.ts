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
  decideFlowApprovalRequestSchema,
  decideFlowApprovalResponseSchema,
  type DecideFlowApprovalResponse
} from "@elevenhouse/contracts";
import {
  decideDurableFlowApproval,
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  FlowRuntimeIdempotencyKeyInvalidError,
  type FlowApprovalCommandOutcome,
  type FlowApprovalCommandRejectionResponse,
  type FlowApprovalStore,
  type FlowRuntimeAvailabilityReader
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FLOW_APPROVAL_STORE, FLOW_RUNTIME_AVAILABILITY_READER } from "./flows.tokens";

const approvalIdParamSchema = z.string().uuid();

@Injectable()
export class FlowApprovalsService {
  constructor(
    @Inject(FLOW_APPROVAL_STORE) private readonly store: FlowApprovalStore,
    @Inject(FLOW_RUNTIME_AVAILABILITY_READER)
    private readonly runtimeAvailabilityReader: FlowRuntimeAvailabilityReader
  ) {}

  async decide(
    approvalId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<DecideFlowApprovalResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const runtime = await this.runtimeAvailabilityReader.readForOwner({ ownerUserId });
    if (!runtime.executionAvailable) {
      throw new ConflictException({
        code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        reasonCode: runtime.reasonCode
      });
    }
    const parsedApprovalId = parseContract(approvalIdParamSchema, approvalId);
    const parsedRequest = parseContract(decideFlowApprovalRequestSchema, body);
    const result = await mapFlowApprovalErrors(() =>
      decideDurableFlowApproval({
        store: this.store,
        actorUserId: ownerUserId,
        ownerUserId,
        approvalId: parsedApprovalId,
        idempotencyKey: idempotencyKey ?? "",
        request: parsedRequest
      })
    );
    return projectOutcome(result.outcome);
  }
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "FLOW_INVALID_REQUEST" });
  return result.data;
}

function projectOutcome(outcome: FlowApprovalCommandOutcome): DecideFlowApprovalResponse {
  if (outcome.kind === "rejected") throwFlowApprovalRejection(outcome.response);
  return decideFlowApprovalResponseSchema.parse(outcome.response.body);
}

async function mapFlowApprovalErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FlowRuntimeIdempotencyKeyInvalidError) {
      throw new BadRequestException({ code: error.code });
    }
    if (
      error instanceof FlowRuntimeIdempotencyConflictError ||
      error instanceof FlowRuntimeIdempotencyExpiredError
    ) {
      throw new ConflictException({ code: error.code });
    }
    if (error instanceof FlowRuntimeCommandBusyError) {
      throw new ServiceUnavailableException({ code: error.code });
    }
    if (error instanceof FlowRuntimeCommandIntegrityError) {
      throw new InternalServerErrorException({ code: error.code });
    }
    throw error;
  }
}

function throwFlowApprovalRejection(response: FlowApprovalCommandRejectionResponse): never {
  if (response.statusCode === 404) throw new NotFoundException(response.body);
  throw new ConflictException(response.body);
}
