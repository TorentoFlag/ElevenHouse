import {
  flowDefinitionDetailV2Schema,
  flowDefinitionSummaryV2Schema,
  listFlowDefinitionsV2QuerySchema,
  type FlowDefinitionDetailV2,
  type FlowDefinitionSummaryV2,
  type ListFlowDefinitionsV2Query,
  type ListFlowDefinitionsV2QueryInput
} from "@elevenhouse/contracts";

import { FlowDefinitionIntegrityError } from "./flow-definition-control-plane";

export type FlowDefinitionQueryPage = {
  readonly flows: readonly FlowDefinitionSummaryV2[];
  readonly total: number;
};

export type FlowDefinitionQueryStore = {
  readonly listByOwner: (input: {
    readonly ownerUserId: string;
    readonly query: ListFlowDefinitionsV2Query;
  }) => Promise<FlowDefinitionQueryPage>;
  readonly getByOwner: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
  }) => Promise<FlowDefinitionDetailV2 | null>;
};

export async function listFlowDefinitionsV2(input: {
  readonly store: FlowDefinitionQueryStore;
  readonly ownerUserId: string;
  readonly query: ListFlowDefinitionsV2QueryInput;
}): Promise<FlowDefinitionQueryPage> {
  const query = listFlowDefinitionsV2QuerySchema.parse(input.query);
  const page = await input.store.listByOwner({ ownerUserId: input.ownerUserId, query });

  try {
    const flows = page.flows.map((flow) => flowDefinitionSummaryV2Schema.parse(flow));
    if (!Number.isSafeInteger(page.total) || page.total < flows.length) {
      throw new Error("Invalid flow definition query total");
    }
    if (new Set(flows.map((flow) => flow.id)).size !== flows.length) {
      throw new Error("Duplicate flow definitions in query page");
    }
    return { flows, total: page.total };
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}

export async function getFlowDefinitionV2(input: {
  readonly store: FlowDefinitionQueryStore;
  readonly ownerUserId: string;
  readonly flowId: string;
}): Promise<FlowDefinitionDetailV2 | null> {
  const detail = await input.store.getByOwner({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (detail === null) return null;

  try {
    return flowDefinitionDetailV2Schema.parse(detail);
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}
