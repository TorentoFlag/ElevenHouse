import type { MigrateFlowDefinitionV2Response } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { MigrateFlowDefinitionInput } from "../api/migrateFlowDefinition";
import { migrateFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useMigrateFlowDefinitionMutation(): UseMutationResult<
  MigrateFlowDefinitionV2Response,
  Error,
  MigrateFlowDefinitionInput
> {
  const queryClient = useQueryClient();

  return useMutation(migrateFlowDefinitionMutationOptions(queryClient));
}
