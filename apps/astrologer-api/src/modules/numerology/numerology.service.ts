import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  numerologyInterpretationDraftPromptV1,
  renderNumerologyInterpretationText
} from "@elevenhouse/ai";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual,
  CalculationResultChangedError,
  createCalculation,
  getAstrologerClient,
  getCalculation,
  recalculateCalculation,
  saveCalculationInterpretation,
  type AstrologerProfileStore,
  type CalculationParticipant,
  type CalculationRecord,
  type CalculationStore,
  type CanonicalJson,
  type ClientStore,
  type NumerologyParticipantInput,
  type PythagoreanPeriodsRequest,
  sha256CanonicalJson,
  stableJson
} from "@elevenhouse/domain";
import {
  calculationIdParamSchema,
  createNumerologyAiDraftRequestSchema,
  numerologyCalculationResponseSchema,
  numerologyPreviewResponseSchema,
  numerologyResultSchema,
  persistNumerologyCalculationRequestSchema,
  previewNumerologyRequestSchema,
  recalculateNumerologyCalculationRequestSchema,
  type CreateNumerologyAiDraftRequest,
  type NumerologyCalculationResponse,
  type NumerologyParticipantRequest,
  type NumerologyPreviewResponse,
  type NumerologyResult,
  type PersistNumerologyCalculationRequest,
  type PreviewNumerologyRequest,
  type RecalculateNumerologyCalculationRequest
} from "@elevenhouse/contracts";
import { AiGenerationService } from "../ai/ai-generation.service";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { requireOwnerUserId, toCalculationResponse } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  mapNumerologyError,
  numerologyHttpError,
  NumerologyResultIntegrityError
} from "./numerology-http-errors";
import { buildNumerologyAiContext } from "./numerology-ai-context";

type NumerologyRequest =
  | PreviewNumerologyRequest
  | PersistNumerologyCalculationRequest
  | RecalculateNumerologyCalculationRequest;

type HydratedParticipant = {
  readonly role: "subject" | "partner";
  readonly source: "crm_client" | "manual";
  readonly clientId: string | null;
  readonly displayName: string;
  readonly calculationInput: NumerologyParticipantInput;
};

type PreparedCalculation = {
  readonly mode: "individual" | "compatibility";
  readonly methodCode: "pythagorean";
  readonly participants: readonly HydratedParticipant[];
  readonly periods: PythagoreanPeriodsRequest;
  readonly inputData: Record<string, CanonicalJson>;
  readonly requestFingerprint: `sha256:${string}`;
};

@Injectable()
export class NumerologyService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(ASTROLOGER_PROFILE_STORE) private readonly profileStore: AstrologerProfileStore,
    private readonly clock: SystemClock,
    private readonly aiGeneration: AiGenerationService
  ) {}

  async preview(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<NumerologyPreviewResponse> {
    const parsedBody = parseNumerologyContract<PreviewNumerologyRequest>(
      previewNumerologyRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapNumerologyError(async () => {
      const prepared = await this.prepare(parsedBody, ownerUserId);
      return numerologyPreviewResponseSchema.parse({ result: calculate(prepared) });
    });
  }

  async createCalculation(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<NumerologyCalculationResponse> {
    const parsedBody = parseNumerologyContract<PersistNumerologyCalculationRequest>(
      persistNumerologyCalculationRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);

    return mapNumerologyError(async () => {
      const prepared = await this.prepare(parsedBody, ownerUserId);
      const exact = await this.store.findExact({
        ownerUserId,
        module: "numerology",
        mode: prepared.mode,
        methodCode: prepared.methodCode,
        requestFingerprint: prepared.requestFingerprint
      });
      const linkClientIds = crmClientIds(prepared.participants);
      if (exact) {
        const linked =
          linkClientIds.length === 0
            ? exact
            : ((await this.store.ensureClientLinks({
                ownerUserId,
                calculationId: exact.id,
                clientIds: linkClientIds,
                now: this.clock.now().toISOString()
              })) ?? exact);
        return toNumerologyResponse(linked);
      }

      const result = calculate(prepared);
      return toNumerologyResponse(
        await createCalculation({
          store: this.store,
          ownerUserId,
          module: "numerology",
          mode: prepared.mode,
          methodCode: prepared.methodCode,
          title: requiredTitle(parsedBody),
          participants: prepared.participants.map(toCalculationParticipant),
          linkClientIds,
          requestFingerprint: prepared.requestFingerprint,
          inputData: prepared.inputData,
          resultData: toJsonObject(result),
          resultSummary: resultSummary(result),
          resultChecksum: resultChecksum(result),
          idGenerator: randomUUID,
          now: this.clock.now()
        })
      );
    });
  }

  async recalculate(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<NumerologyCalculationResponse> {
    const params = parseNumerologyContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedBody = parseNumerologyContract<RecalculateNumerologyCalculationRequest>(
      recalculateNumerologyCalculationRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    const title = "title" in parsedBody ? parsedBody.title : undefined;

    return mapNumerologyError(async () => {
      const current = await getCalculation({
        store: this.store,
        ownerUserId,
        calculationId: params.calculationId
      });
      assertRecalculationMatchesCurrentCalculation(current, parsedBody);
      const prepared = await this.prepare(parsedBody, ownerUserId);
      const result = calculate(prepared);

      return toNumerologyResponse(
        await recalculateCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          ...(title === undefined ? {} : { title }),
          participants: prepared.participants.map(toCalculationParticipant),
          requestFingerprint: prepared.requestFingerprint,
          inputData: prepared.inputData,
          resultData: toJsonObject(result),
          resultSummary: resultSummary(result),
          resultChecksum: resultChecksum(result),
          now: this.clock.now()
        })
      );
    });
  }

  async createAiDraft(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<NumerologyCalculationResponse> {
    const params = parseNumerologyContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedBody = parseNumerologyContract<CreateNumerologyAiDraftRequest>(
      createNumerologyAiDraftRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);

    return mapNumerologyError(async () => {
      const calculation = await getCalculation({
        store: this.store,
        ownerUserId,
        calculationId: params.calculationId
      });
      if (calculation.status === "archived") {
        throw numerologyHttpError(
          409,
          "CALCULATION_ARCHIVED",
          "Archived calculation cannot generate an interpretation"
        );
      }
      if (calculation.resultChecksum !== parsedBody.expectedResultChecksum) {
        throw new CalculationResultChangedError();
      }
      const result = validatedSavedResult(calculation);
      const profile = await this.profileStore.findByOwnerUserId({ ownerUserId });
      const locale = profile?.locale === "en" ? "en" : "ru";
      const generated = await this.aiGeneration.generate({
        prompt: numerologyInterpretationDraftPromptV1,
        input: buildNumerologyAiContext(result, locale),
        ownerUserId,
        feature: "numerology.interpretationDraft"
      });
      const saved = await saveCalculationInterpretation({
        store: this.store,
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: parsedBody.expectedResultChecksum,
        source: "ai",
        text: renderNumerologyInterpretationText(generated.output, locale),
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: randomUUID,
        now: this.clock.now()
      });
      return toNumerologyResponse(saved);
    });
  }

  private async prepare(
    input: NumerologyRequest,
    ownerUserId: string
  ): Promise<PreparedCalculation> {
    const participants = await this.hydrateParticipants(input.participants, ownerUserId);
    const periods = await this.resolvePeriods(input, ownerUserId);
    const canonicalParticipants = participants.map((participant) => ({
      role: participant.role,
      source: participant.source,
      clientId: participant.clientId,
      calculationName: participant.calculationInput.calculationName,
      calculationNameSource: participant.calculationInput.calculationNameSource,
      birthDate: participant.calculationInput.birthDate
    }));
    const inputData = toJsonObject({
      methodCode: input.methodCode,
      mode: input.mode,
      participants: canonicalParticipants,
      periods
    });
    const fingerprintParticipants = participants
      .map((participant) =>
        toJsonObject({
          source: participant.source,
          clientId: participant.clientId,
          calculationName: participant.calculationInput.calculationName,
          calculationNameSource: participant.calculationInput.calculationNameSource,
          birthDate: participant.calculationInput.birthDate
        })
      )
      .sort((first, second) => stableJson(first).localeCompare(stableJson(second)));

    return {
      mode: input.mode,
      methodCode: input.methodCode,
      participants,
      periods,
      inputData,
      requestFingerprint: sha256CanonicalJson({
        methodCode: input.methodCode,
        mode: input.mode,
        participants: fingerprintParticipants,
        periods: toJsonObject(periods)
      })
    };
  }

  private async hydrateParticipants(
    participants: NumerologyRequest["participants"],
    ownerUserId: string
  ): Promise<readonly HydratedParticipant[]> {
    const hydrated: HydratedParticipant[] = [];
    for (const participant of participants) {
      hydrated.push(await this.hydrateParticipant(participant, ownerUserId));
    }
    return hydrated;
  }

  private async hydrateParticipant(
    participant: NumerologyParticipantRequest,
    ownerUserId: string
  ): Promise<HydratedParticipant> {
    if (participant.source === "manual") {
      return {
        role: participant.role,
        source: participant.source,
        clientId: null,
        displayName: participant.displayName,
        calculationInput: {
          calculationName: participant.calculationName,
          calculationNameSource: participant.calculationNameSource,
          birthDate: participant.birthDate
        }
      };
    }

    const client = await getAstrologerClient({
      store: this.clientStore,
      astrologerUserId: ownerUserId,
      clientUserId: participant.clientId
    });
    if (!client?.displayName || !client.birthData?.birthDate) {
      throw numerologyHttpError(
        404,
        "CLIENT_NOT_FOUND",
        "Client was not found or has incomplete calculation data"
      );
    }

    return {
      role: participant.role,
      source: participant.source,
      clientId: participant.clientId,
      displayName: client.displayName,
      calculationInput: {
        calculationName: client.displayName,
        calculationNameSource: "crm_display_name",
        birthDate: client.birthData.birthDate
      }
    };
  }

  private async resolvePeriods(
    input: NumerologyRequest,
    ownerUserId: string
  ): Promise<PythagoreanPeriodsRequest> {
    if (input.periodRequest.kind === "explicit") {
      return {
        personalYear: input.periodRequest.personalYear,
        personalMonths: input.periodRequest.personalMonths,
        personalDay: input.periodRequest.personalDay
      };
    }

    const profile = await this.profileStore.findByOwnerUserId({ ownerUserId });
    const timezone = profile?.timezone;
    if (!timezone || !isValidTimeZone(timezone)) {
      throw numerologyHttpError(
        409,
        "ASTROLOGER_TIMEZONE_REQUIRED",
        "A valid astrologer timezone is required for current-year periods"
      );
    }
    const year = yearInTimeZone(this.clock.now(), timezone);
    return { personalYear: { year }, personalMonths: { year } };
  }
}

function calculate(prepared: PreparedCalculation): NumerologyResult {
  const result =
    prepared.mode === "individual"
      ? calculateNumerologyIndividual({
          methodCode: prepared.methodCode,
          participant: prepared.participants[0]!.calculationInput,
          periods: prepared.periods
        })
      : calculateNumerologyCompatibility({
          methodCode: prepared.methodCode,
          participants: {
            first: prepared.participants[0]!.calculationInput,
            second: prepared.participants[1]!.calculationInput
          },
          periods: prepared.periods
        });
  return numerologyResultSchema.parse(result);
}

function toCalculationParticipant(participant: HydratedParticipant): CalculationParticipant {
  return {
    role: participant.role,
    source: participant.source,
    clientId: participant.clientId,
    displayName: participant.displayName
  };
}

function crmClientIds(participants: readonly HydratedParticipant[]): readonly string[] {
  return participants.flatMap((participant) =>
    participant.source === "crm_client" && participant.clientId ? [participant.clientId] : []
  );
}

function resultSummary(result: NumerologyResult): Record<string, CanonicalJson> {
  return result.mode === "individual"
    ? toJsonObject({ methodCode: result.methodCode, keyNumbers: result.keyNumbers })
    : toJsonObject({
        methodCode: result.methodCode,
        pairNumber: result.pairNumber,
        counts: result.counts,
        conclusion: result.conclusion
      });
}

function resultChecksum(result: NumerologyResult): `sha256:${string}` {
  return sha256CanonicalJson(toJsonObject(result));
}

function assertRecalculationMatchesCurrentCalculation(
  current: CalculationRecord,
  input: RecalculateNumerologyCalculationRequest
): void {
  if (
    current.module !== "numerology" ||
    current.mode !== input.mode ||
    current.methodCode !== input.methodCode
  ) {
    throw numerologyHttpError(
      409,
      "CALCULATION_PARTICIPANT_MISMATCH",
      "Recalculation request does not match the saved calculation"
    );
  }
}

function toNumerologyResponse(record: CalculationRecord): NumerologyCalculationResponse {
  const result = validatedSavedResult(record);
  return numerologyCalculationResponseSchema.parse({
    calculation: toCalculationResponse(record),
    result
  });
}

function validatedSavedResult(record: CalculationRecord): NumerologyResult {
  const parsed = numerologyResultSchema.safeParse(record.resultData);
  if (!parsed.success || resultChecksum(parsed.data) !== record.resultChecksum) {
    throw new NumerologyResultIntegrityError();
  }
  if (parsed.data.mode !== record.mode || parsed.data.methodCode !== record.methodCode) {
    throw new NumerologyResultIntegrityError();
  }
  return parsed.data;
}

function parseNumerologyContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  if (
    typeof value === "object" &&
    value !== null &&
    "methodCode" in value &&
    typeof value.methodCode === "string" &&
    value.methodCode !== "pythagorean"
  ) {
    throw numerologyHttpError(
      422,
      "UNSUPPORTED_NUMEROLOGY_METHOD",
      `Unsupported numerology method: ${value.methodCode}`
    );
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw numerologyHttpError(400, "NUMEROLOGY_VALIDATION_FAILED", "Invalid numerology request");
  }
  return result.data as T;
}

function requiredTitle(input: PersistNumerologyCalculationRequest): string {
  const title = "title" in input ? input.title : undefined;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw numerologyHttpError(400, "NUMEROLOGY_VALIDATION_FAILED", "Calculation title is required");
  }
  return title;
}

function toJsonObject(value: unknown): Record<string, CanonicalJson> {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    throw numerologyHttpError(
      400,
      "NUMEROLOGY_VALIDATION_FAILED",
      "Expected a structured numerology value"
    );
  }
  return normalized as Record<string, CanonicalJson>;
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function yearInTimeZone(date: Date, timezone: string): number {
  const yearPart = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric"
  })
    .formatToParts(date)
    .find((part) => part.type === "year")?.value;
  if (!yearPart) throw new NumerologyResultIntegrityError();
  return Number(yearPart);
}
