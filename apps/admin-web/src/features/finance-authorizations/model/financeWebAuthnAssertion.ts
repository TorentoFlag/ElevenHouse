import type { BeginFinanceAuthorizationResponse, FinanceWebAuthnAssertion } from "@elevenhouse/contracts";

export class FinanceWebAuthnAssertionError extends Error {
  constructor(readonly code: "finance_webauthn_unavailable" | "finance_webauthn_assertion_invalid") {
    super("A verified finance passkey assertion could not be created");
    this.name = "FinanceWebAuthnAssertionError";
  }
}

export type FinanceCredentialGetter = Readonly<{
  get(input: CredentialRequestOptions): Promise<Credential | null>;
}>;

/**
 * Runs the browser half of the assertion ceremony. The server owns the challenge, RP ID and
 * grant issuance; the browser merely signs those exact options and serializes the native result.
 */
export async function createFinanceWebAuthnAssertion(input: Readonly<{
  readonly authorization: BeginFinanceAuthorizationResponse;
  readonly credentials?: FinanceCredentialGetter | null;
}>): Promise<FinanceWebAuthnAssertion> {
  const credentials = input.credentials ?? navigator.credentials;
  if (!credentials?.get) throw new FinanceWebAuthnAssertionError("finance_webauthn_unavailable");

  const credential = await credentials.get({
    publicKey: {
      challenge: decodeBase64Url(input.authorization.publicKey.challenge),
      rpId: input.authorization.publicKey.rpId,
      timeout: input.authorization.publicKey.timeout,
      userVerification: input.authorization.publicKey.userVerification
    }
  });
  if (!isAssertionCredential(credential)) {
    throw new FinanceWebAuthnAssertionError("finance_webauthn_assertion_invalid");
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  const authenticatorAttachment = credential.authenticatorAttachment;
  return {
    id: encodeBase64Url(credential.rawId),
    rawId: encodeBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      authenticatorData: encodeBase64Url(response.authenticatorData),
      signature: encodeBase64Url(response.signature),
      userHandle: response.userHandle ? encodeBase64Url(response.userHandle) : null
    },
    clientExtensionResults: Object.fromEntries(
      Object.entries(credential.getClientExtensionResults())
    ),
    authenticatorAttachment:
      authenticatorAttachment === "platform" || authenticatorAttachment === "cross-platform"
        ? authenticatorAttachment
        : null
  };
}

function isAssertionCredential(value: Credential | null): value is PublicKeyCredential {
  const response = (value as PublicKeyCredential | null)?.response as
    | AuthenticatorAssertionResponse
    | undefined;
  return (
    value !== null &&
    value.type === "public-key" &&
    typeof (value as PublicKeyCredential).getClientExtensionResults === "function" &&
    response instanceof Object &&
    response.clientDataJSON instanceof ArrayBuffer &&
    response.authenticatorData instanceof ArrayBuffer &&
    response.signature instanceof ArrayBuffer &&
    (response.userHandle === null || response.userHandle instanceof ArrayBuffer)
  );
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(`${base64}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
