import { Inject, Injectable } from "@nestjs/common";
import {
  createAes256GcmSecretCipher,
  type Aes256GcmSecretCipher
} from "@elevenhouse/auth";
import type {
  AuthCodeEncryptionPort,
  PasswordlessAuthChannel,
  PasswordlessAuthUnitOfWork
} from "@elevenhouse/domain";
import {
  createAuthCodeDeliveryEncryptionAad,
  createNumericPasswordlessCode,
  requestPasswordlessCode,
  verifyPasswordlessCode
} from "@elevenhouse/domain";
import type {
  RequestPasswordlessCodeRequest,
  RequestPasswordlessCodeResponse,
  VerifyPasswordlessCodeRequest,
  VerifyPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import {
  PublicSessionTokenIssuer,
  SystemClock,
  type IssuedSessionToken
} from "../session/identity-session.service";
import {
  PASSWORDLESS_AUTH_CODE_ENCRYPTION,
  PASSWORDLESS_AUTH_OPTIONS,
  PASSWORDLESS_AUTH_UNIT_OF_WORK
} from "./identity-passwordless.tokens";
import type { PasswordlessRequestContext } from "./identity-passwordless.rate-limit";

export const PUBLIC_AUTH_CODE_GENERATOR = Symbol("PUBLIC_AUTH_CODE_GENERATOR");

export type PasswordlessCodeGenerator = {
  readonly generateCode: () => string;
};

export type SessionTokenIssuer = {
  readonly issueSessionToken: () => IssuedSessionToken;
};

export type PasswordlessAuthOptions = {
  readonly authCodeDeliveryEncryptionKey: Buffer;
  readonly codeSecret: string;
  readonly codeTtlSeconds: number;
  readonly resendCooldownSeconds: number;
  readonly maxAttempts: number;
  readonly sessionTtlSeconds: number;
};

export type VerifyPasswordlessCodeWithSessionResult = {
  readonly response: VerifyPasswordlessCodeResponse;
  readonly session: {
    readonly token: string;
    readonly expiresAt: string;
  };
};

@Injectable()
export class NumericPasswordlessCodeGenerator implements PasswordlessCodeGenerator {
  generateCode(): string {
    return createNumericPasswordlessCode(6);
  }
}

@Injectable()
export class AesGcmAuthCodeEncryption implements AuthCodeEncryptionPort {
  private readonly cipher: Aes256GcmSecretCipher;

  constructor(@Inject(PASSWORDLESS_AUTH_OPTIONS) options: PasswordlessAuthOptions) {
    this.cipher = createAes256GcmSecretCipher(options.authCodeDeliveryEncryptionKey);
  }

  encryptAuthCode(input: {
    readonly challengeId: string;
    readonly deliveryId: string;
    readonly channel: PasswordlessAuthChannel;
    readonly identifier: string;
    readonly code: string;
    readonly expiresAt: string;
  }) {
    return this.cipher.encrypt({
      plaintext: input.code,
      aad: createAuthCodeDeliveryEncryptionAad(input)
    });
  }
}

@Injectable()
export class DomainPasswordlessAuthHandler {
  constructor(
    @Inject(PASSWORDLESS_AUTH_UNIT_OF_WORK)
    private readonly passwordlessAuth: PasswordlessAuthUnitOfWork,
    @Inject(PASSWORDLESS_AUTH_CODE_ENCRYPTION)
    private readonly authCodeEncryption: AuthCodeEncryptionPort,
    @Inject(PUBLIC_AUTH_CODE_GENERATOR)
    private readonly codeGenerator: PasswordlessCodeGenerator,
    private readonly sessionTokenIssuer: PublicSessionTokenIssuer,
    private readonly clock: SystemClock,
    @Inject(PASSWORDLESS_AUTH_OPTIONS)
    private readonly options: PasswordlessAuthOptions
  ) {}

  requestCode(
    input: RequestPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<RequestPasswordlessCodeResponse> {
    const now = this.clock.now();
    const code = this.codeGenerator.generateCode();

    return this.passwordlessAuth.transact((store) =>
      requestPasswordlessCode({
        store,
        encryption: this.authCodeEncryption,
        channel: input.channel,
        identifier: input.identifier,
        roles: input.roles,
        code,
        codeSecret: this.options.codeSecret,
        now,
        ttlSeconds: this.options.codeTtlSeconds,
        resendCooldownSeconds: this.options.resendCooldownSeconds,
        maxAttempts: this.options.maxAttempts,
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
        ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent })
      })
    );
  }

  async verifyCode(
    input: VerifyPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<VerifyPasswordlessCodeWithSessionResult> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlSeconds * 1000);
    const issuedToken = this.sessionTokenIssuer.issueSessionToken();
    const result = await this.passwordlessAuth.transact((store) =>
      verifyPasswordlessCode({
        store,
        challengeId: input.challengeId,
        code: input.code,
        codeSecret: this.options.codeSecret,
        now,
        session: {
          tokenHash: issuedToken.tokenHash,
          createdAt: now,
          expiresAt,
          ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
          ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent })
        }
      })
    );

    if (result.user.status !== "active") {
      throw new Error(`Authenticated customer account has unexpected status: ${result.user.status}`);
    }

    return {
      response: {
        account: {
          id: result.user.id,
          status: result.user.status,
          roles: result.roleAssignments.map((assignment) => assignment.role)
        }
      },
      session: {
        token: issuedToken.token,
        expiresAt: result.session.expiresAt
      }
    };
  }
}
