import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  cancelFlowRunResponseSchema,
  createFlowRequestSchema,
  decideFlowApprovalRequestSchema,
  decideFlowApprovalResponseSchema,
  flowResponseSchema,
  getFlowRunResponseSchema,
  listFlowApprovalsQuerySchema,
  listFlowApprovalsResponseSchema,
  listFlowTemplatesResponseSchema,
  listFlowsQuerySchema,
  listFlowsResponseSchema,
  listFlowRunsQuerySchema,
  listFlowRunsResponseSchema,
  manualFlowRunResponseSchema,
  publishFlowResponseSchema,
  simulateFlowRunRequestSchema,
  simulateFlowRunResponseSchema,
  updateFlowDraftRequestSchema,
  type CancelFlowRunResponse,
  type DecideFlowApprovalResponse,
  type FlowResponse,
  type GetFlowRunResponse,
  type ListFlowApprovalsResponse,
  type ListFlowTemplatesResponse,
  type ListFlowsResponse,
  type ListFlowRunsResponse,
  type ManualFlowRunResponse,
  type PublishFlowResponse,
  type SimulateFlowRunResponse
} from "@elevenhouse/contracts";
import {
  activateFlow,
  createFlowDraft,
  dispatchFlowRuntimeEvent,
  createManualFlowRun,
  decideFlowApproval as decideFlowApprovalUseCase,
  FlowGraphValidationError,
  FlowStatusTransitionError,
  getAstrologerClient,
  getBuiltInFlowTemplates,
  getFlow,
  listFlowApprovals,
  listFlows,
  listFlowRuns,
  pauseFlow,
  publishFlow,
  simulateFlowRun,
  updateFlowDraft,
  type ClientStore,
  type DispatchFlowRuntimeEventInput,
  type DispatchFlowRuntimeEventResult,
  type FlowRuntimeStore,
  type FlowStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FLOW_RUNTIME_STORE, FLOW_STORE } from "./flows.tokens";

const flowIdParamSchema = z.string().uuid();
const clientSubjectIdSchema = z.string().uuid();
type DispatchRuntimeEventServiceInput = Omit<
  DispatchFlowRuntimeEventInput,
  "flowStore" | "runtimeStore" | "gates" | "now"
>;

@Injectable()
export class FlowsService {
  constructor(
    @Inject(FLOW_STORE) private readonly store: FlowStore,
    @Inject(FLOW_RUNTIME_STORE) private readonly runtimeStore: FlowRuntimeStore,
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
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

  async activateFlow(flowId: string, request: AstrologerSessionRequest): Promise<FlowResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);

    try {
      const flow = await activateFlow({
        store: this.store,
        ownerUserId,
        flowId: parsedFlowId,
        now: this.clock.now().toISOString()
      });
      if (!flow) throw flowNotFound();
      return flowResponseSchema.parse(flow);
    } catch (error) {
      if (error instanceof FlowStatusTransitionError) {
        throw flowStatusTransitionBadRequest(error);
      }
      throw error;
    }
  }

  async pauseFlow(flowId: string, request: AstrologerSessionRequest): Promise<FlowResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);

    try {
      const flow = await pauseFlow({
        store: this.store,
        ownerUserId,
        flowId: parsedFlowId,
        now: this.clock.now().toISOString()
      });
      if (!flow) throw flowNotFound();
      return flowResponseSchema.parse(flow);
    } catch (error) {
      if (error instanceof FlowStatusTransitionError) {
        throw flowStatusTransitionBadRequest(error);
      }
      throw error;
    }
  }

  async simulateFlow(
    flowId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<SimulateFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const parsedBody = parseContract(simulateFlowRunRequestSchema, body);
    await requirePublishedRuntimeVersion(this.store, ownerUserId, parsedFlowId);
    const result = await simulateFlowRun({
      flowStore: this.store,
      runtimeStore: this.runtimeStore,
      ownerUserId,
      flowId: parsedFlowId,
      request: parsedBody,
      gates: await this.deriveRuntimeGates(ownerUserId, parsedBody)
    });
    if (!result) throw flowNotFound();

    return simulateFlowRunResponseSchema.parse(result);
  }

  async createManualRun(
    flowId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ManualFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const parsedBody = parseContract(simulateFlowRunRequestSchema, body);
    await requirePublishedRuntimeVersion(this.store, ownerUserId, parsedFlowId);
    const result = await createManualFlowRun({
      flowStore: this.store,
      runtimeStore: this.runtimeStore,
      ownerUserId,
      flowId: parsedFlowId,
      dedupeKey: `manual:${parsedBody.subjectType}:${parsedBody.subjectId}:${parsedFlowId}:${parsedBody.occurredAt}`,
      request: parsedBody,
      gates: await this.deriveRuntimeGates(ownerUserId, parsedBody),
      now: this.clock.now().toISOString()
    });
    if (!result) throw flowNotFound();

    return manualFlowRunResponseSchema.parse(result);
  }

  async dispatchRuntimeEvent(
    input: DispatchRuntimeEventServiceInput
  ): Promise<DispatchFlowRuntimeEventResult> {
    return dispatchFlowRuntimeEvent({
      flowStore: this.store,
      runtimeStore: this.runtimeStore,
      ...input,
      gates: await this.deriveRuntimeGates(input.ownerUserId, input),
      now: this.clock.now().toISOString()
    });
  }

  async listFlowRuns(
    flowId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListFlowRunsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    await requireFlowOwnedByCurrentAstrologer(this.store, ownerUserId, parsedFlowId);
    const parsedQuery = parseContract(listFlowRunsQuerySchema, query ?? {});
    const result = await listFlowRuns({
      runtimeStore: this.runtimeStore,
      ownerUserId,
      flowId: parsedFlowId,
      query: parsedQuery
    });

    return listFlowRunsResponseSchema.parse(result);
  }

  async getFlowRun(runId: string, request: AstrologerSessionRequest): Promise<GetFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedRunId = parseContract(flowIdParamSchema, runId);
    const run = await this.runtimeStore.findRunById({ ownerUserId, runId: parsedRunId });
    if (!run) throw flowNotFound();

    return getFlowRunResponseSchema.parse({ run });
  }

  async cancelFlowRun(
    runId: string,
    request: AstrologerSessionRequest
  ): Promise<CancelFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedRunId = parseContract(flowIdParamSchema, runId);
    const run = await this.runtimeStore.cancelRun({
      ownerUserId,
      runId: parsedRunId,
      now: this.clock.now().toISOString()
    });
    if (!run) throw flowNotFound();

    return cancelFlowRunResponseSchema.parse({ run });
  }

  async listFlowApprovals(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListFlowApprovalsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(listFlowApprovalsQuerySchema, query ?? {});
    const result = await listFlowApprovals({
      runtimeStore: this.runtimeStore,
      ownerUserId,
      query: parsedQuery
    });

    return listFlowApprovalsResponseSchema.parse(result);
  }

  async decideFlowApproval(
    approvalId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<DecideFlowApprovalResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedApprovalId = parseContract(flowIdParamSchema, approvalId);
    const parsedBody = parseContract(decideFlowApprovalRequestSchema, body);
    const approval = await decideFlowApprovalUseCase({
      runtimeStore: this.runtimeStore,
      ownerUserId,
      approvalId: parsedApprovalId,
      decidedByUserId: ownerUserId,
      request: parsedBody,
      now: this.clock.now().toISOString()
    });
    if (!approval) throw flowNotFound();

    return decideFlowApprovalResponseSchema.parse({ approval });
  }

  private async deriveRuntimeGates(
    ownerUserId: string,
    request: { readonly subjectType: string; readonly subjectId: string }
  ) {
    if (request.subjectType !== "client") {
      return {};
    }

    const clientUserId = parseContract(clientSubjectIdSchema, request.subjectId);
    const client = await getAstrologerClient({
      store: this.clientStore,
      astrologerUserId: ownerUserId,
      clientUserId
    });

    return {
      hasOwnerRelationship: client !== null
    };
  }
}

async function requireFlowOwnedByCurrentAstrologer(
  store: FlowStore,
  ownerUserId: string,
  flowId: string
): Promise<void> {
  const flow = await getFlow({ store, ownerUserId, flowId });
  if (!flow) throw flowNotFound();
}

async function requirePublishedRuntimeVersion(
  store: FlowStore,
  ownerUserId: string,
  flowId: string
): Promise<void> {
  const flow = await getFlow({ store, ownerUserId, flowId });
  if (!flow) throw flowNotFound();
  if (!flow.publishedVersionId) {
    throw flowRuntimeVersionRequired();
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

function flowRuntimeVersionRequired(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: "FLOW_RUNTIME_VERSION_REQUIRED",
    code: "FLOW_RUNTIME_VERSION_REQUIRED",
    message: "Publish the flow before running runtime commands"
  });
}

function flowStatusTransitionBadRequest(error: FlowStatusTransitionError): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: error.code,
    code: error.code,
    message: error.message
  });
}
