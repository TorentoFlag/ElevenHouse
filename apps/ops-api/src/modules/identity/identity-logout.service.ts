import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  revokeAuthenticatedSession,
  type AuthSessionRevocationUnitOfWork
} from "@elevenhouse/domain";
import {
  readOpsSessionCookieValue,
  type OpsSessionRequest
} from "./identity-current-session.service";
import { AUTH_SESSION_REVOCATION_UNIT_OF_WORK } from "./identity-auth.tokens";
import type { PasswordlessRequestContext } from "./identity-passwordless.rate-limit";
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
    request: OpsSessionRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<void> {
    const token = readOpsSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("opsApi.sessionCookieName")
    );

    if (!token) {
      return;
    }

    await revokeAuthenticatedSession({
      revocation: this.revocation,
      tokenHash: hashSessionToken(token),
      now: this.clock.now(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
  }
}
