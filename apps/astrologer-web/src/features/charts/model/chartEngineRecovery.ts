import type { ChartJobResponse } from "@elevenhouse/contracts";
import type { ChartJobSubmissionResponse } from "../api/chartsApi";
import type { ChartEngineCopy } from "./chartEngineCopy";
import type { ChartEngineSubmission } from "./chartEngineSubmission";
import type { ChartEngineUrlState } from "./chartEngineUrlState";

export type ChartRecalculationTarget = {
  readonly calculationId: string;
  readonly expectedResultChecksum: string;
};

export function buildSubmissionUrlState(input: {
  readonly current: ChartEngineUrlState;
  readonly submission: ChartEngineSubmission;
  readonly response: ChartJobSubmissionResponse;
}): ChartEngineUrlState {
  const { submission, response } = input;
  return {
    mode: submission.mode,
    clientId: submission.clientId,
    partnerClientId:
      submission.mode === "synastry" || submission.mode === "composite"
        ? submission.partnerClientId
        : null,
    jobId: response.status === "calculating" ? response.jobId : null,
    calculationId: response.status === "succeeded" ? response.calculationId : null,
    transitDate: submission.mode === "transit" ? submission.transit.date : null,
    transitTime: submission.mode === "transit" ? submission.transit.time : null,
    solarReturnYear: submission.mode === "solar_return" ? submission.year : null,
    progressionTargetDate: submission.mode === "progression" ? submission.targetDate : null,
    horaryPlaceProvider: submission.mode === "horary" ? input.current.horaryPlaceProvider : null,
    horaryPlaceId: submission.mode === "horary" ? input.current.horaryPlaceId : null
  };
}

export function getChartJobRecalculationTarget(
  job: ChartJobResponse | undefined,
  expectedJobId: string | null
): ChartRecalculationTarget | null {
  if (
    !job ||
    !expectedJobId ||
    job.id !== expectedJobId ||
    !job.targetCalculationId ||
    !job.expectedSourceChecksum
  ) {
    return null;
  }

  return {
    calculationId: job.targetCalculationId,
    expectedResultChecksum: job.expectedSourceChecksum
  };
}

export function resolveChartRecalculationTarget(
  pendingTarget: ChartRecalculationTarget | null,
  ownerScopedJobTarget: ChartRecalculationTarget | null,
  copy: ChartEngineCopy["controller"]
): { readonly target: ChartRecalculationTarget | null; readonly errorMessage: string | null } {
  if (
    pendingTarget &&
    ownerScopedJobTarget &&
    (pendingTarget.calculationId !== ownerScopedJobTarget.calculationId ||
      pendingTarget.expectedResultChecksum !== ownerScopedJobTarget.expectedResultChecksum)
  ) {
    return { target: null, errorMessage: copy.wrongJobTarget };
  }

  return { target: ownerScopedJobTarget ?? pendingTarget, errorMessage: null };
}

export function getExactChartCalculationRefreshKeys(
  calculationId: string
): readonly (readonly string[])[] {
  return [
    ["charts", "calculations", calculationId],
    ["calculations", calculationId]
  ];
}
