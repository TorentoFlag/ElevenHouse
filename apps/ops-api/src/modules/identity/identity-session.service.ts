import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createSessionToken,
  hashSessionToken
} from "@elevenhouse/auth";
import { OpsCsrfTokenService } from "../security/csrf/ops-csrf-token.service";

export type IssuedSessionToken = {
  readonly token: string;
  readonly tokenHash: string;
};

export type OpsSessionCookie = {
  readonly token: string;
  readonly expiresAt: string;
};

export type OpsSessionCookieResponse = {
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

@Injectable()
export class OpsSessionTokenIssuer {
  issueSessionToken(): IssuedSessionToken {
    const token = createSessionToken();

    return {
      token,
      tokenHash: hashSessionToken(token)
    };
  }
}

@Injectable()
export class SystemClock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class OpsSessionCookieService {
  constructor(
    private readonly configService: ConfigService,
    private readonly csrfTokenService: OpsCsrfTokenService
  ) {}

  setSessionCookie(response: OpsSessionCookieResponse, session: OpsSessionCookie): void {
    const sessionTtlSeconds = this.configService.getOrThrow<number>(
      "opsApi.sessionTtlSeconds"
    );
    const secure = this.configService.getOrThrow<boolean>("opsApi.sessionCookieSecure");
    const name = this.configService.getOrThrow<string>("opsApi.sessionCookieName");

    response.cookie(name, session.token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
      maxAge: sessionTtlSeconds * 1000
    });
    this.csrfTokenService.setCsrfCookie({
      response,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt
    });
  }

  clearSessionCookie(response: OpsSessionCookieResponse): void {
    const secure = this.configService.getOrThrow<boolean>("opsApi.sessionCookieSecure");
    const name = this.configService.getOrThrow<string>("opsApi.sessionCookieName");

    response.cookie(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      maxAge: 0
    });
    this.csrfTokenService.clearCsrfCookie(response);
  }
}
