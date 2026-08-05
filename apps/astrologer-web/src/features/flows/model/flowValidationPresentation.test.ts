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

  it("explains why booking-relative work-item deadlines require a booking trigger", () => {
    const duePolicyIssue = {
      code: "work_item_due_policy_requires_booking_trigger",
      severity: "error",
      blocking: true,
      path: "nodes.prepare-consultation.config.duePolicy",
      message: "Booking-relative work-item due policies require a booking trigger."
    } satisfies FlowDefinitionValidationIssue;

    expect(buildFlowValidationIssuePresentation([duePolicyIssue], "ru")[0]).toMatchObject({
      nodeId: "prepare-consultation",
      message:
        "Срок относительно записи доступен только в воронке, которая начинается с подтверждения записи."
    });
  });
});
