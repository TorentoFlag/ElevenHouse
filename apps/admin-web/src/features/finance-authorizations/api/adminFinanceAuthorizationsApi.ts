import {
  beginFinanceAuthorizationRequestSchema,
  beginFinanceAuthorizationResponseSchema,
  verifyFinanceAuthorizationResponseSchema,
  type BeginFinanceAuthorizationRequest,
  type VerifyFinanceAuthorizationResponse
} from "@elevenhouse/contracts";

import {
  createFinanceWebAuthnAssertion,
  type FinanceCredentialGetter
} from "../model/financeWebAuthnAssertion";

export type AdminFinanceAuthorizationClient = Readonly<{
  authorize(input: BeginFinanceAuthorizationRequest): Promise<VerifyFinanceAuthorizationResponse>;
}>;

export type CreateAdminFinanceAuthorizationClientInput = Readonly<{
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly csrfTokenReader?: () => string | null;
  readonly credentials?: FinanceCredentialGetter | null;
}>;

export class AdminFinanceAuthorizationApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown
  ) {
    super("Admin finance authorization request failed");
    this.name = "AdminFinanceAuthorizationApiError";
  }
}

export function createAdminFinanceAuthorizationClient(
  input: CreateAdminFinanceAuthorizationClientInput = {}
): AdminFinanceAuthorizationClient {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.baseUrl ?? import.meta.env.VITE_ADMIN_API_BASE_URL ?? "";
  const csrfTokenReader = input.csrfTokenReader ?? readAdminCsrfCookie;

  async function request(path: string, body: unknown): Promise<unknown> {
    const csrfToken = csrfTokenReader();
    const response = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {})
      },
      body: JSON.stringify(body)
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok) throw new AdminFinanceAuthorizationApiError(response.status, responseBody);
    return responseBody;
  }

  return Object.freeze({
    async authorize(rawInput) {
      const authorizationRequest = beginFinanceAuthorizationRequestSchema.parse(rawInput);
      const authorization = beginFinanceAuthorizationResponseSchema.parse(
        await request("/admin/finance/authorizations/begin", authorizationRequest)
      );
      const assertion = await createFinanceWebAuthnAssertion({
        authorization,
        credentials: input.credentials
      });
      return verifyFinanceAuthorizationResponseSchema.parse(
        await request("/admin/finance/authorizations/verify", {
          challengeId: authorization.challengeId,
          assertion
        })
      );
    }
  } satisfies AdminFinanceAuthorizationClient);
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
