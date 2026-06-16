import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import type {
  RequestPasswordlessCodeRequest,
  RequestPasswordlessCodeResponse,
  VerifyPasswordlessCodeRequest,
  VerifyPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import {
  PublicSessionCookieService,
  type PublicSessionCookieResponse
} from "./identity-session.service";

@Controller("identity/passwordless")
export class IdentityPasswordlessController {
  constructor(
    private readonly identityPasswordlessService: IdentityPasswordlessService,
    private readonly publicSessionCookieService: PublicSessionCookieService
  ) {}

  @Post("request-code")
  requestCode(
    @Body() body: RequestPasswordlessCodeRequest,
    @Req() request: PasswordlessHttpRequest
  ): Promise<RequestPasswordlessCodeResponse> {
    return this.identityPasswordlessService.requestCode(body, getPasswordlessRequestContext(request));
  }

  @Post("verify-code")
  async verifyCode(
    @Body() body: VerifyPasswordlessCodeRequest,
    @Req() request: PasswordlessHttpRequest,
    @Res({ passthrough: true }) response: PublicSessionCookieResponse
  ): Promise<VerifyPasswordlessCodeResponse> {
    const result = await this.identityPasswordlessService.verifyCode(
      body,
      getPasswordlessRequestContext(request)
    );

    this.publicSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}

type PasswordlessHttpRequest = {
  readonly ip?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

function getPasswordlessRequestContext(request: PasswordlessHttpRequest): {
  readonly ipAddress?: string;
} {
  const ipAddress =
    normalizeHeaderValue(request.ip) ??
    normalizeHeaderValue(request.headers?.["x-forwarded-for"])?.split(",")[0]?.trim() ??
    normalizeHeaderValue(request.socket?.remoteAddress);

  return ipAddress ? { ipAddress } : {};
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  const normalized = Array.isArray(value) ? value[0]?.trim() : value?.trim();

  return normalized ? normalized : undefined;
}
