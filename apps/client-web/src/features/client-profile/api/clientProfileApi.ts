import {
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientBirthPlaceSearchQuerySchema,
  clientBirthPlaceSearchResponseSchema,
  clientCabinetOverviewResponseSchema,
  relatedAstrologerListResponseSchema,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest,
  type ClientBirthPlaceSearchQuery,
  type ClientBirthPlaceSearchResponse,
  type ClientCabinetOverviewResponse,
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

export async function getClientCabinetOverview(): Promise<ClientCabinetOverviewResponse> {
  return clientCabinetOverviewResponseSchema.parse(await application.http.get("/me/overview"));
}

export async function searchClientBirthPlaces(
  query: ClientBirthPlaceSearchQuery,
  signal?: AbortSignal
): Promise<ClientBirthPlaceSearchResponse> {
  const parsed = clientBirthPlaceSearchQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    query: parsed.query,
    limit: String(parsed.limit)
  });

  return clientBirthPlaceSearchResponseSchema.parse(
    await application.http.get(`/me/birth-places?${searchParams.toString()}`, {
      ...(signal ? { signal } : {})
    })
  );
}

export async function upsertClientBirthData(
  input: ClientBirthDataUpsertRequest
): Promise<ClientBirthDataResponse> {
  const request = clientBirthDataUpsertRequestSchema.parse(input);
  return clientBirthDataResponseSchema.parse(
    await application.http.put("/me/birth-data", request, { csrf: true })
  );
}
