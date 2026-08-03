import type { FlowDefinitionValidationIssue } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildFlowValidationIssuePresentation } from "./flowValidationPresentation";

const issue = {
  code: "missing_required_source_handle",
  severity: "error",
  blocking: true,
  path: "nodes.manual-client.next",
  message: "Node manual_client requires exactly one next edge."
} satisfies FlowDefinitionValidationIssue;

describe("flow validation presentation", () => {
  it("localizes stable issue codes and extracts a focusable node id", () => {
    expect(buildFlowValidationIssuePresentation([issue], "ru")).toEqual([
      {
        code: issue.code,
        path: issue.path,
        message: "Добавьте обязательное продолжение из этого узла.",
        nodeId: "manual-client"
      }
    ]);
    expect(buildFlowValidationIssuePresentation([issue], "en")[0]?.message).toBe(issue.message);
  });
});
