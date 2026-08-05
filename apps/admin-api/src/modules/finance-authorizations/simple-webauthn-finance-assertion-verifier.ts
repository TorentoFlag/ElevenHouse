import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type VerifiedAuthenticationResponse,
  type WebAuthnCredential
} from "@simplewebauthn/server";
import {
  financeWebAuthnAssertionSchema,
  type FinanceWebAuthnAssertion
} from "@elevenhouse/contracts";
import type { FinanceWebAuthnAssertionVerifier } from "@elevenhouse/domain";
import type { FinanceWebAuthnCredentialMaterial } from "@elevenhouse/db/finance";

type CredentialReader = {
  readonly findActiveByCredentialId: (
    credentialId: string
  ) => Promise<FinanceWebAuthnCredentialMaterial | null>;
};

type AuthenticationResponseVerifier = (input: {
  readonly response: AuthenticationResponseJSON;
  readonly expectedChallenge: string;
  readonly expectedOrigin: string;
  readonly expectedRPID: string;
  readonly credential: WebAuthnCredential;
  readonly expectedType: "webauthn.get";
  readonly requireUserVerification: true;
  readonly advancedFIDOConfig: Readonly<{ userVerification: "required" }>;
}) => Promise<VerifiedAuthenticationResponse>;

/**
 * This is the only component that interprets browser assertion bytes. Domain code receives a
 * reduced verified fact, then rechecks owner, one-time challenge and counter CAS in PostgreSQL.
 */
export class SimpleWebAuthnFinanceAssertionVerifier implements FinanceWebAuthnAssertionVerifier {
  constructor(
    private readonly credentialReader: CredentialReader,
    private readonly verify: AuthenticationResponseVerifier = verifyAuthenticationResponse
  ) {}

  async verifyAssertion(input: Parameters<FinanceWebAuthnAssertionVerifier["verifyAssertion"]>[0]) {
    const parsed = financeWebAuthnAssertionSchema.safeParse(input.assertion);
    if (!parsed.success || parsed.data.id !== parsed.data.rawId) return { verified: false as const };
    const credential = await this.credentialReader.findActiveByCredentialId(parsed.data.id);
    if (!credential || credential.credentialId !== parsed.data.id) return { verified: false as const };

    try {
      const verified = await this.verify({
        response: toAuthenticationResponse(parsed.data),
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: input.allowedOrigin,
        expectedRPID: input.rpId,
        credential: {
          id: credential.credentialId,
          publicKey: Uint8Array.from(credential.publicKey),
          counter: credential.signatureCounter,
          transports: toTransports(credential.transports)
        },
        expectedType: "webauthn.get",
        requireUserVerification: true,
        advancedFIDOConfig: { userVerification: "required" }
      });
      if (
        !verified.verified ||
        !verified.authenticationInfo.userVerified ||
        verified.authenticationInfo.credentialID !== credential.credentialId ||
        !Number.isSafeInteger(verified.authenticationInfo.newCounter) ||
        verified.authenticationInfo.newCounter < 0
      ) {
        return { verified: false as const };
      }
      return {
        verified: true as const,
        credentialId: credential.credentialId,
        userVerified: true as const,
        signatureCounter: verified.authenticationInfo.newCounter
      };
    } catch {
      return { verified: false as const };
    }
  }
}

function toAuthenticationResponse(value: FinanceWebAuthnAssertion): AuthenticationResponseJSON {
  return value as AuthenticationResponseJSON;
}

function toTransports(value: readonly string[]): WebAuthnCredential["transports"] {
  const allowed = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
  if (!value.every((transport) => allowed.has(transport))) {
    throw new Error("Unexpected persisted finance WebAuthn transport");
  }
  return [...value] as WebAuthnCredential["transports"];
}
