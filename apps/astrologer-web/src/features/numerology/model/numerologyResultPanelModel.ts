export type NumerologyPersonalMonthItem = {
  readonly label: string;
  readonly value: number;
  readonly isCurrent: boolean;
};

export type NumerologyPersonalMonthPanelModel = {
  readonly year: number | null;
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
  readonly personalMonths: readonly {
    readonly year: number;
    readonly month: number;
    readonly value: number;
  }[];
  readonly currentMonth: number;
}): NumerologyPersonalMonthPanelModel {
  return {
    year: input.personalMonths[0]?.year ?? null,
    items: input.personalMonths.map((month) => ({
      label: monthLabels[month.month - 1] ?? String(month.month),
      value: month.value,
      isCurrent: month.month === input.currentMonth
    }))
  };
}

export function formatNullableNumerologyNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function getPersonalYear(model: {
  readonly personalYear: { readonly year: number; readonly value: number } | null;
}): { readonly year: number; readonly value: number } | null {
  return model.personalYear;
}

export function getPersonalYearEssence(model: {
  readonly keyNumbers: readonly {
    readonly code: string;
    readonly meaning?: { readonly essence?: string | null } | null;
  }[];
}): string | null {
  return model.keyNumbers.find((item) => item.code === "personalYear")?.meaning?.essence ?? null;
}
