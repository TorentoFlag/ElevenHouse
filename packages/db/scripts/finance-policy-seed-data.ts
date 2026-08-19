export const defaultFinancePolicySeedData = Object.freeze({
  riskTier: "standard",
  holdDurationHours: 48,
  reserveBps: 0,
  reserveReleaseDelayDays: 0,
  providerSettlementRequired: true
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
