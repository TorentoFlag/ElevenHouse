import {
  listFlowDefinitionsV2QuerySchema,
  listFlowDefinitionsV2ResponseSchema,
  type ListFlowDefinitionsV2QueryInput,
  type ListFlowDefinitionsV2Response
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlows(
  query: ListFlowDefinitionsV2QueryInput
): Promise<ListFlowDefinitionsV2Response> {
  const parsedQuery = listFlowDefinitionsV2QuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    state: parsedQuery.state,
    runtimeStatus: parsedQuery.runtimeStatus,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowDefinitionsV2ResponseSchema.parse(
    await application.http.get(`/flows?${searchParams.toString()}`)
  );
}
