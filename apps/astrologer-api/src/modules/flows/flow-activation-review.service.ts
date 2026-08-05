import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  flowActivationReviewQuerySchema,
  flowActivationReviewResponseSchema,
  type FlowActivationReviewResponse
} from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  reviewFlowActivation,
  type FlowActivationReviewStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FLOW_ACTIVATION_REVIEW_STORE } from "./flows.tokens";

const flowIdParamSchema = z.string().uuid();

@Injectable()
export class FlowActivationReviewService {
  constructor(
    @Inject(FLOW_ACTIVATION_REVIEW_STORE)
    private readonly store: FlowActivationReviewStore
  ) {}

  async review(
    flowId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<FlowActivationReviewResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const parsedQuery = parseContract(flowActivationReviewQuerySchema, query);
    const review = await mapActivationReviewErrors(() =>
      reviewFlowActivation({
        store: this.store,
        ownerUserId,
        flowId: parsedFlowId,
        query: parsedQuery
      })
    );
    if (!review) throw new NotFoundException({ code: "FLOW_DEFINITION_NOT_FOUND" });
    return flowActivationReviewResponseSchema.parse(review);
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

async function mapActivationReviewErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) {
      throw new InternalServerErrorException({ code: error.code });
    }
    throw error;
  }
}
