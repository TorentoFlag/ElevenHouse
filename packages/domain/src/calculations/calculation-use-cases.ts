import { normalizeRequiredString } from "../shared";
import { CalculationNotFoundError, CalculationValidationError } from "./calculation-errors";
import type {
  CalculationListResult,
  CalculationRecord,
  CalculationStore,
  CalculationStoreAppendVersionInput,
  CalculationStoreCreateInput
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
  // Store contract returns updatedAt desc, id desc with total counted before pagination.
  const limit = normalizeListLimit(input.limit);
  const offset = normalizeListOffset(input.offset);

  return input.store.listByOwner({
    ownerUserId: normalizeRequiredCalculationString(
      input.ownerUserId,
      "Calculation owner user id is required"
    ),
    module: input.module,
    status: input.status,
    limit,
    offset
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
  }
): Promise<CalculationRecord> {
  return input.store.create({
    ownerUserId: normalizeRequiredCalculationString(
      input.ownerUserId,
      "Calculation owner user id is required"
    ),
    module: input.module,
    mode: input.mode,
    methodCode: normalizeRequiredCalculationString(
      input.methodCode,
      "Calculation method code is required"
    ),
    methodVersion: normalizeRequiredCalculationString(
      input.methodVersion,
      "Calculation method version is required"
    ),
    title: normalizeRequiredCalculationString(input.title, "Calculation title is required"),
    participants: normalizeCalculationParticipants(input.participants),
    settingsSnapshot: input.settingsSnapshot,
    inputSnapshot: input.inputSnapshot,
    resultSnapshot: input.resultSnapshot,
    resultSummary: input.resultSummary,
    resultChecksum: normalizeRequiredCalculationString(
      input.resultChecksum,
      "Calculation result checksum is required"
    ),
    idGenerator: input.idGenerator,
    versionIdGenerator: input.versionIdGenerator,
    now: input.now.toISOString()
  });
}

export async function recalculateCalculation(
  input: Omit<CalculationStoreAppendVersionInput, "now"> & {
    readonly store: CalculationStore;
    readonly ownerUserId: string;
    readonly now: Date;
  }
): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const updated = await input.store.appendVersion({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    methodVersion: normalizeRequiredCalculationString(
      input.methodVersion,
      "Calculation method version is required"
    ),
    settingsSnapshot: input.settingsSnapshot,
    inputSnapshot: input.inputSnapshot,
    resultSnapshot: input.resultSnapshot,
    resultSummary: input.resultSummary,
    resultChecksum: normalizeRequiredCalculationString(
      input.resultChecksum,
      "Calculation result checksum is required"
    ),
    versionIdGenerator: input.versionIdGenerator,
    now: input.now.toISOString()
  });
  if (!updated) {
    throw new CalculationNotFoundError();
  }
  return updated;
}

export async function linkCalculationToClient(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly clientId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const clientId = normalizeRequiredCalculationString(
    input.clientId,
    "Calculation client id is required"
  );

  if (
    !record.participants.some(
      (participant) => participant.source === "crm_client" && participant.clientId === clientId
    )
  ) {
    throw new CalculationValidationError("Calculation can be linked only to a CRM participant");
  }
  if (record.links.some((link) => link.clientId === clientId)) {
    return record;
  }

  const linked = await input.store.linkClient({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    clientId,
    now: input.now.toISOString()
  });
  if (!linked) {
    throw new CalculationNotFoundError();
  }
  return linked;
}

export async function publishCalculationToClient(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly clientId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const clientId = normalizeRequiredCalculationString(
    input.clientId,
    "Calculation client id is required"
  );
  const latestVersion = getLatestVersion(record);

  if (!record.links.some((link) => link.clientId === clientId)) {
    throw new CalculationValidationError("Calculation must be linked before publishing");
  }
  if (
    !latestVersion ||
    !record.interpretations.some(
      (interpretation) =>
        interpretation.versionId === latestVersion.id && interpretation.status === "approved"
    )
  ) {
    throw new CalculationValidationError(
      "Calculation requires approved interpretation before publishing"
    );
  }

  const published = await input.store.publishClientLink({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    clientId,
    expectedVersionId: latestVersion.id,
    now: input.now.toISOString()
  });
  if (!published) {
    throw new CalculationNotFoundError();
  }
  return published;
}

export async function saveCalculationInterpretation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly versionId: string;
  readonly source: CalculationInterpretationSource;
  readonly text: string;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly interpretationIdGenerator: () => string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  assertCalculationCanBeChanged(record);
  const versionId = normalizeRequiredCalculationString(
    input.versionId,
    "Calculation version id is required"
  );
  if (!record.versions.some((version) => version.id === versionId)) {
    throw new CalculationValidationError("Calculation version was not found");
  }

  const saved = await input.store.saveInterpretation({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    versionId,
    source: input.source,
    text: normalizeRequiredCalculationString(
      input.text,
      "Calculation interpretation text is required"
    ),
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    interpretationIdGenerator: input.interpretationIdGenerator,
    now: input.now.toISOString()
  });
  if (!saved) {
    throw new CalculationNotFoundError();
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
  const interpretationId = normalizeRequiredCalculationString(
    input.interpretationId,
    "Calculation interpretation id is required"
  );
  if (!record.interpretations.some((interpretation) => interpretation.id === interpretationId)) {
    throw new CalculationValidationError("Calculation interpretation was not found");
  }

  const approved = await input.store.approveInterpretation({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    interpretationId,
    now: input.now.toISOString()
  });
  if (!approved) {
    throw new CalculationNotFoundError();
  }
  return approved;
}

export async function archiveCalculation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  if (record.status === "archived") {
    return record;
  }

  const archived = await input.store.archive({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    now: input.now.toISOString()
  });
  if (!archived) {
    throw new CalculationNotFoundError();
  }
  return archived;
}

async function requireOwnedCalculation(
  store: CalculationStore,
  ownerUserId: string,
  calculationId: string
): Promise<CalculationRecord> {
  const record = await store.findByOwnerAndId({
    ownerUserId: normalizeRequiredCalculationString(
      ownerUserId,
      "Calculation owner user id is required"
    ),
    calculationId: normalizeRequiredCalculationString(calculationId, "Calculation id is required")
  });
  if (!record) {
    throw new CalculationNotFoundError();
  }
  return record;
}

function assertCalculationCanBeChanged(record: CalculationRecord): void {
  if (record.status === "archived") {
    throw new CalculationValidationError("Archived calculation cannot be changed");
  }
}

function getLatestVersion(record: CalculationRecord) {
  return record.versions.reduce<(typeof record.versions)[number] | null>((latest, version) => {
    if (!latest || version.versionNumber > latest.versionNumber) {
      return version;
    }
    return latest;
  }, null);
}

function normalizeCalculationParticipants(
  participants: readonly CalculationParticipant[]
): readonly CalculationParticipant[] {
  if (participants.length === 0) {
    throw new CalculationValidationError("Calculation requires at least one participant");
  }

  return participants.map((participant) => {
    const displayName = normalizeRequiredCalculationString(
      participant.displayName,
      "Calculation participant display name is required"
    );
    const birthDate =
      participant.birthDate === null
        ? null
        : normalizeOptionalCalculationBirthDate(participant.birthDate);

    if (participant.source === "crm_client") {
      return {
        ...participant,
        clientId: normalizeRequiredCalculationString(
          participant.clientId ?? "",
          "CRM calculation participant requires client id"
        ),
        displayName,
        birthDate
      };
    }

    if (participant.clientId !== null) {
      throw new CalculationValidationError("Manual calculation participant cannot have client id");
    }

    return {
      ...participant,
      clientId: null,
      displayName,
      birthDate
    };
  });
}

function normalizeOptionalCalculationBirthDate(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new CalculationValidationError("Calculation participant birth date cannot be blank");
  }
  return normalized;
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

function normalizeRequiredCalculationString(value: string, message: string): string {
  try {
    return normalizeRequiredString(value, message);
  } catch {
    throw new CalculationValidationError(message);
  }
}
