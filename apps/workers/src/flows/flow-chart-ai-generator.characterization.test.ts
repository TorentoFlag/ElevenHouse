import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Flow chart AI generator characterization", () => {
  it("keeps chart generation on the existing prompt and required-evidence policy", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/workers/src/flows/flow-chart-ai-generator.ts"),
      "utf8"
    );

    expect(source).toContain("prompt: chartInterpretationDraftPromptV1");
    expect(source).toContain('feature: "chart.interpretationDraft"');
    expect(source).toContain(
      '? { usageEvidence: "required" }'
    );
    expect(source).toContain(
      "promptVersion: `${chartInterpretationDraftPromptV1.id}@${chartInterpretationDraftPromptV1.version}`"
    );
  });
});
