// @vitest-environment jsdom

import type { FlowGraphV2 } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowMobileDagProjection } from "./FlowMobileDagProjection";

const graph: FlowGraphV2 = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual-client",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "birth-data",
      kind: "birth_data_available",
      displayTitle: "Данные рождения заполнены?",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { purpose: "service_preparation" }
    }
  ],
  edges: [
    {
      id: "manual-client-next",
      sourceNodeId: "manual-client",
      sourceHandle: "next",
      targetNodeId: "birth-data"
    }
  ]
};

describe("FlowMobileDagProjection", () => {
  afterEach(() => cleanup());

  it("keeps node kind, title, output handles and named connections readable", () => {
    renderProjection();

    const projection = screen.getByRole("region", { name: "Мобильная схема воронки" });
    expect(projection.textContent).toContain("Клиент выбран вручную");
    expect(projection.textContent).toContain("Данные рождения заполнены?");
    expect(screen.getByLabelText("Выходы: Данные рождения заполнены?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Продолжить из Данные рождения заполнены?: Да" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Продолжить из Данные рождения заполнены?: Нет" })).toBeTruthy();
    expect(screen.getByLabelText("Связи: Клиент выбран вручную").textContent).toContain(
      "ДалееДанные рождения заполнены?"
    );
  });

  it("routes configure and free-handle commands without enabling occupied handles", () => {
    const onEditNode = vi.fn();
    const onSelectSourceHandle = vi.fn();
    renderProjection({ onEditNode, onSelectSourceHandle });

    const occupied = screen.getByRole("button", {
      name: "Продолжить из Клиент выбран вручную: Далее"
    });
    expect(occupied).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Настроить узел: Данные рождения заполнены?" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить из Данные рождения заполнены?: Да" })
    );

    expect(onEditNode).toHaveBeenCalledWith("birth-data");
    expect(onSelectSourceHandle).toHaveBeenCalledWith("birth-data", "true");
  });
});

function renderProjection(
  overrides: Partial<Parameters<typeof FlowMobileDagProjection>[0]> = {}
) {
  return render(
    <FlowMobileDagProjection
      graph={graph}
      locale="ru"
      selectedNodeId="manual-client"
      connectionSource={null}
      editable
      onEditNode={vi.fn()}
      onSelectSourceHandle={vi.fn()}
      {...overrides}
    />
  );
}
