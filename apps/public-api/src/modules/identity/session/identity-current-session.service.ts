import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import { customerPlatformRoles } from "@elevenhouse/auth/roles";
import {
  resolveAuthenticatedMobileSession,
  resolveAuthenticatedSession,
  type AuthSessionAuthenticationStore,
  type MobileSessionAuthenticationStore
} from "@elevenhouse/domain";
import {
  authenticatedCustomerAccountResponseSchema,
  type AuthenticatedCustomerAccountResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../../common/system-clock.js";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  MOBILE_SESSION_AUTHENTICATION_STORE
} from "../auth/identity-auth.tokens";

const customerPlatformRoleSet = new Set<string>(customerPlatformRoles);

export type PublicSessionRequest = {
  readonly headers: {
    readonly cookie?: string | readonly string[];
    readonly authorization?: string | readonly string[];
  };
  currentCustomerAccount?: AuthenticatedCustomerAccountResponse;
  currentMobileSessionId?: string;
};

@Injectable()
export class IdentityCurrentSessionService {
  constructor(
    @Inject(AUTH_SESSION_AUTHENTICATION_STORE)
    private readonly store: AuthSessionAuthenticationStore,
    @Inject(MOBILE_SESSION_AUTHENTICATION_STORE)
    private readonly mobileStore: MobileSessionAuthenticationStore,
    @Inject(SystemClock)
    private readonly clock: SystemClock,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async resolveCurrentCustomerAccount(
    request: PublicSessionRequest
  ): Promise<AuthenticatedCustomerAccountResponse | null> {
    const authorizationHeader = readAuthorizationHeader(request.headers.authorization);
    if (authorizationHeader !== null) {
      const bearerToken = readBearerToken(authorizationHeader);
      if (!bearerToken) return null;
      const context = await resolveAuthenticatedMobileSession({
        store: this.mobileStore,
        accessTokenHash: hashSessionToken(bearerToken),
        now: this.clock.now()
      });
      if (!context) return null;
      request.currentMobileSessionId = context.session.id;
      return toCustomerAccount(context);
    }

    const token = readPublicSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("publicApi.sessionCookieName")
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

    return toCustomerAccount(context);
  }
}

function toCustomerAccount(context: {
  readonly user: { readonly id: string; readonly status: string };
  readonly roleAssignments: readonly { readonly role: string }[];
}): AuthenticatedCustomerAccountResponse {
  return authenticatedCustomerAccountResponseSchema.parse({
    account: {
      id: context.user.id,
      status: context.user.status,
      roles: context.roleAssignments
        .map((assignment) => assignment.role)
        .filter((role) => customerPlatformRoleSet.has(role))
    }
  });
}

function readAuthorizationHeader(
  authorizationHeader: string | readonly string[] | undefined
): string | null {
  const value =
    typeof authorizationHeader === "string" ? authorizationHeader : authorizationHeader?.[0];
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readBearerToken(authorizationHeader: string): string | null {
  return /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim())?.[1] ?? null;
}

export function readPublicSessionCookieValue(
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
