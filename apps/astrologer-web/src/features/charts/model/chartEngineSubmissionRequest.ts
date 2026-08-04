import type { ChartSettings, DictionaryLocale } from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import type { ChartEngineCopy } from "./chartEngineCopy";
import type { ChartHoraryQuestionInput, ChartTransitMomentInput } from "./chartEngineInput";
import type { ChartEngineMode } from "./chartEngineMode";
import type { ChartEngineSubmission } from "./chartEngineSubmission";
import { getChartBirthDataReadiness, toChartHoraryQuestionSnapshot } from "./chartEngineState";

type WithoutSubmissionTarget<T> = T extends unknown
  ? Omit<T, "calculationId" | "expectedResultChecksum">
  : never;

export type ChartEngineSubmissionDraft = WithoutSubmissionTarget<ChartEngineSubmission>;

export type ChartEngineSubmissionTarget = {
  readonly calculationId: string | null;
  readonly expectedResultChecksum: string | null;
};

export type ChartEngineSubmissionPreparation =
  | { readonly kind: "ready"; readonly draft: ChartEngineSubmissionDraft }
  | { readonly kind: "blocked"; readonly message: string };

export function prepareChartEngineSubmission(input: {
  readonly mode: ChartEngineMode;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly settings: ChartSettings;
  readonly transitMoment: ChartTransitMomentInput;
  readonly solarReturnYear: number;
  readonly progressionTargetDate: string;
  readonly horaryQuestion: ChartHoraryQuestionInput;
  readonly locale: DictionaryLocale;
  readonly copy: ChartEngineCopy["controller"];
}): ChartEngineSubmissionPreparation {
  const { copy, mode, selectedClient, selectedPartnerClient } = input;
  if (!selectedClient) return { kind: "blocked", message: copy.chooseClient };

  if (mode === "horary") {
    try {
      return {
        kind: "ready",
        draft: {
          mode,
          clientId: selectedClient.value,
          settings: input.settings,
          question: toChartHoraryQuestionSnapshot(input.horaryQuestion, input.locale)
        }
      };
    } catch (error) {
      return {
        kind: "blocked",
        message: error instanceof Error ? error.message : copy.fillHorary
      };
    }
  }

  const readiness = getChartBirthDataReadiness(selectedClient.birthData, input.locale);
  if (!readiness.ready) {
    return { kind: "blocked", message: copy.missingBirthData(readiness.missing) };
  }

  if (mode === "synastry" || mode === "composite") {
    if (!selectedPartnerClient) {
      return { kind: "blocked", message: copy.choosePartner };
    }
    if (selectedClient.value === selectedPartnerClient.value) {
      return {
        kind: "blocked",
        message: mode === "composite" ? copy.compositeOtherClient : copy.synastryOtherClient
      };
    }
    const partnerReadiness = getChartBirthDataReadiness(
      selectedPartnerClient.birthData,
      input.locale
    );
    if (!partnerReadiness.ready) {
      return {
        kind: "blocked",
        message: copy.missingPartnerBirthData(partnerReadiness.missing)
      };
    }
    return {
      kind: "ready",
      draft: {
        mode,
        clientId: selectedClient.value,
        partnerClientId: selectedPartnerClient.value,
        settings: input.settings
      }
    };
  }

  if (mode === "transit") {
    if (!input.transitMoment.date || !input.transitMoment.time) {
      return { kind: "blocked", message: copy.transitMoment };
    }
    return {
      kind: "ready",
      draft: {
        mode,
        clientId: selectedClient.value,
        settings: input.settings,
        transit: input.transitMoment
      }
    };
  }

  if (mode === "solar_return") {
    return {
      kind: "ready",
      draft: {
        mode,
        clientId: selectedClient.value,
        settings: input.settings,
        year: input.solarReturnYear
      }
    };
  }

  if (mode === "progression") {
    if (!input.progressionTargetDate) {
      return { kind: "blocked", message: copy.progressionDate };
    }
    return {
      kind: "ready",
      draft: {
        mode,
        clientId: selectedClient.value,
        settings: input.settings,
        targetDate: input.progressionTargetDate
      }
    };
  }

  return {
    kind: "ready",
    draft: {
      mode,
      clientId: selectedClient.value,
      settings: input.settings
    }
  };
}

export function attachChartEngineSubmissionTarget(
  draft: ChartEngineSubmissionDraft,
  target: ChartEngineSubmissionTarget
): ChartEngineSubmission {
  return { ...draft, ...target } as ChartEngineSubmission;
}
