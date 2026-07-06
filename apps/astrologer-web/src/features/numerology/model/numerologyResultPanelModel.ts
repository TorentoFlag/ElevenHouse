export type NumerologyPersonalMonthItem = {
  readonly label: string;
  readonly value: number | null;
  readonly isCurrent: boolean;
};

export type NumerologyPersonalMonthPanelModel = {
  readonly year: number;
  readonly items: readonly NumerologyPersonalMonthItem[];
};

const monthLabels = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек"
] as const;

export function buildPersonalMonthItems(input: {
  readonly personalYear: number | null;
  readonly currentDate: Date;
}): NumerologyPersonalMonthPanelModel {
  const currentMonth = input.currentDate.getMonth();

  return {
    year: input.currentDate.getFullYear(),
    items: monthLabels.map((label, index) => ({
      label,
      value: input.personalYear ? reduceNumerologyRoot(input.personalYear + index + 1) : null,
      isCurrent: index === currentMonth
    }))
  };
}

export function formatNullableNumerologyNumber(value: number | null): string {
  if (value === null) return "—";
  return String(value);
}

export function getPersonalYear(model: {
  readonly keyNumbers: readonly { readonly code: string; readonly value: number | null }[];
}): number | null {
  return model.keyNumbers.find((item) => item.code === "personalYear")?.value ?? null;
}

export function getPersonalYearEssence(model: {
  readonly keyNumbers: readonly {
    readonly code: string;
    readonly meaning?: { readonly essence?: string | null } | null;
  }[];
}): string | null {
  return model.keyNumbers.find((item) => item.code === "personalYear")?.meaning?.essence ?? null;
}

export function reduceNumerologyRoot(value: number): number {
  let result = value;
  while (result > 9) {
    result = String(result)
      .split("")
      .reduce((total, digit) => total + Number(digit), 0);
  }
  return result;
}
