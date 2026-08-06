import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON
} from "@simplewebauthn/server";
import {
  beginFinanceAuthorizationResponseSchema,
  beginFinanceAuthorizationRequestSchema,
  beginFinanceWebAuthnRegistrationResponseSchema,
  financeWebAuthnRegistrationResponseSchema,
  verifyFinanceAuthorizationRequestSchema,
  verifyFinanceAuthorizationResponseSchema,
  verifyFinanceWebAuthnRegistrationRequestSchema,
  verifyFinanceWebAuthnRegistrationResponseSchema,
  type BeginFinanceAuthorizationResponse,
  type BeginFinanceAuthorizationRequest,
  type BeginFinanceWebAuthnRegistrationResponse,
  type VerifyFinanceAuthorizationResponse,
  type VerifyFinanceWebAuthnRegistrationResponse
} from "@elevenhouse/contracts";
import {
  beginFinanceAuthorization,
  FinanceAuthorizationRejectedError,
  verifyFinanceAuthorizationAndIssueGrant
} from "@elevenhouse/domain";
import {
  createDrizzleFinanceAuthorizationStore,
  createDrizzleFinanceAuthorizationVerificationUnitOfWork,
  createDrizzleFinanceWebAuthnCredentialMaterialReader,
  createDrizzleFinanceWebAuthnRegistrationStore
} from "@elevenhouse/db/finance";

import type { AdminApiRuntimeConfig } from "../../config/runtime-config.js";
import { SystemClock } from "../../common/system-clock.js";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import type { AdminAuthenticatedAccount } from "../identity/session/identity-current-session.service";
import { SimpleWebAuthnFinanceAssertionVerifier } from "./simple-webauthn-finance-assertion-verifier";

const ceremonyLifetimeMilliseconds = 300_000;

@Injectable()
export class AdminFinanceAuthorizationsService {
  constructor(
    @Inject(PostgresRuntimeService) private readonly postgresRuntime: PostgresRuntimeService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(SystemClock) private readonly clock: SystemClock
  ) {}

  async begin(
    account: AdminAuthenticatedAccount,
    body: unknown
  ): Promise<BeginFinanceAuthorizationResponse> {
    const request = beginFinanceAuthorizationRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    return this.beginResolved(account, request.data);
  }

  /**
   * Used by server-owned finance workflows after they derive the canonical aggregate/version/
   * payload from persisted facts. Keeping it here preserves the same ceremony, TTL and credential
   * policy as the generic endpoint without trusting browser-provided money instructions.
   */
  async beginResolved(
    account: AdminAuthenticatedAccount,
    request: BeginFinanceAuthorizationRequest
  ): Promise<BeginFinanceAuthorizationResponse> {
    const config = this.webAuthnConfig();
    const result = await beginFinanceAuthorization({
      actorUserId: account.id,
      sessionId: account.sessionId,
      sessionKind: "standard",
      actionKind: request.actionKind,
      aggregateId: request.aggregateId,
      expectedVersion: request.expectedVersion,
      payload: request.payload,
      store: createDrizzleFinanceAuthorizationStore(this.postgresRuntime.database),
      randomSource: { randomBytes },
      clock: { now: () => this.clock.now().toISOString() },
      rpId: config.rpId,
      origin: config.origin
    });
    return beginFinanceAuthorizationResponseSchema.parse(result);
  }

  async verify(
    account: AdminAuthenticatedAccount,
    body: unknown
  ): Promise<VerifyFinanceAuthorizationResponse> {
    const request = verifyFinanceAuthorizationRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    try {
      const result = await verifyFinanceAuthorizationAndIssueGrant({
        actorUserId: account.id,
        sessionId: account.sessionId,
        sessionKind: "standard",
        challengeId: request.data.challengeId,
        assertion: request.data.assertion,
        store: createDrizzleFinanceAuthorizationStore(this.postgresRuntime.database),
        verificationUnitOfWork: createDrizzleFinanceAuthorizationVerificationUnitOfWork({
          database: this.postgresRuntime.database
        }),
        verifier: new SimpleWebAuthnFinanceAssertionVerifier(
          createDrizzleFinanceWebAuthnCredentialMaterialReader(this.postgresRuntime.database)
        ),
        clock: { now: () => this.clock.now().toISOString() }
      });
      return verifyFinanceAuthorizationResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof FinanceAuthorizationRejectedError) throw new ConflictException(financeRejected());
      throw error;
    }
  }

  async beginRegistration(
    account: AdminAuthenticatedAccount
  ): Promise<BeginFinanceWebAuthnRegistrationResponse> {
    const config = this.webAuthnConfig();
    const credentialReader = createDrizzleFinanceWebAuthnCredentialMaterialReader(
      this.postgresRuntime.database
    );
    const now = this.clock.now();
    const publicKey = await generateRegistrationOptions({
      rpName: "ElevenHouse",
      rpID: config.rpId,
      userName: `finance-admin:${account.id}`,
      userID: Uint8Array.from(Buffer.from(account.id, "utf8")),
      userDisplayName: "ElevenHouse finance administrator",
      timeout: ceremonyLifetimeMilliseconds,
      attestationType: "none",
      excludeCredentials: (await credentialReader.listActiveByOwnerUserId(account.id)).map(
        (credential) => ({
          id: credential.credentialId,
          transports: credential.transports as ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[]
        })
      ),
      authenticatorSelection: { residentKey: "required", userVerification: "required" }
    });
    const challenge = await createDrizzleFinanceWebAuthnRegistrationStore({
      database: this.postgresRuntime.database
    }).createChallenge({
      actorUserId: account.id,
      sessionId: account.sessionId,
      challenge: publicKey.challenge,
      rpId: config.rpId,
      origin: config.origin,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ceremonyLifetimeMilliseconds).toISOString()
    });
    return beginFinanceWebAuthnRegistrationResponseSchema.parse({
      registrationChallengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      publicKey
    });
  }

  async verifyRegistration(
    account: AdminAuthenticatedAccount,
    body: unknown
  ): Promise<VerifyFinanceWebAuthnRegistrationResponse> {
    const request = verifyFinanceWebAuthnRegistrationRequestSchema.safeParse(body);
    if (!request.success || request.data.registration.id !== request.data.registration.rawId) {
      throw invalidRequest();
    }
    const store = createDrizzleFinanceWebAuthnRegistrationStore({
      database: this.postgresRuntime.database
    });
    const challenge = await store.findChallengeById(request.data.registrationChallengeId);
    if (
      !challenge ||
      challenge.actorUserId !== account.id ||
      challenge.sessionId !== account.sessionId ||
      challenge.status !== "active" ||
      Date.parse(challenge.expiresAt) <= this.clock.now().getTime()
    ) {
      throw new ConflictException(financeRejected());
    }

    let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verified = await verifyRegistrationResponse({
        response: financeWebAuthnRegistrationResponseSchema.parse(
          request.data.registration
        ) as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpId,
        expectedType: "webauthn.create",
        requireUserPresence: true,
        requireUserVerification: true
      });
    } catch {
      throw new ConflictException(financeRejected());
    }
    if (!verified.verified || !verified.registrationInfo.userVerified) {
      throw new ConflictException(financeRejected());
    }

    const credential = await store.consumeChallengeAndCreateCredential({
      registrationChallengeId: challenge.id,
      actorUserId: account.id,
      sessionId: account.sessionId,
      consumedAt: this.clock.now().toISOString(),
      credential: {
        credentialId: verified.registrationInfo.credential.id,
        publicKey: Buffer.from(verified.registrationInfo.credential.publicKey),
        transports: request.data.registration.response.transports ?? [],
        deviceType: verified.registrationInfo.credentialDeviceType,
        backedUp: verified.registrationInfo.credentialBackedUp,
        signatureCounter: verified.registrationInfo.credential.counter
      }
    });
    if (!credential) throw new ConflictException(financeRejected());
    return verifyFinanceWebAuthnRegistrationResponseSchema.parse({ credentialId: credential.credentialId });
  }

  private webAuthnConfig(): NonNullable<AdminApiRuntimeConfig["financeWebAuthn"]> {
    const config = this.configService.getOrThrow<AdminApiRuntimeConfig>("adminApi").financeWebAuthn;
    if (!config) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "finance_webauthn_not_configured",
        code: "finance_webauthn_not_configured",
        message: "Finance WebAuthn is not configured"
      });
    }
    return config;
  }
}

function invalidRequest(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: "invalid_request",
    code: "invalid_request",
    message: "Invalid finance authorization request"
  });
}

function financeRejected() {
  return {
    statusCode: 409,
    error: "finance_authorization_rejected",
    code: "finance_authorization_rejected",
    message: "Finance authorization was rejected"
  };
}
