import {
  clientBirthDataListResponseSchema,
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientCabinetOverviewResponseSchema,
  relatedAstrologerListResponseSchema,
  type ClientBirthDataListResponse,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest,
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

export async function listClientBirthProfiles(): Promise<ClientBirthDataListResponse> {
  return clientBirthDataListResponseSchema.parse(await application.http.get("/me/birth-profiles"));
}

export async function upsertClientBirthData(
  input: ClientBirthDataUpsertRequest
): Promise<ClientBirthDataResponse> {
  const request = clientBirthDataUpsertRequestSchema.parse(input);
  return clientBirthDataResponseSchema.parse(
    await application.http.put("/me/birth-data", request, { csrf: true })
  );
}

export async function createClientBirthProfile(
  input: ClientBirthDataUpsertRequest
): Promise<ClientBirthDataResponse> {
  const request = clientBirthDataUpsertRequestSchema.parse(input);
  return clientBirthDataResponseSchema.parse(
    await application.http.post("/me/birth-profiles", request, { csrf: true })
  );
}

export async function updateClientBirthProfile(
  birthDataId: string,
  input: ClientBirthDataUpsertRequest
): Promise<ClientBirthDataResponse> {
  const request = clientBirthDataUpsertRequestSchema.parse(input);
  return clientBirthDataResponseSchema.parse(
    await application.http.put(`/me/birth-profiles/${birthDataId}`, request, { csrf: true })
  );
}
