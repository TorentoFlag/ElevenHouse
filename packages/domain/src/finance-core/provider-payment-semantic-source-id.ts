import { createHash } from "node:crypto";

/**
 * Stable, bounded identity for a captured provider payment semantic fact. The database identity
 * is scoped by provider account and semantic kind, so a static transition label would incorrectly
 * collapse every successful client order into one fact.
 */
export function createCapturedProviderPaymentSemanticSourceId(providerPaymentId: string): string {
  if (
    typeof providerPaymentId !== "string" ||
    providerPaymentId.length < 1 ||
    providerPaymentId.length > 160 ||
    providerPaymentId.trim() !== providerPaymentId ||
    // eslint-disable-next-line no-control-regex -- Provider identifier grammar rejects ASCII C0/DEL.
    /[\u0000-\u001f\u007f]/u.test(providerPaymentId)
  ) {
    throw new ProviderPaymentSemanticSourceIdError();
  }
  const digest = createHash("sha256").update(providerPaymentId, "utf8").digest("hex");
  return `captured:sha256:${digest}`;
}

export class ProviderPaymentSemanticSourceIdError extends Error {
  readonly code = "provider_payment_semantic_source_id_error" as const;

  constructor() {
    super("Provider payment semantic source identity is invalid");
    this.name = "ProviderPaymentSemanticSourceIdError";
  }
}
