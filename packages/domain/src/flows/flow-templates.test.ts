import { flowTemplateSchema } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { validateFlowGraph } from "./flow-validation";
import { getBuiltInFlowTemplates } from "./flow-templates";

describe("built-in flow templates", () => {
  it("returns the first-wave templates with deterministic keys", () => {
    expect(getBuiltInFlowTemplates().map((template) => template.key)).toEqual([
      "session-prep",
      "async-recorded-reading",
      "lead-magnet-upsell",
      "sleeping-client-reactivation",
      "post-session-follow-up"
    ]);
  });

  it("ships schema-valid publishable templates without auto-send", () => {
    for (const template of getBuiltInFlowTemplates()) {
      expect(flowTemplateSchema.parse(template)).toEqual(template);
      expect(validateFlowGraph(template.graph)).toEqual({
        publishable: true,
        issues: []
      });
      expect(JSON.stringify(template)).not.toContain("auto_send");
    }
  });
});
