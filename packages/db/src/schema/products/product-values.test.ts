import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  productAccessGrantValues as databaseProductAccessGrantValues,
  productCurrencyValues as databaseProductCurrencyValues,
  productDeliveryFormatValues as databaseProductDeliveryFormatValues,
  productExecutionModeValues as databaseProductExecutionModeValues,
  productMethodValues as databaseProductMethodValues,
  productModifierKindValues as databaseProductModifierKindValues,
  productParticipantModeValues as databaseProductParticipantModeValues,
  productPaymentModelValues as databaseProductPaymentModelValues,
  productRequiredClientDataValues as databaseProductRequiredClientDataValues,
  productStatusValues as databaseProductStatusValues,
  productSubscriptionPeriodValues as databaseProductSubscriptionPeriodValues,
  productTypeValues as databaseProductTypeValues
} from "./product-values";
import {
  productAccessGrantValues,
  productCurrencyValues,
  productDeliveryFormatValues,
  productExecutionModeValues,
  productMethodValues,
  productModifierKindValues,
  productParticipantModeValues,
  productPaymentModelValues,
  productRequiredClientDataValues,
  productStatusValues,
  productSubscriptionPeriodValues,
  productTypeValues
} from "@elevenhouse/validation/products";

const productValuesSource = "packages/db/src/schema/products/product-values.ts";

describe("database product taxonomy boundary", () => {
  it("re-exports product values from the shared product validation taxonomy", () => {
    expect(databaseProductStatusValues).toBe(productStatusValues);
    expect(databaseProductTypeValues).toBe(productTypeValues);
    expect(databaseProductDeliveryFormatValues).toBe(productDeliveryFormatValues);
    expect(databaseProductExecutionModeValues).toBe(productExecutionModeValues);
    expect(databaseProductPaymentModelValues).toBe(productPaymentModelValues);
    expect(databaseProductSubscriptionPeriodValues).toBe(productSubscriptionPeriodValues);
    expect(databaseProductParticipantModeValues).toBe(productParticipantModeValues);
    expect(databaseProductRequiredClientDataValues).toBe(productRequiredClientDataValues);
    expect(databaseProductMethodValues).toBe(productMethodValues);
    expect(databaseProductAccessGrantValues).toBe(productAccessGrantValues);
    expect(databaseProductModifierKindValues).toBe(productModifierKindValues);
    expect(databaseProductCurrencyValues).toBe(productCurrencyValues);
  });

  it("does not redeclare product value arrays locally", () => {
    const source = readFileSync(productValuesSource, "utf8");

    expect(source).toContain('from "@elevenhouse/validation/products"');
    expect(source).not.toContain("] as const");
  });
});
