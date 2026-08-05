import {
  adminTariffDraftRequestSchema,
  adminTariffListResponseSchema,
  adminTariffResponseSchema,
  adminTariffUpdateRequestSchema,
  type AdminTariffDraftRequest,
  type AdminTariffListResponse,
  type AdminTariffResponse,
  type AdminTariffUpdateRequest
} from "@elevenhouse/contracts";

export type AdminPlatformTariffsApi = {
  readonly listTariffs: () => Promise<AdminTariffListResponse>;
  readonly createDraft: (
    request: AdminTariffDraftRequest,
    idempotencyKey: string
  ) => Promise<AdminTariffResponse>;
  readonly updateDraft: (
    request: AdminTariffUpdateRequest,
    idempotencyKey: string
  ) => Promise<AdminTariffResponse>;
  readonly publishDraft: (
    tariffSeriesId: string,
    version: number,
    expectedDraftRevision: number,
    idempotencyKey: string
  ) => Promise<AdminTariffResponse>;
};

export type CreateAdminPlatformTariffsApiInput = {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly csrfTokenReader?: () => string | null;
};

export function createAdminPlatformTariffsApi(
  input: CreateAdminPlatformTariffsApiInput = {}
): AdminPlatformTariffsApi {
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
    if (!response.ok) throw new AdminPlatformTariffsApiError(response.status, body);
    return body;
  }

  return {
    listTariffs: async () => adminTariffListResponseSchema.parse(await request("/admin/tariffs")),
    createDraft: async (rawRequest, idempotencyKey) => {
      const parsed = adminTariffDraftRequestSchema.parse(rawRequest);
      return adminTariffResponseSchema.parse(
        await request("/admin/tariffs", {
          method: "POST",
          headers: { "idempotency-key": requireIdempotencyKey(idempotencyKey) },
          body: JSON.stringify(parsed)
        })
      );
    },
    updateDraft: async (rawRequest, idempotencyKey) => {
      const parsed = adminTariffUpdateRequestSchema.parse(rawRequest);
      return adminTariffResponseSchema.parse(
        await request("/admin/tariffs", {
          method: "PUT",
          headers: { "idempotency-key": requireIdempotencyKey(idempotencyKey) },
          body: JSON.stringify(parsed)
        })
      );
    },
    publishDraft: async (tariffSeriesId, version, expectedDraftRevision, idempotencyKey) =>
      adminTariffResponseSchema.parse(
        await request(
          `/admin/tariffs/${encodeURIComponent(tariffSeriesId)}/${encodeURIComponent(String(version))}/publish`,
          {
            method: "POST",
            headers: { "idempotency-key": requireIdempotencyKey(idempotencyKey) },
            body: JSON.stringify({ expectedDraftRevision })
          }
        )
      )
  };
}

export class AdminPlatformTariffsApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown
  ) {
    super(`Admin platform tariffs request failed with status ${status}`);
  }
}

function csrfHeaders(
  method: string | undefined,
  csrfTokenReader: () => string | null
): Record<string, string> {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") return {};
  const csrfToken = csrfTokenReader();
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

function requireIdempotencyKey(value: string): string {
  if (!value.trim()) throw new Error("An idempotency key is required for an admin tariff mutation");
  return value;
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
