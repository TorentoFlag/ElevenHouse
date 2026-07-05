export const PLATFORM_BILLING_STORE = Symbol("PLATFORM_BILLING_STORE");
export const PLATFORM_BILLING_OPTIONS = Symbol("PLATFORM_BILLING_OPTIONS");

export type PlatformBillingOptions = {
  readonly providerConfigured: boolean;
};
