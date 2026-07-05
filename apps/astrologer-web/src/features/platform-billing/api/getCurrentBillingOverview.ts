import {
  billingOverviewResponseSchema,
  type BillingOverviewResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCurrentBillingOverview(): Promise<BillingOverviewResponse> {
  return billingOverviewResponseSchema.parse(await application.http.get("/platform-billing/me"));
}
