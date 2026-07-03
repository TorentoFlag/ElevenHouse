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
    expect(productDeliveryFormatOptions.map((option) => option.value)).toEqual([
      "video",
      "audio",
      "chat",
      "text",
      "file",
      "channel"
    ]);
    expect(productExecutionModeOptions.map((option) => option.value)).toEqual([
      "live",
      "async",
      "instant"
    ]);
    expect(productPaymentModelOptions.map((option) => option.value)).toEqual([
      "once",
      "pack",
      "sub",
      "free"
    ]);
    expect(productParticipantModeOptions.map((option) => option.value)).toEqual([
      "solo",
      "group",
      "gift"
    ]);
    expect(productRequiredClientDataOptions.map((option) => option.value)).toEqual([
      "chart1",
      "cities",
      "chart2",
      "question",
      "event"
    ]);
    expect(productMethodOptions.map((option) => option.value)).toEqual([
      "natal",
      "forecast",
      "synastry",
      "child",
      "numerology",
      "matrix",
      "humandesign"
    ]);
    expect(productAccessGrantOptions.map((option) => option.value)).toEqual([
      "content",
      "channel",
      "records",
      "course",
      "community",
      "journal"
    ]);
    expect(productSubscriptionPeriodOptions.map((option) => option.value)).toEqual([
      "week",
      "month",
      "year"
    ]);
    expect(productIconNames).toEqual([
      "check",
      "sparkle",
      "video",
      "chat",
      "content",
      "flow",
      "box",
      "wallet",
      "orbit",
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
