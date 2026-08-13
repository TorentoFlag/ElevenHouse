import {
  createFlowDefinitionV2RequestSchema,
  listFlowDefinitionTemplatesV2ResponseSchema
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { compileFlowGraphV2 } from "./flow-graph-v2-compiler";
import {
  getFlowDefinitionTemplateCatalogV2,
  prepareFlowDefinitionV2Creation
} from "./flow-definition-templates";

describe("flow definition V2 server-owned templates", () => {
  it("returns a localized V2-only catalog with the manual and natal booking templates", () => {
    const catalog = getFlowDefinitionTemplateCatalogV2("ru");

    expect(listFlowDefinitionTemplatesV2ResponseSchema.parse(catalog)).toEqual(catalog);
    expect(catalog).toMatchObject({
      schemaVersion: "flow-definition-template-catalog.v2",
      catalogVersion: 4,
      locale: "ru"
    });
    expect(catalog.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "manual-consultation-preparation",
          version: 2,
          availability: "available",
          blockerCode: null
        }),
        expect.objectContaining({
          key: "booking-natal-preparation",
          version: 3,
          availability: "available",
          parameters: [
            {
              key: "product_ids",
              kind: "product_ids",
              required: true,
              minimumItems: 1,
              maximumItems: 100
            }
          ]
        })
      ])
    );
    expect(catalog.templates).toHaveLength(2);
    expect(catalog.templates.every((template) => !("graph" in template))).toBe(true);

    const english = getFlowDefinitionTemplateCatalogV2("en");
    expect(english.locale).toBe("en");
    expect(english.templates[0]?.name).not.toBe(catalog.templates[0]?.name);
  });

  it("builds blank and available-template drafts on the server", () => {
    const blank = prepareFlowDefinitionV2Creation(
      createFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-create.v2",
        name: "Новая воронка",
        locale: "ru",
        source: { type: "blank" }
      })
    );
    expect(blank).toMatchObject({
      kind: "accepted",
      value: {
        origin: { type: "blank" },
        graph: {
          schemaVersion: "flow-graph.v2",
          nodes: [
            expect.objectContaining({
              id: "first-inbound-message",
              kind: "first_inbound_message",
              displayTitle: "Первое сообщение клиента",
              config: { enrollmentPolicy: "once_per_client" }
            })
          ],
          edges: []
        }
      }
    });
    if (blank.kind !== "accepted") throw new Error("Expected blank draft");
    expect(compileFlowGraphV2(blank.value.graph)).toMatchObject({ publishable: false });

    const templated = prepareFlowDefinitionV2Creation(
      createFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-create.v2",
        name: "Consultation preparation",
        locale: "en",
        source: {
          type: "template",
          templateKey: "manual-consultation-preparation",
          templateVersion: 2,
          parameters: {}
        }
      })
    );
    expect(templated).toMatchObject({
      kind: "accepted",
      value: {
        origin: {
          type: "template",
          templateKey: "manual-consultation-preparation",
          templateVersion: 2
        }
      }
    });
    if (templated.kind !== "accepted") throw new Error("Expected template draft");
    expect(compileFlowGraphV2(templated.value.graph)).toMatchObject({
      publishable: true,
      issues: []
    });
    expect(templated.value.presentation?.nodes).toHaveLength(3);
    expect(templated.value.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "preparation-completed",
          displayTitle: "Preparation task completed",
          config: { goalKey: "manual_preparation_task_completed" }
        })
      ])
    );

    const bookingNatal = prepareFlowDefinitionV2Creation(
      createFlowDefinitionV2RequestSchema.parse({
        schemaVersion: "flow-definition-create.v2",
        name: "Natal preparation",
        locale: "en",
        source: {
          type: "template",
          templateKey: "booking-natal-preparation",
          templateVersion: 3,
          parameters: { product_ids: ["11111111-1111-4111-8111-111111111111"] }
        }
      })
    );
    expect(bookingNatal).toMatchObject({
      kind: "accepted",
      value: {
        graph: {
          nodes: expect.arrayContaining([
            expect.objectContaining({
              kind: "booking_confirmed",
              config: { productIds: ["11111111-1111-4111-8111-111111111111"] }
            }),
            expect.objectContaining({ kind: "natal_chart_request" }),
            expect.objectContaining({
              kind: "natal_chart_ai_draft",
              config: expect.objectContaining({ chartRequestNodeId: "natal-chart-request" })
            }),
            expect.objectContaining({
              id: "natal-preparation-completed",
              displayTitle: "Natal chart calculated",
              config: { goalKey: "natal_chart_calculated" }
            })
          ])
        }
      }
    });
    if (bookingNatal.kind !== "accepted") throw new Error("Expected natal booking template draft");
    expect(compileFlowGraphV2(bookingNatal.value.graph)).toMatchObject({
      publishable: true,
      issues: []
    });
  });

  it("returns deterministic typed failures for unknown, stale, unavailable and invalid sources", () => {
    const base = {
      schemaVersion: "flow-definition-create.v2",
      name: "Новая воронка",
      locale: "ru",
      approvalMode: "manual_approve"
    } as const;

    expect(
      prepareFlowDefinitionV2Creation({
        ...base,
        source: {
          type: "template",
          templateKey: "unknown-template",
          templateVersion: 1,
          parameters: {}
        }
      })
    ).toEqual({
      kind: "rejected",
      response: {
        statusCode: 404,
        body: { code: "FLOW_TEMPLATE_NOT_FOUND", templateKey: "unknown-template" }
      }
    });
    expect(
      prepareFlowDefinitionV2Creation({
        ...base,
        source: {
          type: "template",
          templateKey: "manual-consultation-preparation",
          templateVersion: 1,
          parameters: {}
        }
      })
    ).toMatchObject({
      kind: "rejected",
      response: {
        statusCode: 409,
        body: { code: "FLOW_TEMPLATE_VERSION_CONFLICT", currentVersion: 2 }
      }
    });
    expect(
      prepareFlowDefinitionV2Creation({
        ...base,
        source: {
          type: "template",
          templateKey: "booking-natal-preparation",
          templateVersion: 3,
          parameters: {}
        }
      })
    ).toMatchObject({
      kind: "rejected",
      response: {
        statusCode: 422,
        body: {
          code: "FLOW_TEMPLATE_PARAMETERS_INVALID",
          templateKey: "booking-natal-preparation",
          parameterPaths: ["product_ids"]
        }
      }
    });
    expect(
      prepareFlowDefinitionV2Creation({
        ...base,
        source: {
          type: "template",
          templateKey: "booking-natal-preparation",
          templateVersion: 3,
          parameters: { product_id: "33333333-3333-4333-8333-333333333333" }
        }
      })
    ).toEqual({
      kind: "rejected",
      response: {
        statusCode: 422,
        body: {
          code: "FLOW_TEMPLATE_PARAMETERS_INVALID",
          templateKey: "booking-natal-preparation",
          parameterPaths: ["product_id", "product_ids"]
        }
      }
    });
  });
});
