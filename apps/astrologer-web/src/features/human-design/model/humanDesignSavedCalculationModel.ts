import {
  humanDesignCalculationResponseSchema,
  humanDesignResultSchema,
  type CalculationRecordResponse,
  type HumanDesignCalculationResponse
} from "@elevenhouse/contracts";
import {
  formatBirthDate,
  getClientInitials,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";

export function getActiveHumanDesignCalculations(
  calculations: readonly CalculationRecordResponse[],
  mode: "individual" | "compatibility" = "individual"
): readonly CalculationRecordResponse[] {
  return calculations
    .filter(
      (calculation) =>
        calculation.module === "human_design" &&
        calculation.methodCode === "human_design_classic" &&
        calculation.mode === mode &&
        calculation.status !== "archived"
    )
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function toHumanDesignCalculationResponse(
  calculation: CalculationRecordResponse
): HumanDesignCalculationResponse {
  const result = humanDesignResultSchema.parse(calculation.resultData);
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
  calculation: CalculationRecordResponse,
  role: "subject" | "partner" = "subject"
): ClientSelectOption | null {
  const subject = calculation.participants.find(
    (participant) => participant.role === role && participant.source === "crm_client"
  );
  if (!subject?.clientId) return null;

  const input = asRecord(calculation.inputData);
  const birthData = getBirthDataSnapshot(input, role);
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

function getBirthDataSnapshot(
  input: Record<string, unknown> | null,
  role: "subject" | "partner"
): Record<string, unknown> | null {
  const directBirthData = asRecord(input?.birthData);
  if (directBirthData) return directBirthData;

  const participant = asRecord(input?.[role]);
  return asRecord(participant?.birthData);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
