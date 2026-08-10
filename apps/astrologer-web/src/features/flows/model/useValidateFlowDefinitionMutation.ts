import type { ValidateFlowDefinitionResponse } from "@elevenhouse/contracts";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { ValidateFlowDefinitionInput } from "../api/validateFlowDefinition";
import { validateFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useValidateFlowDefinitionMutation(): UseMutationResult<
  ValidateFlowDefinitionResponse,
  Error,
  ValidateFlowDefinitionInput
> {
  return useMutation(validateFlowDefinitionMutationOptions());
}
