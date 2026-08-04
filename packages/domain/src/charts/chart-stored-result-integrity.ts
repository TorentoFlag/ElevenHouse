import {
  chartResultSchema,
  chartSettingsSchema,
  type ChartExecutionProfile,
  type ChartResult
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import {
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson
} from "../calculations/canonical-json";
import { ChartStoredResultIntegrityError } from "./chart-errors";
import {
  buildChartJobInputSnapshotForResult,
  hasValidChartResultReproducibilityFingerprint,
  isChartResultProducedByExecutionProfile
} from "./chart-execution-profile";

type StoredChartCalculationInput = {
  readonly calculation: {
    readonly module: string;
    readonly methodCode: string;
    readonly inputData: unknown;
    readonly resultData: unknown;
    readonly resultChecksum: string;
  };
};

type StoredChartCalculationIntegrityInput = StoredChartCalculationInput & {
  readonly expectedExecutionProfile: ChartExecutionProfile;
};

const persistedChartInputEnvelopeSchema = z
  .object({
    inputSnapshot: z.unknown(),
    settings: chartSettingsSchema
  })
  .strict();

export function assertStoredChartCalculationIntegrity(
  input: StoredChartCalculationIntegrityInput
): ChartResult {
  const result = assertStoredChartCalculationSelfIntegrity(input);
  if (
    result.schemaVersion === "chart-result.v2" &&
    !isChartResultProducedByExecutionProfile(result, input.expectedExecutionProfile)
  ) {
    throw new ChartStoredResultIntegrityError();
  }
  return result;
}

export function assertStoredChartCalculationSelfIntegrity(
  input: StoredChartCalculationInput
): ChartResult {
  const calculation = input.calculation;
  const parsedResult = chartResultSchema.safeParse(calculation.resultData);
  const parsedInput = persistedChartInputEnvelopeSchema.safeParse(calculation.inputData);
  if (
    calculation.module !== "chart" ||
    !parsedResult.success ||
    parsedResult.data.method !== calculation.methodCode ||
    !parsedInput.success
  ) {
    throw new ChartStoredResultIntegrityError();
  }

  const result = parsedResult.data;
  if (
    stableJson(parsedInput.data.settings as CanonicalJson) !==
      stableJson(result.settings as CanonicalJson) ||
    stableJson(normalizePersistedInputSnapshot(result, parsedInput.data.inputSnapshot)) !==
      stableJson(
        normalizePersistedInputSnapshot(result, buildChartJobInputSnapshotForResult(result))
      )
  ) {
    throw new ChartStoredResultIntegrityError();
  }

  if (result.schemaVersion === "chart-result.v1") return result;
  if (
    calculation.resultChecksum !== sha256CanonicalJson(result as unknown as CanonicalJson) ||
    !hasValidChartResultReproducibilityFingerprint(result)
  ) {
    throw new ChartStoredResultIntegrityError();
  }
  return result;
}

function normalizePersistedInputSnapshot(result: ChartResult, value: unknown): CanonicalJson {
  if (
    result.schemaVersion !== "chart-result.v1" ||
    (result.method !== "synastry" && result.method !== "composite") ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return value as CanonicalJson;
  }
  const record = value as Record<string, unknown>;
  const relationship = record.relationshipSnapshot;
  if (relationship === null || typeof relationship !== "object" || Array.isArray(relationship)) {
    return value as CanonicalJson;
  }
  const relationshipRecord = relationship as Record<string, unknown>;
  return {
    ...record,
    relationshipSnapshot: {
      ...relationshipRecord,
      primaryClientId: normalizeUuidForSemanticComparison(relationshipRecord.primaryClientId),
      partnerClientId: normalizeUuidForSemanticComparison(relationshipRecord.partnerClientId)
    }
  } as CanonicalJson;
}

function normalizeUuidForSemanticComparison(value: unknown): unknown {
  return typeof value === "string" ? value.toLowerCase() : value;
}
