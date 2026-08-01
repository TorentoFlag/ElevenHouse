import type { SimulateFlowRunResponse } from "@elevenhouse/contracts";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { type SimulateFlowRunInput } from "../api/simulateFlowRun";
import { simulateFlowRunMutationOptions } from "./flowsQueryOptions";

export function useSimulateFlowRunMutation(): UseMutationResult<
  SimulateFlowRunResponse,
  Error,
  SimulateFlowRunInput
> {
  return useMutation(simulateFlowRunMutationOptions());
}
