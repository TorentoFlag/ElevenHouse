import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import {
  mobileAstrologerSessionListResponseSchema,
  mobileAstrologerSessionResponseSchema,
  mobileAstrologerTokenRefreshResponseSchema,
  refreshMobileAstrologerSessionRequestSchema,
  type MobileAstrologerSessionListResponse,
  type MobileAstrologerSessionResponse,
  type MobileAstrologerTokenRefreshResponse,
  type RequestAstrologerPasswordlessCodeRequest,
  type RefreshMobileAstrologerSessionRequest,
  type VerifyMobileAstrologerRegistrationPasswordlessCodeRequest,
  type VerifyMobileAstrologerPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import { AstrologerSessionAuthGuard } from "../auth/identity-auth.guard";
import { getIdentityRequestContext, type IdentityHttpRequest } from "../http/identity-http-context";
import { IdentityPasswordlessService } from "../passwordless/identity-passwordless.service";
import type { AstrologerSessionRequest } from "../session/identity-current-session.service";
import { MobileAstrologerSessionService } from "./mobile-session.service";

@Controller("identity/astrologer/mobile")
export class MobileAstrologerSessionController {
  constructor(
    private readonly passwordless: IdentityPasswordlessService,
    private readonly mobileSessions: MobileAstrologerSessionService
  ) {}

  @Post("passwordless/request-code")
  requestCode(
    @Body() body: RequestAstrologerPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest
  ) {
    return this.passwordless.requestCode(body, getIdentityRequestContext(request));
  }

  @Post("passwordless/verify-code")
  @Header("Cache-Control", "no-store")
  async verifyCode(
    @Body() body: VerifyMobileAstrologerPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest
  ): Promise<MobileAstrologerSessionResponse> {
    return mobileAstrologerSessionResponseSchema.parse(
      await this.mobileSessions.verifyPasswordlessCode(body, getIdentityRequestContext(request))
    );
  }

  @Post("registration/verify-code")
  @Header("Cache-Control", "no-store")
  async verifyRegistrationCode(
    @Body() body: VerifyMobileAstrologerRegistrationPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest
  ): Promise<MobileAstrologerSessionResponse> {
    return mobileAstrologerSessionResponseSchema.parse(
      await this.mobileSessions.verifyRegistrationCode(body, getIdentityRequestContext(request))
    );
  }

  @Post("refresh")
  @Header("Cache-Control", "no-store")
  async refresh(
    @Body() body: RefreshMobileAstrologerSessionRequest,
    @Req() request: IdentityHttpRequest
  ): Promise<MobileAstrologerTokenRefreshResponse> {
    const parsed = refreshMobileAstrologerSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid mobile refresh request",
        issues: parsed.error.issues
      });
    }
    const session = await this.mobileSessions.refresh(
      parsed.data.refreshToken,
      parsed.data.operationId,
      getIdentityRequestContext(request)
    );
    return mobileAstrologerTokenRefreshResponseSchema.parse({
      sessionId: session.sessionId,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt
    });
  }

  @Get("sessions")
  @UseGuards(AstrologerSessionAuthGuard)
  async list(
    @Req() request: AstrologerSessionRequest
  ): Promise<MobileAstrologerSessionListResponse> {
    const context = requireMobileRequestContext(request);
    return mobileAstrologerSessionListResponseSchema.parse(
      await this.mobileSessions.list(context.userId, context.sessionId)
    );
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(AstrologerSessionAuthGuard)
  async logout(@Req() request: AstrologerSessionRequest): Promise<void> {
    const context = requireMobileRequestContext(request);
    await this.mobileSessions.logout(context.userId, context.sessionId);
  }

  @Post("logout-all")
  @HttpCode(204)
  @UseGuards(AstrologerSessionAuthGuard)
  async logoutAll(@Req() request: AstrologerSessionRequest): Promise<void> {
    await this.mobileSessions.logoutAll(requireMobileRequestContext(request).userId);
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  @UseGuards(AstrologerSessionAuthGuard)
  async revoke(
    @Param("sessionId") sessionId: string,
    @Req() request: AstrologerSessionRequest
  ): Promise<void> {
    const context = requireMobileRequestContext(request);
    const sessions = await this.mobileSessions.list(context.userId, context.sessionId);
    if (!sessions.sessions.some((session) => session.id === sessionId)) {
      throw new UnauthorizedException("Mobile session is not owned by the authenticated account");
    }
    await this.mobileSessions.logout(context.userId, sessionId);
  }
}

function requireMobileRequestContext(request: AstrologerSessionRequest): {
  readonly userId: string;
  readonly sessionId: string;
} {
  if (!request.currentAstrologerAccount || !request.currentMobileSessionId) {
    throw new UnauthorizedException("Valid mobile session is required");
  }
  return {
    userId: request.currentAstrologerAccount.account.id,
    sessionId: request.currentMobileSessionId
  };
}
