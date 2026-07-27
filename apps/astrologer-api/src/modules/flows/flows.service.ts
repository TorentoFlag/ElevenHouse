import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  createFlowRequestSchema,
  flowResponseSchema,
  listFlowTemplatesResponseSchema,
  listFlowsQuerySchema,
  listFlowsResponseSchema,
  publishFlowResponseSchema,
  updateFlowDraftRequestSchema,
  type FlowResponse,
  type ListFlowTemplatesResponse,
  type ListFlowsResponse,
  type PublishFlowResponse
} from "@elevenhouse/contracts";
import {
  createFlowDraft,
  FlowGraphValidationError,
  getBuiltInFlowTemplates,
  getFlow,
  listFlows,
  publishFlow,
  updateFlowDraft,
  type FlowStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FLOW_STORE } from "./flows.tokens";

const flowIdParamSchema = z.string().uuid();

@Injectable()
export class FlowsService {
  constructor(
    @Inject(FLOW_STORE) private readonly store: FlowStore,
    private readonly clock: SystemClock
  ) {}

  async listFlowTemplates(): Promise<ListFlowTemplatesResponse> {
    return listFlowTemplatesResponseSchema.parse({
      templates: getBuiltInFlowTemplates()
    });
  }

  async listFlows(query: unknown, request: AstrologerSessionRequest): Promise<ListFlowsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(listFlowsQuerySchema, query ?? {});
    const result = await listFlows({
      store: this.store,
      ownerUserId,
      query: parsedQuery
    });

    return listFlowsResponseSchema.parse({
      flows: result.flows,
      total: result.total
    });
  }

  async createFlow(body: unknown, request: AstrologerSessionRequest): Promise<FlowResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedBody = parseContract(createFlowRequestSchema, body);
    const flow = await createFlowDraft({
      store: this.store,
      ownerUserId,
      input: parsedBody,
      now: this.clock.now().toISOString()
    });

    return flowResponseSchema.parse(flow);
  }

  async getFlow(flowId: string, request: AstrologerSessionRequest): Promise<FlowResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const flow = await getFlow({
      store: this.store,
      ownerUserId,
      flowId: parsedFlowId
    });
    if (!flow) throw flowNotFound();

    return flowResponseSchema.parse(flow);
  }

  async updateFlowDraft(
    flowId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<FlowResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const patch = parseContract(updateFlowDraftRequestSchema, body);
    const flow = await updateFlowDraft({
      store: this.store,
      ownerUserId,
      flowId: parsedFlowId,
      patch,
      now: this.clock.now().toISOString()
    });
    if (!flow) throw flowNotFound();

    return flowResponseSchema.parse(flow);
  }

  async publishFlow(
    flowId: string,
    request: AstrologerSessionRequest
  ): Promise<PublishFlowResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);

    try {
      const result = await publishFlow({
        store: this.store,
        ownerUserId,
        flowId: parsedFlowId,
        now: this.clock.now().toISOString()
      });
      if (!result) throw flowNotFound();
      return publishFlowResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof FlowGraphValidationError) {
        throw new BadRequestException({
          statusCode: 400,
          error: "FLOW_GRAPH_NOT_PUBLISHABLE",
          code: "FLOW_GRAPH_NOT_PUBLISHABLE",
          message: "Flow graph is not publishable",
          issues: error.issues
        });
      }
      throw error;
    }
  }
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      statusCode: 400,
      error: "FLOW_INVALID_REQUEST",
      code: "FLOW_INVALID_REQUEST",
      message: "Invalid flow request"
    });
  }
  return result.data;
}

function flowNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: "FLOW_NOT_FOUND",
    code: "FLOW_NOT_FOUND",
    message: "Flow was not found"
  });
}
