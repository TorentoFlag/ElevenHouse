import type { ChartCalculationMethod } from "@elevenhouse/contracts";
import type { ChartAiLocale } from "./prompts/chart-interpretation-draft.v1";

export type ChartAiDraftSubjectKind = "adult" | "child";

export type ChartAiDraftProfile = {
  readonly method: ChartCalculationMethod;
  readonly subjectKind: ChartAiDraftSubjectKind;
  readonly outputContractVersion: 4;
  readonly renderSystemInstruction: (locale: ChartAiLocale) => string;
};

type ChartAiDraftProfileInput = {
  readonly method: ChartCalculationMethod;
  readonly subjectKind: ChartAiDraftSubjectKind;
};

const adultInstructionByMethod: Readonly<
  Record<ChartCalculationMethod, Record<ChartAiLocale, string>>
> = {
  natal: {
    ru: "Ты готовишь редактируемый черновик трактовки натальной карты для профессионального астролога ElevenHouse.",
    en: "You prepare an editable natal chart interpretation draft for a professional ElevenHouse astrologer."
  },
  transit: {
    ru: "Ты готовишь редактируемый черновик трактовки транзитной карты и её актуального временного окна для профессионального астролога ElevenHouse.",
    en: "You prepare an editable transit chart interpretation draft focused on the current time window for a professional ElevenHouse astrologer."
  },
  progression: {
    ru: "Ты готовишь редактируемый черновик трактовки прогрессивной карты как развивающегося жизненного цикла для профессионального астролога ElevenHouse.",
    en: "You prepare an editable progressed-chart interpretation draft as a developing life cycle for a professional ElevenHouse astrologer."
  },
  synastry: {
    ru: "Ты готовишь редактируемый черновик трактовки синастрии как анализа динамики двух карт для профессионального астролога ElevenHouse.",
    en: "You prepare an editable synastry interpretation draft about the dynamics between two charts for a professional ElevenHouse astrologer."
  },
  composite: {
    ru: "Ты готовишь редактируемый черновик трактовки композитной карты как анализа динамики отношений для профессионального астролога ElevenHouse.",
    en: "You prepare an editable composite-chart interpretation draft about relationship dynamics for a professional ElevenHouse astrologer."
  },
  solar_return: {
    ru: "Ты готовишь редактируемый черновик трактовки соляра для соответствующего года жизни для профессионального астролога ElevenHouse.",
    en: "You prepare an editable solar-return interpretation draft for the relevant year of life for a professional ElevenHouse astrologer."
  },
  astrocartography: {
    ru: "Ты готовишь редактируемый черновик трактовки астрографии как анализа угловых линий и контекста местности для профессионального астролога ElevenHouse.",
    en: "You prepare an editable astrocartography interpretation draft about angular lines and location context for a professional ElevenHouse astrologer."
  },
  horary: {
    ru: "Ты готовишь редактируемый черновик трактовки хорарной карты для профессионального астролога ElevenHouse.",
    en: "You prepare an editable horary chart interpretation draft for a professional ElevenHouse astrologer."
  }
};

export function resolveChartAiDraftProfile(input: ChartAiDraftProfileInput): ChartAiDraftProfile {
  if (input.method === "natal" && input.subjectKind === "child") {
    return {
      method: input.method,
      subjectKind: input.subjectKind,
      outputContractVersion: 4,
      renderSystemInstruction(locale) {
        return locale === "ru"
          ? "Ты готовишь редактируемый черновик трактовки натальной карты ребёнка для профессионального астролога ElevenHouse. Используй бережный, возрастно-уместный и нефаталистичный язык; описывай возможности и поддерживающие наблюдения, а не ярлыки или предсказания."
          : "You prepare an editable natal-chart interpretation draft for a child for a professional ElevenHouse astrologer. Use supportive, age-appropriate, non-deterministic language; describe possibilities and supportive observations, never labels or predictions.";
      }
    };
  }

  return {
    method: input.method,
    subjectKind: input.subjectKind,
    outputContractVersion: 4,
    renderSystemInstruction(locale) {
      return adultInstructionByMethod[input.method][locale];
    }
  };
}
