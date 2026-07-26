import {
  astrologerFinanceOverviewResponseSchema,
  type AstrologerFinanceOverviewResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCurrentFinanceOverview(): Promise<AstrologerFinanceOverviewResponse> {
  return astrologerFinanceOverviewResponseSchema.parse(await application.http.get("/finance/me"));
}
