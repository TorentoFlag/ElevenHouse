import {
  astrologerClientCrmDetailResponseSchema,
  astrologerClientCrmListQuerySchema,
  astrologerClientCrmListResponseSchema,
  astrologerClientCrmManualClientCreateRequestSchema,
  astrologerClientCrmManualClientCreateResponseSchema,
  astrologerClientCrmPrivateProfileUpdateRequestSchema,
  astrologerClientCrmPrivateProfileUpdateResponseSchema,
  astrologerClientParamsSchema,
  clientCrmActivityPageResponseSchema,
  type AstrologerClientCrmDetailResponse,
  type AstrologerClientCrmListQuery,
  type AstrologerClientCrmListResponse,
  type AstrologerClientCrmManualClientCreateRequest,
  type AstrologerClientCrmManualClientCreateResponse,
  type AstrologerClientCrmPrivateProfileUpdateRequest,
  type AstrologerClientCrmPrivateProfileUpdateResponse,
  type ClientCrmActivityPageResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listAstrologerClientCrm(
  query: Partial<AstrologerClientCrmListQuery> = {}
): Promise<AstrologerClientCrmListResponse> {
  const parsedQuery = astrologerClientCrmListQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    query: parsedQuery.query,
    limit: String(parsedQuery.limit),
    sort: parsedQuery.sort
  });

  if (parsedQuery.cursor !== null) searchParams.set("cursor", parsedQuery.cursor);
  if (parsedQuery.lifecycle) searchParams.set("lifecycle", parsedQuery.lifecycle);
  if (parsedQuery.source) searchParams.set("source", parsedQuery.source);

  return astrologerClientCrmListResponseSchema.parse(
    await application.http.get(`/clients/crm?${searchParams.toString()}`)
  );
}

export async function getAstrologerClientCrmDetail(
  clientUserId: string
): Promise<AstrologerClientCrmDetailResponse> {
  const params = astrologerClientParamsSchema.parse({ clientUserId });

  return astrologerClientCrmDetailResponseSchema.parse(
    await application.http.get(`/clients/crm/${encodeURIComponent(params.clientUserId)}`)
  );
}

export async function createManualClientCrmClient(
  input: AstrologerClientCrmManualClientCreateRequest
): Promise<AstrologerClientCrmManualClientCreateResponse> {
  const body = astrologerClientCrmManualClientCreateRequestSchema.parse(input);

  return astrologerClientCrmManualClientCreateResponseSchema.parse(
    await application.http.post("/clients/crm", body, { csrf: true })
  );
}

export async function getAstrologerClientCrmFirstActivityPage(
  clientUserId: string
): Promise<ClientCrmActivityPageResponse> {
  const params = astrologerClientParamsSchema.parse({ clientUserId });

  return clientCrmActivityPageResponseSchema.parse(
    await application.http.get(`/clients/crm/${encodeURIComponent(params.clientUserId)}/activity`)
  );
}

export async function updateAstrologerClientCrmPrivateProfile(
  clientUserId: string,
  input: AstrologerClientCrmPrivateProfileUpdateRequest
): Promise<AstrologerClientCrmPrivateProfileUpdateResponse> {
  const params = astrologerClientParamsSchema.parse({ clientUserId });
  const body = astrologerClientCrmPrivateProfileUpdateRequestSchema.parse(input);

  return astrologerClientCrmPrivateProfileUpdateResponseSchema.parse(
    await application.http.put(
      `/clients/crm/${encodeURIComponent(params.clientUserId)}/private-profile`,
      body,
      { csrf: true }
    )
  );
}
