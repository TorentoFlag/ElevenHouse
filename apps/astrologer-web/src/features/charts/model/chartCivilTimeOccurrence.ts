import type { DictionaryLocale } from "@elevenhouse/contracts";

export type ChartDstOccurrence = "first" | "second";

export type ChartCivilMomentDraft = {
  readonly date: string;
  readonly time: string;
  readonly timezone?: string;
  readonly dstOccurrence?: ChartDstOccurrence;
};

export type ChartDstOccurrenceCopy = {
  readonly label: string;
  readonly none: string;
  readonly first: string;
  readonly second: string;
  readonly helper: string;
};

export const chartDstOccurrenceCopyByLocale = {
  ru: {
    label: "Повторный час",
    none: "Не выбрано",
    first: "Первое вхождение",
    second: "Второе вхождение",
    helper: "Выберите вариант только если местное время повторялось при переводе часов."
  },
  en: {
    label: "Repeated hour",
    none: "Not selected",
    first: "First occurrence",
    second: "Second occurrence",
    helper: "Choose only when the local clock time occurred twice during a DST change."
  }
} satisfies Record<DictionaryLocale, ChartDstOccurrenceCopy>;

export function updateChartCivilMoment<T extends ChartCivilMomentDraft>(
  current: T,
  patch: Partial<ChartCivilMomentDraft>
): T {
  const civilMomentChanged =
    (hasOwn(patch, "date") && patch.date !== current.date) ||
    (hasOwn(patch, "time") && patch.time !== current.time) ||
    (hasOwn(patch, "timezone") && patch.timezone !== current.timezone);
  const next = { ...current, ...patch } as T & {
    dstOccurrence?: ChartDstOccurrence;
  };

  if (civilMomentChanged || (hasOwn(patch, "dstOccurrence") && patch.dstOccurrence === undefined)) {
    delete next.dstOccurrence;
  }

  return next;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
