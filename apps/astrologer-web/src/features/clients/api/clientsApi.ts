import {
  astrologerClientListQuerySchema,
  astrologerClientListResponseSchema,
  astrologerClientResponseSchema,
  astrologerClientParamsSchema,
  clientBirthPlaceSearchQuerySchema,
  clientBirthPlaceSearchResponseSchema,
  clientBirthDataUpsertRequestSchema,
  type AstrologerClientListQuery,
  type AstrologerClientListResponse,
  type AstrologerClientResponse,
  type ClientBirthPlaceSearchQuery,
  type ClientBirthPlaceSearchResponse,
  type ClientBirthDataUpsertRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listAstrologerClients(
  query: Partial<AstrologerClientListQuery> = {}
): Promise<AstrologerClientListResponse> {
  const parsedQuery = astrologerClientListQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    query: parsedQuery.query,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return astrologerClientListResponseSchema.parse(
    await application.http.get(`/clients?${searchParams.toString()}`)
  );
}

export async function getAstrologerClient(clientUserId: string): Promise<AstrologerClientResponse> {
  const params = astrologerClientParamsSchema.parse({ clientUserId });

  return astrologerClientResponseSchema.parse(
    await application.http.get(`/clients/${params.clientUserId}`)
  );
}

export async function searchClientBirthPlaces(
  query: ClientBirthPlaceSearchQuery
): Promise<ClientBirthPlaceSearchResponse> {
  const parsedQuery = clientBirthPlaceSearchQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    query: parsedQuery.query,
    limit: String(parsedQuery.limit)
  });

  return clientBirthPlaceSearchResponseSchema.parse(
    await application.http.get(`/clients/birth-places?${searchParams.toString()}`)
  );
}

export async function updateClientBirthData(
  clientUserId: string,
  input: ClientBirthDataUpsertRequest
): Promise<AstrologerClientResponse> {
  const params = astrologerClientParamsSchema.parse({ clientUserId });
  const body = clientBirthDataUpsertRequestSchema.parse(input);

  return astrologerClientResponseSchema.parse(
    await application.http.put(`/clients/${params.clientUserId}/birth-data`, body, {
      csrf: true
    })
  );
}
