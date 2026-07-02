import { describe, expect, it } from "vitest";
import { createAiSafetyIdentifier } from "./ai-safety-identifier";

describe("createAiSafetyIdentifier", () => {
  it("creates a stable non-PII OpenAI safety identifier from owner ids", () => {
    expect(createAiSafetyIdentifier("owner")).toBe(
      "eh_4c1029697ee358715d3a14a2add817c4b01651440de808371f78165ac90dc"
    );
    expect(createAiSafetyIdentifier("owner")).toMatch(/^eh_[a-f0-9]{61}$/);
    expect(createAiSafetyIdentifier("owner")).toHaveLength(64);
  });
});
