/**
 * A tokenization result is a short-lived provider secret: it is neither a saved credential nor
 * an artifact that can be placed in an outbox payload.  The vault boundary keeps its bytes out
 * of PostgreSQL, logs and queue messages while preserving an opaque, auditable reference.
 */
export type ArcPayBrowserInfo = Readonly<{
  acceptHeader: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: 1 | 4 | 8 | 15 | 16 | 24 | 32 | 48;
  timezoneOffsetMinutes: number;
  userAgent: string;
  javaEnabled?: boolean;
  windowSize?: "01" | "02" | "03" | "04" | "05";
}>;

export type ArcPayCardTokenizationSecret = Readonly<{
  kind: "arc_pay_card_tokenization_secret";
  providerSetupId: string;
  cardTokenId: string;
  browserInfo: ArcPayBrowserInfo;
}>;

/**
 * Browser fingerprint retained for ArcPay's separate 3DS Method completion call.
 * It is intentionally stored apart from the single-use card token so a Method retry can never
 * resurrect card-token material after the execute operation has consumed it.
 */
export type ArcPayThreeDsMethodContext = Readonly<{
  kind: "arc_pay_three_ds_method_context";
  providerSetupId: string;
  browserInfo: ArcPayBrowserInfo;
}>;

export type SealedOneTimeProviderSecret = Readonly<{
  kind: "sealed_one_time_provider_secret_ref";
  secretRef: string;
  providerExpiresAt: string;
  providerConsumption: "one_time";
}>;

export type FinanceTransientSecretVaultPort = Readonly<{
  sealArcPayCardTokenizationSecret(input: Readonly<{
    secretId: string;
    providerSetupId: string;
    cardTokenId: string;
    browserInfo: ArcPayBrowserInfo;
    providerExpiresAt: string;
  }>): Promise<SealedOneTimeProviderSecret>;
  consumeArcPayCardTokenizationSecret(input: Readonly<{
    secretRef: string;
    expectedProviderSetupId: string;
  }>): Promise<ArcPayCardTokenizationSecret>;
  sealArcPayThreeDsMethodContext(input: Readonly<{
    secretId: string;
    providerSetupId: string;
    browserInfo: ArcPayBrowserInfo;
    providerExpiresAt: string;
  }>): Promise<SealedOneTimeProviderSecret>;
  consumeArcPayThreeDsMethodContext(input: Readonly<{
    secretRef: string;
    expectedProviderSetupId: string;
  }>): Promise<ArcPayThreeDsMethodContext>;
  destroyOneTimeSecret(input: Readonly<{ secretRef: string }>): Promise<void>;
}>;
