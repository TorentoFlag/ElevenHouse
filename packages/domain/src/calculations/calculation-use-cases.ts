import { chartResultSchema, type ChartExecutionProfile } from "@elevenhouse/contracts";
import { assertStoredChartCalculationIntegrity } from "../charts/chart-stored-result-integrity";
import { normalizeRequiredString } from "../shared";
import {
  CalculationAlreadyExistsError,
  CalculationInterpretationIdempotencyConflictError,
  CalculationInterpretationModeUnavailableError,
  CalculationNotFoundError,
  CalculationParticipantMismatchError,
  CalculationResultChangedError,
  CalculationValidationError
} from "./calculation-errors";
import type {
  CalculationListResult,
  CalculationRecord,
  CalculationStore,
  CalculationStoreCreateInput,
  CalculationStoreReplaceResultInput
} from "./calculation-store";
import type {
  CalculationInterpretationSource,
  CalculationModuleFilter,
  CalculationParticipant,
  CalculationStatusFilter
} from "./calculation-types";

export async function listCalculations(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly module: CalculationModuleFilter;
  readonly status: CalculationStatusFilter;
  readonly limit: number;
  readonly offset: number;
}): Promise<CalculationListResult> {
  return input.store.listByOwner({
    ownerUserId: required(input.ownerUserId, "Calculation owner user id is required"),
    module: input.module,
    status: input.status,
    limit: normalizeListLimit(input.limit),
    offset: normalizeListOffset(input.offset)
  });
}

export function getCalculation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
}): Promise<CalculationRecord> {
  return requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
}

export async function createCalculation(
  input: Omit<CalculationStoreCreateInput, "now"> & {
    readonly store: CalculationStore;
    readonly now: Date;
    readonly expectedChartExecutionProfile?: ChartExecutionProfile;
  }
): Promise<CalculationRecord> {
  const normalized: CalculationStoreCreateInput = {
    ownerUserId: required(input.ownerUserId, "Calculation owner user id is required"),
    module: input.module,
    mode: input.mode,
    interpretationMode: input.interpretationMode ?? null,
    methodCode: required(input.methodCode, "Calculation method code is required"),
    title: required(input.title, "Calculation title is required"),
    participants: normalizeCalculationParticipants(input.participants),
    linkClientIds: [
      ...new Set(
        input.linkClientIds.map((clientId) =>
          required(clientId, "Calculation client id is required")
        )
      )
    ],
    requestFingerprint: digest(
      input.requestFingerprint,
      "Calculation request fingerprint is invalid"
    ),
    inputData: input.inputData,
    resultData: input.resultData,
    resultSummary: input.resultSummary,
    resultChecksum: digest(input.resultChecksum, "Calculation result checksum is invalid"),
    idGenerator: input.idGenerator,
    now: input.now.toISOString()
  };
  assertLinkClientsAreParticipants(normalized.participants, normalized.linkClientIds);
  const existing = await input.store.findExact(normalized);
  if (!existing) {
    if (normalized.linkClientIds.length > 0) {
      assertClientExposureAllowed(normalized, input.expectedChartExecutionProfile);
    }
    return input.store.create(normalized);
  }
  if (normalized.linkClientIds.length === 0) return existing;
  assertClientExposureAllowed(existing, input.expectedChartExecutionProfile);
  return (
    (await input.store.ensureClientLinks({
      ownerUserId: existing.ownerUserId,
      calculationId: existing.id,
      clientIds: normalized.linkClientIds,
      now: normalized.now
    })) ?? existing
  );
}

export async function recalculateCalculation(
  input: Omit<CalculationStoreReplaceResultInput, "now"> & {
    readonly store: CalculationStore;
    readonly now: Date;
  }
): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const participants = normalizeCalculationParticipants(input.participants);
  assertParticipantIdentityMatches(record.participants, participants);

  const outcome = await input.store.replaceResult({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    ...(input.title === undefined
      ? {}
      : { title: required(input.title, "Calculation title is required") }),
    participants,
    requestFingerprint: digest(
      input.requestFingerprint,
      "Calculation request fingerprint is invalid"
    ),
    inputData: input.inputData,
    resultData: input.resultData,
    resultSummary: input.resultSummary,
    resultChecksum: digest(input.resultChecksum, "Calculation result checksum is invalid"),
    now: input.now.toISOString()
  });

  if (outcome.status === "not_found") throw new CalculationNotFoundError();
  if (outcome.status === "exact_key_conflict") throw new CalculationAlreadyExistsError();
  return outcome.calculation;
}

export async function linkCalculationToClient(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly clientId: string;
  readonly expectedChartExecutionProfile?: ChartExecutionProfile;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  assertClientExposureAllowed(record, input.expectedChartExecutionProfile);
  const clientId = required(input.clientId, "Calculation client id is required");

  if (
    !record.participants.some(
      (participant) => participant.source === "crm_client" && participant.clientId === clientId
    )
  ) {
    throw new CalculationValidationError("Calculation can be linked only to a CRM participant");
  }
  if (record.links.some((link) => link.clientId === clientId)) return record;

  const linked = await input.store.linkClient({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    clientId,
    now: input.now.toISOString()
  });
  if (!linked) throw new CalculationNotFoundError();
  return linked;
}

export async function publishCalculationToClient(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly clientId: string;
  readonly expectedResultChecksum: string;
  readonly expectedChartExecutionProfile?: ChartExecutionProfile;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  assertClientPublicationInterpretationMode(record);
  assertClientExposureAllowed(record, input.expectedChartExecutionProfile);
  const clientId = required(input.clientId, "Calculation client id is required");
  const expectedResultChecksum = digest(
    input.expectedResultChecksum,
    "Calculation result checksum is invalid"
  );

  if (!record.links.some((link) => link.clientId === clientId)) {
    throw new CalculationValidationError("Calculation must be linked before publishing");
  }
  if (record.resultChecksum !== expectedResultChecksum) {
    throw new CalculationValidationError("Publication must target the current result checksum");
  }
  if (!record.interpretations.some((interpretation) => interpretation.status === "approved")) {
    throw new CalculationValidationError(
      "Calculation requires approved interpretation before publishing"
    );
  }

  const published = await input.store.publishClientLink({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    clientId,
    expectedResultChecksum,
    now: input.now.toISOString()
  });
  if (!published) {
    throw new CalculationValidationError("Calculation changed while it was being published");
  }
  return published;
}

export async function saveCalculationInterpretation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly expectedResultChecksum: string;
  readonly source: CalculationInterpretationSource;
  readonly text: string;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly interpretationIdGenerator: () => string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const expectedResultChecksum = digest(
    input.expectedResultChecksum,
    "Expected calculation result checksum is required"
  );
  const saved = await input.store.saveInterpretation({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    expectedResultChecksum,
    source: input.source,
    text: required(input.text, "Calculation interpretation text is required"),
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    interpretationIdGenerator: input.interpretationIdGenerator,
    now: input.now.toISOString()
  });
  if (!saved) throw new CalculationResultChangedError();
  if ("kind" in saved) {
    throw new CalculationInterpretationIdempotencyConflictError();
  }
  return saved;
}

export async function approveCalculationInterpretation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly interpretationId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const interpretationId = required(
    input.interpretationId,
    "Calculation interpretation id is required"
  );
  const interpretation = record.interpretations.find(
    (candidate) => candidate.id === interpretationId
  );
  if (!interpretation) {
    throw new CalculationValidationError("Calculation interpretation was not found");
  }
  if (interpretation.status === "approved") return record;

  const approved = await input.store.approveInterpretation({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    interpretationId,
    now: input.now.toISOString()
  });
  if (!approved) throw new CalculationNotFoundError();
  return approved;
}

export async function archiveCalculation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  if (record.status === "archived") return record;
  const archived = await input.store.archive({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    now: input.now.toISOString()
  });
  if (!archived) throw new CalculationNotFoundError();
  return archived;
}

async function requireOwnedCalculation(
  store: CalculationStore,
  ownerUserId: string,
  calculationId: string
): Promise<CalculationRecord> {
  const record = await store.findByOwnerAndId({
    ownerUserId: required(ownerUserId, "Calculation owner user id is required"),
    calculationId: required(calculationId, "Calculation id is required")
  });
  if (!record) throw new CalculationNotFoundError();
  return record;
}

function assertCalculationCanBeChanged(record: CalculationRecord): void {
  if (record.status === "archived") {
    throw new CalculationValidationError("Archived calculation cannot be changed");
  }
}

function assertClientPublicationInterpretationMode(
  calculation: Pick<CalculationRecord, "module" | "methodCode" | "interpretationMode">
): void {
  if (
    calculation.module === "chart" &&
    calculation.methodCode === "natal" &&
    calculation.interpretationMode !== "adult_natal"
  ) {
    throw new CalculationInterpretationModeUnavailableError();
  }
}

function assertClientExposureAllowed(
  calculation: Pick<
    CalculationRecord,
    "module" | "methodCode" | "inputData" | "resultData" | "resultChecksum"
  >,
  expectedExecutionProfile: ChartExecutionProfile | undefined
): void {
  if (calculation.module !== "chart") return;
  const parsed = chartResultSchema.safeParse(calculation.resultData);
  if (!parsed.success || parsed.data.method !== calculation.methodCode) {
    throw new CalculationValidationError(
      "Chart calculation result is not eligible for client exposure"
    );
  }
  if (parsed.data.schemaVersion === "chart-result.v1") {
    throw new CalculationValidationError(
      "Legacy chart calculation must be recalculated before client exposure"
    );
  }
  if (!expectedExecutionProfile) {
    throw new CalculationValidationError(
      "Chart calculation result is not eligible for client exposure"
    );
  }
  try {
    assertStoredChartCalculationIntegrity({
      calculation,
      expectedExecutionProfile
    });
  } catch {
    throw new CalculationValidationError(
      "Chart calculation result is not eligible for client exposure"
    );
  }
}

function assertParticipantIdentityMatches(
  current: readonly CalculationParticipant[],
  proposed: readonly CalculationParticipant[]
): void {
  if (
    current.length !== proposed.length ||
    current.some((participant, index) => {
      const candidate = proposed[index];
      return (
        !candidate ||
        candidate.role !== participant.role ||
        candidate.source !== participant.source ||
        candidate.clientId !== participant.clientId
      );
    })
  ) {
    throw new CalculationParticipantMismatchError();
  }
}

function assertLinkClientsAreParticipants(
  participants: readonly CalculationParticipant[],
  clientIds: readonly string[]
): void {
  if (
    clientIds.some(
      (clientId) =>
        !participants.some(
          (participant) => participant.source === "crm_client" && participant.clientId === clientId
        )
    )
  ) {
    throw new CalculationValidationError("Calculation can link only CRM participants");
  }
}

function normalizeCalculationParticipants(
  participants: readonly CalculationParticipant[]
): readonly CalculationParticipant[] {
  if (participants.length < 1 || participants.length > 2) {
    throw new CalculationValidationError("Calculation requires one or two participants");
  }
  const roles = new Set<string>();
  return participants.map((participant) => {
    if (roles.has(participant.role)) {
      throw new CalculationValidationError("Calculation participant roles must be unique");
    }
    roles.add(participant.role);
    const displayName = required(
      participant.displayName,
      "Calculation participant display name is required"
    );
    if (participant.source === "crm_client") {
      return {
        ...participant,
        clientId: required(
          participant.clientId ?? "",
          "CRM calculation participant requires client id"
        ),
        displayName
      };
    }
    if (participant.clientId !== null) {
      throw new CalculationValidationError("Manual calculation participant cannot have client id");
    }
    return { ...participant, clientId: null, displayName };
  });
}

function normalizeListLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CalculationValidationError("Calculation list limit must be an integer from 1 to 100");
  }
  return limit;
}

function normalizeListOffset(offset: number): number {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new CalculationValidationError(
      "Calculation list offset must be an integer greater than or equal to 0"
    );
  }
  return offset;
}

function digest(value: string, message: string): string {
  const normalized = required(value, message);
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) throw new CalculationValidationError(message);
  return normalized;
}

function required(value: string, message: string): string {
  try {
    return normalizeRequiredString(value, message);
  } catch {
    throw new CalculationValidationError(message);
  }
}
