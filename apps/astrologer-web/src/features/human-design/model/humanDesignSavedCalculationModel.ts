import {
  humanDesignCalculationResponseSchema,
  humanDesignIndividualResultSchema,
  type CalculationRecordResponse,
  type HumanDesignCalculationResponse
} from "@elevenhouse/contracts";
import {
  formatBirthDate,
  getClientInitials,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";

export function getActiveHumanDesignCalculations(
  calculations: readonly CalculationRecordResponse[]
): readonly CalculationRecordResponse[] {
  return calculations
    .filter(
      (calculation) =>
        calculation.module === "human_design" &&
        calculation.methodCode === "human_design_classic" &&
        calculation.mode === "individual" &&
        calculation.status !== "archived"
    )
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function toHumanDesignCalculationResponse(
  calculation: CalculationRecordResponse
): HumanDesignCalculationResponse {
  const result = humanDesignIndividualResultSchema.parse(calculation.resultData);
  if (calculation.resultChecksum !== result.resultChecksum.value) {
    throw new Error("Human Design calculation result checksum mismatch");
  }
  if (calculation.requestFingerprint !== result.inputFingerprint.value) {
    throw new Error("Human Design calculation request fingerprint mismatch");
  }

  return humanDesignCalculationResponseSchema.parse({
    calculation,
    result
  });
}

export function toClientOptionFromHumanDesignCalculation(
  calculation: CalculationRecordResponse
): ClientSelectOption | null {
  const subject = calculation.participants.find(
    (participant) => participant.role === "subject" && participant.source === "crm_client"
  );
  if (!subject?.clientId) return null;

  const input = asRecord(calculation.inputData);
  const birthData = asRecord(input?.birthData);
  const birthDate = typeof birthData?.birthDate === "string" ? birthData.birthDate : null;
  const birthDateDisplay = formatBirthDate(birthDate);
  const label = subject.displayName;

  return {
    value: subject.clientId,
    label,
    initials: getClientInitials(label),
    subtitle:
      [birthDateDisplay || birthDate, "сохранённый расчёт"].filter(Boolean).join(" · ") ||
      "Сохранённый расчёт",
    birthDateDisplay: birthDateDisplay || "—",
    hasBirthDate: Boolean(birthDate),
    birthData: null
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
