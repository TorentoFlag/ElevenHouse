import { chartExecutionProfileSchema, chartMethodVersions } from "@elevenhouse/contracts";
import { normalizeRequiredString } from "../shared";
import type { CanonicalJson } from "../calculations/canonical-json";
import {
  buildChartJobRequestFingerprint,
  canonicalizeChartExecutionProfile
} from "./chart-execution-profile";
import type {
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  CreateOrReuseChartJobInput,
  CreateOrReuseChartJobResult,
  CreateOrReuseNatalJobInput,
  CreateOrReuseNatalJobResult
} from "./chart-types";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;

export async function createChartJob(
  input: { readonly store: ChartCalculationJobStore } & CreateOrReuseChartJobInput
): Promise<CreateOrReuseChartJobResult> {
  const { store, ...creationInput } = input;
  return store.createOrReuseChartJob(validateChartJobCreationInput(creationInput));
}

export async function createNatalChartJob(
  input: { readonly store: ChartCalculationJobStore } & CreateOrReuseNatalJobInput
): Promise<CreateOrReuseNatalJobResult> {
  const { store, ...creationInput } = input;
  const validated = validateChartJobCreationInput({ ...creationInput, method: "natal" });
  const { method, ...natalInput } = validated;
  if (method !== "natal") throw new Error("CHART_METHOD_INVALID");
  return store.createOrReuseNatalJob(natalInput);
}

export async function createChartJobAndRequestCalculation(
  input: {
    readonly store: ChartCalculationCommandStore;
    readonly now: Date;
  } & CreateOrReuseChartJobInput
): Promise<CreateOrReuseChartJobResult> {
  const { store, now, ...creationInput } = input;
  return store.createOrReuseChartJobAndRequestCalculation({
    ...validateChartJobCreationInput(creationInput),
    now: now.toISOString()
  });
}

export async function createNatalChartJobAndRequestCalculation(
  input: {
    readonly store: ChartCalculationCommandStore;
    readonly now: Date;
  } & CreateOrReuseNatalJobInput
): Promise<CreateOrReuseNatalJobResult> {
  const { store, now, ...creationInput } = input;
  const validated = validateChartJobCreationInput({ ...creationInput, method: "natal" });
  const { method, ...natalInput } = validated;
  if (method !== "natal") throw new Error("CHART_METHOD_INVALID");
  return store.createOrReuseNatalJobAndRequestCalculation({
    ...natalInput,
    now: now.toISOString()
  });
}

function validateChartJobCreationInput(
  input: CreateOrReuseChartJobInput
): CreateOrReuseChartJobInput {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Chart owner user id is required");
  const clientId = normalizeRequiredString(input.clientId, "Chart client id is required");
  const inputFingerprint = normalizeRequiredString(
    input.inputFingerprint,
    "Chart input fingerprint is required"
  );
  if (chartMethodVersions[input.method] !== input.methodVersion) {
    throw new Error("CHART_METHOD_VERSION_MISMATCH");
  }
  if (
    (input.method === "natal" &&
      input.interpretationMode !== "adult_natal" &&
      input.interpretationMode !== "child") ||
    (input.method !== "natal" && input.interpretationMode !== "legacy_unclassified")
  ) {
    throw new Error("CHART_NATAL_INTERPRETATION_MODE_INVALID");
  }
  const profile = chartExecutionProfileSchema.safeParse(input.executionProfile);
  if (!profile.success) throw new Error("CHART_EXECUTION_PROFILE_INVALID");
  const executionProfile = canonicalizeChartExecutionProfile(profile.data);
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts <= 0) {
    throw new Error("CHART_JOB_MAX_ATTEMPTS_INVALID");
  }
  if (!sha256Pattern.test(inputFingerprint)) throw new Error("CHART_JOB_FINGERPRINT_INVALID");
  if (!hasValidReplacementPair(input.targetCalculationId, input.expectedSourceChecksum)) {
    throw new Error("CHART_JOB_REPLACEMENT_PAIR_INVALID");
  }
  if (!hasValidParticipants(input.method, clientId, input.participants)) {
    throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
  }
  const expectedFingerprint = buildChartJobRequestFingerprint({
    ownerUserId,
    method: input.method,
    methodVersion: input.methodVersion,
    executionProfile,
    interpretationMode: input.interpretationMode,
    settings: input.settingsSnapshot as CanonicalJson,
    inputSnapshot: input.inputSnapshot as CanonicalJson,
    participants: input.participants,
    targetCalculationId: input.targetCalculationId,
    expectedSourceChecksum: input.expectedSourceChecksum
  });
  if (inputFingerprint !== expectedFingerprint) {
    throw new Error("CHART_JOB_FINGERPRINT_MISMATCH");
  }
  return {
    ...input,
    ownerUserId,
    clientId,
    inputFingerprint,
    executionProfile,
    participants: input.participants.map((participant) => ({ ...participant }))
  };
}

function hasValidReplacementPair(
  targetCalculationId: string | null,
  expectedSourceChecksum: string | null
): boolean {
  if (targetCalculationId === null && expectedSourceChecksum === null) return true;
  return (
    targetCalculationId !== null &&
    expectedSourceChecksum !== null &&
    canonicalUuidPattern.test(targetCalculationId) &&
    sha256Pattern.test(expectedSourceChecksum)
  );
}

function hasValidParticipants(
  method: CreateOrReuseChartJobInput["method"],
  clientId: string,
  participants: readonly CreateOrReuseChartJobInput["participants"][number][]
): boolean {
  const relationship = method === "synastry" || method === "composite";
  if (participants.length !== (relationship ? 2 : 1)) return false;
  const [subject, partner] = participants;
  if (
    !subject ||
    subject.role !== "subject" ||
    subject.clientId !== clientId ||
    !canonicalUuidPattern.test(subject.clientId)
  ) {
    return false;
  }
  if (!relationship) return partner === undefined;
  return Boolean(
    partner &&
    partner.role === "partner" &&
    canonicalUuidPattern.test(partner.clientId) &&
    partner.clientId !== subject.clientId
  );
}
