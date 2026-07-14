import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  createCalculation,
  getAstrologerClient,
  getCalculation,
  MATRIX_ENGINE_REVISION,
  recalculateCalculation,
  resolveMatrixMethod,
  sha256CanonicalJson,
  stableJson,
  type AstrologerProfileStore,
  type CalculationParticipant,
  type CalculationRecord,
  type CalculationStore,
  type CanonicalJson,
  type ClientStore,
  type MatrixBaseResult,
  type MatrixData,
  type MatrixParticipantInput
} from "@elevenhouse/domain";
import {
  calculationIdParamSchema,
  matrixBaseResultSchema,
  matrixCalculationInputSchema,
  matrixCalculationResponseSchema,
  matrixPreviewResponseSchema,
  matrixProjectionQuerySchema,
  matrixProjectionResponseSchema,
  persistMatrixCalculationRequestSchema,
  previewMatrixRequestSchema,
  recalculateMatrixCalculationRequestSchema,
  type MatrixCalculationResponse,
  type MatrixParticipantRequest,
  type MatrixPreviewResponse,
  type MatrixProjectionQuery,
  type MatrixProjectionResponse,
  type PersistMatrixCalculationRequest,
  type PreviewMatrixRequest,
  type RecalculateMatrixCalculationRequest
} from "@elevenhouse/contracts";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { requireOwnerUserId, toCalculationResponse } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { mapMatrixError, matrixHttpError, MatrixResultIntegrityError } from "./matrix-http-errors";

type MatrixRequestShape = {
  readonly methodCode: "ladini_22";
  readonly mode: "individual" | "compatibility";
  readonly participants: readonly MatrixParticipantRequest[];
};

type HydratedMatrixParticipant = {
  readonly role: "subject" | "partner";
  readonly clientId: string;
  readonly displayName: string;
  readonly calculationInput: MatrixParticipantInput;
};

type PreparedCalculation = {
  readonly mode: "individual" | "compatibility";
  readonly methodCode: "ladini_22";
  readonly participants: readonly HydratedMatrixParticipant[];
  readonly inputData: Record<string, CanonicalJson>;
  readonly requestFingerprint: `sha256:${string}`;
};

@Injectable()
export class MatrixService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(ASTROLOGER_PROFILE_STORE) private readonly profileStore: AstrologerProfileStore,
    private readonly clock: SystemClock
  ) {}

  async preview(body: unknown, request: AstrologerSessionRequest): Promise<MatrixPreviewResponse> {
    const parsedBody = parseMatrixContract<PreviewMatrixRequest>(previewMatrixRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const prepared = await this.prepare(parsedBody, ownerUserId);
      const result = calculate(prepared);
      let projection = null;
      if (parsedBody.mode === "individual" && parsedBody.projection.kind !== "none") {
        if (result.mode !== "individual") throw new MatrixResultIntegrityError();
        projection = await this.deriveProjection(
          ownerUserId,
          prepared.participants[0]!.calculationInput,
          result.matrix,
          parsedBody.projection.kind === "explicit_year" ? parsedBody.projection.year : undefined
        );
      }
      return matrixPreviewResponseSchema.parse({ result, projection });
    });
  }

  async createCalculation(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixCalculationResponse> {
    const parsedBody = parseMatrixContract<PersistMatrixCalculationRequest>(
      persistMatrixCalculationRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const prepared = await this.prepare(parsedBody, ownerUserId);
      const result = calculate(prepared);
      const record = await createCalculation({
        store: this.store,
        ownerUserId,
        module: "matrix",
        mode: prepared.mode,
        methodCode: prepared.methodCode,
        title: titleFor(prepared),
        participants: prepared.participants.map(toCalculationParticipant),
        linkClientIds: prepared.participants.map((participant) => participant.clientId),
        requestFingerprint: prepared.requestFingerprint,
        inputData: prepared.inputData,
        resultData: toJsonObject(result),
        resultSummary: resultSummary(result),
        resultChecksum: resultChecksum(result),
        idGenerator: randomUUID,
        now: this.clock.now()
      });
      return toMatrixResponse(record);
    });
  }

  async recalculate(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixCalculationResponse> {
    const params = parseMatrixContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    parseMatrixContract<RecalculateMatrixCalculationRequest>(
      recalculateMatrixCalculationRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const current = await getCalculation({
        store: this.store,
        ownerUserId,
        calculationId: params.calculationId
      });
      assertMatrixCalculation(current);
      const prepared = await this.prepare(requestFromRecord(current), ownerUserId);
      const result = calculate(prepared);
      const updated = await recalculateCalculation({
        store: this.store,
        ownerUserId,
        calculationId: current.id,
        participants: prepared.participants.map(toCalculationParticipant),
        requestFingerprint: prepared.requestFingerprint,
        inputData: prepared.inputData,
        resultData: toJsonObject(result),
        resultSummary: resultSummary(result),
        resultChecksum: resultChecksum(result),
        now: this.clock.now()
      });
      return toMatrixResponse(updated);
    });
  }

  async projection(
    calculationId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixProjectionResponse> {
    const params = parseMatrixContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedQuery = parseMatrixContract<MatrixProjectionQuery>(
      matrixProjectionQuerySchema,
      query
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const record = await getCalculation({
        store: this.store,
        ownerUserId,
        calculationId: params.calculationId
      });
      assertMatrixCalculation(record);
      if (record.mode !== "individual") {
        throw matrixHttpError(
          409,
          "MATRIX_CALCULATION_MISMATCH",
          "Annual projection is available only for an individual Matrix"
        );
      }
      const input = matrixCalculationInputSchema.safeParse(record.inputData);
      const result = validatedSavedResult(record);
      if (!input.success || input.data.mode !== "individual" || result.mode !== "individual") {
        throw new MatrixResultIntegrityError();
      }
      const participant = input.data.participants[0]!;
      const projection = await this.deriveProjection(
        ownerUserId,
        { displayName: participant.displayName, birthDate: participant.birthDate },
        result.matrix,
        parsedQuery.year
      );
      return matrixProjectionResponseSchema.parse({
        calculationId: record.id,
        resultChecksum: record.resultChecksum,
        projection
      });
    });
  }

  private async prepare(
    input: MatrixRequestShape,
    ownerUserId: string
  ): Promise<PreparedCalculation> {
    const participants: HydratedMatrixParticipant[] = [];
    for (const participant of input.participants) {
      participants.push(await this.hydrateParticipant(participant, ownerUserId));
    }
    const inputData = toJsonObject({
      methodCode: input.methodCode,
      engineRevision: MATRIX_ENGINE_REVISION,
      mode: input.mode,
      participants: participants.map((participant) => ({
        role: participant.role,
        clientId: participant.clientId,
        displayName: participant.displayName,
        birthDate: participant.calculationInput.birthDate
      }))
    });
    matrixCalculationInputSchema.parse(inputData);
    const fingerprintParticipants = participants
      .map((participant) =>
        toJsonObject({
          clientId: participant.clientId,
          birthDate: participant.calculationInput.birthDate
        })
      )
      .sort((first, second) => stableJson(first).localeCompare(stableJson(second)));
    return {
      methodCode: input.methodCode,
      mode: input.mode,
      participants,
      inputData,
      requestFingerprint: sha256CanonicalJson({
        methodCode: input.methodCode,
        engineRevision: MATRIX_ENGINE_REVISION,
        mode: input.mode,
        participants: fingerprintParticipants
      })
    };
  }

  private async hydrateParticipant(
    participant: MatrixParticipantRequest,
    ownerUserId: string
  ): Promise<HydratedMatrixParticipant> {
    const client = await getAstrologerClient({
      store: this.clientStore,
      astrologerUserId: ownerUserId,
      clientUserId: participant.clientId
    });
    if (!client || client.relationshipStatus !== "active" || !client.displayName) {
      throw matrixHttpError(404, "MATRIX_CLIENT_NOT_AVAILABLE", "Active CRM client was not found");
    }
    if (!client.birthData?.birthDate) {
      throw matrixHttpError(
        409,
        "MATRIX_CLIENT_BIRTH_DATE_REQUIRED",
        "Client birth date is required for Matrix calculation"
      );
    }
    return {
      role: participant.role,
      clientId: participant.clientId,
      displayName: client.displayName,
      calculationInput: { displayName: client.displayName, birthDate: client.birthData.birthDate }
    };
  }

  private async deriveProjection(
    ownerUserId: string,
    participant: MatrixParticipantInput,
    matrix: MatrixData,
    explicitYear?: number
  ) {
    const context = await this.projectionContext(ownerUserId);
    return resolveMatrixMethod("ladini_22").calculateProjection({
      participant,
      matrix,
      selectedYear: explicitYear ?? context.year,
      currentDate: context.currentDate,
      timezone: context.timezone
    });
  }

  private async projectionContext(ownerUserId: string): Promise<{
    readonly timezone: string;
    readonly currentDate: string;
    readonly year: number;
  }> {
    const profile = await this.profileStore.findByOwnerUserId({ ownerUserId });
    const timezone = profile?.timezone;
    if (!timezone || !isValidTimeZone(timezone)) {
      throw matrixHttpError(
        409,
        "ASTROLOGER_TIMEZONE_REQUIRED",
        "A valid astrologer timezone is required for Matrix projections"
      );
    }
    const currentDate = dateInTimeZone(this.clock.now(), timezone);
    return { timezone, currentDate, year: Number(currentDate.slice(0, 4)) };
  }
}

function calculate(prepared: PreparedCalculation): MatrixBaseResult {
  const engine = resolveMatrixMethod(prepared.methodCode);
  const result =
    prepared.mode === "individual"
      ? engine.calculateIndividual({ participant: prepared.participants[0]!.calculationInput })
      : engine.calculateCompatibility({
          first: prepared.participants[0]!.calculationInput,
          second: prepared.participants[1]!.calculationInput
        });
  return matrixBaseResultSchema.parse(result);
}

function requestFromRecord(record: CalculationRecord): MatrixRequestShape {
  const participants = record.participants.map((participant) => {
    if (participant.source !== "crm_client" || !participant.clientId) {
      throw matrixHttpError(
        409,
        "MATRIX_CALCULATION_MISMATCH",
        "Matrix calculations require CRM participants"
      );
    }
    return {
      role: participant.role,
      source: "crm_client" as const,
      clientId: participant.clientId
    };
  });
  const candidate = {
    methodCode: "ladini_22" as const,
    mode: record.mode,
    participants
  };
  const parsed = persistMatrixCalculationRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    throw matrixHttpError(
      409,
      "MATRIX_CALCULATION_MISMATCH",
      "Saved Matrix participants are invalid"
    );
  }
  return parsed.data;
}

function assertMatrixCalculation(record: CalculationRecord): void {
  if (record.module !== "matrix" || record.methodCode !== "ladini_22") {
    throw matrixHttpError(
      409,
      "MATRIX_CALCULATION_MISMATCH",
      "Calculation is not a supported Matrix record"
    );
  }
}

function toCalculationParticipant(participant: HydratedMatrixParticipant): CalculationParticipant {
  return {
    role: participant.role,
    source: "crm_client",
    clientId: participant.clientId,
    displayName: participant.displayName
  };
}

function titleFor(prepared: PreparedCalculation): string {
  return prepared.mode === "individual"
    ? `${prepared.participants[0]!.displayName} — Матрица судьбы`
    : `${prepared.participants[0]!.displayName} и ${prepared.participants[1]!.displayName} — Совместимость`;
}

function resultSummary(result: MatrixBaseResult): Record<string, CanonicalJson> {
  const matrix = result.mode === "individual" ? result.matrix : result.composite;
  return toJsonObject({
    center: matrix.points.E,
    personalPurpose: matrix.purposes.personal,
    money: matrix.zones.money,
    love: matrix.zones.love
  });
}

function resultChecksum(result: MatrixBaseResult): `sha256:${string}` {
  return sha256CanonicalJson(toJsonObject(result));
}

function toMatrixResponse(record: CalculationRecord): MatrixCalculationResponse {
  const result = validatedSavedResult(record);
  return matrixCalculationResponseSchema.parse({
    calculation: toCalculationResponse(record),
    result
  });
}

function validatedSavedResult(record: CalculationRecord): MatrixBaseResult {
  const parsed = matrixBaseResultSchema.safeParse(record.resultData);
  if (!parsed.success || resultChecksum(parsed.data) !== record.resultChecksum) {
    throw new MatrixResultIntegrityError();
  }
  if (parsed.data.mode !== record.mode || parsed.data.methodCode !== record.methodCode) {
    throw new MatrixResultIntegrityError();
  }
  return parsed.data;
}

function parseMatrixContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  if (
    typeof value === "object" &&
    value !== null &&
    "methodCode" in value &&
    typeof value.methodCode === "string" &&
    value.methodCode !== "ladini_22"
  ) {
    throw matrixHttpError(
      422,
      "UNSUPPORTED_MATRIX_METHOD",
      `Unsupported Matrix method: ${value.methodCode}`
    );
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Invalid Matrix request");
  }
  return result.data as T;
}

function toJsonObject(value: unknown): Record<string, CanonicalJson> {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Expected a structured Matrix value");
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

function dateInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new MatrixResultIntegrityError();
  return `${year}-${month}-${day}`;
}
