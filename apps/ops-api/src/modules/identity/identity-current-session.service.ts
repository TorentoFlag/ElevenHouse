import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  resolveAuthenticatedSession,
  type AuthSessionAuthenticationStore
} from "@elevenhouse/domain";
import {
  authenticatedAstrologerAccountResponseSchema,
  type AuthenticatedAstrologerAccountResponse
} from "@elevenhouse/contracts";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./identity-auth.tokens";
import { SystemClock } from "./identity-session.service";

export type OpsSessionRequest = {
  readonly headers: {
    readonly cookie?: string | readonly string[];
  };
  currentAstrologerAccount?: AuthenticatedAstrologerAccountResponse;
};

@Injectable()
export class IdentityCurrentSessionService {
  constructor(
    @Inject(AUTH_SESSION_AUTHENTICATION_STORE)
    private readonly store: AuthSessionAuthenticationStore,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async resolveCurrentAstrologerAccount(
    request: OpsSessionRequest
  ): Promise<AuthenticatedAstrologerAccountResponse | null> {
    const token = readOpsSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("opsApi.sessionCookieName")
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

    return authenticatedAstrologerAccountResponseSchema.parse({
      account: {
        id: context.user.id,
        status: context.user.status,
        roles: context.roleAssignments.map((assignment) => assignment.role)
      }
    });
  }
}

export function readOpsSessionCookieValue(
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
