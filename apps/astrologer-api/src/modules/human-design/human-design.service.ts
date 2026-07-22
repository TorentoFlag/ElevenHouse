import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  assertChartBirthDataReady,
  buildHumanDesignIndividualBaseResult,
  ChartBirthDataReadinessError,
  createCalculation,
  type CalculationParticipant,
  type CalculationRecord,
  type CalculationStore,
  type CanonicalJson,
  type ChartReadyBirthData,
  type ClientStore
} from "@elevenhouse/domain";
import {
  humanDesignCalculationResponseSchema,
  humanDesignIndividualResultSchema,
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  persistHumanDesignCalculationRequestSchema,
  type HumanDesignCalculationResponse,
  type HumanDesignIndividualResult,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse,
  type PersistHumanDesignCalculationRequest
} from "@elevenhouse/contracts";
import { requireOwnerUserId, toCalculationResponse } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { humanDesignHttpError, mapHumanDesignError } from "./human-design-http-errors";
import {
  HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER,
  type HumanDesignResolvedInputProvider
} from "./human-design.tokens";

@Injectable()
export class HumanDesignService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER)
    private readonly resolvedInputProvider: HumanDesignResolvedInputProvider,
    private readonly clock: SystemClock
  ) {}

  async preview(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignPreviewResponse> {
    const parsedBody = parseHumanDesignContract<HumanDesignPreviewRequest>(
      humanDesignPreviewRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignError(async () => {
      const resolvedLongitudes =
        "resolvedLongitudes" in parsedBody
          ? parsedBody.resolvedLongitudes
          : (await this.resolveClientInput({ ownerUserId, request: parsedBody }))
              .resolvedLongitudes;
      return humanDesignPreviewResponseSchema.parse({
        result: buildHumanDesignIndividualBaseResult(resolvedLongitudes)
      });
    });
  }

  async createCalculation(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignCalculationResponse> {
    const parsedBody = parseHumanDesignContract<PersistHumanDesignCalculationRequest>(
      persistHumanDesignCalculationRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignError(async () => {
      const prepared = await this.resolveClientInput({ ownerUserId, request: parsedBody });
      const result = humanDesignIndividualResultSchema.parse(
        buildHumanDesignIndividualBaseResult(prepared.resolvedLongitudes)
      );
      const record = await createCalculation({
        store: this.store,
        ownerUserId,
        module: "human_design",
        mode: "individual",
        methodCode: "human_design_classic",
        title: parsedBody.title ?? `${prepared.displayName} — Дизайн человека`,
        participants: [toCalculationParticipant(prepared)],
        linkClientIds: [prepared.clientId],
        requestFingerprint: result.inputFingerprint.value,
        inputData: toJsonObject({
          methodCode: "human_design_classic",
          engineRevision: result.engineRevision,
          schemaVersion: result.schemaVersion,
          mode: "individual",
          source: "client",
          client: {
            clientId: prepared.clientId,
            displayName: prepared.displayName
          },
          birthData: toChartInputSnapshot(prepared.birthData),
          resolvedLongitudes: prepared.resolvedLongitudes
        }),
        resultData: toJsonObject(result),
        resultSummary: resultSummary(result),
        resultChecksum: result.resultChecksum.value,
        idGenerator: randomUUID,
        now: this.clock.now()
      });
      return toHumanDesignResponse(record);
    });
  }

  private async resolveClientInput(input: {
    readonly ownerUserId: string;
    readonly request: Extract<HumanDesignPreviewRequest, { source: "client" }>;
  }): Promise<{
    readonly clientId: string;
    readonly displayName: string;
    readonly birthData: ChartReadyBirthData;
    readonly resolvedLongitudes: Awaited<ReturnType<HumanDesignResolvedInputProvider["resolve"]>>;
  }> {
    const client = await this.clientStore.getAstrologerClient({
      astrologerUserId: input.ownerUserId,
      clientUserId: input.request.clientId
    });
    if (!client?.birthData || !client.displayName) {
      throw humanDesignHttpError(404, "HUMAN_DESIGN_CLIENT_NOT_FOUND", "Client was not found");
    }

    try {
      const readyBirthData = assertChartBirthDataReady(client.birthData);
      const resolved = await this.resolvedInputProvider.resolve({
        inputSnapshot: toChartInputSnapshot(readyBirthData)
      });
      return {
        clientId: input.request.clientId,
        displayName: client.displayName,
        birthData: readyBirthData,
        resolvedLongitudes: resolved
      };
    } catch (error) {
      if (error instanceof ChartBirthDataReadinessError) {
        throw humanDesignHttpError(
          409,
          "HUMAN_DESIGN_BIRTH_DATA_NOT_READY",
          "Client birth data is not ready for Human Design calculation"
        );
      }
      throw humanDesignHttpError(
        502,
        "HUMAN_DESIGN_PROVIDER_FAILED",
        "Human Design positions provider failed"
      );
    }
  }
}

function toChartInputSnapshot(input: ChartReadyBirthData) {
  return {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    timezone: input.birthTimezone,
    latitude: input.birthLatitude,
    longitude: input.birthLongitude,
    birthTimePrecision: input.birthTimePrecision,
    ...(input.birthTimeDstOccurrence ? { dstOccurrence: input.birthTimeDstOccurrence } : {})
  };
}

function parseHumanDesignContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw humanDesignHttpError(
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED",
      "Invalid Human Design preview request"
    );
  }
  return result.data as T;
}

function toCalculationParticipant(input: {
  readonly clientId: string;
  readonly displayName: string;
}): CalculationParticipant {
  return {
    role: "subject",
    source: "crm_client",
    clientId: input.clientId,
    displayName: input.displayName
  };
}

function resultSummary(result: HumanDesignIndividualResult): Record<string, CanonicalJson> {
  return toJsonObject({
    type: result.type,
    strategy: result.strategy,
    authority: result.authority,
    profile: result.profile.code,
    definition: result.definition,
    definedCenters: result.definedCenters.map((center) => center.code),
    definedChannels: result.definedChannels.map((channel) => channel.code)
  });
}

function toHumanDesignResponse(record: CalculationRecord): HumanDesignCalculationResponse {
  const result = validatedSavedResult(record);
  return humanDesignCalculationResponseSchema.parse({
    calculation: toCalculationResponse(record),
    result
  });
}

function validatedSavedResult(record: CalculationRecord): HumanDesignIndividualResult {
  const parsed = humanDesignIndividualResultSchema.safeParse(record.resultData);
  if (
    !parsed.success ||
    record.module !== "human_design" ||
    record.mode !== "individual" ||
    record.methodCode !== "human_design_classic" ||
    parsed.data.resultChecksum.value !== record.resultChecksum ||
    parsed.data.inputFingerprint.value !== record.requestFingerprint
  ) {
    throw humanDesignHttpError(
      409,
      "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED",
      "Saved Human Design result is inconsistent"
    );
  }
  return parsed.data;
}

function toJsonObject(value: unknown): Record<string, CanonicalJson> {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    throw humanDesignHttpError(
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED",
      "Expected a structured Human Design value"
    );
  }
  return normalized as Record<string, CanonicalJson>;
}
