import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeClientCheckoutPreparationIntegritySql,
  financeClientCheckoutPreparations
} from "./client-checkouts.schema";

describe("client checkout preparation persistence", () => {
  it("keeps one active worker-mediated checkout per order without storing the HPP URL", () => {
    expect(getTableName(financeClientCheckoutPreparations)).toBe(
      "finance_client_checkout_preparations"
    );
    expect(
      getTableColumns(financeClientCheckoutPreparations).providerOperationIntentId.getSQLType()
    ).toBe("varchar(160)");
    expect(
      getTableConfig(financeClientCheckoutPreparations).indexes.map((item) => item.config.name)
    ).toContain("finance_client_checkout_preparations_one_active_order_unique");
    expect(Object.keys(getTableColumns(financeClientCheckoutPreparations))).not.toEqual(
      expect.arrayContaining(["checkoutUrl", "providerPaymentId", "amountMinor", "currency"])
    );
    expect(financeClientCheckoutPreparationIntegritySql).toContain(
      "finance_validate_client_checkout_preparation_head"
    );
    expect(financeClientCheckoutPreparationIntegritySql).toContain(
      "finance_validate_client_checkout_preparation_correlation"
    );
    expect(financeClientCheckoutPreparationIntegritySql).toContain(
      "authority.provider_operation_intent_id = new.provider_operation_intent_id"
    );
    expect(financeClientCheckoutPreparationIntegritySql).toContain("provider_session_unknown");
    expect(financeClientCheckoutPreparationIntegritySql).toContain(
      "finance_validate_client_checkout_preparation_head"
    );
  });
});
