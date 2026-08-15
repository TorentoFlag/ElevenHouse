import {
  chartCalculationCapabilityValues,
  chartHoraryQuestionSnapshotSchema,
  chartInputSnapshotSchema,
  chartProgressionRequestSnapshotSchema,
  chartSettingsSchema,
  chartSolarReturnSnapshotSchema,
  chartTransitSnapshotSchema,
  type ChartCalculationMethod,
  type ChartCalculationCapability as ContractChartCalculationCapability,
  type ChartExecutionProfile,
  type ChartInterpretationMode,
  type ChartHoraryQuestionSnapshot,
  type ChartProgressionRequestSnapshot,
  type ChartSettings,
  type ChartSolarReturnSnapshot,
  type ChartTransitSnapshot
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import {
  CalculationNotFoundError,
  CalculationResultChangedError,
  CalculationValidationError
} from "../calculations/calculation-errors";
import type { CalculationRecord } from "../calculations/calculation-store";
import type { ChartCalculationParticipant } from "./chart-types";
import { ChartStoredResultIntegrityError } from "./chart-errors";
import { assertStoredChartCalculationIntegrity } from "./chart-stored-result-integrity";

export const chartCalculationCapabilities = chartCalculationCapabilityValues;
export type ChartCalculationCapability = ContractChartCalculationCapability;

const chartTariffOwnerCapabilityByMethod = {
  natal: "natal",
  astrocartography: "forecast",
  transit: "forecast",
  synastry: "synastry",
  composite: "synastry",
  solar_return: "solar",
  progression: "forecast",
  horary: "horar"
} as const satisfies Readonly<Record<ChartCalculationMethod, string>>;

export function resolveChartTariffOwnerCapability(
  method: ChartCalculationMethod
): (typeof chartTariffOwnerCapabilityByMethod)[ChartCalculationMethod] {
  return chartTariffOwnerCapabilityByMethod[method];
}

export function resolveChartAiDraftTariffCapabilities(
  method: ChartCalculationMethod
): readonly ["ai", (typeof chartTariffOwnerCapabilityByMethod)[ChartCalculationMethod]] {
  return ["ai", resolveChartTariffOwnerCapability(method)];
}

type ChartRecalculationTargetBase = {
  readonly calculationId: string;
  readonly expectedSourceChecksum: string;
  readonly sourceSchemaVersion: "chart-result.v1" | "chart-result.v2";
  readonly interpretationMode: ChartInterpretationMode;
  readonly settings: ChartSettings;
  readonly participants: readonly ChartCalculationParticipant[];
};

export type ChartRecalculationTarget = ChartRecalculationTargetBase &
  (
    | {
        readonly method: "natal" | "astrocartography" | "synastry" | "composite";
        readonly eventSnapshot: null;
      }
    | {
        readonly method: "transit";
        readonly eventSnapshot: { readonly transitSnapshot: ChartTransitSnapshot };
      }
    | {
        readonly method: "solar_return";
        readonly eventSnapshot: {
          readonly solarReturnSnapshot: Omit<ChartSolarReturnSnapshot, "resolvedAt">;
        };
      }
    | {
        readonly method: "progression";
        readonly eventSnapshot: {
          readonly progressionSnapshot: ChartProgressionRequestSnapshot;
        };
      }
    | {
        readonly method: "horary";
        readonly eventSnapshot: { readonly questionSnapshot: ChartHoraryQuestionSnapshot };
      }
  );

type StripChartRecalculationTargetBase<T> = T extends ChartRecalculationTargetBase
  ? Omit<T, keyof ChartRecalculationTargetBase>
  : never;
type ChartRecalculationMethodTarget = StripChartRecalculationTargetBase<ChartRecalculationTarget>;

type PrepareChartRecalculationInput = {
  readonly calculation: CalculationRecord;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly expectedResultChecksum: string;
  readonly expectedExecutionProfile: ChartExecutionProfile;
  readonly settings?: ChartSettings;
};

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const historicalBirthSnapshotSchema = z.record(z.string(), z.unknown());
const historicalRelationshipSnapshotSchema = z
  .object({
    primaryClientId: z.string().uuid().transform(normalizeUuid),
    partnerClientId: z.string().uuid().transform(normalizeUuid)
  })
  .strict();
type HistoricalRelationshipSnapshot = z.infer<typeof historicalRelationshipSnapshotSchema>;
const persistedInputEnvelopeSchema = z
  .object({
    inputSnapshot: z.unknown(),
    settings: chartSettingsSchema
  })
  .strict();
const solarReturnRequestSnapshotSchema = chartSolarReturnSnapshotSchema
  .omit({ resolvedAt: true })
  .strict();

export function prepareChartRecalculation(
  input: PrepareChartRecalculationInput
): ChartRecalculationTarget {
  const calculation = input.calculation;
  if (
    calculation.id !== input.calculationId ||
    calculation.ownerUserId !== input.ownerUserId ||
    calculation.module !== "chart"
  ) {
    throw new CalculationNotFoundError();
  }
  if (calculation.status === "archived") {
    throw new CalculationValidationError("Archived chart calculation cannot be recalculated");
  }
  if (calculation.resultChecksum !== input.expectedResultChecksum) {
    throw new CalculationResultChangedError();
  }

  const result = assertStoredChartCalculationIntegrity({
    calculation,
    expectedExecutionProfile: input.expectedExecutionProfile
  });
  const method = result.method;
  const envelope = persistedInputEnvelopeSchema.safeParse(calculation.inputData);
  if (!envelope.success) throw new ChartStoredResultIntegrityError();
  const persistedSettings = chartSettingsSchema.safeParse(envelope.data.settings);
  const requestedSettings = chartSettingsSchema.safeParse(input.settings ?? envelope.data.settings);
  if (!persistedSettings.success || !requestedSettings.success) {
    throw new ChartStoredResultIntegrityError();
  }

  const participants = parseParticipants(
    method,
    result.schemaVersion,
    calculation,
    envelope.data.inputSnapshot,
    result
  );
  const methodTarget = parseMethodTarget(method, result.schemaVersion, envelope.data.inputSnapshot);
  const base: ChartRecalculationTargetBase = {
    calculationId: calculation.id,
    expectedSourceChecksum: calculation.resultChecksum,
    sourceSchemaVersion: result.schemaVersion,
    interpretationMode: resolveChartInterpretationMode(calculation, method),
    settings: requestedSettings.data,
    participants
  };
  return attachTargetBase(base, methodTarget);
}

export function deriveChartCalculationCapabilities(input: {
  readonly calculation: CalculationRecord;
  readonly expectedExecutionProfile: ChartExecutionProfile;
}): readonly ChartCalculationCapability[] {
  const result = assertStoredChartCalculationIntegrity(input);
  if (result.schemaVersion === "chart-result.v1") {
    return ["view_legacy", "recalculate"];
  }
  if (result.method === "natal") {
    const interpretationMode = resolveChartInterpretationMode(input.calculation, result.method);
    if (interpretationMode === "legacy_unclassified") {
      return ["view_current", "recalculate"];
    }
  }
  const common: ChartCalculationCapability[] = ["view_current", "recalculate", "link", "publish"];
  common.push("ai_draft");
  if (result.method === "natal") common.push("pdf");
  return common;
}

export function resolveChartInterpretationMode(
  calculation: Pick<CalculationRecord, "interpretationMode">,
  method: ChartCalculationMethod
): ChartInterpretationMode {
  const interpretationMode = calculation.interpretationMode ?? "legacy_unclassified";
  if (method !== "natal" && interpretationMode !== "legacy_unclassified") {
    throw new ChartStoredResultIntegrityError();
  }
  return interpretationMode;
}

function parseMethodTarget(
  method: ChartCalculationMethod,
  sourceSchemaVersion: "chart-result.v1" | "chart-result.v2",
  value: unknown
): ChartRecalculationMethodTarget {
  const birthSchema =
    sourceSchemaVersion === "chart-result.v2"
      ? chartInputSnapshotSchema
      : historicalBirthSnapshotSchema;
  if (method === "natal") {
    parsePersistedSnapshot(birthSchema, value);
    return { method, eventSnapshot: null };
  }
  if (method === "astrocartography") {
    parsePersistedSnapshot(z.object({ inputSnapshot: birthSchema }).strict(), value);
    return { method, eventSnapshot: null };
  }
  if (method === "transit") {
    const parsed = parsePersistedSnapshot(
      z
        .object({
          inputSnapshot: birthSchema,
          transitSnapshot: chartTransitSnapshotSchema
        })
        .strict(),
      value
    );
    return { method, eventSnapshot: { transitSnapshot: parsed.transitSnapshot } };
  }
  if (method === "synastry" || method === "composite") {
    const fields = {
      inputSnapshot: birthSchema,
      partnerInputSnapshot: birthSchema
    };
    parsePersistedSnapshot(
      sourceSchemaVersion === "chart-result.v1"
        ? z
            .object({
              ...fields,
              relationshipSnapshot: historicalRelationshipSnapshotSchema
            })
            .strict()
        : z.object(fields).strict(),
      value
    );
    return { method, eventSnapshot: null };
  }
  if (method === "solar_return") {
    const parsed = parsePersistedSnapshot(
      z
        .object({
          inputSnapshot: birthSchema,
          solarReturnSnapshot: solarReturnRequestSnapshotSchema
        })
        .strict(),
      value
    );
    return {
      method,
      eventSnapshot: { solarReturnSnapshot: parsed.solarReturnSnapshot }
    };
  }
  if (method === "progression") {
    const parsed = parsePersistedSnapshot(
      z
        .object({
          inputSnapshot: birthSchema,
          progressionSnapshot: chartProgressionRequestSnapshotSchema
        })
        .strict(),
      value
    );
    return {
      method,
      eventSnapshot: { progressionSnapshot: parsed.progressionSnapshot }
    };
  }
  const parsed = parsePersistedSnapshot(
    z.object({ questionSnapshot: chartHoraryQuestionSnapshotSchema }).strict(),
    value
  );
  return { method, eventSnapshot: { questionSnapshot: parsed.questionSnapshot } };
}

function parsePersistedSnapshot<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ChartStoredResultIntegrityError();
  return parsed.data as T;
}

function parseParticipants(
  method: ChartCalculationMethod,
  sourceSchemaVersion: "chart-result.v1" | "chart-result.v2",
  calculation: CalculationRecord,
  persistedInputSnapshot: unknown,
  persistedResult: unknown
): readonly ChartCalculationParticipant[] {
  const relationship = method === "synastry" || method === "composite";
  if (!relationship) {
    if (calculation.mode !== "individual") throw new ChartStoredResultIntegrityError();
    return parseAuthoritativeParticipants(calculation, ["subject"]);
  }

  if (sourceSchemaVersion === "chart-result.v2") {
    if (calculation.mode !== "compatibility") throw new ChartStoredResultIntegrityError();
    return parseAuthoritativeParticipants(calculation, ["subject", "partner"]);
  }

  const inputRelationship = parseHistoricalRelationshipSnapshot(persistedInputSnapshot);
  const resultRelationship = parseHistoricalRelationshipSnapshot(persistedResult);
  assertSameRelationship(inputRelationship, resultRelationship);

  if (calculation.mode === "individual") {
    const [subject] = parseAuthoritativeParticipants(calculation, ["subject"]);
    if (subject?.clientId !== inputRelationship.primaryClientId) {
      throw new ChartStoredResultIntegrityError();
    }
    return [subject, { role: "partner", clientId: inputRelationship.partnerClientId }];
  }

  const participants = parseAuthoritativeParticipants(calculation, ["subject", "partner"]);
  if (
    participants[0]?.clientId !== inputRelationship.primaryClientId ||
    participants[1]?.clientId !== inputRelationship.partnerClientId
  ) {
    throw new ChartStoredResultIntegrityError();
  }
  return participants;
}

function parseAuthoritativeParticipants(
  calculation: CalculationRecord,
  roles: readonly ChartCalculationParticipant["role"][]
): readonly ChartCalculationParticipant[] {
  if (calculation.participants.length !== roles.length) {
    throw new ChartStoredResultIntegrityError();
  }
  const participants = calculation.participants.map((participant, order) => {
    const expectedRole = roles[order];
    if (
      expectedRole === undefined ||
      participant.role !== expectedRole ||
      participant.source !== "crm_client" ||
      !participant.clientId ||
      !canonicalUuidPattern.test(participant.clientId) ||
      participant.displayName.trim().length === 0
    ) {
      throw new ChartStoredResultIntegrityError();
    }
    return { role: expectedRole, clientId: participant.clientId };
  });
  if (participants[0]?.clientId === participants[1]?.clientId) {
    throw new ChartStoredResultIntegrityError();
  }
  return participants;
}

function parseHistoricalRelationshipSnapshot(value: unknown): HistoricalRelationshipSnapshot {
  const parsed = z
    .object({ relationshipSnapshot: historicalRelationshipSnapshotSchema })
    .safeParse(value);
  if (
    !parsed.success ||
    parsed.data.relationshipSnapshot.primaryClientId ===
      parsed.data.relationshipSnapshot.partnerClientId
  ) {
    throw new ChartStoredResultIntegrityError();
  }
  return parsed.data.relationshipSnapshot;
}

function assertSameRelationship(
  left: HistoricalRelationshipSnapshot,
  right: HistoricalRelationshipSnapshot
): void {
  if (
    left.primaryClientId !== right.primaryClientId ||
    left.partnerClientId !== right.partnerClientId
  ) {
    throw new ChartStoredResultIntegrityError();
  }
}

function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

function attachTargetBase(
  base: ChartRecalculationTargetBase,
  target: ChartRecalculationMethodTarget
): ChartRecalculationTarget {
  if (target.method === "transit") return { ...base, ...target };
  if (target.method === "solar_return") return { ...base, ...target };
  if (target.method === "progression") return { ...base, ...target };
  if (target.method === "horary") return { ...base, ...target };
  return { ...base, ...target };
}
