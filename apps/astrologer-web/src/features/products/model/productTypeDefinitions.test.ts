import { describe, expect, it } from "vitest";
import {
  getProductTypeDefinition,
  productScenarioSectionIds
} from "./productTypeDefinitions";

describe("productTypeDefinitions", () => {
  it("keeps custom as the full cube constructor", () => {
    const definition = getProductTypeDefinition("custom");

    expect(definition.mode).toBe("full");
    expect(definition.primarySections).toEqual(productScenarioSectionIds);
    expect(definition.advancedSections).toEqual([]);
  });

  it.each([
    [
      "single",
      ["media", "basics", "consultation", "clientData", "methods", "modifiers", "includedItems"]
    ],
    ["pack", ["media", "basics", "package", "clientData", "methods", "includedItems"]],
    ["async", ["media", "basics", "asyncResult", "clientData", "methods", "includedItems"]],
    ["sub", ["media", "basics", "subscription", "accessGrants", "includedItems"]],
    ["mini", ["media", "basics", "mini", "includedItems"]],
    ["course", ["media", "basics", "course", "accessGrants", "includedItems"]]
  ] as const)("defines primary sections for %s", (type, expectedSections) => {
    const definition = getProductTypeDefinition(type);

    expect(definition.mode).toBe("guided");
    expect(definition.primarySections).toEqual(expectedSections);
  });

  it("does not put subscription fields into one-off consultation primary sections", () => {
    const definition = getProductTypeDefinition("single");

    expect(definition.primarySections).not.toContain("subscription");
    expect(definition.fixedPaymentModel).toBe("once");
    expect(definition.fixedExecutionMode).toBe("live");
  });

  it("marks package, subscription, and course settings as required for their product types", () => {
    expect(getProductTypeDefinition("pack").requiredDraftFields).toContain(
      "packageSessionCount"
    );
    expect(getProductTypeDefinition("sub").requiredDraftFields).toContain("subscriptionPeriod");
    expect(getProductTypeDefinition("sub").requiredDraftFields).toContain("accessGrants");
    expect(getProductTypeDefinition("course").requiredDraftFields).toContain("accessGrants");
  });
});
