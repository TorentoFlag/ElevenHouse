import {
  flowDefinitionDetailSchema,
  listFlowDefinitionsQuerySchema,
  listFlowDefinitionsResponseSchema,
  type FlowDefinitionDetail,
  type FlowDefinitionSummary,
  type ListFlowDefinitionsQuery,
  type ListFlowDefinitionsQueryInput,
  type FlowRuntimeAvailability
} from "@elevenhouse/contracts";

import { FlowDefinitionIntegrityError } from "./flow-definition-control-plane";

export type FlowDefinitionReadPage = {
  readonly flows: readonly FlowDefinitionSummary[];
  readonly total: number;
};

export type FlowDefinitionReadResult = FlowDefinitionReadPage & {
  readonly runtime: FlowRuntimeAvailability;
};

export type FlowDefinitionReadStore = {
  readonly listByOwner: (input: {
    readonly ownerUserId: string;
    readonly query: ListFlowDefinitionsQuery;
  }) => Promise<FlowDefinitionReadPage>;
  readonly getByOwner: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
  }) => Promise<FlowDefinitionDetail | null>;
};

export async function listFlowDefinitions(input: {
  readonly store: FlowDefinitionReadStore;
  readonly ownerUserId: string;
  readonly query: ListFlowDefinitionsQueryInput;
  readonly runtime: FlowRuntimeAvailability;
}): Promise<FlowDefinitionReadResult> {
  const query = listFlowDefinitionsQuerySchema.parse(input.query);
  const page = await input.store.listByOwner({ ownerUserId: input.ownerUserId, query });

  try {
    const response = listFlowDefinitionsResponseSchema.parse({
      flows: page.flows,
      total: page.total,
      runtime: input.runtime
    });
    return { flows: response.flows, total: response.total, runtime: response.runtime };
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}

export async function getFlowDefinition(input: {
  readonly store: FlowDefinitionReadStore;
  readonly ownerUserId: string;
  readonly flowId: string;
}): Promise<FlowDefinitionDetail | null> {
  const detail = await input.store.getByOwner({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (detail === null) return null;

  try {
    return flowDefinitionDetailSchema.parse(detail);
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}
