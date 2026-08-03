// @vitest-environment jsdom

import type { FlowDefinitionDetailV2 } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowLegacyMigrationPanel } from "./FlowLegacyMigrationPanel";

const legacy = {
  schemaVersion: "flow-definition-detail.v2",
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Legacy-сценарий",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 4,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v1",
  origin: null,
  migrationRequired: true,
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "lead-created",
        category: "trigger",
        kind: "lead_created",
        title: "Новый лид",
        description: "Повторное обращение",
        config: { segment: "returning-client" },
        position: { x: 80, y: 120 }
      }
    ],
    edges: []
  },
  draftPresentation: null
} satisfies Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v1" }>;

describe("FlowLegacyMigrationPanel", () => {
  afterEach(() => cleanup());

  it("keeps the complete legacy node readable and exposes exact JSON export", () => {
    const onExport = vi.fn();
    render(
      <FlowLegacyMigrationPanel
        flow={legacy}
        locale="ru"
        onBack={vi.fn()}
        onMigrate={vi.fn()}
        onExport={onExport}
      />
    );

    expect(
      screen.getByText(
        (content, element) =>
          element?.tagName === "PRE" &&
          content.includes('"segment": "returning-client"') &&
          content.includes('"position"')
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Скачать JSON" }));
    expect(onExport).toHaveBeenCalledWith(legacy);
  });
});
