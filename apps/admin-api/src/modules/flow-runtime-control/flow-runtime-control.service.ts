import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  adminFlowRuntimeControlResponseSchema,
  replaceAdminFlowRuntimeControlRequestSchema,
  replaceAdminFlowRuntimeControlResponseSchema,
  type AdminFlowRuntimeControlResponse,
  type ReplaceAdminFlowRuntimeControlResponse
} from "@elevenhouse/contracts";
import {
  FlowRuntimeControlCommandIdempotencyConflictError,
  FlowRuntimeControlCommandIntegrityError,
  FlowRuntimeControlCommandReplayExpiredError,
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeControlCommandStore,
  type FlowRuntimeControlReader
} from "@elevenhouse/domain";
import { FLOW_RUNTIME_CONTROL_COMMAND_STORE, FLOW_RUNTIME_CONTROL_READER } from "./flow-runtime-control.tokens";

@Injectable()
export class FlowRuntimeControlService {
  constructor(
    @Inject(FLOW_RUNTIME_CONTROL_READER) private readonly reader: FlowRuntimeControlReader,
    @Inject(FLOW_RUNTIME_CONTROL_COMMAND_STORE)
    private readonly commandStore: FlowRuntimeControlCommandStore
  ) {}

  async readCurrent(): Promise<AdminFlowRuntimeControlResponse> {
    return adminFlowRuntimeControlResponseSchema.parse({ policy: await this.reader.readCurrent() });
  }

  async replace(
    actorUserId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<ReplaceAdminFlowRuntimeControlResponse> {
    const request = parseRequest(body);
    try {
      const result = await replaceFlowRuntimeRolloutPolicy({
        store: this.commandStore,
        actorUserId,
        idempotencyKey,
        expectedRevision: request.expectedRevision,
        policy: request.policy,
        reason: request.reason
      });
      if (result.outcome.kind === "revision_conflict") {
        throw new ConflictException({
          code: "FLOW_RUNTIME_CONTROL_REVISION_CONFLICT",
          expectedRevision: result.outcome.expectedRevision,
          currentRevision: result.outcome.currentRevision
        });
      }
      return replaceAdminFlowRuntimeControlResponseSchema.parse({
        policy: result.outcome.policyEvidence.policy,
        command: { kind: result.kind, completedAt: result.outcome.completedAt }
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (
        error instanceof FlowRuntimeControlCommandIdempotencyConflictError ||
        error instanceof FlowRuntimeControlCommandReplayExpiredError
      ) {
        throw new ConflictException(error.code);
      }
      if (error instanceof FlowRuntimeControlCommandIntegrityError) throw error;
      throw error;
    }
  }
}

function parseRequest(body: unknown) {
  const parsed = replaceAdminFlowRuntimeControlRequestSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException("Invalid Flow runtime rollout policy request");
  return parsed.data;
}
