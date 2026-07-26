import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  resolveAuthenticatedSession,
  type AuthSessionAuthenticationStore,
  type UserAccountStatus
} from "@elevenhouse/domain";
import { SystemClock } from "../../../common/system-clock.js";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../auth/identity-auth.tokens";

export type AdminAuthenticatedAccount = {
  readonly id: string;
  readonly status: UserAccountStatus;
  readonly roles: readonly string[];
};

export type AdminSessionRequest = {
  readonly headers: {
    readonly cookie?: string | readonly string[];
  };
  currentAdminAccount?: AdminAuthenticatedAccount;
};

@Injectable()
export class IdentityCurrentSessionService {
  constructor(
    @Inject(AUTH_SESSION_AUTHENTICATION_STORE)
    private readonly store: AuthSessionAuthenticationStore,
    @Inject(SystemClock)
    private readonly clock: SystemClock,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async resolveCurrentAdminAccount(
    request: AdminSessionRequest
  ): Promise<AdminAuthenticatedAccount | null> {
    const token = readAdminSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("adminApi.sessionCookieName")
    );
    if (!token) return null;

    const context = await resolveAuthenticatedSession({
      store: this.store,
      tokenHash: hashSessionToken(token),
      now: this.clock.now()
    });
    if (!context) return null;

    return {
      id: context.user.id,
      status: context.user.status,
      roles: context.roleAssignments.map((assignment) => assignment.role)
    };
  }
}

export function readAdminSessionCookieValue(
  cookieHeader: string | readonly string[] | undefined,
  name: string
): string | null {
  const header = typeof cookieHeader === "string" ? cookieHeader : cookieHeader?.join("; ");
  if (!header) return null;

  for (const cookie of header.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");
    if (rawName?.trim() !== name) continue;
    const value = rawValueParts.join("=").trim();
    return value ? value : null;
  }
  return null;
}
