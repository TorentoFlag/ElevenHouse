import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createSessionToken,
  hashSessionToken
} from "@elevenhouse/auth";
import { SystemClock } from "../../clock/system-clock.service";
import { AstrologerCsrfTokenService } from "../../security/csrf/astrologer-csrf-token.service";

export type IssuedSessionToken = {
  readonly token: string;
  readonly tokenHash: string;
};

export type AstrologerSessionCookie = {
  readonly token: string;
  readonly expiresAt: string;
};

export type AstrologerSessionCookieResponse = {
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
export class AstrologerSessionTokenIssuer {
  issueSessionToken(): IssuedSessionToken {
    const token = createSessionToken();

    return {
      token,
      tokenHash: hashSessionToken(token)
    };
  }
}

@Injectable()
export class AstrologerSessionCookieService {
  constructor(
    private readonly configService: ConfigService,
    private readonly csrfTokenService: AstrologerCsrfTokenService,
    private readonly clock: SystemClock
  ) {}

  setSessionCookie(response: AstrologerSessionCookieResponse, session: AstrologerSessionCookie): void {
    const sessionTtlSeconds = this.configService.getOrThrow<number>(
      "astrologerApi.sessionTtlSeconds"
    );
    const secure = this.configService.getOrThrow<boolean>("astrologerApi.sessionCookieSecure");
    const name = this.configService.getOrThrow<string>("astrologerApi.sessionCookieName");

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
      sessionExpiresAt: session.expiresAt,
      now: this.clock.now()
    });
  }

  clearSessionCookie(response: AstrologerSessionCookieResponse): void {
    const secure = this.configService.getOrThrow<boolean>("astrologerApi.sessionCookieSecure");
    const name = this.configService.getOrThrow<string>("astrologerApi.sessionCookieName");

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
