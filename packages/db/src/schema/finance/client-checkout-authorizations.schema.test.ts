import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeClientCheckoutAuthorizationIntegritySql,
  financeClientCheckoutAuthorizations
} from "./client-checkout-authorizations.schema";

describe("client checkout authorization persistence", () => {
  it("makes the server-issued source authorization immutable and provider-operation-bound", () => {
    expect(getTableName(financeClientCheckoutAuthorizations)).toBe(
      "finance_client_checkout_authorizations"
    );
    expect(
      getTableConfig(financeClientCheckoutAuthorizations).uniqueConstraints.map((item) => item.name)
    ).toContain("finance_client_checkout_authorizations_exact_authority_unique");
    expect(Object.keys(getTableColumns(financeClientCheckoutAuthorizations))).toEqual(
      expect.arrayContaining([
        "authorityId",
        "orderSnapshotVersion",
        "paymentCommandId",
        "providerOperationIntentId",
        "riskPolicyId",
        "fulfillmentDecisionId",
        "canonicalDigest"
      ])
    );
    expect(financeClientCheckoutAuthorizationIntegritySql).toContain(
      "finance_issue_client_checkout_authorization"
    );
    expect(financeClientCheckoutAuthorizationIntegritySql).toContain(
      "order_row.client_user_id <> new.client_user_id"
    );
    expect(financeClientCheckoutAuthorizationIntegritySql).toContain(
      "risk_policy.policy_id <> order_row.finance_policy_snapshot_id::text"
    );
    expect(financeClientCheckoutAuthorizationIntegritySql).toContain(
      "fulfillment.registry_key <> concat_ws"
    );
  });
});
