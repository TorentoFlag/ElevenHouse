import {
  FLOW_DEFINITION_LIST_V3_MEDIA_TYPE,
  listFlowDefinitionsV3QuerySchema,
  listFlowDefinitionsV3ResponseSchema,
  type ListFlowDefinitionsV3QueryInput,
  type ListFlowDefinitionsV3Response
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlows(
  query: ListFlowDefinitionsV3QueryInput
): Promise<ListFlowDefinitionsV3Response> {
  const parsedQuery = listFlowDefinitionsV3QuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    state: parsedQuery.state,
    enrollmentState: parsedQuery.enrollmentState,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowDefinitionsV3ResponseSchema.parse(
    await application.http.get(`/flows?${searchParams.toString()}`, {
      cache: "no-store",
      headers: { accept: FLOW_DEFINITION_LIST_V3_MEDIA_TYPE }
    })
  );
}
