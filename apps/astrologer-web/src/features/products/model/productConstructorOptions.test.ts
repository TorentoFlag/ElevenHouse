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
    expect(productRequiredClientDataOptions.map((option) => option.value)).toContain("chart1");
    expect(productMethodOptions.map((option) => option.value)).toContain("natal");
    expect(productAccessGrantOptions.map((option) => option.value)).toContain("course");
    expect(productSubscriptionPeriodOptions.map((option) => option.value)).toEqual([
      "week",
      "month",
      "year"
    ]);
    expect(productIconNames).toContain("check");
    expect(productIconNames).toContain("video");
  });
});
