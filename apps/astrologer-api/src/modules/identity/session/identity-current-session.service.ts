import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  resolveAuthenticatedSession,
  resolveAuthenticatedMobileSession,
  type AuthSessionAuthenticationStore,
  type MobileSessionAuthenticationStore
} from "@elevenhouse/domain";
import {
  authenticatedAstrologerAccountResponseSchema,
  type AuthenticatedAstrologerAccountResponse
} from "@elevenhouse/contracts";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../auth/identity-auth.tokens";
import { MOBILE_SESSION_AUTHENTICATION_STORE } from "../mobile/mobile-session.tokens";
import { SystemClock } from "../../clock/system-clock.service";

export type AstrologerSessionRequest = {
  readonly headers: {
    readonly cookie?: string | readonly string[];
    readonly authorization?: string | readonly string[];
  };
  currentAstrologerAccount?: AuthenticatedAstrologerAccountResponse;
  currentMobileSessionId?: string;
};

@Injectable()
export class IdentityCurrentSessionService {
  constructor(
    @Inject(AUTH_SESSION_AUTHENTICATION_STORE)
    private readonly store: AuthSessionAuthenticationStore,
    @Inject(MOBILE_SESSION_AUTHENTICATION_STORE)
    private readonly mobileSessionStore: MobileSessionAuthenticationStore,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async resolveCurrentAstrologerAccount(
    request: AstrologerSessionRequest
  ): Promise<AuthenticatedAstrologerAccountResponse | null> {
    const authorizationHeader = readAuthorizationHeader(request.headers.authorization);
    if (authorizationHeader !== null) {
      const bearerToken = readBearerToken(authorizationHeader);
      if (!bearerToken) return null;
      const context = await resolveAuthenticatedMobileSession({
        store: this.mobileSessionStore,
        accessTokenHash: hashSessionToken(bearerToken),
        now: this.clock.now()
      });
      if (!context) return null;
      const account = toAstrologerAccount(context);
      if (account) request.currentMobileSessionId = context.session.id;
      return account;
    }

    const token = readAstrologerSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("astrologerApi.sessionCookieName")
    );

    if (!token) {
      return null;
    }

    const context = await resolveAuthenticatedSession({
      store: this.store,
      tokenHash: hashSessionToken(token),
      now: this.clock.now()
    });

    if (!context) {
      return null;
    }

    return toAstrologerAccount(context);
  }
}

function toAstrologerAccount(context: {
  readonly user: { readonly id: string; readonly status: string };
  readonly roleAssignments: readonly { readonly role: string }[];
}): AuthenticatedAstrologerAccountResponse | null {
  const account = authenticatedAstrologerAccountResponseSchema.safeParse({
    account: {
      id: context.user.id,
      status: context.user.status,
      roles: context.roleAssignments.map((assignment) => assignment.role)
    }
  });
  return account.success ? account.data : null;
}

export function readBearerToken(
  authorizationHeader: string | readonly string[] | undefined
): string | null {
  const value = typeof authorizationHeader === "string" ? authorizationHeader : authorizationHeader?.[0];
  if (!value) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

function readAuthorizationHeader(
  authorizationHeader: string | readonly string[] | undefined
): string | null {
  const value = typeof authorizationHeader === "string" ? authorizationHeader : authorizationHeader?.[0];
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function readAstrologerSessionCookieValue(
  cookieHeader: string | readonly string[] | undefined,
  name: string
): string | null {
  const header = typeof cookieHeader === "string" ? cookieHeader : cookieHeader?.join("; ");

  if (!header) {
    return null;
  }

  for (const cookie of header.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");

    if (rawName?.trim() !== name) {
      continue;
    }

    const value = rawValueParts.join("=").trim();
    return value ? value : null;
  }

  return null;
}
