export const defaultFinancePolicySeedData = Object.freeze({
  riskTier: "standard",
  holdDurationHours: 48,
  reserveBps: 0,
  reserveReleaseDelayDays: 0,
  providerSettlementRequired: true
});

export const defaultFinanceRiskPolicyAuthoritySeedData = Object.freeze({
  holdAnchor: "booking_completed",
  payoutMinimumAmountMinor: 100_000,
  payoutMinimumCurrency: "RUB"
});

export const defaultClientCheckoutPreparePolicySeedData = Object.freeze({
  policyId: "default-client-checkout-prepare",
  version: 1,
  draftRevision: 1,
  operationKind: "client_checkout_prepare",
  lifecycle: "published",
  maximumRows: 100,
  maximumDecimalDigits: 38,
  maximumArtifactBytes: 65_536,
  canonicalPreimage:
    '{"maximumArtifactBytes":65536,"maximumDecimalDigits":38,"maximumRows":100,"operationKind":"client_checkout_prepare","policyId":"default-client-checkout-prepare","version":1}',
  canonicalDigest: "sha256:f4a054273879d230e093a06e8312567861173c2a5005b1012d89c933385f3f94"
});

export const defaultClientOrderCapturePolicySeedData = Object.freeze({
  policyId: "default-client-order-capture",
  version: 1,
  draftRevision: 1,
  operationKind: "client_order_capture",
  lifecycle: "published",
  maximumRows: 100,
  maximumDecimalDigits: 38,
  maximumArtifactBytes: 65_536,
  canonicalPreimage:
    '{"maximumArtifactBytes":65536,"maximumDecimalDigits":38,"maximumRows":100,"operationKind":"client_order_capture","policyId":"default-client-order-capture","version":1}',
  canonicalDigest: "sha256:f7fe5811e818ebdf601482438da232be34a00017cf40cba1a1a09030fc6c655c"
});

export const defaultFinanceArtifactRetentionPolicySeedData = Object.freeze([
  {
    policyId: "provider-request",
    policyVersion: "1",
    artifactClass: "provider_request",
    retainForSeconds: "31536000",
    authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
  },
  {
    policyId: "provider-response",
    policyVersion: "1",
    artifactClass: "provider_response",
    retainForSeconds: "31536000",
    authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
  },
  {
    policyId: "provider-webhook",
    policyVersion: "1",
    artifactClass: "provider_webhook",
    retainForSeconds: "31536000",
    authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
  },
  {
    policyId: "provider-canonical-read",
    policyVersion: "1",
    artifactClass: "provider_canonical_read",
    retainForSeconds: "31536000",
    authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
  },
  {
    policyId: "provider-settlement-page",
    policyVersion: "1",
    artifactClass: "provider_settlement_page",
    retainForSeconds: "31536000",
    authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
  }
] as const);
