import type { FinanceProviderAccountIdentity } from "./finance-port-types";

/** Resolves the one immutable ArcPay account identity currently enabled for an environment. */
export type ActiveProviderAccountReaderPort = Readonly<{
  findActiveProviderAccount(input: Readonly<{
    provider: "arc_pay";
    environment: "sandbox" | "live";
  }>): Promise<FinanceProviderAccountIdentity | null>;
}>;

/**
 * Narrow ingress-only context. The tenant identifier is intentionally not carried by ordinary
 * finance provider bindings, but a signed webhook must prove it before it enters the durable
 * inbox; environment alone is not a merchant correlation boundary.
 */
export type ActiveProviderAccountWebhookContextReaderPort = Readonly<{
  findActiveWebhookContext(input: Readonly<{
    provider: "arc_pay";
    environment: "sandbox" | "live";
  }>): Promise<
    Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      merchantTenantId: string;
    }> | null
  >;
}>;
