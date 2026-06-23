import {
  authenticatedAstrologerAccountResponseSchema,
  type AuthenticatedAstrologerAccountResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCurrentAccount(): Promise<AuthenticatedAstrologerAccountResponse> {
  return authenticatedAstrologerAccountResponseSchema.parse(
    await application.http.get("/identity/me")
  );
}
