import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createAes256GcmSecretCipher,
  createSessionToken,
  hashSessionToken,
  type Aes256GcmEncryptedSecret,
  type Aes256GcmSecretCipher
} from "@elevenhouse/auth";
import {
  verifyMobileAstrologerRegistrationPasswordlessCodeRequestSchema,
  verifyMobileAstrologerPasswordlessCodeRequestSchema,
  type MobileAstrologerSessionResponse,
  type VerifyMobileAstrologerRegistrationPasswordlessCodeRequest,
  type VerifyMobileAstrologerPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import {
  CustomerAccountIdentityConflictError,
  MobileAstrologerAccountAccessDeniedError,
  type MobileRefreshRetryReceiptCipher,
  PasswordlessCodeVerificationError,
  refreshMobileSession,
  revokeAllMobileSessions,
  revokeMobileSession,
  verifyMobilePasswordlessLogin,
  verifyMobilePasswordlessRegistration,
  type MobilePasswordlessLoginUnitOfWork,
  type MobilePasswordlessRegistrationUnitOfWork,
  type MobileSessionManagementStore,
  type MobileSessionStore,
  type MobileSessionTokenIssuer,
  type MobileSessionUnitOfWork
} from "@elevenhouse/domain";
import { SystemClock } from "../../clock/system-clock.service";
import type { PasswordlessAuthOptions } from "../passwordless/identity-passwordless.handler";
import { assertPasswordlessRateLimitAllowed } from "../passwordless/identity-passwordless-http-errors";
import {
  anonymousPasswordlessIpAddress,
  type PasswordlessRateLimitPort,
  type PasswordlessRequestContext
} from "../passwordless/identity-passwordless.rate-limit";
import {
  PASSWORDLESS_AUTH_OPTIONS,
  PASSWORDLESS_RATE_LIMITER
} from "../passwordless/identity-passwordless.tokens";
import {
  MOBILE_PASSWORDLESS_LOGIN_UNIT_OF_WORK,
  MOBILE_PASSWORDLESS_REGISTRATION_UNIT_OF_WORK,
  MOBILE_SESSION_MANAGEMENT_STORE,
  MOBILE_SESSION_UNIT_OF_WORK
} from "./mobile-session.tokens";

@Injectable()
export class MobileAstrologerSessionTokenIssuer implements MobileSessionTokenIssuer {
  issueToken() {
    const token = createSessionToken();
    return { token, tokenHash: hashSessionToken(token) };
  }
}

type MobileRefreshRetryReceipt = {
  readonly version: 1;
  readonly sessionId: string;
  readonly refreshTokenId: string;
  readonly operationId: string;
  readonly encrypted: Aes256GcmEncryptedSecret;
};

type MobileRefreshTokenPair = {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
};

@Injectable()
export class MobileRefreshRetryReceiptCodec implements MobileRefreshRetryReceiptCipher {
  private readonly cipher: Aes256GcmSecretCipher;

  constructor(@Inject(PASSWORDLESS_AUTH_OPTIONS) options: PasswordlessAuthOptions) {
    this.cipher = createAes256GcmSecretCipher(options.authCodeDeliveryEncryptionKey);
  }

  encrypt(input: Parameters<MobileRefreshRetryReceiptCipher["encrypt"]>[0]): string {
    const encrypted = this.cipher.encrypt({
      plaintext: JSON.stringify({
        sessionId: input.sessionId,
        accessToken: input.accessToken,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        refreshToken: input.refreshToken,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt
      }),
      aad: refreshReceiptAad(input)
    });
    return JSON.stringify({
      version: 1,
      sessionId: input.sessionId,
      refreshTokenId: input.refreshTokenId,
      operationId: input.operationId,
      encrypted
    } satisfies MobileRefreshRetryReceipt);
  }

  decrypt(encryptedTokenPair: string): MobileRefreshTokenPair {
    const receipt = parseRefreshReceipt(encryptedTokenPair);
    const plaintext = this.cipher.decrypt({
      encrypted: receipt.encrypted,
      aad: refreshReceiptAad(receipt)
    });
    const pair = JSON.parse(plaintext) as MobileRefreshTokenPair;
    if (
      pair.sessionId !== receipt.sessionId ||
      !pair.accessToken ||
      !pair.refreshToken ||
      !pair.accessTokenExpiresAt ||
      !pair.refreshTokenExpiresAt
    ) {
      throw new Error("Invalid mobile refresh retry receipt payload");
    }
    return pair;
  }
}

@Injectable()
export class MobileAstrologerSessionService {
  constructor(
    @Inject(MOBILE_SESSION_UNIT_OF_WORK)
    private readonly sessions: MobileSessionUnitOfWork<MobileSessionStore>,
    @Inject(MOBILE_PASSWORDLESS_LOGIN_UNIT_OF_WORK)
    private readonly mobileLogin: MobilePasswordlessLoginUnitOfWork,
    @Inject(MOBILE_PASSWORDLESS_REGISTRATION_UNIT_OF_WORK)
    private readonly mobileRegistration: MobilePasswordlessRegistrationUnitOfWork,
    @Inject(MOBILE_SESSION_MANAGEMENT_STORE)
    private readonly management: MobileSessionManagementStore,
    private readonly tokenIssuer: MobileAstrologerSessionTokenIssuer,
    private readonly retryReceiptCodec: MobileRefreshRetryReceiptCodec,
    private readonly clock: SystemClock,
    private readonly configService: ConfigService,
    @Inject(PASSWORDLESS_AUTH_OPTIONS)
    private readonly passwordlessOptions: PasswordlessAuthOptions,
    @Inject(PASSWORDLESS_RATE_LIMITER)
    private readonly rateLimiter: PasswordlessRateLimitPort
  ) {}

  async verifyPasswordlessCode(
    body: VerifyMobileAstrologerPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<MobileAstrologerSessionResponse> {
    const request = verifyMobileAstrologerPasswordlessCodeRequestSchema.safeParse(body);
    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid mobile passwordless code verification request",
        issues: request.error.issues
      });
    }
    await assertPasswordlessRateLimitAllowed(
      await this.rateLimiter.consumeVerifyCode({
        challengeId: request.data.challengeId,
        ipAddress: context.ipAddress ?? anonymousPasswordlessIpAddress
      })
    );

    try {
      const result = await verifyMobilePasswordlessLogin({
        login: this.mobileLogin,
        tokenIssuer: this.tokenIssuer,
        challengeId: request.data.challengeId,
        code: request.data.code,
        codeSecret: this.passwordlessOptions.codeSecret,
        trustedStaticCode: this.passwordlessOptions.trustedStaticCode ?? null,
        platform: request.data.platform,
        deviceLabel: request.data.deviceLabel,
        now: this.clock.now(),
        accessTokenTtlSeconds: this.accessTokenTtlSeconds,
        idleTtlSeconds: this.idleTtlSeconds,
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
        ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent })
      });
      return {
        account: { ...result.account, roles: [...result.account.roles] },
        sessionId: result.session.id,
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt,
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt
      };
    } catch (error) {
      if (error instanceof PasswordlessCodeVerificationError) {
        throw new UnauthorizedException("Invalid or expired passwordless code", { cause: error });
      }
      if (error instanceof MobileAstrologerAccountAccessDeniedError) {
        throw new UnauthorizedException("Astrologer account access is required", { cause: error });
      }
      throw error;
    }
  }

  async refresh(
    refreshToken: string,
    operationId: string,
    context: PasswordlessRequestContext = {}
  ) {
    const refreshTokenHash = hashSessionToken(refreshToken);
    await assertPasswordlessRateLimitAllowed(
      await this.rateLimiter.consumeMobileRefresh({
        refreshTokenHash,
        ipAddress: context.ipAddress ?? anonymousPasswordlessIpAddress
      })
    );
    const result = await refreshMobileSession({
      sessions: this.sessions,
      tokenIssuer: this.tokenIssuer,
      refreshTokenHash,
      operationId,
      retryReceiptCipher: this.retryReceiptCodec,
      now: this.clock.now(),
      accessTokenTtlSeconds: this.accessTokenTtlSeconds,
      idleTtlSeconds: this.idleTtlSeconds
    });
    if (result.kind === "recovered") {
      return this.retryReceiptCodec.decrypt(result.encryptedTokenPair);
    }
    if (result.kind !== "refreshed") {
      throw new UnauthorizedException("Invalid mobile refresh token");
    }
    return result;
  }

  async verifyRegistrationCode(
    body: VerifyMobileAstrologerRegistrationPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<MobileAstrologerSessionResponse> {
    const request = verifyMobileAstrologerRegistrationPasswordlessCodeRequestSchema.safeParse(body);
    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid mobile registration verification request",
        issues: request.error.issues
      });
    }
    await assertPasswordlessRateLimitAllowed(
      await this.rateLimiter.consumeVerifyCode({
        challengeId: request.data.challengeId,
        ipAddress: context.ipAddress ?? anonymousPasswordlessIpAddress
      })
    );
    try {
      const result = await verifyMobilePasswordlessRegistration({
        registration: this.mobileRegistration,
        tokenIssuer: this.tokenIssuer,
        challengeId: request.data.challengeId,
        code: request.data.code,
        codeSecret: this.passwordlessOptions.codeSecret,
        trustedStaticCode: this.passwordlessOptions.trustedStaticCode ?? null,
        displayName: request.data.displayName,
        platform: request.data.platform,
        deviceLabel: request.data.deviceLabel,
        now: this.clock.now(),
        accessTokenTtlSeconds: this.accessTokenTtlSeconds,
        idleTtlSeconds: this.idleTtlSeconds,
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
        ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent })
      });
      return {
        account: { ...result.account, roles: [...result.account.roles] },
        sessionId: result.session.id,
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt,
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt
      };
    } catch (error) {
      if (error instanceof PasswordlessCodeVerificationError) {
        throw new UnauthorizedException("Invalid or expired passwordless code", { cause: error });
      }
      if (error instanceof CustomerAccountIdentityConflictError) {
        throw new ConflictException(
          {
            code: "identity_already_exists",
            message: "Astrologer account identity already exists"
          },
          { cause: error }
        );
      }
      throw error;
    }
  }

  async list(userId: string, currentSessionId: string) {
    const sessions = await this.management.listActiveSessionsForUser({
      userId,
      now: this.clock.now().toISOString()
    });
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        platform: session.platform,
        deviceLabel: session.deviceLabel,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        isCurrent: session.id === currentSessionId
      }))
    };
  }

  logout(userId: string, sessionId: string): Promise<void> {
    return revokeMobileSession({
      sessions: this.sessions,
      sessionId,
      userId,
      now: this.clock.now(),
      reason: "logout"
    });
  }

  logoutAll(userId: string): Promise<void> {
    return revokeAllMobileSessions({
      sessions: this.sessions,
      userId,
      now: this.clock.now(),
      reason: "logout_all"
    });
  }

  private get accessTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>("astrologerApi.mobileAccessTokenTtlSeconds");
  }

  private get idleTtlSeconds(): number {
    return this.configService.getOrThrow<number>("astrologerApi.mobileSessionIdleTtlSeconds");
  }
}

function refreshReceiptAad(input: {
  readonly sessionId: string;
  readonly refreshTokenId: string;
  readonly operationId: string;
}): string {
  return `elevenhouse:mobile-refresh-retry:${input.sessionId}:${input.refreshTokenId}:${input.operationId}`;
}

function parseRefreshReceipt(value: string): MobileRefreshRetryReceipt {
  const parsed = JSON.parse(value) as Partial<MobileRefreshRetryReceipt>;
  if (
    parsed.version !== 1 ||
    typeof parsed.sessionId !== "string" ||
    typeof parsed.refreshTokenId !== "string" ||
    typeof parsed.operationId !== "string" ||
    !parsed.encrypted ||
    parsed.encrypted.algorithm !== "aes-256-gcm" ||
    typeof parsed.encrypted.iv !== "string" ||
    typeof parsed.encrypted.ciphertext !== "string" ||
    typeof parsed.encrypted.authTag !== "string"
  ) {
    throw new Error("Invalid mobile refresh retry receipt");
  }
  return parsed as MobileRefreshRetryReceipt;
}
