import {
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  relatedAstrologerListResponseSchema,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest,
  type RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getRelatedAstrologers(): Promise<RelatedAstrologerListResponse> {
  return relatedAstrologerListResponseSchema.parse(await application.http.get("/me/astrologers"));
}

export async function getClientBirthData(): Promise<ClientBirthDataResponse | null> {
  const response = await application.http.get<unknown>("/me/birth-data");
  return response === null ? null : clientBirthDataResponseSchema.parse(response);
}

export async function upsertClientBirthData(
  input: ClientBirthDataUpsertRequest
): Promise<ClientBirthDataResponse> {
  const request = clientBirthDataUpsertRequestSchema.parse(input);
  return clientBirthDataResponseSchema.parse(await application.http.put("/me/birth-data", request));
}
