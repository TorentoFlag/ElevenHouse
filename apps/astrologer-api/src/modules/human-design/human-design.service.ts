import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  humanDesignInterpretationDraftPromptV1,
  renderHumanDesignInterpretationText
} from "@elevenhouse/ai";
import {
  assertChartBirthDataReady,
  buildHumanDesignCompatibilityResult,
  buildHumanDesignAiContext,
  buildHumanDesignIndividualBaseResult,
  buildHumanDesignTransitResult,
  ChartBirthDataReadinessError,
  createCalculation,
  getCalculation,
  recalculateCalculation,
  saveCalculationInterpretation,
  type AstrologerProfileStore,
  type HumanDesignAiBaseResult,
  type CalculationParticipant,
  type CalculationRecord,
  type CalculationStore,
  type CanonicalJson,
  type ChartReadyBirthData,
  type ClientStore,
  type HumanDesignIndividualBaseResult
} from "@elevenhouse/domain";
import {
  humanDesignCalculationResponseSchema,
  createHumanDesignAiDraftRequestSchema,
  humanDesignIndividualResultSchema,
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  humanDesignTransitQuerySchema,
  humanDesignTransitResponseSchema,
  humanDesignResultSchema,
  persistHumanDesignCalculationRequestSchema,
  recalculateHumanDesignCalculationRequestSchema,
  calculationIdParamSchema,
  type HumanDesignCalculationResponse,
  type CreateHumanDesignAiDraftRequest,
  type HumanDesignIndividualResult,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse,
  type HumanDesignResult,
  type HumanDesignTransitQuery,
  type HumanDesignTransitResponse,
  type PersistHumanDesignCalculationRequest,
  type RecalculateHumanDesignCalculationRequest
} from "@elevenhouse/contracts";
import {
  mapCalculationErrors,
  requireOwnerUserId,
  toCalculationResponse
} from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { AiGenerationService } from "../ai/ai-generation.service";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { humanDesignHttpError, mapHumanDesignError } from "./human-design-http-errors";
import {
  HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER,
  type HumanDesignResolvedInputProvider
} from "./human-design.tokens";

type ResolvedHumanDesignClientInput = {
  readonly clientId: string;
  readonly displayName: string;
  readonly birthData: ChartReadyBirthData;
  readonly resolvedLongitudes: Awaited<ReturnType<HumanDesignResolvedInputProvider["resolve"]>>;
};

type ReadyHumanDesignClientInput = Omit<ResolvedHumanDesignClientInput, "resolvedLongitudes">;

@Injectable()
export class HumanDesignService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(ASTROLOGER_PROFILE_STORE)
    private readonly profileStore: AstrologerProfileStore,
    @Inject(HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER)
    private readonly resolvedInputProvider: HumanDesignResolvedInputProvider,
    private readonly clock: SystemClock,
    private readonly aiGeneration: AiGenerationService
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
      if (parsedBody.mode === "compatibility") {
        const prepared = await this.resolveClientPair({
          ownerUserId,
          subjectClientId: parsedBody.subjectClientId,
          partnerClientId: parsedBody.partnerClientId
        });
        return humanDesignPreviewResponseSchema.parse({
          result: buildHumanDesignCompatibilityResult({
            subject: buildHumanDesignIndividualBaseResult(prepared.subject.resolvedLongitudes),
            partner: buildHumanDesignIndividualBaseResult(prepared.partner.resolvedLongitudes)
          })
        });
      }
      const resolvedLongitudes =
        "resolvedLongitudes" in parsedBody
          ? parsedBody.resolvedLongitudes
          : (await this.resolveClientInput({ ownerUserId, clientId: parsedBody.clientId }))
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
      if (parsedBody.mode === "compatibility") {
        const prepared = await this.resolveClientPair({
          ownerUserId,
          subjectClientId: parsedBody.subjectClientId,
          partnerClientId: parsedBody.partnerClientId
        });
        const result = humanDesignResultSchema.parse(
          buildHumanDesignCompatibilityResult({
            subject: buildHumanDesignIndividualBaseResult(prepared.subject.resolvedLongitudes),
            partner: buildHumanDesignIndividualBaseResult(prepared.partner.resolvedLongitudes)
          })
        );
        const record = await createCalculation({
          store: this.store,
          ownerUserId,
          module: "human_design",
          mode: "compatibility",
          methodCode: "human_design_classic",
          title:
            parsedBody.title ??
            `${prepared.subject.displayName} + ${prepared.partner.displayName} — Партнёрский Human Design`,
          participants: [
            toCalculationParticipant(prepared.subject, "subject"),
            toCalculationParticipant(prepared.partner, "partner")
          ],
          linkClientIds: [prepared.subject.clientId, prepared.partner.clientId],
          requestFingerprint: result.inputFingerprint.value,
          inputData: compatibilityInputData(prepared, result),
          resultData: toJsonObject(result),
          resultSummary: resultSummary(result),
          resultChecksum: result.resultChecksum.value,
          idGenerator: randomUUID,
          now: this.clock.now()
        });
        return toHumanDesignResponse(record);
      }

      const prepared = await this.resolveClientInput({
        ownerUserId,
        clientId: parsedBody.clientId
      });
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
        participants: [toCalculationParticipant(prepared, "subject")],
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

  async recalculate(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignCalculationResponse> {
    const params = parseHumanDesignContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    parseHumanDesignContract<RecalculateHumanDesignCalculationRequest>(
      recalculateHumanDesignCalculationRequestSchema,
      body ?? {}
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignError(async () =>
      mapCalculationErrors(async () => {
        const current = await getCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId
        });
        assertHumanDesignCalculation(current);
        if (current.mode === "compatibility") {
          const prepared = await this.resolveClientPair({
            ownerUserId,
            subjectClientId: participantClientId(current, "subject"),
            partnerClientId: participantClientId(current, "partner")
          });
          const result = humanDesignResultSchema.parse(
            buildHumanDesignCompatibilityResult({
              subject: buildHumanDesignIndividualBaseResult(prepared.subject.resolvedLongitudes),
              partner: buildHumanDesignIndividualBaseResult(prepared.partner.resolvedLongitudes)
            })
          );
          const updated = await recalculateCalculation({
            store: this.store,
            ownerUserId,
            calculationId: current.id,
            title: current.title,
            participants: [
              toCalculationParticipant(prepared.subject, "subject"),
              toCalculationParticipant(prepared.partner, "partner")
            ],
            requestFingerprint: result.inputFingerprint.value,
            inputData: compatibilityInputData(prepared, result),
            resultData: toJsonObject(result),
            resultSummary: resultSummary(result),
            resultChecksum: result.resultChecksum.value,
            now: this.clock.now()
          });
          return toHumanDesignResponse(updated);
        }

        const prepared = await this.resolveClientInput({
          ownerUserId,
          clientId: participantClientId(current, "subject")
        });
        const result = humanDesignIndividualResultSchema.parse(
          buildHumanDesignIndividualBaseResult(prepared.resolvedLongitudes)
        );
        const updated = await recalculateCalculation({
          store: this.store,
          ownerUserId,
          calculationId: current.id,
          title: current.title,
          participants: [toCalculationParticipant(prepared, "subject")],
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
          now: this.clock.now()
        });
        return toHumanDesignResponse(updated);
      })
    );
  }

  async transits(
    calculationId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignTransitResponse> {
    const params = parseHumanDesignContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedQuery = parseHumanDesignContract<HumanDesignTransitQuery>(
      humanDesignTransitQuerySchema,
      query ?? {}
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignError(async () =>
      mapCalculationErrors(async () => {
        const current = await getCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId
        });
        assertHumanDesignCalculation(current);
        if (current.mode !== "individual") {
          throw humanDesignHttpError(
            409,
            "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED",
            "Human Design transits require an individual calculation"
          );
        }
        const natal = validatedSavedResult(current);
        if (natal.mode !== "individual") {
          throw humanDesignHttpError(
            409,
            "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED",
            "Saved Human Design result is not an individual calculation"
          );
        }
        const natalBase = toDomainIndividualBaseResult(natal);
        const prepared = await this.resolveClientBirthData({
          ownerUserId,
          clientId: participantClientId(current, "subject")
        });
        const transitSnapshot = buildTransitSnapshot({
          instant: parsedQuery.instant ? new Date(parsedQuery.instant) : this.clock.now(),
          birthData: prepared.birthData
        });
        try {
          const transitLongitudes = await this.resolvedInputProvider.resolveTransit({
            transitSnapshot
          });
          return humanDesignTransitResponseSchema.parse({
            result: buildHumanDesignTransitResult({
              natal: natalBase,
              transit: transitLongitudes,
              transitSnapshot
            })
          });
        } catch (error) {
          throw humanDesignHttpError(
            502,
            "HUMAN_DESIGN_PROVIDER_FAILED",
            "Human Design positions provider failed"
          );
        }
      })
    );
  }

  async createAiDraft(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignCalculationResponse> {
    const params = parseHumanDesignContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedBody = parseHumanDesignContract<CreateHumanDesignAiDraftRequest>(
      createHumanDesignAiDraftRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignError(async () =>
      mapCalculationErrors(async () => {
        const calculation = await getCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId
        });
        assertHumanDesignCalculation(calculation);
        if (calculation.resultChecksum !== parsedBody.expectedResultChecksum) {
          throw humanDesignHttpError(
            409,
            "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED",
            "Human Design result changed; reload and retry"
          );
        }
        const result = validatedSavedResult(calculation);
        const profile = await this.profileStore.findByOwnerUserId({ ownerUserId });
        const locale = profile?.locale === "en" ? "en" : "ru";
        const generated = await this.aiGeneration.generate({
          prompt: humanDesignInterpretationDraftPromptV1,
          input: humanDesignInterpretationDraftPromptV1.inputSchema.parse(
            buildHumanDesignAiContext({
              locale,
              result: toDomainAiBaseResult(result),
              resultChecksum: calculation.resultChecksum
            })
          ),
          ownerUserId,
          feature: "humanDesign.interpretationDraft"
        });
        const saved = await saveCalculationInterpretation({
          store: this.store,
          ownerUserId,
          calculationId: calculation.id,
          expectedResultChecksum: parsedBody.expectedResultChecksum,
          source: "ai",
          text: renderHumanDesignInterpretationText(generated.output, locale),
          modelId: generated.model,
          promptVersion: `${humanDesignInterpretationDraftPromptV1.id}@${humanDesignInterpretationDraftPromptV1.version}`,
          interpretationIdGenerator: randomUUID,
          now: this.clock.now()
        });
        return toHumanDesignResponse(saved);
      })
    );
  }

  private async resolveClientInput(input: {
    readonly ownerUserId: string;
    readonly clientId: string;
  }): Promise<ResolvedHumanDesignClientInput> {
    const prepared = await this.resolveClientBirthData(input);
    try {
      const resolved = await this.resolvedInputProvider.resolve({
        inputSnapshot: toChartInputSnapshot(prepared.birthData)
      });
      return {
        ...prepared,
        resolvedLongitudes: resolved
      };
    } catch (error) {
      throw humanDesignHttpError(
        502,
        "HUMAN_DESIGN_PROVIDER_FAILED",
        "Human Design positions provider failed"
      );
    }
  }

  private async resolveClientBirthData(input: {
    readonly ownerUserId: string;
    readonly clientId: string;
  }): Promise<ReadyHumanDesignClientInput> {
    const client = await this.clientStore.getAstrologerClient({
      astrologerUserId: input.ownerUserId,
      clientUserId: input.clientId
    });
    if (!client?.birthData || !client.displayName) {
      throw humanDesignHttpError(404, "HUMAN_DESIGN_CLIENT_NOT_FOUND", "Client was not found");
    }

    try {
      const readyBirthData = assertChartBirthDataReady(client.birthData);
      return {
        clientId: input.clientId,
        displayName: client.displayName,
        birthData: readyBirthData
      };
    } catch (error) {
      if (error instanceof ChartBirthDataReadinessError) {
        throw humanDesignHttpError(
          409,
          "HUMAN_DESIGN_BIRTH_DATA_NOT_READY",
          "Client birth data is not ready for Human Design calculation"
        );
      }
      throw error;
    }
  }

  private async resolveClientPair(input: {
    readonly ownerUserId: string;
    readonly subjectClientId: string;
    readonly partnerClientId: string;
  }): Promise<{
    readonly subject: ResolvedHumanDesignClientInput;
    readonly partner: ResolvedHumanDesignClientInput;
  }> {
    const [subject, partner] = await Promise.all([
      this.resolveClientInput({
        ownerUserId: input.ownerUserId,
        clientId: input.subjectClientId
      }),
      this.resolveClientInput({
        ownerUserId: input.ownerUserId,
        clientId: input.partnerClientId
      })
    ]);
    return { subject, partner };
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

function buildTransitSnapshot(input: { readonly instant: Date; readonly birthData: ChartReadyBirthData }) {
  const localParts = localMinuteParts(input.instant, input.birthData.birthTimezone);
  return {
    instant: input.instant.toISOString(),
    date: [localParts.year, localParts.month, localParts.day]
      .map((part, index) => part.toString().padStart(index === 0 ? 4 : 2, "0"))
      .join("-"),
    time: [localParts.hour, localParts.minute]
      .map((part) => part.toString().padStart(2, "0"))
      .join(":"),
    timezone: input.birthData.birthTimezone,
    latitude: input.birthData.birthLatitude,
    longitude: input.birthData.birthLongitude
  };
}

function localMinuteParts(
  instant: Date,
  timeZone: string
): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const value = (type: string) => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (part === undefined) throw new Error(`Missing ${type} in formatted transit instant`);
    return Number(part);
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute")
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

function toCalculationParticipant(
  input: {
    readonly clientId: string;
    readonly displayName: string;
  },
  role: CalculationParticipant["role"]
): CalculationParticipant {
  return {
    role,
    source: "crm_client",
    clientId: input.clientId,
    displayName: input.displayName
  };
}

function resultSummary(result: HumanDesignResult): Record<string, CanonicalJson> {
  if (result.mode === "compatibility") {
    return toJsonObject({
      dynamicCounts: result.dynamicCounts,
      connectionChannelCount: result.connectionChannels.length,
      sharedDefinedCenters: result.sharedDefinedCenters,
      bridgedCenters: result.bridgedCenters,
      subject: individualSummary(result.participants.subject),
      partner: individualSummary(result.participants.partner)
    });
  }
  return toJsonObject(individualSummary(result));
}

function individualSummary(result: HumanDesignIndividualResult): Record<string, CanonicalJson> {
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

function toDomainIndividualBaseResult(
  result: HumanDesignIndividualResult
): HumanDesignIndividualBaseResult {
  return result as HumanDesignIndividualBaseResult;
}

function toDomainAiBaseResult(result: HumanDesignResult): HumanDesignAiBaseResult {
  return result as unknown as HumanDesignAiBaseResult;
}

function compatibilityInputData(
  prepared: {
    readonly subject: ResolvedHumanDesignClientInput;
    readonly partner: ResolvedHumanDesignClientInput;
  },
  result: HumanDesignResult
): Record<string, CanonicalJson> {
  return toJsonObject({
    methodCode: "human_design_classic",
    engineRevision: result.engineRevision,
    schemaVersion: result.schemaVersion,
    mode: "compatibility",
    source: "client_pair",
    subject: clientInputSnapshot(prepared.subject),
    partner: clientInputSnapshot(prepared.partner)
  });
}

function clientInputSnapshot(input: {
  readonly clientId: string;
  readonly displayName: string;
  readonly birthData: ChartReadyBirthData;
  readonly resolvedLongitudes: Awaited<ReturnType<HumanDesignResolvedInputProvider["resolve"]>>;
}) {
  return {
    clientId: input.clientId,
    displayName: input.displayName,
    birthData: toChartInputSnapshot(input.birthData),
    resolvedLongitudes: input.resolvedLongitudes
  };
}

function toHumanDesignResponse(record: CalculationRecord): HumanDesignCalculationResponse {
  const result = validatedSavedResult(record);
  return humanDesignCalculationResponseSchema.parse({
    calculation: toCalculationResponse(record),
    result
  });
}

function validatedSavedResult(record: CalculationRecord): HumanDesignResult {
  const parsed = humanDesignResultSchema.safeParse(record.resultData);
  if (
    !parsed.success ||
    record.module !== "human_design" ||
    record.mode !== parsed.data.mode ||
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

function assertHumanDesignCalculation(record: CalculationRecord): void {
  if (
    record.module !== "human_design" ||
    (record.mode !== "individual" && record.mode !== "compatibility") ||
    record.methodCode !== "human_design_classic"
  ) {
    throw humanDesignHttpError(
      409,
      "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED",
      "Calculation is not a supported Human Design record"
    );
  }
}

function participantClientId(
  record: CalculationRecord,
  role: CalculationParticipant["role"]
): string {
  const subject = record.participants.find(
    (participant) => participant.role === role && participant.source === "crm_client"
  );
  if (!subject?.clientId) {
    throw humanDesignHttpError(
      409,
      "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED",
      `Human Design calculation ${role} is missing`
    );
  }
  return subject.clientId;
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
