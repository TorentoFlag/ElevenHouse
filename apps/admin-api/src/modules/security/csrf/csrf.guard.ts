import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { SystemClock } from "../../../common/system-clock.js";
import { csrfRequiredMetadataKey } from "../route-policy/route-security-metadata";
import { AdminCsrfTokenService, type CsrfRequest } from "./admin-csrf-token.service";

type CookieAuthRequest = CsrfRequest & {
  readonly headers?: Record<string, string | readonly string[] | undefined>;
};

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrfTokenService: AdminCsrfTokenService,
    private readonly configService: ConfigService,
    private readonly clock: SystemClock
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const csrfRequired = this.reflector.getAllAndOverride<boolean>(csrfRequiredMetadataKey, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!csrfRequired) return true;

    const request = context.switchToHttp().getRequest<CookieAuthRequest>();
    const sessionToken = readCookieValue(
      normalizeHeaderValue(request.headers?.cookie),
      this.configService.getOrThrow<string>("adminApi.sessionCookieName")
    );
    if (!sessionToken) {
      throw new UnauthorizedException("Valid admin session is required");
    }

    this.csrfTokenService.assertValidRequest({
      request,
      sessionToken,
      now: this.clock.now()
    });
    return true;
  }
}

function normalizeHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : value?.[0]?.trim();
  return normalized ? normalized : undefined;
}

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");
    if (rawName?.trim() !== name) continue;
    const value = rawValueParts.join("=").trim();
    return value ? value : null;
  }
  return null;
}
