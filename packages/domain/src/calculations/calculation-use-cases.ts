import { normalizeRequiredString } from "../shared";
import { CalculationNotFoundError, CalculationValidationError } from "./calculation-errors";
import type {
  CalculationRecord,
  CalculationStore,
  CalculationStoreAppendVersionInput,
  CalculationStoreCreateInput
} from "./calculation-store";
import type { CalculationInterpretationSource } from "./calculation-types";

export async function createCalculation(
  input: Omit<CalculationStoreCreateInput, "now"> & {
    readonly store: CalculationStore;
    readonly now: Date;
  }
): Promise<CalculationRecord> {
  return input.store.create({
    ownerUserId: normalizeRequiredString(
      input.ownerUserId,
      "Calculation owner user id is required"
    ),
    module: input.module,
    mode: input.mode,
    methodCode: normalizeRequiredString(input.methodCode, "Calculation method code is required"),
    methodVersion: normalizeRequiredString(
      input.methodVersion,
      "Calculation method version is required"
    ),
    title: normalizeRequiredString(input.title, "Calculation title is required"),
    participants: input.participants,
    settingsSnapshot: input.settingsSnapshot,
    inputSnapshot: input.inputSnapshot,
    resultSnapshot: input.resultSnapshot,
    resultSummary: input.resultSummary,
    resultChecksum: normalizeRequiredString(
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
    methodVersion: normalizeRequiredString(
      input.methodVersion,
      "Calculation method version is required"
    ),
    settingsSnapshot: input.settingsSnapshot,
    inputSnapshot: input.inputSnapshot,
    resultSnapshot: input.resultSnapshot,
    resultSummary: input.resultSummary,
    resultChecksum: normalizeRequiredString(
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
  const clientId = normalizeRequiredString(input.clientId, "Calculation client id is required");

  if (
    !record.participants.some(
      (participant) => participant.source === "crm_client" && participant.clientId === clientId
    )
  ) {
    throw new CalculationValidationError("Calculation can be linked only to a CRM participant");
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
  const clientId = normalizeRequiredString(input.clientId, "Calculation client id is required");
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
  const versionId = normalizeRequiredString(input.versionId, "Calculation version id is required");
  if (!record.versions.some((version) => version.id === versionId)) {
    throw new CalculationValidationError("Calculation version was not found");
  }

  const saved = await input.store.saveInterpretation({
    ownerUserId: record.ownerUserId,
    calculationId: record.id,
    versionId,
    source: input.source,
    text: normalizeRequiredString(
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
  const interpretationId = normalizeRequiredString(
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
    ownerUserId: normalizeRequiredString(ownerUserId, "Calculation owner user id is required"),
    calculationId: normalizeRequiredString(calculationId, "Calculation id is required")
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
