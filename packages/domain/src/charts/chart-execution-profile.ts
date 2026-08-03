import {
  chartExecutionProfileSchema,
  chartMethodVersions,
  chartProviderMetadataV2Schema,
  type ChartCalculationMethod,
  type ChartExecutionProfile,
  type ChartResult,
  type ChartMethodVersion,
  type ChartProviderMetadata,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { ChartExecutionProfileError } from "./chart-errors";

export function resolveChartExecutionProfile(
  source: Record<string, string | undefined> = process.env
): ChartExecutionProfile {
  const isProduction = source.NODE_ENV?.trim() === "production";
  const configuredEphemeris = source.CHART_ENGINE_EXPECTED_EPHEMERIS?.trim();
  if (isProduction && !configuredEphemeris) {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_EPHEMERIS is required in production");
  }
  const expectedEphemeris = configuredEphemeris ?? "moshier";
  if (expectedEphemeris !== "swiss-ephemeris" && expectedEphemeris !== "moshier") {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_EPHEMERIS is unsupported");
  }
  if (isProduction && expectedEphemeris === "moshier") {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_EPHEMERIS moshier is not allowed in production");
  }
  const dataRevision = source.CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION?.trim() || null;
  if (dataRevision === "unknown") {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION is unsupported");
  }
  const profile = {
    provider: "kerykeion" as const,
    kerykeionVersion: "5.12.9" as const,
    pyswissephVersion: "2.10.3.2" as const,
    expectedEphemeris,
    expectedEphemerisFlags: expectedEphemeris === "swiss-ephemeris" ? ["FLG_SWIEPH"] : ["FLG_MOSEPH"],
    expectedEphemerisDataRevision: expectedEphemeris === "swiss-ephemeris" ? dataRevision : null
  };
  const parsed = chartExecutionProfileSchema.safeParse(profile);
  if (!parsed.success) {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXECUTION_PROFILE_INVALID");
  }
  return parsed.data;
}

export function buildChartRequestFingerprint(input: {
  readonly method: ChartCalculationMethod;
  readonly methodVersion: ChartMethodVersion;
  readonly executionProfile: ChartExecutionProfile;
  readonly settings: CanonicalJson;
  readonly inputSnapshot: CanonicalJson;
  readonly calculationBasis?: CanonicalJson;
}): `sha256:${string}` {
  assertMethodVersion(input.method, input.methodVersion);
  const executionProfile = chartExecutionProfileSchema.parse(input.executionProfile);
  return sha256CanonicalJson({
    schemaVersion: "chart-request.v2",
    method: input.method,
    methodVersion: input.methodVersion,
    executionProfile: normalizeExecutionProfile(executionProfile),
    settings: input.settings,
    inputSnapshot: input.inputSnapshot,
    calculationBasis: input.calculationBasis ?? null
  });
}

export function buildChartReproducibilityFingerprint(input: {
  readonly method: ChartCalculationMethod;
  readonly methodVersion: ChartMethodVersion;
  readonly provider: ChartProviderMetadata;
  readonly settings: CanonicalJson;
  readonly inputSnapshot: CanonicalJson;
  readonly calculationBasis?: CanonicalJson;
}): `sha256:${string}` {
  assertMethodVersion(input.method, input.methodVersion);
  const provider = chartProviderMetadataV2Schema.parse(input.provider);
  return sha256CanonicalJson({
    schemaVersion: "chart-result.v2",
    method: input.method,
    methodVersion: input.methodVersion,
    provider: {
      ...provider,
      ephemerisFlags: [...provider.ephemerisFlags].sort()
    },
    settings: input.settings,
    inputSnapshot: input.inputSnapshot,
    calculationBasis: input.calculationBasis ?? null
  });
}

export function buildChartResultReproducibilityFingerprint(
  result: ReproducibleChartResult
): `sha256:${string}` {
  return buildChartReproducibilityFingerprint({
    method: result.method,
    methodVersion: result.methodVersion,
    provider: result.provider,
    settings: result.settings as CanonicalJson,
    inputSnapshot: chartResultFingerprintInput(result),
    calculationBasis:
      result.method === "progression" ? (result.calculationBasis as CanonicalJson) : undefined
  });
}

export function buildChartJobInputSnapshotForResult(result: ChartResult): CanonicalJson {
  if (result.method === "natal") {
    return result.inputSnapshot as CanonicalJson;
  }
  if (result.method === "astrocartography") {
    return { inputSnapshot: result.inputSnapshot as CanonicalJson };
  }
  if (result.method === "transit") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      transitSnapshot: result.transitSnapshot as CanonicalJson
    };
  }
  if (result.method === "synastry" || result.method === "composite") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      partnerInputSnapshot: result.partnerInputSnapshot as CanonicalJson,
      relationshipSnapshot: result.relationshipSnapshot as CanonicalJson
    };
  }
  if (result.method === "solar_return") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      solarReturnSnapshot: omitSnapshotKey(result.solarReturnSnapshot, "resolvedAt")
    };
  }
  if (result.method === "progression") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      progressionSnapshot: omitSnapshotKey(result.progressionSnapshot, "calculationBasis")
    };
  }
  return { questionSnapshot: result.questionSnapshot as CanonicalJson };
}

function chartResultFingerprintInput(result: ReproducibleChartResult): CanonicalJson {
  if (
    result.method === "natal" ||
    result.method === "astrocartography" ||
    result.method === "progression"
  ) {
    return result.inputSnapshot as CanonicalJson;
  }
  if (result.method === "transit") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      transitSnapshot: result.transitSnapshot as CanonicalJson
    };
  }
  if (result.method === "synastry" || result.method === "composite") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      partnerInputSnapshot: result.partnerInputSnapshot as CanonicalJson,
      relationshipSnapshot: result.relationshipSnapshot as CanonicalJson
    };
  }
  if (result.method === "solar_return") {
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      solarReturnSnapshot: result.solarReturnSnapshot as CanonicalJson
    };
  }
  return result.questionSnapshot as CanonicalJson;
}

function omitSnapshotKey(value: object, omittedKey: string): CanonicalJson {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey)
  ) as CanonicalJson;
}

function assertMethodVersion(method: ChartCalculationMethod, methodVersion: ChartMethodVersion): void {
  if (chartMethodVersions[method] !== methodVersion) {
    throw new ChartExecutionProfileError("CHART_METHOD_VERSION_MISMATCH");
  }
}

function normalizeExecutionProfile(profile: ChartExecutionProfile): CanonicalJson {
  return {
    ...profile,
    expectedEphemerisFlags: [...profile.expectedEphemerisFlags].sort()
  };
}
