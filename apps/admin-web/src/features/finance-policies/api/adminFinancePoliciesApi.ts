import {
  astrologerRiskProfileResponseSchema,
  financePoliciesResponseSchema,
  financePolicyResponseSchema,
  updateAstrologerRiskProfileRequestSchema,
  updateFinancePolicyRequestSchema,
  type AstrologerRiskProfileResponse,
  type FinancePoliciesResponse,
  type FinancePolicyResponse,
  type UpdateAstrologerRiskProfileRequest,
  type UpdateFinancePolicyRequest
} from "@elevenhouse/contracts";

export type AdminFinancePoliciesApi = {
  readonly listPolicies: () => Promise<FinancePoliciesResponse>;
  readonly ensureDefaultPolicy: () => Promise<FinancePolicyResponse>;
  readonly updateDefaultPolicy: (
    request: UpdateFinancePolicyRequest
  ) => Promise<FinancePolicyResponse>;
  readonly updateAstrologerRiskProfile: (
    astrologerUserId: string,
    request: UpdateAstrologerRiskProfileRequest
  ) => Promise<AstrologerRiskProfileResponse>;
};

export type CreateAdminFinancePoliciesApiInput = {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly csrfTokenReader?: () => string | null;
};

export function createAdminFinancePoliciesApi(
  input: CreateAdminFinancePoliciesApiInput = {}
): AdminFinancePoliciesApi {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.baseUrl ?? import.meta.env.VITE_ADMIN_API_BASE_URL ?? "";
  const csrfTokenReader = input.csrfTokenReader ?? readAdminCsrfCookie;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...csrfHeaders(init.method, csrfTokenReader),
        ...init.headers
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AdminFinancePoliciesApiError(response.status, body);
    }
    return body;
  }

  return {
    listPolicies: async () =>
      financePoliciesResponseSchema.parse(await request("/admin/finance/policies")),
    ensureDefaultPolicy: async () =>
      financePolicyResponseSchema.parse(
        await request("/admin/finance/policies/default", { method: "POST" })
      ),
    updateDefaultPolicy: async (rawRequest) => {
      const parsed = updateFinancePolicyRequestSchema.parse(rawRequest);
      return financePolicyResponseSchema.parse(
        await request("/admin/finance/policies/default", {
          method: "PUT",
          body: JSON.stringify(parsed)
        })
      );
    },
    updateAstrologerRiskProfile: async (astrologerUserId, rawRequest) => {
      const parsed = updateAstrologerRiskProfileRequestSchema.parse(rawRequest);
      return astrologerRiskProfileResponseSchema.parse(
        await request(`/admin/finance/risk-profiles/${encodeURIComponent(astrologerUserId)}`, {
          method: "PUT",
          body: JSON.stringify(parsed)
        })
      );
    }
  };
}

export class AdminFinancePoliciesApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown
  ) {
    super(`Admin finance policies request failed with status ${status}`);
    this.name = "AdminFinancePoliciesApiError";
  }
}

function csrfHeaders(
  method: string | undefined,
  csrfTokenReader: () => string | null
): Record<string, string> {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return {};
  }
  const csrfToken = csrfTokenReader();
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

function readAdminCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = "elevenhouse_admin_csrf=";
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}
