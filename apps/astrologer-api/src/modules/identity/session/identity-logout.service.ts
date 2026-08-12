import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  revokeAuthenticatedSession,
  revokeMobileSession,
  type MobileSessionRevocationStore,
  type MobileSessionUnitOfWork,
  type AuthSessionRevocationUnitOfWork
} from "@elevenhouse/domain";
import {
  readAstrologerSessionCookieValue,
  type AstrologerSessionRequest
} from "./identity-current-session.service";
import { AUTH_SESSION_REVOCATION_UNIT_OF_WORK } from "../auth/identity-auth.tokens";
import { MOBILE_SESSION_UNIT_OF_WORK } from "../mobile/mobile-session.tokens";
import type { PasswordlessRequestContext } from "../passwordless/identity-passwordless.rate-limit";
import { SystemClock } from "../../clock/system-clock.service";

@Injectable()
export class IdentityLogoutService {
  constructor(
    @Inject(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
    private readonly revocation: AuthSessionRevocationUnitOfWork,
    @Inject(MOBILE_SESSION_UNIT_OF_WORK)
    private readonly mobileRevocation: MobileSessionUnitOfWork<MobileSessionRevocationStore>,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService
  ) {}

  async logout(
    request: AstrologerSessionRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<void> {
    if (request.currentMobileSessionId && request.currentAstrologerAccount) {
      await revokeMobileSession({
        sessions: this.mobileRevocation,
        sessionId: request.currentMobileSessionId,
        userId: request.currentAstrologerAccount.account.id,
        now: this.clock.now(),
        reason: "logout"
      });
      return;
    }

    const token = readAstrologerSessionCookieValue(
      request.headers.cookie,
      this.configService.getOrThrow<string>("astrologerApi.sessionCookieName")
    );

    if (!token) {
      return;
    }

    await revokeAuthenticatedSession({
      revocation: this.revocation,
      tokenHash: hashSessionToken(token),
      now: this.clock.now(),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {})
    });
  }
}
