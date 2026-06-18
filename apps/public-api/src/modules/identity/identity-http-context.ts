import type { PasswordlessRequestContext } from "./identity-passwordless.rate-limit";

export type IdentityHttpRequest = {
  readonly ip?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

export function getIdentityRequestContext(
  request: IdentityHttpRequest
): PasswordlessRequestContext {
  const ipAddress =
    normalizeHeaderValue(request.ip) ??
    normalizeHeaderValue(request.headers?.["x-forwarded-for"])?.split(",")[0]?.trim() ??
    normalizeHeaderValue(request.socket?.remoteAddress);
  const userAgent = normalizeHeaderValue(request.headers?.["user-agent"]);

  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {})
  };
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  const normalized = Array.isArray(value) ? value[0]?.trim() : value?.trim();

  return normalized ? normalized : undefined;
}
