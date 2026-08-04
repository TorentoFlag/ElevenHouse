import {
  chartExecutionProfileSchema,
  chartMethodVersions,
  chartProviderMetadataV2Schema,
  isReproducibleChartResult,
  type ChartCalculationMethod,
  type ChartExecutionProfile,
  type ChartInterpretationMode,
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
    throw new ChartExecutionProfileError(
      "CHART_ENGINE_EXPECTED_EPHEMERIS is required in production"
    );
  }
  const expectedEphemeris = configuredEphemeris ?? "moshier";
  if (expectedEphemeris !== "swiss-ephemeris" && expectedEphemeris !== "moshier") {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_EPHEMERIS is unsupported");
  }
  if (isProduction && expectedEphemeris === "moshier") {
    throw new ChartExecutionProfileError(
      "CHART_ENGINE_EXPECTED_EPHEMERIS moshier is not allowed in production"
    );
  }
  const configuredFlags = source.CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS?.split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);
  if (isProduction && !configuredFlags?.length) {
    throw new ChartExecutionProfileError(
      "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS is required in production"
    );
  }
  const dataRevision = source.CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION?.trim() || null;
  if (dataRevision === "unknown") {
    throw new ChartExecutionProfileError(
      "CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION is unsupported"
    );
  }
  if (expectedEphemeris === "moshier" && dataRevision !== null) {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION_FORBIDDEN");
  }
  if (
    source.CHART_ENGINE_EXPECTED_KERYKEION_VERSION?.trim() &&
    source.CHART_ENGINE_EXPECTED_KERYKEION_VERSION.trim() !== "5.12.9"
  ) {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_KERYKEION_VERSION is unsupported");
  }
  if (
    source.CHART_ENGINE_EXPECTED_PYSWISSEPH_VERSION?.trim() &&
    source.CHART_ENGINE_EXPECTED_PYSWISSEPH_VERSION.trim() !== "2.10.3.2"
  ) {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXPECTED_PYSWISSEPH_VERSION is unsupported");
  }
  return canonicalizeChartExecutionProfile({
    provider: "kerykeion" as const,
    kerykeionVersion: "5.12.9" as const,
    pyswissephVersion: "2.10.3.2" as const,
    expectedEphemeris,
    expectedEphemerisFlags:
      configuredFlags ??
      (expectedEphemeris === "swiss-ephemeris"
        ? ["FLG_SWIEPH", "FLG_SPEED"]
        : ["FLG_MOSEPH", "FLG_SPEED"]),
    expectedEphemerisDataRevision: dataRevision
  });
}

export function canonicalizeChartExecutionProfile(value: unknown): ChartExecutionProfile {
  const parsed = chartExecutionProfileSchema.safeParse(value);
  if (!parsed.success) {
    throw new ChartExecutionProfileError("CHART_ENGINE_EXECUTION_PROFILE_INVALID");
  }
  return {
    ...parsed.data,
    expectedEphemerisFlags: [...parsed.data.expectedEphemerisFlags].sort()
  };
}

export function buildChartJobRequestFingerprint(input: {
  readonly ownerUserId: string;
  readonly method: ChartCalculationMethod;
  readonly methodVersion: ChartMethodVersion;
  readonly executionProfile: ChartExecutionProfile;
  readonly interpretationMode?: ChartInterpretationMode;
  readonly settings: CanonicalJson;
  readonly inputSnapshot: CanonicalJson;
  readonly participants: readonly {
    readonly role: "subject" | "partner";
    readonly clientId: string;
  }[];
  readonly targetCalculationId?: string | null;
  readonly expectedSourceChecksum?: string | null;
  readonly calculationBasis?: CanonicalJson;
}): `sha256:${string}` {
  const targetCalculationId = input.targetCalculationId ?? null;
  const expectedSourceChecksum = input.expectedSourceChecksum ?? null;
  if ((targetCalculationId === null) !== (expectedSourceChecksum === null)) {
    throw new ChartExecutionProfileError("CHART_JOB_REPLACEMENT_PAIR_INVALID");
  }
  return sha256CanonicalJson({
    schemaVersion: "chart-job-command.v2",
    calculationRequestFingerprint: buildChartCalculationRequestFingerprint(input),
    purpose: targetCalculationId === null ? "initial" : "replacement",
    targetCalculationId,
    expectedSourceChecksum
  });
}

export function buildChartCalculationRequestFingerprint(input: {
  readonly ownerUserId: string;
  readonly method: ChartCalculationMethod;
  readonly methodVersion: ChartMethodVersion;
  readonly executionProfile: ChartExecutionProfile;
  readonly interpretationMode?: ChartInterpretationMode;
  readonly settings: CanonicalJson;
  readonly inputSnapshot: CanonicalJson;
  readonly participants: readonly {
    readonly role: "subject" | "partner";
    readonly clientId: string;
  }[];
  readonly calculationBasis?: CanonicalJson;
}): `sha256:${string}` {
  const interpretationMode = input.interpretationMode ?? "legacy_unclassified";
  return sha256CanonicalJson({
    schemaVersion: "chart-calculation-request.v2",
    ownerUserId: input.ownerUserId,
    providerRequestFingerprint: buildChartRequestFingerprint(input),
    participants: input.participants.map((participant, order) => ({
      order,
      role: participant.role,
      clientId: participant.clientId
    })),
    ...(interpretationMode === "legacy_unclassified" ? {} : { interpretationMode })
  });
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
  const executionProfile = canonicalizeChartExecutionProfile(input.executionProfile);
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

export function hasValidChartResultReproducibilityFingerprint(
  value: unknown
): value is ReproducibleChartResult {
  return (
    isReproducibleChartResult(value) &&
    value.reproducibilityFingerprint === buildChartResultReproducibilityFingerprint(value)
  );
}

export function isChartResultProducedByExecutionProfile(
  result: ReproducibleChartResult,
  expectedProfile: ChartExecutionProfile
): boolean {
  const profile = canonicalizeChartExecutionProfile(expectedProfile);
  return (
    result.provider.name === profile.provider &&
    result.provider.version === profile.kerykeionVersion &&
    result.provider.pyswissephVersion === profile.pyswissephVersion &&
    result.provider.ephemeris === profile.expectedEphemeris &&
    stableFlags(result.provider.ephemerisFlags) === stableFlags(profile.expectedEphemerisFlags) &&
    result.provider.ephemerisDataRevision === profile.expectedEphemerisDataRevision
  );
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
    if (result.schemaVersion === "chart-result.v1") {
      return {
        inputSnapshot: result.inputSnapshot as CanonicalJson,
        partnerInputSnapshot: result.partnerInputSnapshot as CanonicalJson,
        relationshipSnapshot: result.relationshipSnapshot as CanonicalJson
      };
    }
    return {
      inputSnapshot: result.inputSnapshot as CanonicalJson,
      partnerInputSnapshot: result.partnerInputSnapshot as CanonicalJson
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
      partnerInputSnapshot: result.partnerInputSnapshot as CanonicalJson
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

function assertMethodVersion(
  method: ChartCalculationMethod,
  methodVersion: ChartMethodVersion
): void {
  if (chartMethodVersions[method] !== methodVersion) {
    throw new ChartExecutionProfileError("CHART_METHOD_VERSION_MISMATCH");
  }
}

function normalizeExecutionProfile(profile: ChartExecutionProfile): CanonicalJson {
  return canonicalizeChartExecutionProfile(profile) as CanonicalJson;
}

function stableFlags(flags: readonly string[]): string {
  return JSON.stringify([...flags].sort());
}
