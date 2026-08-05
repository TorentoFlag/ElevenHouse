import type { FinanceOperationKind } from "@elevenhouse/contracts";

import type { FinanceOperationResourcePolicyVersion } from "../finance-operation-resource-policy";

/**
 * Checkout and workers depend only on a published policy selected by operation kind. Administrative
 * draft mutation belongs to a separate authority store and can never leak into a payment command.
 */
export type FinanceOperationResourcePolicyReader = Readonly<{
  findPublishedForOperation(input: Readonly<{
    operationKind: FinanceOperationKind;
  }>): Promise<FinanceOperationResourcePolicyVersion | null>;
}>;
