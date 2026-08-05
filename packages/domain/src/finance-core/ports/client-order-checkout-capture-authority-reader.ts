import type { FinanceDigest } from "./finance-port-types";

/**
 * Immutable capture terms selected while a client checkout is opened. These references are later
 * persisted with the checkout authorization; a capture worker must never select a newer policy.
 */
export type ClientOrderCheckoutCaptureAuthority = Readonly<{
  riskPolicy: Readonly<{
    policyId: string;
    policyVersion: number;
    canonicalDigest: FinanceDigest;
  }>;
  fulfillmentDecision: Readonly<{
    registryKey: string;
    registryRevision: number;
    canonicalDigest: FinanceDigest;
  }>;
}>;

/** Reads only configured immutable terms that belong to the already-created order. */
export type ClientOrderCheckoutCaptureAuthorityReader = Readonly<{
  findForCheckout(
    input: Readonly<{ orderId: string }>
  ): Promise<ClientOrderCheckoutCaptureAuthority | null>;
}>;
