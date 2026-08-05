/**
 * A reusable processor credential is deliberately distinct from a browser tokenization secret.
 * It may be read only by the payment worker for a server-side card-on-file charge; PostgreSQL
 * retains a KMS/object-store handle and a fingerprint, never the provider token itself.
 */
export type ArcPayRestrictedSavedCardCredential = Readonly<{
  kind: "arc_pay_restricted_saved_card_credential";
  credentialId: string;
  providerCustomerId: string;
  cardTokenId: string;
}>;

export type SealedRestrictedProviderCredential = Readonly<{
  kind: "sealed_restricted_provider_credential";
  restrictedTokenHandleRef: string;
  providerCredentialFingerprint: `sha256:${string}`;
}>;

export type FinanceRestrictedProviderCredentialVaultPort = Readonly<{
  sealArcPaySavedCardCredential(input: Readonly<{
    credentialId: string;
    providerCustomerId: string;
    cardTokenId: string;
  }>): Promise<SealedRestrictedProviderCredential>;
  resolveArcPaySavedCardCredential(input: Readonly<{
    restrictedTokenHandleRef: string;
    expectedCredentialId: string;
    expectedProviderCustomerId: string;
  }>): Promise<ArcPayRestrictedSavedCardCredential>;
}>;
