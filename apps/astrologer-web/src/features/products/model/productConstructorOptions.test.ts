import {
  productAccessGrantSchema,
  productDeliveryFormatSchema,
  productExecutionModeSchema,
  productMethodSchema,
  productParticipantModeSchema,
  productPaymentModelSchema,
  productRequiredClientDataSchema,
  productSubscriptionPeriodSchema
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  productAccessGrantOptions,
  productDeliveryFormatOptions,
  productExecutionModeOptions,
  productIconNames,
  productMethodOptions,
  productParticipantModeOptions,
  productPaymentModelOptions,
  productRequiredClientDataOptions,
  productSubscriptionPeriodOptions
} from "./productConstructorOptions";

describe("product constructor options", () => {
  it("keeps option sets aligned with product contracts", () => {
    expect(productDeliveryFormatOptions.map((option) => option.value)).toEqual(
      productDeliveryFormatSchema.options
    );
    expect(productExecutionModeOptions.map((option) => option.value)).toEqual(
      productExecutionModeSchema.options
    );
    expect(productPaymentModelOptions.map((option) => option.value)).toEqual(
      productPaymentModelSchema.options
    );
    expect(productParticipantModeOptions.map((option) => option.value)).toEqual(
      productParticipantModeSchema.options
    );
    expect(productRequiredClientDataOptions.map((option) => option.value)).toEqual(
      productRequiredClientDataSchema.options
    );
    expect(productMethodOptions.map((option) => option.value)).toEqual(productMethodSchema.options);
    expect(productAccessGrantOptions.map((option) => option.value)).toEqual(
      productAccessGrantSchema.options
    );
    expect(productSubscriptionPeriodOptions.map((option) => option.value)).toEqual(
      productSubscriptionPeriodSchema.options
    );
    expect(productIconNames).toEqual([
      "check",
      "sparkle",
      "video",
      "mic",
      "chat",
      "content",
      "fileDown",
      "flow",
      "globe",
      "box",
      "wallet",
      "calendar",
      "clock",
      "lightning",
      "users",
      "gift",
      "orbit",
      "map",
      "star",
      "reference",
      "verified",
      "refresh"
    ]);
  });

  it("keeps all constructor option icons available to icon pickers", () => {
    const optionIconNames = [
      ...productDeliveryFormatOptions,
      ...productExecutionModeOptions,
      ...productPaymentModelOptions,
      ...productParticipantModeOptions,
      ...productRequiredClientDataOptions,
      ...productMethodOptions,
      ...productAccessGrantOptions,
      ...productSubscriptionPeriodOptions
    ].map((option) => option.iconName);

    expect(optionIconNames.filter((iconName) => !productIconNames.includes(iconName))).toEqual([]);
  });
});
