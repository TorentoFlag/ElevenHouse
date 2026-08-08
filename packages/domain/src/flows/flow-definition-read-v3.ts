import {
  flowDefinitionDetailV3Schema,
  listFlowDefinitionsV3QuerySchema,
  listFlowDefinitionsV3ResponseSchema,
  type FlowDefinitionDetailV3,
  type FlowDefinitionSummaryV3,
  type ListFlowDefinitionsV3Query,
  type ListFlowDefinitionsV3QueryInput,
  type FlowRuntimeAvailability
} from "@elevenhouse/contracts";

import { FlowDefinitionIntegrityError } from "./flow-definition-control-plane";

export type FlowDefinitionReadV3Page = {
  readonly flows: readonly FlowDefinitionSummaryV3[];
  readonly total: number;
};

export type FlowDefinitionReadV3Result = FlowDefinitionReadV3Page & {
  readonly runtime: FlowRuntimeAvailability;
};

export type FlowDefinitionReadV3Store = {
  readonly listByOwner: (input: {
    readonly ownerUserId: string;
    readonly query: ListFlowDefinitionsV3Query;
  }) => Promise<FlowDefinitionReadV3Page>;
  readonly getByOwner: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
  }) => Promise<FlowDefinitionDetailV3 | null>;
};

export async function listFlowDefinitionsV3(input: {
  readonly store: FlowDefinitionReadV3Store;
  readonly ownerUserId: string;
  readonly query: ListFlowDefinitionsV3QueryInput;
  readonly runtime: FlowRuntimeAvailability;
}): Promise<FlowDefinitionReadV3Result> {
  const query = listFlowDefinitionsV3QuerySchema.parse(input.query);
  const page = await input.store.listByOwner({ ownerUserId: input.ownerUserId, query });

  try {
    const response = listFlowDefinitionsV3ResponseSchema.parse({
      schemaVersion: "flow-definition-list.v3",
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

export async function getFlowDefinitionV3(input: {
  readonly store: FlowDefinitionReadV3Store;
  readonly ownerUserId: string;
  readonly flowId: string;
}): Promise<FlowDefinitionDetailV3 | null> {
  const detail = await input.store.getByOwner({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (detail === null) return null;

  try {
    return flowDefinitionDetailV3Schema.parse(detail);
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}
