import {
  listFlowDefinitionTemplatesV2QuerySchema,
  listFlowDefinitionTemplatesV2ResponseSchema,
  type ListFlowDefinitionTemplatesV2Response
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlowTemplates(
  locale: "ru" | "en"
): Promise<ListFlowDefinitionTemplatesV2Response> {
  const query = listFlowDefinitionTemplatesV2QuerySchema.parse({ locale });
  const searchParams = new URLSearchParams({ locale: query.locale });

  return listFlowDefinitionTemplatesV2ResponseSchema.parse(
    await application.http.get(`/flow-templates?${searchParams.toString()}`)
  );
}
