import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  cancelFlowRunRequestSchema,
  cancelFlowRunResponseSchema,
  createFlowDefinitionV2RequestSchema,
  createNextFlowDraftV2RequestSchema,
  decideFlowApprovalRequestSchema,
  decideFlowApprovalResponseSchema,
  flowDefinitionDetailSchema,
  flowDefinitionV2Schema,
  getFlowRunResponseSchema,
  listFlowApprovalsQuerySchema,
  listFlowApprovalsResponseSchema,
  listFlowDefinitionTemplatesV2QuerySchema,
  listFlowDefinitionTemplatesV2ResponseSchema,
  listFlowDefinitionsQuerySchema,
  listFlowDefinitionsResponseSchema,
  listFlowRunsQuerySchema,
  listFlowRunsResponseSchema,
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionResponseSchema,
  updateFlowDefinitionDraftV2RequestSchema,
  validateFlowDefinitionRequestSchema,
  validateFlowDefinitionResponseSchema,
  type CancelFlowRunResponse,
  type DecideFlowApprovalResponse,
  type FlowDefinitionDetail,
  type FlowDefinitionV2,
  type GetFlowRunResponse,
  type ListFlowApprovalsResponse,
  type ListFlowDefinitionTemplatesV2Response,
  type ListFlowDefinitionsResponse,
  type ListFlowRunsResponse,
  type PublishFlowDefinitionResponse,
  type ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import {
  cancelDurableFlowRun,
  createFlowDefinitionV2,
  createNextFlowDraftV2,
  decideFlowApproval as decideFlowApprovalUseCase,
  FlowDefinitionDraftMutationInvalidError,
  FlowDefinitionIdempotencyConflictError,
  FlowDefinitionIdempotencyExpiredError,
  FlowDefinitionIdempotencyKeyInvalidError,
  FlowDefinitionIntegrityError,
  FlowDefinitionNextDraftBaseConflictError,
  FlowDefinitionNextDraftUnavailableError,
  FlowDefinitionNotEditableError,
  FlowDefinitionPublishValidationError,
  FlowDefinitionRevisionConflictError,
  FlowDefinitionTemplateNotAvailableError,
  FlowDefinitionTemplateNotFoundError,
  FlowDefinitionTemplateParametersInvalidError,
  FlowDefinitionTemplateVersionConflictError,
  FlowRuntimeExecutionUnavailableError,
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  FlowRuntimeIdempotencyKeyInvalidError,
  getFlowDefinitionTemplateCatalogV2,
  getFlowDefinition as getFlowDefinitionUseCase,
  listFlowApprovals,
  listFlowDefinitions as listFlowDefinitionsUseCase,
  listFlowRuns,
  publishFlowDefinitionV2,
  updateFlowDefinitionDraftV2,
  validateFlowDefinition as validateFlowDefinitionUseCase,
  type FlowDefinitionControlStore,
  type FlowDefinitionReadStore,
  type FlowRunCancellationRejectionResponse,
  type FlowRunCancellationStore,
  type FlowRuntimeAvailabilityReader,
  type FlowRuntimeStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  FLOW_DEFINITION_CONTROL_STORE,
  FLOW_DEFINITION_READ_STORE,
  FLOW_RUN_CANCELLATION_STORE,
  FLOW_RUNTIME_AVAILABILITY_READER,
  FLOW_RUNTIME_STORE
} from "./flows.tokens";

const flowIdParamSchema = z.string().uuid();

@Injectable()
export class FlowsService {
  constructor(
    @Inject(FLOW_DEFINITION_CONTROL_STORE)
    private readonly definitionStore: FlowDefinitionControlStore,
    @Inject(FLOW_DEFINITION_READ_STORE)
    private readonly definitionReadStore: FlowDefinitionReadStore,
    @Inject(FLOW_RUNTIME_STORE) private readonly runtimeStore: FlowRuntimeStore,
    @Inject(FLOW_RUNTIME_AVAILABILITY_READER)
    private readonly runtimeAvailabilityReader: FlowRuntimeAvailabilityReader,
    @Inject(FLOW_RUN_CANCELLATION_STORE)
    private readonly cancellationStore: FlowRunCancellationStore,
    private readonly clock: SystemClock
  ) {}

  async listFlowTemplates(query: unknown): Promise<ListFlowDefinitionTemplatesV2Response> {
    const parsedQuery = parseContract(listFlowDefinitionTemplatesV2QuerySchema, query ?? {});
    return listFlowDefinitionTemplatesV2ResponseSchema.parse(
      getFlowDefinitionTemplateCatalogV2(parsedQuery.locale)
    );
  }

  async listFlows(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListFlowDefinitionsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(listFlowDefinitionsQuerySchema, query ?? {});
    const runtime = await this.runtimeAvailabilityReader.readForOwner({ ownerUserId });
    return mapFlowDefinitionErrors(async () => {
      const result = await listFlowDefinitionsUseCase({
        store: this.definitionReadStore,
        ownerUserId,
        query: parsedQuery,
        runtime
      });
      return listFlowDefinitionsResponseSchema.parse({
        flows: result.flows,
        total: result.total,
        runtime: result.runtime
      });
    });
  }

  async createFlow(
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<FlowDefinitionV2> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedBody = parseContract(createFlowDefinitionV2RequestSchema, body);
    return mapFlowDefinitionErrors(async () => {
      const flow = await createFlowDefinitionV2({
        store: this.definitionStore,
        actorUserId: ownerUserId,
        ownerUserId,
        request: parsedBody,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now().toISOString()
      });
      return flowDefinitionV2Schema.parse(flow);
    });
  }

  async getFlow(
    flowId: string,
    request: AstrologerSessionRequest
  ): Promise<FlowDefinitionDetail> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    return mapFlowDefinitionErrors(async () => {
      const flow = await getFlowDefinitionUseCase({
        store: this.definitionReadStore,
        ownerUserId,
        flowId: parsedFlowId
      });
      if (!flow) throw flowDefinitionNotFound();
      return flowDefinitionDetailSchema.parse(flow);
    });
  }

  async validateFlowDefinition(
    flowId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ValidateFlowDefinitionResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const flow = await mapFlowDefinitionErrors(() =>
      getFlowDefinitionUseCase({
        store: this.definitionReadStore,
        ownerUserId,
        flowId: parsedFlowId
      })
    );
    if (!flow) throw flowNotFound();

    const parsedBody = parseContract(validateFlowDefinitionRequestSchema, body);
    const runtime = await this.runtimeAvailabilityReader.readForOwner({ ownerUserId });
    const activationBlockers = runtime.executionAvailable
      ? []
      : (["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"] as const);
    return validateFlowDefinitionResponseSchema.parse(
      validateFlowDefinitionUseCase({ graph: parsedBody.graph, activationBlockers })
    );
  }

  async updateFlowDraft(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<FlowDefinitionV2> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const command = parseContract(updateFlowDefinitionDraftV2RequestSchema, body);
    return mapFlowDefinitionErrors(async () => {
      const flow = await updateFlowDefinitionDraftV2({
        store: this.definitionStore,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: parsedFlowId,
        request: command,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now().toISOString()
      });
      if (!flow) throw flowDefinitionNotFound();
      return flowDefinitionV2Schema.parse(flow);
    });
  }

  async publishFlow(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<PublishFlowDefinitionResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const command = parseContract(publishFlowDefinitionV2RequestSchema, body);
    return mapFlowDefinitionErrors(async () => {
      const result = await publishFlowDefinitionV2({
        store: this.definitionStore,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: parsedFlowId,
        request: command,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now().toISOString()
      });
      if (!result) throw flowDefinitionNotFound();
      return publishFlowDefinitionResponseSchema.parse(result);
    });
  }

  async createNextFlowDraft(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<FlowDefinitionV2> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const command = parseContract(createNextFlowDraftV2RequestSchema, body);
    return mapFlowDefinitionErrors(async () => {
      const flow = await createNextFlowDraftV2({
        store: this.definitionStore,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: parsedFlowId,
        request: command,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now().toISOString()
      });
      if (!flow) throw flowDefinitionNotFound();
      return flowDefinitionV2Schema.parse(flow);
    });
  }

  async listFlowRuns(
    flowId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListFlowRunsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const definition = await this.definitionReadStore.getByOwner({
      ownerUserId,
      flowId: parsedFlowId
    });
    if (!definition) throw flowDefinitionNotFound();
    const parsedQuery = parseContract(listFlowRunsQuerySchema, query ?? {});
    const runtime = await this.runtimeAvailabilityReader.readForOwner({ ownerUserId });
    const result = await listFlowRuns({
      runtimeStore: this.runtimeStore,
      ownerUserId,
      flowId: parsedFlowId,
      query: parsedQuery
    });

    return listFlowRunsResponseSchema.parse({
      ...result,
      runtime
    });
  }

  async getFlowRun(runId: string, request: AstrologerSessionRequest): Promise<GetFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedRunId = parseContract(flowIdParamSchema, runId);
    const history = await this.runtimeStore.getRunHistory({ ownerUserId, runId: parsedRunId });
    if (!history) throw flowNotFound();

    return getFlowRunResponseSchema.parse({
      ...history,
      runtime: await this.runtimeAvailabilityReader.readForOwner({ ownerUserId })
    });
  }

  async cancelFlowRun(
    runId: string,
    idempotencyKey: string | undefined,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CancelFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedRunId = parseContract(flowIdParamSchema, runId);
    const parsedRequest = parseContract(cancelFlowRunRequestSchema, body ?? {});
    const result = await mapFlowRunCancellationErrors(() =>
      cancelDurableFlowRun({
        store: this.cancellationStore,
        actorUserId: ownerUserId,
        ownerUserId,
        runId: parsedRunId,
        idempotencyKey: idempotencyKey ?? "",
        request: parsedRequest
      })
    );
    if (result.outcome.kind === "rejected") {
      throwFlowRunCancellationRejection(result.outcome.response);
    }

    return cancelFlowRunResponseSchema.parse(result.outcome.response.body);
  }

  async listFlowApprovals(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListFlowApprovalsResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(listFlowApprovalsQuerySchema, query ?? {});
    const runtime = await this.runtimeAvailabilityReader.readForOwner({ ownerUserId });
    const result = await listFlowApprovals({
      runtimeStore: this.runtimeStore,
      ownerUserId,
      query: parsedQuery
    });

    return listFlowApprovalsResponseSchema.parse({
      ...result,
      runtime
    });
  }

  async decideFlowApproval(
    approvalId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<DecideFlowApprovalResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedApprovalId = parseContract(flowIdParamSchema, approvalId);
    const parsedBody = parseContract(decideFlowApprovalRequestSchema, body);
    const approval = await mapRuntimeExecutionUnavailable(() =>
      decideFlowApprovalUseCase({
        runtimeStore: this.runtimeStore,
        ownerUserId,
        approvalId: parsedApprovalId,
        decidedByUserId: ownerUserId,
        request: parsedBody,
        now: this.clock.now().toISOString()
      })
    );
    if (!approval) throw flowNotFound();

    return decideFlowApprovalResponseSchema.parse({ approval });
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

function flowDefinitionNotFound(): NotFoundException {
  return new NotFoundException({ code: "FLOW_DEFINITION_NOT_FOUND" });
}

async function mapFlowDefinitionErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FlowDefinitionIdempotencyKeyInvalidError) {
      throw new BadRequestException({ code: error.code });
    }
    if (error instanceof FlowDefinitionTemplateNotFoundError) {
      throw new NotFoundException({ code: error.code, templateKey: error.templateKey });
    }
    if (error instanceof FlowDefinitionRevisionConflictError) {
      throw new ConflictException({
        code: error.code,
        expectedRevision: error.expectedRevision,
        currentRevision: error.currentRevision
      });
    }
    if (error instanceof FlowDefinitionNotEditableError) {
      throw new ConflictException({ code: error.code, state: error.state });
    }
    if (error instanceof FlowDefinitionNextDraftUnavailableError) {
      throw new ConflictException({ code: error.code, state: error.state });
    }
    if (error instanceof FlowDefinitionNextDraftBaseConflictError) {
      throw new ConflictException({
        code: error.code,
        expectedBaseVersionId: error.expectedBaseVersionId,
        currentBaseVersionId: error.currentBaseVersionId
      });
    }
    if (
      error instanceof FlowDefinitionIdempotencyConflictError ||
      error instanceof FlowDefinitionIdempotencyExpiredError ||
      error instanceof FlowDefinitionDraftMutationInvalidError
    ) {
      throw new ConflictException({ code: error.code });
    }
    if (error instanceof FlowDefinitionTemplateVersionConflictError) {
      throw new ConflictException({
        code: error.code,
        templateKey: error.templateKey,
        requestedVersion: error.requestedVersion,
        currentVersion: error.currentVersion
      });
    }
    if (error instanceof FlowDefinitionTemplateNotAvailableError) {
      throw new ConflictException({
        code: error.code,
        templateKey: error.templateKey,
        reasonCode: error.reasonCode
      });
    }
    if (error instanceof FlowDefinitionTemplateParametersInvalidError) {
      throw new UnprocessableEntityException({
        code: error.code,
        templateKey: error.templateKey,
        parameterPaths: error.parameterPaths
      });
    }
    if (error instanceof FlowDefinitionPublishValidationError) {
      throw new UnprocessableEntityException({ code: error.code, issues: error.issues });
    }
    if (error instanceof FlowDefinitionIntegrityError) {
      throw new InternalServerErrorException({ code: error.code });
    }
    throw error;
  }
}

async function mapRuntimeExecutionUnavailable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FlowRuntimeExecutionUnavailableError) {
      throw flowRuntimeExecutionUnavailableConflict(error);
    }
    throw error;
  }
}

async function mapFlowRunCancellationErrors<T>(operation: () => Promise<T>): Promise<T> {
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

function throwFlowRunCancellationRejection(response: FlowRunCancellationRejectionResponse): never {
  if (response.statusCode === 404) {
    throw new NotFoundException(response.body);
  }
  throw new ConflictException(response.body);
}

function flowRuntimeExecutionUnavailableConflict(
  error: FlowRuntimeExecutionUnavailableError
): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: error.code,
    code: error.code,
    message: error.message
  });
}
