import type { CalculationRecordResponse } from "@elevenhouse/contracts";

export function getLatestCalculationVersion(calculation: CalculationRecordResponse) {
  return calculation.versions.reduce<CalculationRecordResponse["versions"][number] | null>(
    (latest, version) => {
      if (!latest || version.versionNumber > latest.versionNumber) return version;
      return latest;
    },
    null
  );
}

export function canLinkCalculation(calculation: CalculationRecordResponse | null): boolean {
  if (!calculation || calculation.status === "archived") return false;

  return calculation.participants.some(
    (participant) => participant.source === "crm_client" && participant.clientId
  );
}

export function getFirstLinkableClientId(calculation: CalculationRecordResponse | null) {
  return (
    calculation?.participants.find(
      (participant) => participant.source === "crm_client" && participant.clientId
    )?.clientId ?? null
  );
}

export function isCalculationLinked(calculation: CalculationRecordResponse | null): boolean {
  return Boolean(calculation?.links.length);
}

export function hasApprovedCurrentInterpretation(
  calculation: CalculationRecordResponse | null
): boolean {
  const latestVersion = calculation ? getLatestCalculationVersion(calculation) : null;
  if (!calculation || !latestVersion) return false;

  return calculation.interpretations.some(
    (interpretation) =>
      interpretation.versionId === latestVersion.id && interpretation.status === "approved"
  );
}

export function canPublishCalculation(calculation: CalculationRecordResponse | null): boolean {
  return (
    Boolean(calculation) &&
    calculation!.status !== "archived" &&
    isCalculationLinked(calculation) &&
    hasApprovedCurrentInterpretation(calculation)
  );
}
