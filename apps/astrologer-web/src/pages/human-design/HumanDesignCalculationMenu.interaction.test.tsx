// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanDesignCalculationMenu } from "./HumanDesignCalculationMenu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.replaceChildren();
});

describe("HumanDesignCalculationMenu interactions", () => {
  it("opens saved calculations and closes before selecting a record", () => {
    const onSelect = vi.fn();
    const saved = savedCalculation();
    const container = renderMenu({ calculations: [saved], selectedCalculationId: saved.id, onSelect });

    openMenu(container);
    act(() => getButton(container, "Марина Краснова").click());

    expect(onSelect).toHaveBeenCalledWith(saved);
    expect(getTrigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Сохранённые расчёты");
  });
});

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof HumanDesignCalculationMenu>>
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HumanDesignCalculationMenu
        calculations={[]}
        selectedCalculationId={null}
        disabled={false}
        onSelect={vi.fn()}
        {...overrides}
      />
    );
  });
  return container;
}

function openMenu(container: ParentNode): void {
  act(() => getTrigger(container).click());
  expect(getTrigger(container).getAttribute("aria-expanded")).toBe("true");
  expect(container.textContent).toContain("Сохранённые расчёты");
}

function getTrigger(container: ParentNode): HTMLButtonElement {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Список расчётов Human Design"]');
  if (!trigger) throw new Error("Expected Human Design calculations trigger");
  return trigger;
}

function getButton(container: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.includes(text)
  );
  if (!button) throw new Error(`Expected button: ${text}`);
  return button;
}

function savedCalculation(): CalculationRecordResponse {
  const checksum = `sha256:${"c".repeat(64)}`;

  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "human_design",
    mode: "individual",
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked",
    requestFingerprint: checksum,
    inputData: { mode: "individual" },
    resultData: { mode: "individual" },
    resultSummary: { type: "generator" },
    resultChecksum: checksum,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "33333333-3333-4333-8333-333333333333",
        displayName: "Марина Краснова"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  } as unknown as CalculationRecordResponse;
}
