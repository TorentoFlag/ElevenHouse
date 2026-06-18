import {
  authenticatedCustomerAccountResponseSchema,
  type AuthenticatedCustomerAccountResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCurrentAccount(): Promise<AuthenticatedCustomerAccountResponse> {
  return authenticatedCustomerAccountResponseSchema.parse(
    await application.http.get("/identity/me")
  );
}
