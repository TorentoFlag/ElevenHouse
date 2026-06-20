import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  revokeAuthenticatedSession,
  type AuthSessionRevocationUnitOfWork
} from "@elevenhouse/domain";
import {
  readPublicSessionCookieValue,
  type PublicSessionRequest
} from "./identity-current-session.service";
import { AUTH_SESSION_REVOCATION_UNIT_OF_WORK } from "../auth/identity-auth.tokens";
import type { PasswordlessRequestContext } from "../passwordless/identity-passwordless.rate-limit";
import { SystemClock } from "./identity-session.service";

@Injectable()
export class IdentityLogoutService {
  constructor(
    @Inject(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
    private readonly revocation: AuthSessionRevocationUnitOfWork,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async logout(
    request: PublicSessionRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<void> {
    const token = readPublicSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("publicApi.sessionCookieName")
    );

    if (!token) {
      return;
    }

    await revokeAuthenticatedSession({
      revocation: this.revocation,
      tokenHash: hashSessionToken(token),
      now: this.clock.now(),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent })
    });
  }
}
