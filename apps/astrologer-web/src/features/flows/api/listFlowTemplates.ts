import {
  listFlowTemplatesResponseSchema,
  type ListFlowTemplatesResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlowTemplates(): Promise<ListFlowTemplatesResponse> {
  return listFlowTemplatesResponseSchema.parse(await application.http.get("/flow-templates"));
}
