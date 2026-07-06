import { BadRequestException, Inject, Injectable, NotImplementedException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual,
  createCalculation,
  getCalculation,
  NumerologyValidationError,
  recalculateCalculation,
  type CalculationParticipant,
  type CalculationRecord,
  type CalculationStore,
  type NumerologyCompatibilityInput,
  type NumerologyParticipantInput
} from "@elevenhouse/domain";
import {
  calculationIdParamSchema,
  createNumerologyAiDraftRequestSchema,
  createNumerologyCalculationRequestSchema,
  numerologyCalculationResponseSchema,
  recalculateNumerologyCalculationRequestSchema,
  type CreateNumerologyCalculationRequest,
  type NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../clock/system-clock.service";
import {
  mapCalculationErrors,
  parseContract,
  requireOwnerUserId,
  toCalculationResponse
} from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";

type NumerologySnapshotBundle = {
  readonly methodVersion: string;
  readonly participants: readonly CalculationParticipant[];
  readonly settingsSnapshot: Record<string, unknown>;
  readonly inputSnapshot: Record<string, unknown>;
  readonly resultSnapshot: Record<string, unknown>;
  readonly resultSummary: Record<string, unknown>;
  readonly resultChecksum: string;
};

@Injectable()
export class NumerologyService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly store: CalculationStore,
    private readonly clock: SystemClock
  ) {}

  async createCalculation(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<NumerologyCalculationResponse> {
    const parsedBody = parseContract(createNumerologyCalculationRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapNumerologyErrors(async () => {
      const snapshot = buildNumerologySnapshots(parsedBody);

      return toNumerologyResponse(
        await createCalculation({
          store: this.store,
          ownerUserId,
          module: "numerology",
          mode: parsedBody.mode,
          methodCode: parsedBody.methodCode,
          methodVersion: snapshot.methodVersion,
          title: parsedBody.title,
          participants: snapshot.participants,
          settingsSnapshot: snapshot.settingsSnapshot,
          inputSnapshot: snapshot.inputSnapshot,
          resultSnapshot: snapshot.resultSnapshot,
          resultSummary: snapshot.resultSummary,
          resultChecksum: snapshot.resultChecksum,
          idGenerator: randomUUID,
          versionIdGenerator: randomUUID,
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
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const parsedBody = parseContract(recalculateNumerologyCalculationRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapNumerologyErrors(async () => {
      const snapshot = buildNumerologySnapshots(parsedBody);
      const current = await getCalculation({
        store: this.store,
        ownerUserId,
        calculationId: params.calculationId
      });
      assertRecalculationMatchesCurrentCalculation(current, parsedBody);

      return toNumerologyResponse(
        await recalculateCalculation({
          store: this.store,
          ownerUserId,
          calculationId: params.calculationId,
          methodVersion: snapshot.methodVersion,
          settingsSnapshot: snapshot.settingsSnapshot,
          inputSnapshot: snapshot.inputSnapshot,
          resultSnapshot: snapshot.resultSnapshot,
          resultSummary: snapshot.resultSummary,
          resultChecksum: snapshot.resultChecksum,
          versionIdGenerator: randomUUID,
          now: this.clock.now()
        })
      );
    });
  }

  async createAiDraft(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<never> {
    const params = parseContract(calculationIdParamSchema, { calculationId });
    const parsedBody = parseContract(createNumerologyAiDraftRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    await mapCalculationErrors(async () => {
      const calculation = await getCalculation({
        store: this.store,
        ownerUserId,
        calculationId: params.calculationId
      });
      if (!calculation.versions.some((version) => version.id === parsedBody.versionId)) {
        throw new BadRequestException("Calculation version was not found");
      }
      return calculation;
    });

    throw new NotImplementedException("Numerology AI draft generation is not configured");
  }
}

function buildNumerologySnapshots(
  input: CreateNumerologyCalculationRequest
): NumerologySnapshotBundle {
  const result =
    input.mode === "individual"
      ? calculateNumerologyIndividual({
          methodCode: input.methodCode,
          participant: toNumerologyParticipantInput(input.participants[0]!),
          settings: input.settings
        })
      : calculateNumerologyCompatibility({
          methodCode: input.methodCode,
          participants: toCompatibilityInput(input),
          settings: input.settings
        });
  const resultSnapshot = toJsonObject(result);
  const settingsSnapshot = toJsonObject(input.settings);
  const inputSnapshot = toJsonObject(input);

  return {
    methodVersion: result.methodVersion,
    participants: input.participants.map(toCalculationParticipant),
    settingsSnapshot,
    inputSnapshot,
    resultSnapshot,
    resultSummary: toResultSummary(input.mode, resultSnapshot),
    resultChecksum: sha256StableJson(resultSnapshot)
  };
}

function toCompatibilityInput(
  input: CreateNumerologyCalculationRequest
): NumerologyCompatibilityInput {
  const subject = input.participants.find((participant) => participant.role === "subject");
  const partner = input.participants.find((participant) => participant.role === "partner");
  if (!subject || !partner) {
    throw new BadRequestException("Compatibility numerology requires subject and partner roles");
  }

  return {
    first: toNumerologyParticipantInput(subject),
    second: toNumerologyParticipantInput(partner)
  };
}

function toNumerologyParticipantInput(
  participant: CreateNumerologyCalculationRequest["participants"][number]
): NumerologyParticipantInput {
  if (!participant.fullName || !participant.birthDate) {
    throw new BadRequestException("Numerology participant fullName and birthDate are required");
  }

  return {
    fullName: participant.fullName,
    birthDate: participant.birthDate
  };
}

function toCalculationParticipant(
  participant: CreateNumerologyCalculationRequest["participants"][number]
): CalculationParticipant {
  return {
    role: participant.role,
    source: participant.source,
    clientId: participant.clientId,
    displayName: participant.displayName ?? participant.fullName ?? "",
    birthDate: participant.birthDate ?? null,
    inputSnapshot: toJsonObject({
      fullName: participant.fullName,
      birthDate: participant.birthDate
    }),
    manuallyOverridden: false
  };
}

function toResultSummary(
  mode: CreateNumerologyCalculationRequest["mode"],
  resultSnapshot: Record<string, unknown>
): Record<string, unknown> {
  if (mode === "compatibility") {
    return toJsonObject({
      methodCode: resultSnapshot.methodCode,
      methodVersion: resultSnapshot.methodVersion,
      pairNumber: resultSnapshot.pairNumber
    });
  }

  const keyNumbers = resultSnapshot.keyNumbers;
  return toJsonObject({
    methodCode: resultSnapshot.methodCode,
    methodVersion: resultSnapshot.methodVersion,
    keyNumbers
  });
}

function assertRecalculationMatchesCurrentCalculation(
  current: CalculationRecord,
  input: CreateNumerologyCalculationRequest
): void {
  if (
    current.module !== "numerology" ||
    current.mode !== input.mode ||
    current.methodCode !== input.methodCode
  ) {
    throw new BadRequestException("Recalculation request does not match existing calculation");
  }
}

function toNumerologyResponse(record: CalculationRecord): NumerologyCalculationResponse {
  const currentVersion = record.versions.reduce<(typeof record.versions)[number] | null>(
    (latest, version) => {
      if (!latest || version.versionNumber > latest.versionNumber) return version;
      return latest;
    },
    null
  );
  if (!currentVersion) {
    throw new BadRequestException("Calculation has no versions");
  }

  return numerologyCalculationResponseSchema.parse({
    calculation: toCalculationResponse(record),
    currentVersion,
    resultSnapshot: currentVersion.resultSnapshot,
    settingsSnapshot: currentVersion.settingsSnapshot,
    inputSnapshot: currentVersion.inputSnapshot
  });
}

function toJsonObject(value: unknown): Record<string, unknown> {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    throw new BadRequestException("Expected structured numerology snapshot");
  }

  return normalized as Record<string, unknown>;
}

function sha256StableJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

async function mapNumerologyErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await mapCalculationErrors(operation);
  } catch (error) {
    if (error instanceof NumerologyValidationError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
