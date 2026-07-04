/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
import {
  productAccessGrantSchema,
  productCurrencySchema,
  productDeliveryFormatSchema,
  productExecutionModeSchema,
  productMethodSchema,
  productModifierKindSchema,
  productParticipantModeSchema,
  productPaymentModelSchema,
  productRequiredClientDataSchema,
  productStatusSchema,
  productSubscriptionPeriodSchema,
  productTypeSchema
} from "./products";

const productsContractSource = "packages/contracts/src/products.ts";

describe("product contract taxonomy boundary", () => {
  it("builds product enum schemas from the shared product validation taxonomy tuples", () => {
    expect(productStatusSchema.options).toStrictEqual(productStatusValues);
    expect(productTypeSchema.options).toStrictEqual(productTypeValues);
    expect(productDeliveryFormatSchema.options).toStrictEqual(productDeliveryFormatValues);
    expect(productExecutionModeSchema.options).toStrictEqual(productExecutionModeValues);
    expect(productPaymentModelSchema.options).toStrictEqual(productPaymentModelValues);
    expect(productSubscriptionPeriodSchema.options).toStrictEqual(productSubscriptionPeriodValues);
    expect(productParticipantModeSchema.options).toStrictEqual(productParticipantModeValues);
    expect(productRequiredClientDataSchema.options).toStrictEqual(productRequiredClientDataValues);
    expect(productMethodSchema.options).toStrictEqual(productMethodValues);
    expect(productAccessGrantSchema.options).toStrictEqual(productAccessGrantValues);
    expect(productModifierKindSchema.options).toStrictEqual(productModifierKindValues);
    expect(productCurrencySchema.options).toStrictEqual(productCurrencyValues);
  });

  it("does not redeclare product enum literals in the contract module", () => {
    const source = readFileSync(productsContractSource, "utf8");

    expect(source).toContain('from "@elevenhouse/validation/products"');
    expect(source).not.toContain("z.enum([");
  });
});
