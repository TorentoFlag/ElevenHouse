import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { csrfRequiredMetadataKey } from "../route-policy/route-security-metadata";
import { AstrologerCsrfTokenService, type CsrfRequest } from "./astrologer-csrf-token.service";

type CookieAuthRequest = CsrfRequest & {
  readonly headers?: Record<string, string | readonly string[] | undefined>;
};

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrfTokenService: AstrologerCsrfTokenService,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const csrfRequired = this.reflector.getAllAndOverride<boolean>(csrfRequiredMetadataKey, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!csrfRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<CookieAuthRequest>();
    const sessionToken = readCookieValue(
      normalizeHeaderValue(request.headers?.cookie),
      this.configService.getOrThrow<string>("astrologerApi.sessionCookieName")
    );

    if (!sessionToken) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    this.csrfTokenService.assertValidRequest({
      request,
      sessionToken
    });

    return true;
  }
}

function normalizeHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : value?.[0]?.trim();

  return normalized ? normalized : undefined;
}

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");

    if (rawName?.trim() !== name) {
      continue;
    }

    const value = rawValueParts.join("=").trim();
    return value ? value : null;
  }

  return null;
}
