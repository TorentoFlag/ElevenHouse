import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import type { ChartEngineMode } from "./chartEngineUrlState";

export type ChartCalculationIdentityState =
  | { readonly kind: "pending" }
  | {
      readonly kind: "ready";
      readonly subjectClientId: string;
      readonly partnerClientId: string | null;
    }
  | { readonly kind: "client_mismatch" }
  | { readonly kind: "partner_mismatch" }
  | { readonly kind: "unavailable" };

type ChartCalculationIdentityRecord = Pick<
  CalculationRecordResponse,
  "module" | "status" | "methodCode" | "mode" | "participants" | "inputData" | "resultData"
>;

type ResolvedChartParticipants = {
  readonly subjectClientId: string;
  readonly partnerClientId: string | null;
};

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function resolveChartCalculationIdentity(input: {
  readonly calculation: ChartCalculationIdentityRecord | null | undefined;
  readonly mode: ChartEngineMode;
  readonly selectedClientId: string | null;
  readonly selectedPartnerClientId: string | null;
}): ChartCalculationIdentityState {
  if (input.calculation === undefined) return { kind: "pending" };
  if (
    input.calculation === null ||
    input.calculation.module !== "chart" ||
    input.calculation.status === "archived" ||
    !methodMatchesMode(input.calculation.methodCode, input.mode)
  ) {
    return { kind: "unavailable" };
  }

  const pair = isPairMode(input.mode);
  const participants = pair
    ? resolvePairParticipants(input.calculation, input.mode)
    : resolveIndividualParticipant(input.calculation);
  if (participants === null) return { kind: "unavailable" };

  if (input.selectedClientId !== null && input.selectedClientId !== participants.subjectClientId) {
    return { kind: "client_mismatch" };
  }
  if (
    pair &&
    input.selectedPartnerClientId !== null &&
    input.selectedPartnerClientId !== participants.partnerClientId
  ) {
    return { kind: "partner_mismatch" };
  }

  return {
    kind: "ready",
    ...participants
  };
}

function resolveIndividualParticipant(
  calculation: ChartCalculationIdentityRecord
): ResolvedChartParticipants | null {
  const subject = calculation.participants[0];
  if (
    calculation.mode !== "individual" ||
    calculation.participants.length !== 1 ||
    !isCrmParticipant(subject, "subject")
  ) {
    return null;
  }
  return { subjectClientId: subject.clientId, partnerClientId: null };
}

function resolvePairParticipants(
  calculation: ChartCalculationIdentityRecord,
  method: "synastry" | "composite"
): ResolvedChartParticipants | null {
  const result = asRecord(calculation.resultData);
  if (result?.method !== method) return null;

  if (result.schemaVersion === "chart-result.v1") {
    return resolveLegacyPairParticipants(calculation, result);
  }
  if (result.schemaVersion !== "chart-result.v2") return null;

  const subject = calculation.participants[0];
  const partner = calculation.participants[1];
  if (
    calculation.mode === "compatibility" &&
    calculation.participants.length === 2 &&
    isCrmParticipant(subject, "subject") &&
    isCrmParticipant(partner, "partner") &&
    partner.clientId !== subject.clientId
  ) {
    return { subjectClientId: subject.clientId, partnerClientId: partner.clientId };
  }
  return null;
}

function resolveLegacyPairParticipants(
  calculation: ChartCalculationIdentityRecord,
  result: Record<string, unknown>
): ResolvedChartParticipants | null {
  const subject = calculation.participants[0];
  const partner = calculation.participants[1];
  const hasHistoricalDefect =
    calculation.mode === "individual" &&
    calculation.participants.length === 1 &&
    isCrmParticipant(subject, "subject");
  const hasRepairedIdentity =
    calculation.mode === "compatibility" &&
    calculation.participants.length === 2 &&
    isCrmParticipant(subject, "subject") &&
    isCrmParticipant(partner, "partner") &&
    partner.clientId !== subject.clientId;
  if ((!hasHistoricalDefect && !hasRepairedIdentity) || !isCrmParticipant(subject, "subject")) {
    return null;
  }

  const inputEnvelope = asRecord(calculation.inputData);
  const storedJobInput = asRecord(inputEnvelope?.inputSnapshot);
  const inputRelationship = parseLegacyRelationship(storedJobInput?.relationshipSnapshot);
  const resultRelationship = parseLegacyRelationship(result.relationshipSnapshot);
  if (
    inputRelationship === null ||
    resultRelationship === null ||
    inputRelationship.primaryClientId !== resultRelationship.primaryClientId ||
    inputRelationship.partnerClientId !== resultRelationship.partnerClientId ||
    inputRelationship.primaryClientId !== subject.clientId ||
    (hasRepairedIdentity && inputRelationship.partnerClientId !== partner?.clientId)
  ) {
    return null;
  }
  return {
    subjectClientId: inputRelationship.primaryClientId,
    partnerClientId: inputRelationship.partnerClientId
  };
}

function parseLegacyRelationship(value: unknown): {
  readonly primaryClientId: string;
  readonly partnerClientId: string;
} | null {
  const record = asRecord(value);
  if (
    record === null ||
    Object.keys(record).length !== 2 ||
    typeof record.primaryClientId !== "string" ||
    typeof record.partnerClientId !== "string" ||
    !canonicalUuidPattern.test(record.primaryClientId) ||
    !canonicalUuidPattern.test(record.partnerClientId) ||
    record.primaryClientId === record.partnerClientId
  ) {
    return null;
  }
  return {
    primaryClientId: record.primaryClientId,
    partnerClientId: record.partnerClientId
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isCrmParticipant(
  participant: CalculationRecordResponse["participants"][number] | undefined,
  role: "subject" | "partner"
): participant is CalculationRecordResponse["participants"][number] & {
  readonly clientId: string;
} {
  return (
    participant?.role === role &&
    participant.source === "crm_client" &&
    typeof participant.clientId === "string"
  );
}

function methodMatchesMode(method: string, mode: ChartEngineMode): boolean {
  return method === (mode === "child_chart" ? "natal" : mode);
}

function isPairMode(mode: ChartEngineMode): mode is "synastry" | "composite" {
  return mode === "synastry" || mode === "composite";
}
