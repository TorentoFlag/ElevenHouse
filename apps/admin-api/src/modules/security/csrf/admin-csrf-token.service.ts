import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";

export type CsrfCookieResponse = {
  readonly cookie: (
    name: string,
    value: string,
    options: {
      readonly httpOnly: boolean;
      readonly secure: boolean;
      readonly sameSite: "lax";
      readonly path: "/";
      readonly expires: Date;
      readonly maxAge: number;
    }
  ) => void;
};

export type CsrfRequest = {
  readonly headers?: Record<string, string | readonly string[] | undefined>;
};

const csrfTokenVersion = "v1";

@Injectable()
export class AdminCsrfTokenService {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  setCsrfCookie(input: {
    readonly response: CsrfCookieResponse;
    readonly sessionToken: string;
    readonly sessionExpiresAt: string;
    readonly now?: Date;
  }): string {
    const now = input.now ?? new Date();
    const tokenTtlMs = this.configService.getOrThrow<number>("adminApi.csrfTokenTtlSeconds") * 1000;
    const sessionExpiresAtMs = new Date(input.sessionExpiresAt).getTime();
    const expiresAtMs = Math.min(now.getTime() + tokenTtlMs, sessionExpiresAtMs);
    const token = this.createToken({
      sessionTokenHash: hashSessionToken(input.sessionToken),
      expiresAtMs,
      nonce: randomBytes(16).toString("base64url")
    });

    input.response.cookie(this.configService.getOrThrow<string>("adminApi.csrfCookieName"), token, {
      httpOnly: false,
      secure: this.configService.getOrThrow<boolean>("adminApi.sessionCookieSecure"),
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAtMs),
      maxAge: Math.max(0, expiresAtMs - now.getTime())
    });

    return token;
  }

  assertValidRequest(input: {
    readonly request: CsrfRequest;
    readonly sessionToken: string;
    readonly now?: Date;
  }): void {
    this.assertTrustedOrigin(input.request);

    const headerName = this.configService.getOrThrow<string>("adminApi.csrfHeaderName");
    const csrfHeader = normalizeHeaderValue(input.request.headers?.[headerName]);
    const csrfCookie = readCookieValue(
      normalizeHeaderValue(input.request.headers?.cookie),
      this.configService.getOrThrow<string>("adminApi.csrfCookieName")
    );
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new ForbiddenException("Valid CSRF token is required");
    }
    if (
      !this.verifyToken({
        token: csrfHeader,
        sessionTokenHash: hashSessionToken(input.sessionToken),
        now: input.now ?? new Date()
      })
    ) {
      throw new ForbiddenException("Valid CSRF token is required");
    }
  }

  private assertTrustedOrigin(request: CsrfRequest): void {
    const allowedOrigins = this.configService.getOrThrow<readonly string[]>(
      "adminApi.allowedOrigins"
    );
    const origin = normalizeOrigin(normalizeHeaderValue(request.headers?.origin));
    const refererOrigin = normalizeOrigin(normalizeHeaderValue(request.headers?.referer));
    const requestOrigin = origin ?? refererOrigin;
    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      throw new ForbiddenException("Trusted request origin is required");
    }
  }

  private createToken(input: {
    readonly sessionTokenHash: string;
    readonly expiresAtMs: number;
    readonly nonce: string;
  }): string {
    return [
      csrfTokenVersion,
      input.expiresAtMs.toString(),
      input.nonce,
      this.sign(input)
    ].join(".");
  }

  private verifyToken(input: {
    readonly token: string;
    readonly sessionTokenHash: string;
    readonly now: Date;
  }): boolean {
    const [version, expiresAtRaw, nonce, signature] = input.token.split(".");
    const expiresAtMs = Number.parseInt(expiresAtRaw ?? "", 10);
    if (
      version !== csrfTokenVersion ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= input.now.getTime() ||
      !nonce ||
      !signature
    ) {
      return false;
    }

    return safeEqual(
      signature,
      this.sign({ sessionTokenHash: input.sessionTokenHash, expiresAtMs, nonce })
    );
  }

  private sign(input: {
    readonly sessionTokenHash: string;
    readonly expiresAtMs: number;
    readonly nonce: string;
  }): string {
    return createHmac("sha256", this.configService.getOrThrow<string>("adminApi.csrfSecret"))
      .update(
        [
          csrfTokenVersion,
          input.sessionTokenHash,
          input.expiresAtMs.toString(),
          input.nonce
        ].join("|")
      )
      .digest("base64url");
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

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
