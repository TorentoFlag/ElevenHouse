import type { FlowDefinitionTemplateDescriptorV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import {
  buildCreateFlowDefinitionRequest,
  buildFlowDefinitionPath,
  createFlowCommandAttemptRegistry,
  createFlowDefinitionIdempotencyKey,
  describeFlowDefinitionError,
  getFlowDefinitionRevisionConflict,
  parseAstroCalendarFlowHandoff,
  parseFlowDefinitionSelection
} from "./flowsPageModel";

const template = {
  schemaVersion: "flow-definition-template.v2",
  key: "manual-consultation-preparation",
  version: 1,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
} satisfies FlowDefinitionTemplateDescriptorV2;

describe("flows page model", () => {
  it("creates server-owned blank and template V2 requests without embedding a graph", () => {
    expect(buildCreateFlowDefinitionRequest({ locale: "ru", template })).toEqual({
      schemaVersion: "flow-definition-create.v2",
      name: template.name,
      locale: "ru",
      approvalMode: "manual_approve",
      source: {
        type: "template",
        templateKey: template.key,
        templateVersion: 1,
        parameters: {}
      }
    });
    expect(buildCreateFlowDefinitionRequest({ locale: "en", template: null })).toEqual({
      schemaVersion: "flow-definition-create.v2",
      name: "New flow",
      locale: "en",
      approvalMode: "manual_approve",
      source: { type: "blank" }
    });
  });

  it("passes explicit selected products to a parameterized server template", () => {
    expect(
      buildCreateFlowDefinitionRequest({
        locale: "en",
        template: { ...template, key: "booking-natal-preparation", parameters: [{ key: "product_ids", kind: "product_ids", required: true, minimumItems: 1, maximumItems: 100 }] },
        parameters: { product_ids: ["11111111-1111-4111-8111-111111111111"] }
      }).source
    ).toMatchObject({ parameters: { product_ids: ["11111111-1111-4111-8111-111111111111"] } });
  });

  it("creates a bounded command-specific idempotency key", () => {
    expect(createFlowDefinitionIdempotencyKey("publish", () => "request-1")).toBe(
      "flows:publish:request-1"
    );
  });

  it("retains every unresolved command key and rotates only the acknowledged attempt", () => {
    const requestIds = ["request-1", "request-2", "request-3", "request-4"];
    const attempts = createFlowCommandAttemptRegistry(() => requestIds.shift()!);
    const first = attempts.acquire("update", { expectedRevision: 3, graph: { b: 2, a: 1 } });
    const second = attempts.acquire("update", { expectedRevision: 4 });

    expect(attempts.acquire("update", { graph: { a: 1, b: 2 }, expectedRevision: 3 })).toBe(first);
    expect(second).toBe("flows:update:request-2");
    expect(attempts.acquire("update", { expectedRevision: 3, graph: { a: 1, b: 2 } })).toBe(first);

    attempts.acknowledge("update", second);
    expect(attempts.acquire("update", { expectedRevision: 4 })).toBe("flows:update:request-3");
    expect(attempts.acquire("update", { graph: { b: 2, a: 1 }, expectedRevision: 3 })).toBe(first);

    attempts.acknowledge("update", first);
    expect(attempts.acquire("update", { expectedRevision: 3, graph: { a: 1, b: 2 } })).toBe(
      "flows:update:request-4"
    );
  });

  it("parses an AstroCalendar handoff without inventing template availability", () => {
    expect(
      parseAstroCalendarFlowHandoff(
        "?source=astro_calendar&eventId=event-1&suggestedTemplateKey=sleeping-client-reactivation&clientId=client-1"
      )
    ).toEqual({
      source: "astro_calendar",
      eventId: "event-1",
      suggestedTemplateKey: "sleeping-client-reactivation",
      clientId: "client-1"
    });
    expect(parseAstroCalendarFlowHandoff("?source=astro_calendar")).toBeNull();
  });

  it("accepts only a valid flow id for an operational deep link", () => {
    expect(buildFlowDefinitionPath("66666666-6666-4666-8666-666666666666")).toBe(
      "/flows?flowId=66666666-6666-4666-8666-666666666666"
    );
    expect(
      parseFlowDefinitionSelection("?flowId=66666666-6666-4666-8666-666666666666&ignored=value")
    ).toEqual({ flowId: "66666666-6666-4666-8666-666666666666" });
    expect(parseFlowDefinitionSelection("?flowId=not-a-flow")).toBeNull();
  });

  it("turns typed revision and publish rejections into actionable localized errors", () => {
    expect(
      describeFlowDefinitionError(
        new HttpError(409, {
          code: "FLOW_DRAFT_REVISION_CONFLICT",
          expectedRevision: 4,
          currentRevision: 6
        }),
        "ru"
      ).message
    ).toContain("текущая редакция 6");
    expect(
      describeFlowDefinitionError(
        new HttpError(422, {
          code: "FLOW_GRAPH_NOT_PUBLISHABLE",
          issues: [
            {
              code: "unterminated_path",
              severity: "error",
              blocking: true,
              path: "nodes.manual-client",
              message: "Path does not terminate"
            }
          ]
        }),
        "en"
      ).message
    ).toContain("1 blocking issue");
  });

  it("describes idempotency contract failures without exposing raw codes", () => {
    expect(
      describeFlowDefinitionError(
        new HttpError(400, { code: "FLOW_IDEMPOTENCY_KEY_INVALID" }),
        "ru"
      ).message
    ).toContain("повторите команду");
    expect(
      describeFlowDefinitionError(new HttpError(409, { code: "FLOW_IDEMPOTENCY_KEY_REUSED" }), "en")
        .message
    ).toContain("different command");
  });

  it("extracts only a typed optimistic revision conflict", () => {
    expect(
      getFlowDefinitionRevisionConflict(
        new HttpError(409, {
          code: "FLOW_DRAFT_REVISION_CONFLICT",
          expectedRevision: 4,
          currentRevision: 7
        })
      )
    ).toEqual({ expectedRevision: 4, currentRevision: 7 });
    expect(
      getFlowDefinitionRevisionConflict(new HttpError(409, { code: "FLOW_IDEMPOTENCY_KEY_REUSED" }))
    ).toBeNull();
  });

});
