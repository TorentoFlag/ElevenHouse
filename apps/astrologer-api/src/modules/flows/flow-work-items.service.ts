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
  completeFlowWorkItemRequestSchema,
  flowWorkItemMutationResponseSchema,
  listFlowWorkItemsQuerySchema,
  listFlowWorkItemsResponseSchema,
  snoozeFlowWorkItemRequestSchema,
  startFlowWorkItemRequestSchema,
  type FlowWorkItemMutationResponse,
  type ListFlowWorkItemsResponse
} from "@elevenhouse/contracts";
import {
  completeFlowWorkItem,
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  FlowRuntimeIdempotencyKeyInvalidError,
  listOwnerFlowWorkItems,
  snoozeFlowWorkItem,
  startFlowWorkItem,
  type FlowWorkItemCommandOutcome,
  type FlowWorkItemCommandRejectionResponse,
  type FlowWorkItemStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FLOW_WORK_ITEM_STORE } from "./flows.tokens";

const workItemIdParamSchema = z.string().uuid();

@Injectable()
export class FlowWorkItemsService {
  constructor(@Inject(FLOW_WORK_ITEM_STORE) private readonly store: FlowWorkItemStore) {}

  async list(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListFlowWorkItemsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(listFlowWorkItemsQuerySchema, query ?? {});
    return listFlowWorkItemsResponseSchema.parse(
      await listOwnerFlowWorkItems({ store: this.store, ownerUserId, query: parsedQuery })
    );
  }

  async start(
    workItemId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<FlowWorkItemMutationResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedWorkItemId = parseContract(workItemIdParamSchema, workItemId);
    const parsedRequest = parseContract(startFlowWorkItemRequestSchema, body);
    const result = await mapFlowWorkItemErrors(() =>
      startFlowWorkItem({
        store: this.store,
        actorUserId: ownerUserId,
        ownerUserId,
        workItemId: parsedWorkItemId,
        idempotencyKey: idempotencyKey ?? "",
        request: parsedRequest
      })
    );
    return projectWorkItemCommandResult(result.outcome);
  }

  async snooze(
    workItemId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<FlowWorkItemMutationResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedWorkItemId = parseContract(workItemIdParamSchema, workItemId);
    const parsedRequest = parseContract(snoozeFlowWorkItemRequestSchema, body);
    const result = await mapFlowWorkItemErrors(() =>
      snoozeFlowWorkItem({
        store: this.store,
        actorUserId: ownerUserId,
        ownerUserId,
        workItemId: parsedWorkItemId,
        idempotencyKey: idempotencyKey ?? "",
        request: parsedRequest
      })
    );
    return projectWorkItemCommandResult(result.outcome);
  }

  async complete(
    workItemId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<FlowWorkItemMutationResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedWorkItemId = parseContract(workItemIdParamSchema, workItemId);
    const parsedRequest = parseContract(completeFlowWorkItemRequestSchema, body);
    const result = await mapFlowWorkItemErrors(() =>
      completeFlowWorkItem({
        store: this.store,
        actorUserId: ownerUserId,
        ownerUserId,
        workItemId: parsedWorkItemId,
        idempotencyKey: idempotencyKey ?? "",
        request: parsedRequest
      })
    );
    return projectWorkItemCommandResult(result.outcome);
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

function projectWorkItemCommandResult(
  input: FlowWorkItemCommandOutcome
): FlowWorkItemMutationResponse {
  if (input.kind === "rejected") throwFlowWorkItemRejection(input.response);
  return flowWorkItemMutationResponseSchema.parse(input.response.body);
}

async function mapFlowWorkItemErrors<T>(operation: () => Promise<T>): Promise<T> {
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

function throwFlowWorkItemRejection(response: FlowWorkItemCommandRejectionResponse): never {
  if (response.statusCode === 404) throw new NotFoundException(response.body);
  throw new ConflictException(response.body);
}
