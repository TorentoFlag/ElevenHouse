import type { FlowResponse } from "@elevenhouse/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowsPageView } from "./FlowsPageView";

const flows = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    name: "Запись на консультацию",
    status: "draft",
    approvalMode: "manual_approve",
    draftGraph: {
      schemaVersion: "flow-graph.v1",
      nodes: [
        {
          id: "lead-created",
          category: "trigger",
          kind: "lead_created",
          title: "Новый лид",
          config: {}
        }
      ],
      edges: []
    },
    publishedVersionId: null,
    publishedVersion: null,
    createdAt: "2026-07-28T08:00:00.000Z",
    updatedAt: "2026-07-28T08:00:00.000Z",
    publishedAt: null
  }
] satisfies FlowResponse[];

describe("FlowsPageView", () => {
  it("shows the production loading state", () => {
    expect(render({ isLoading: true })).toContain("Загружаем воронки");
  });

  it("shows the production error state", () => {
    expect(render({ isError: true })).toContain("Не удалось загрузить воронки");
  });

  it("shows the production empty state", () => {
    expect(render()).toContain("Создайте первую воронку");
  });

  it("renders flow names supplied by the API", () => {
    expect(render({ flows })).toContain("Запись на консультацию");
  });

  it("shows unavailable runtime metrics as dashes without inventing revenue", () => {
    const markup = render({ flows });

    expect(markup).toContain("Конверсия");
    expect(markup).toContain(">-</dd>");
    expect(markup).not.toContain("Выручка");
  });

  it("renders builder actions as unavailable until page callbacks exist", () => {
    const markup = render({ flows });

    expect(markup).toContain('aria-label="Открыть схему: Запись на консультацию"');
    expect(markup.match(/disabled=""/g)).toHaveLength(6);
  });
});

function render(overrides: Partial<Parameters<typeof FlowsPageView>[0]> = {}) {
  return renderToStaticMarkup(
    <FlowsPageView
      flows={[]}
      templates={[]}
      isLoading={false}
      isError={false}
      {...overrides}
    />
  );
}
