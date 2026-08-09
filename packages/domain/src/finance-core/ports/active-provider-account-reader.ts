import type { FinanceProviderAccountIdentity } from "./finance-port-types";

/** Resolves the one active ArcPay account selected by the configured provider key. */
export type ActiveProviderAccountReaderPort = Readonly<{
  findActiveProviderAccount(input: Readonly<{
    provider: "arc_pay";
  }>): Promise<FinanceProviderAccountIdentity | null>;
}>;

/**
 * Narrow ingress-only context. The tenant identifier is intentionally not carried by ordinary
 * finance provider bindings, but a signed webhook must prove it before it enters the durable
 * inbox.
 */
export type ActiveProviderAccountWebhookContextReaderPort = Readonly<{
  findActiveWebhookContext(input: Readonly<{
    provider: "arc_pay";
  }>): Promise<
    Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      merchantTenantId: string;
    }> | null
  >;
}>;
