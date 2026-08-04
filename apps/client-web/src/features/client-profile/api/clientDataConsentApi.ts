import {
  clientDataConsentListQuerySchema,
  clientDataConsentListResponseSchema,
  grantChartAiConsentParamsSchema,
  grantChartAiConsentRequestSchema,
  grantChartAiConsentResponseSchema,
  revokeClientDataConsentParamsSchema,
  revokeClientDataConsentResponseSchema,
  type ClientDataConsentListResponse,
  type ClientDataConsentLocale,
  type GrantChartAiConsentRequest,
  type GrantChartAiConsentResponse,
  type RevokeClientDataConsentResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getClientDataConsents(
  locale: ClientDataConsentLocale
): Promise<ClientDataConsentListResponse> {
  const query = clientDataConsentListQuerySchema.parse({ locale });
  return clientDataConsentListResponseSchema.parse(
    await application.http.get(`/me/consents?locale=${encodeURIComponent(query.locale)}`)
  );
}

export async function grantClientChartAiConsent(
  astrologerUserId: string,
  input: GrantChartAiConsentRequest
): Promise<GrantChartAiConsentResponse> {
  const params = grantChartAiConsentParamsSchema.parse({ astrologerUserId });
  const request = grantChartAiConsentRequestSchema.parse(input);
  return grantChartAiConsentResponseSchema.parse(
    await application.http.put(
      `/me/consents/${encodeURIComponent(params.astrologerUserId)}/chart-ai`,
      request,
      { csrf: true }
    )
  );
}

export async function revokeClientDataConsent(
  consentId: string
): Promise<RevokeClientDataConsentResponse> {
  const params = revokeClientDataConsentParamsSchema.parse({ consentId });
  return revokeClientDataConsentResponseSchema.parse(
    await application.http.delete(`/me/consents/${encodeURIComponent(params.consentId)}`, {}, {
      csrf: true
    })
  );
}
