import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createSessionToken,
  hashSessionToken
} from "@elevenhouse/auth";
import { SystemClock } from "../../../common/system-clock.js";
import { PublicCsrfTokenService } from "../../security/csrf/public-csrf-token.service";

export type IssuedSessionToken = {
  readonly token: string;
  readonly tokenHash: string;
};

export type PublicSessionCookie = {
  readonly token: string;
  readonly expiresAt: string;
};

export type PublicSessionCookieResponse = {
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
export class PublicSessionTokenIssuer {
  issueSessionToken(): IssuedSessionToken {
    const token = createSessionToken();

    return {
      token,
      tokenHash: hashSessionToken(token)
    };
  }
}

@Injectable()
export class PublicSessionCookieService {
  constructor(
    private readonly configService: ConfigService,
    private readonly csrfTokenService: PublicCsrfTokenService,
    private readonly clock: SystemClock
  ) {}

  setSessionCookie(response: PublicSessionCookieResponse, session: PublicSessionCookie): void {
    const sessionTtlSeconds = this.configService.getOrThrow<number>(
      "publicApi.sessionTtlSeconds"
    );
    const secure = this.configService.getOrThrow<boolean>("publicApi.sessionCookieSecure");
    const name = this.configService.getOrThrow<string>("publicApi.sessionCookieName");

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

  clearSessionCookie(response: PublicSessionCookieResponse): void {
    const secure = this.configService.getOrThrow<boolean>("publicApi.sessionCookieSecure");
    const name = this.configService.getOrThrow<string>("publicApi.sessionCookieName");

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
