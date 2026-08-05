import { describe, expect, it } from "vitest";

import {
  flowDefinitionDetailV3Schema,
  flowDefinitionSummaryV3Schema,
  listFlowDefinitionsV3QuerySchema,
  listFlowDefinitionsV3ResponseSchema
} from "./flow-definition-read-v3";

const flowId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const epochId = "44444444-4444-4444-8444-444444444444";
const createdAt = "2026-08-02T18:00:00.000Z";

const definition = {
  id: flowId,
  ownerUserId,
  name: "Consultation preparation",
  state: "versioned",
  approvalMode: "manual_approve",
  revision: 4,
  draftBaseVersionId: null,
  latestPublishedVersionId: versionId,
  latestPublishedVersion: 1,
  createdAt,
  updatedAt: createdAt,
  publishedAt: createdAt,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" }
} as const;

const inactiveEnrollment = {
  schemaVersion: "flow-enrollment-read-authority.v1",
  authority: "enrollment_v1",
  control: {
    schemaVersion: "flow-enrollment-control.v1",
    flowId,
    state: "inactive",
    definitionRevision: 4,
    enrollmentRevision: 0,
    activeVersionId: null,
    activeActivationEpochId: null,
    activeSince: null,
    lastPausedAt: null
  }
} as const;

describe("flow definition V3 read contracts", () => {
  it("returns definition fields without legacy runtime status and with enrollment CAS authority", () => {
    const response = {
      schemaVersion: "flow-definition-summary.v3",
      ...definition,
      enrollment: inactiveEnrollment
    } as const;

    expect(flowDefinitionSummaryV3Schema.parse(response)).toEqual(response);
    expect(flowDefinitionSummaryV3Schema.safeParse({ ...response, runtimeStatus: "published" }).success).toBe(
      false
    );
  });

  it("accepts an active enrollment independently of the latest published version", () => {
    const response = {
      schemaVersion: "flow-definition-summary.v3",
      ...definition,
      latestPublishedVersionId: "66666666-6666-4666-8666-666666666666",
      enrollment: {
        schemaVersion: "flow-enrollment-read-authority.v1",
        authority: "enrollment_v1",
        control: {
          ...inactiveEnrollment.control,
          state: "active",
          enrollmentRevision: 3,
          activeVersionId: versionId,
          activeActivationEpochId: epochId,
          activeSince: createdAt
        }
      }
    } as const;

    expect(flowDefinitionSummaryV3Schema.parse(response)).toEqual(response);
  });

  it("rejects enrollment snapshots from another flow or definition revision", () => {
    const response = {
      schemaVersion: "flow-definition-summary.v3",
      ...definition,
      enrollment: inactiveEnrollment
    } as const;

    expect(
      flowDefinitionSummaryV3Schema.safeParse({
        ...response,
        enrollment: {
          ...inactiveEnrollment,
          control: {
            ...inactiveEnrollment.control,
            flowId: "55555555-5555-4555-8555-555555555555"
          }
        }
      }).success
    ).toBe(false);
    expect(
      flowDefinitionSummaryV3Schema.safeParse({
        ...response,
        enrollment: {
          ...inactiveEnrollment,
          control: { ...inactiveEnrollment.control, definitionRevision: 3 }
        }
      }).success
    ).toBe(false);
  });

  it("rejects unsupported enrollment authority", () => {
    const legacyActive = {
      schemaVersion: "flow-definition-summary.v3",
      ...definition,
      enrollment: {
        schemaVersion: "flow-enrollment-read-authority.v1",
        authority: "legacy_active",
        flowId,
        state: "active",
        activeVersionId: versionId
      }
    } as const;

    expect(flowDefinitionSummaryV3Schema.safeParse(legacyActive).success).toBe(false);
  });

  it("rejects non-V2 detail composition", () => {
    const detail = {
      schemaVersion: "flow-definition-detail.v3",
      ...definition,
      graphSchemaVersion: "flow-graph.legacy",
      origin: null,
      draftGraph: {
        schemaVersion: "flow-graph.legacy",
        nodes: [
          {
            id: "trigger-booking",
            category: "trigger",
            kind: "booking_confirmed",
            title: "Booking confirmed",
            config: {}
          }
        ],
        edges: []
      },
      draftPresentation: null,
      enrollment: inactiveEnrollment
    } as const;

    expect(flowDefinitionDetailV3Schema.safeParse(detail).success).toBe(false);
  });

  it("uses enrollment filters and rejects legacy runtime filters", () => {
    expect(
      listFlowDefinitionsV3QuerySchema.parse({ state: "all", enrollmentState: "active" })
    ).toEqual({ state: "all", enrollmentState: "active", limit: 50, offset: 0 });
    expect(
      listFlowDefinitionsV3QuerySchema.safeParse({ state: "all", runtimeStatus: "active" }).success
    ).toBe(false);
    expect(
      listFlowDefinitionsV3QuerySchema.safeParse({ state: "all", enrollmentState: "legacy_active" })
        .success
    ).toBe(false);
  });

  it("rejects duplicate definitions and impossible totals", () => {
    const item = {
      schemaVersion: "flow-definition-summary.v3",
      ...definition,
      enrollment: inactiveEnrollment
    } as const;
    const response = {
      schemaVersion: "flow-definition-list.v3",
      flows: [item],
      total: 1
    } as const;

    expect(listFlowDefinitionsV3ResponseSchema.parse(response)).toEqual(response);
    expect(
      listFlowDefinitionsV3ResponseSchema.safeParse({ ...response, flows: [item, item] }).success
    ).toBe(false);
    expect(listFlowDefinitionsV3ResponseSchema.safeParse({ ...response, total: 0 }).success).toBe(
      false
    );
  });
});
