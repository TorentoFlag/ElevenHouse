import type { ValidateFlowDefinitionResponseV2 } from "@elevenhouse/contracts";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { ValidateFlowDefinitionInput } from "../api/validateFlowDefinition";
import { validateFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useValidateFlowDefinitionMutation(): UseMutationResult<
  ValidateFlowDefinitionResponseV2,
  Error,
  ValidateFlowDefinitionInput
> {
  return useMutation(validateFlowDefinitionMutationOptions());
}
