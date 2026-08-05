import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  ClientCheckoutPreparationReadPort,
  FinancePrivateObjectStoragePort
} from "@elevenhouse/domain/finance-core";

type CheckoutActionResult =
  | Readonly<{ kind: "checkout_action_ready"; checkoutUrl: string }>
  | Readonly<{ kind: "checkout_preparing" }>
  | Readonly<{ kind: "provider_session_unknown" }>
  | Readonly<{ kind: "checkout_failed" }>;

export type ClientCheckoutPreparationState =
  | "checkout_requested"
  | "checkout_ready"
  | "provider_session_unknown"
  | "failed";

export class ClientCheckoutActionServiceError extends Error {
  readonly code = "client_checkout_action_error" as const;

  constructor(readonly reason: "checkout_not_found" | "artifact_integrity") {
    super("Client checkout action could not be resolved safely");
  }
}

/**
 * The public API does not create or call an ArcPay session.  It only lets the authenticated
 * owner follow the exact HPP redirect that the payment worker already sealed and published.
 * The redirect URL is never persisted in a public read model or logged by this service.
 */
export class ClientCheckoutActionService {
  constructor(
    private readonly checkoutPreparations: ClientCheckoutPreparationReadPort,
    private readonly artifactRegistry: Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">,
    private readonly privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "readImmutable">
  ) {}

  async resolveAction(input: Readonly<{
    checkoutPreparationId: string;
    clientUserId: string;
    requestId: string;
  }>): Promise<CheckoutActionResult> {
    const preparation = await this.checkoutPreparations.findClientCheckoutPreparation({
      checkoutPreparationId: input.checkoutPreparationId,
      clientUserId: input.clientUserId
    });
    if (!preparation) throw new ClientCheckoutActionServiceError("checkout_not_found");
    if (preparation.state === "checkout_requested") return Object.freeze({ kind: "checkout_preparing" });
    if (preparation.state === "provider_session_unknown") {
      return Object.freeze({ kind: "provider_session_unknown" });
    }
    if (preparation.state === "failed") return Object.freeze({ kind: "checkout_failed" });
    if (
      preparation.providerCheckoutId === null ||
      preparation.responseArtifactId === null ||
      preparation.responseArtifactDigest === null
    ) {
      throw new ClientCheckoutActionServiceError("artifact_integrity");
    }

    const artifact = await this.artifactRegistry.resolvePrivateArtifact({
      artifactId: preparation.responseArtifactId,
      serviceIdentity: "client_checkout_delivery",
      purpose: "client_checkout_action_delivery",
      requestId: input.requestId
    });
    if (
      artifact.artifactClass !== "provider_response" ||
      artifact.contentType !== "application/json" ||
      artifact.artifact.artifactId !== preparation.responseArtifactId ||
      artifact.artifact.sha256Digest !== preparation.responseArtifactDigest
    ) {
      throw new ClientCheckoutActionServiceError("artifact_integrity");
    }
    const response = await this.privateObjectStorage.readImmutable(artifact.privateObject);
    const actualDigest = digest(response.bytes);
    if (
      response.contentType !== "application/json" ||
      actualDigest !== preparation.responseArtifactDigest ||
      actualDigest !== response.sha256Digest ||
      response.sha256Digest !== preparation.responseArtifactDigest ||
      response.sha256Digest !== artifact.artifact.sha256Digest ||
      response.byteLength !== artifact.artifact.byteLength
    ) {
      throw new ClientCheckoutActionServiceError("artifact_integrity");
    }
    const checkoutUrl = parseExactCheckoutResponse(response.bytes, preparation.providerCheckoutId);
    return Object.freeze({ kind: "checkout_action_ready", checkoutUrl });
  }

  async resolveState(input: Readonly<{
    checkoutPreparationId: string;
    clientUserId: string;
  }>): Promise<ClientCheckoutPreparationState> {
    const preparation = await this.checkoutPreparations.findClientCheckoutPreparation(input);
    if (!preparation) throw new ClientCheckoutActionServiceError("checkout_not_found");
    return preparation.state;
  }
}

function parseExactCheckoutResponse(bytes: Uint8Array, providerCheckoutId: string): string {
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ClientCheckoutActionServiceError("artifact_integrity");
  }
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.keys(candidate).length !== 2 ||
    !Object.hasOwn(candidate, "id") ||
    !Object.hasOwn(candidate, "url")
  ) {
    throw new ClientCheckoutActionServiceError("artifact_integrity");
  }
  const { id, url } = candidate as Readonly<{ id: unknown; url: unknown }>;
  if (id !== providerCheckoutId || !isHttpsUrl(url)) {
    throw new ClientCheckoutActionServiceError("artifact_integrity");
  }
  return url;
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
