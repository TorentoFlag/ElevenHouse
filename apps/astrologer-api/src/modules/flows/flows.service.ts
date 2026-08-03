import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  cancelFlowRunResponseSchema,
  createFlowDefinitionV2RequestSchema,
  createNextFlowDraftV2RequestSchema,
  decideFlowApprovalRequestSchema,
  decideFlowApprovalResponseSchema,
  flowDefinitionDetailV2Schema,
  flowDefinitionV2Schema,
  flowResponseSchema,
  getFlowRunResponseSchema,
  listFlowApprovalsQuerySchema,
  listFlowApprovalsResponseSchema,
  listFlowDefinitionTemplatesV2QuerySchema,
  listFlowDefinitionTemplatesV2ResponseSchema,
  listFlowDefinitionsV2QuerySchema,
  listFlowDefinitionsV2ResponseSchema,
  listFlowRunsQuerySchema,
  listFlowRunsResponseSchema,
  manualFlowRunResponseSchema,
  migrateFlowDefinitionV2RequestSchema,
  migrateFlowDefinitionV2ResponseSchema,
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionV2ResponseSchema,
  simulateFlowRunRequestSchema,
  simulateFlowRunResponseSchema,
  updateFlowDefinitionDraftV2RequestSchema,
  validateFlowDefinitionRequestSchema,
  validateFlowDefinitionResponseSchema,
  type CancelFlowRunResponse,
  type DecideFlowApprovalResponse,
  type FlowDefinitionDetailV2,
  type FlowDefinitionV2,
  type FlowResponse,
  type GetFlowRunResponse,
  type ListFlowApprovalsResponse,
  type ListFlowDefinitionTemplatesV2Response,
  type ListFlowDefinitionsV2Response,
  type ListFlowRunsResponse,
  type ManualFlowRunResponse,
  type MigrateFlowDefinitionV2Response,
  type PublishFlowDefinitionV2Response,
  type SimulateFlowRunResponse,
  type ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import {
  activateFlow,
  cancelFlowRun as cancelFlowRunUseCase,
  createFlowDefinitionV2,
  createNextFlowDraftV2,
  dispatchFlowRuntimeEvent,
  createManualFlowRun,
  decideFlowApproval as decideFlowApprovalUseCase,
  FLOW_RUNTIME_AVAILABILITY,
  FlowDefinitionDraftMutationInvalidError,
  FlowDefinitionGraphAlreadyV2Error,
  FlowDefinitionIdempotencyConflictError,
  FlowDefinitionIdempotencyExpiredError,
  FlowDefinitionIdempotencyKeyInvalidError,
  FlowDefinitionIntegrityError,
  FlowDefinitionMigrationBlockedError,
  FlowDefinitionMigrationNotAllowedError,
  FlowDefinitionMigrationRequiredError,
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
  FlowStatusTransitionError,
  getFlowDefinitionTemplateCatalogV2,
  getFlowDefinitionV2 as getFlowDefinitionV2UseCase,
  getFlow,
  listFlowApprovals,
  listFlowDefinitionsV2 as listFlowDefinitionsV2UseCase,
  listFlowRuns,
  migrateFlowDefinitionV2,
  pauseFlow,
  publishFlowDefinitionV2,
  simulateFlowRun,
  updateFlowDefinitionDraftV2,
  validateFlowDefinition as validateFlowDefinitionUseCase,
  type DispatchFlowRuntimeEventInput,
  type DispatchFlowRuntimeEventResult,
  type FlowDefinitionControlStore,
  type FlowDefinitionQueryStore,
  type FlowRuntimeStore,
  type FlowStore
} from "@elevenhouse/domain";
import { z, type ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  FLOW_DEFINITION_CONTROL_STORE,
  FLOW_DEFINITION_QUERY_STORE,
  FLOW_RUNTIME_STORE,
  FLOW_STORE
} from "./flows.tokens";

const flowIdParamSchema = z.string().uuid();
type DispatchRuntimeEventServiceInput = Omit<
  DispatchFlowRuntimeEventInput,
  "flowStore" | "runtimeStore" | "gates" | "now"
>;

@Injectable()
export class FlowsService {
  constructor(
    @Inject(FLOW_STORE) private readonly store: FlowStore,
    @Inject(FLOW_DEFINITION_CONTROL_STORE)
    private readonly definitionStore: FlowDefinitionControlStore,
    @Inject(FLOW_DEFINITION_QUERY_STORE)
    private readonly definitionQueryStore: FlowDefinitionQueryStore,
    @Inject(FLOW_RUNTIME_STORE) private readonly runtimeStore: FlowRuntimeStore,
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
  ): Promise<ListFlowDefinitionsV2Response> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedQuery = parseContract(listFlowDefinitionsV2QuerySchema, query ?? {});
    return mapFlowDefinitionErrors(async () => {
      const result = await listFlowDefinitionsV2UseCase({
        store: this.definitionQueryStore,
        ownerUserId,
        query: parsedQuery
      });

      return listFlowDefinitionsV2ResponseSchema.parse({
        schemaVersion: "flow-definition-list.v2",
        flows: result.flows,
        total: result.total,
        runtime: FLOW_RUNTIME_AVAILABILITY
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
  ): Promise<FlowDefinitionDetailV2> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    return mapFlowDefinitionErrors(async () => {
      const flow = await getFlowDefinitionV2UseCase({
        store: this.definitionQueryStore,
        ownerUserId,
        flowId: parsedFlowId
      });
      if (!flow) throw flowDefinitionNotFound();

      return flowDefinitionDetailV2Schema.parse(flow);
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
      getFlowDefinitionV2UseCase({
        store: this.definitionQueryStore,
        ownerUserId,
        flowId: parsedFlowId
      })
    );
    if (!flow) throw flowNotFound();

    const parsedBody = parseContract(validateFlowDefinitionRequestSchema, body);
    const activationBlockers = FLOW_RUNTIME_AVAILABILITY.executionAvailable
      ? []
      : [FLOW_RUNTIME_AVAILABILITY.reasonCode];
    return validateFlowDefinitionResponseSchema.parse(
      validateFlowDefinitionUseCase({
        graph: parsedBody.graph,
        activationBlockers
      })
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
  ): Promise<PublishFlowDefinitionV2Response> {
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
      return publishFlowDefinitionV2ResponseSchema.parse(result);
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

  async migrateFlowDefinition(
    flowId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<MigrateFlowDefinitionV2Response> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedFlowId = parseContract(flowIdParamSchema, flowId);
    const command = parseContract(migrateFlowDefinitionV2RequestSchema, body);
    return mapFlowDefinitionErrors(async () => {
      const result = await migrateFlowDefinitionV2({
        store: this.definitionStore,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: parsedFlowId,
        request: command,
        idempotencyKey: idempotencyKey ?? "",
        now: this.clock.now().toISOString()
      });
      if (!result) throw flowDefinitionNotFound();
      return migrateFlowDefinitionV2ResponseSchema.parse(result);
    });
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
      if (error instanceof FlowRuntimeExecutionUnavailableError) {
        throw flowRuntimeExecutionUnavailableConflict(error);
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
    const result = await mapRuntimeExecutionUnavailable(() =>
      simulateFlowRun({
        flowStore: this.store,
        runtimeStore: this.runtimeStore,
        ownerUserId,
        flowId: parsedFlowId,
        request: parsedBody
      })
    );
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
    const result = await mapRuntimeExecutionUnavailable(() =>
      createManualFlowRun({
        flowStore: this.store,
        runtimeStore: this.runtimeStore,
        ownerUserId,
        flowId: parsedFlowId,
        dedupeKey: `manual:${parsedBody.subjectType}:${parsedBody.subjectId}:${parsedFlowId}:${parsedBody.occurredAt}`,
        request: parsedBody,
        now: this.clock.now().toISOString()
      })
    );
    if (!result) throw flowNotFound();

    return manualFlowRunResponseSchema.parse(result);
  }

  async dispatchRuntimeEvent(
    input: DispatchRuntimeEventServiceInput
  ): Promise<DispatchFlowRuntimeEventResult> {
    return mapRuntimeExecutionUnavailable(() =>
      dispatchFlowRuntimeEvent({
        flowStore: this.store,
        runtimeStore: this.runtimeStore,
        ...input,
        now: this.clock.now().toISOString()
      })
    );
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

    return listFlowRunsResponseSchema.parse({
      ...result,
      runtime: FLOW_RUNTIME_AVAILABILITY
    });
  }

  async getFlowRun(runId: string, request: AstrologerSessionRequest): Promise<GetFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedRunId = parseContract(flowIdParamSchema, runId);
    const run = await this.runtimeStore.findRunById({ ownerUserId, runId: parsedRunId });
    if (!run) throw flowNotFound();

    return getFlowRunResponseSchema.parse({ run, runtime: FLOW_RUNTIME_AVAILABILITY });
  }

  async cancelFlowRun(
    runId: string,
    request: AstrologerSessionRequest
  ): Promise<CancelFlowRunResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedRunId = parseContract(flowIdParamSchema, runId);
    const run = await mapRuntimeExecutionUnavailable(() =>
      cancelFlowRunUseCase({
        runtimeStore: this.runtimeStore,
        ownerUserId,
        runId: parsedRunId,
        now: this.clock.now().toISOString()
      })
    );
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

    return listFlowApprovalsResponseSchema.parse({
      ...result,
      runtime: FLOW_RUNTIME_AVAILABILITY
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
      error instanceof FlowDefinitionMigrationRequiredError ||
      error instanceof FlowDefinitionDraftMutationInvalidError ||
      error instanceof FlowDefinitionGraphAlreadyV2Error
    ) {
      throw new ConflictException({ code: error.code });
    }
    if (error instanceof FlowDefinitionMigrationNotAllowedError) {
      throw new ConflictException({ code: error.code, state: error.state });
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
    if (error instanceof FlowDefinitionMigrationBlockedError) {
      throw new UnprocessableEntityException({ code: error.code, issues: error.issues });
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
