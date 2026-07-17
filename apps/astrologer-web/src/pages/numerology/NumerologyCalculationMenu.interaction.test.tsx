// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedNumerologyCalculationListItem } from "../../features/numerology/model/numerologySavedWorkspaceModel";
import { NumerologyCalculationMenu } from "./NumerologyCalculationMenu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.replaceChildren();
});

describe("NumerologyCalculationMenu interactions", () => {
  it("closes the calculations menu before opening a new calculation", () => {
    const onCreate = vi.fn();
    const container = renderMenu({ onCreate });

    openMenu(container);
    act(() => getButton(container, "Новый расчёт").click());

    expect(onCreate).toHaveBeenCalledOnce();
    expect(getTrigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Сохранённые расчёты");
  });

  it("closes the calculations menu before opening recalculation", () => {
    const onRecalculate = vi.fn();
    const container = renderMenu({ onRecalculate });

    openMenu(container);
    act(() => getButton(container, "Пересчитать").click());

    expect(onRecalculate).toHaveBeenCalledOnce();
    expect(getTrigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Сохранённые расчёты");
  });
});

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof NumerologyCalculationMenu>>
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <NumerologyCalculationMenu
        items={[savedItem()]}
        selectedCalculationId="11111111-1111-4111-8111-111111111111"
        disabled={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRecalculate={vi.fn()}
        onArchive={vi.fn()}
        {...overrides}
      />
    );
  });
  return container;
}

function openMenu(container: ParentNode): void {
  act(() => getTrigger(container).click());
  expect(getTrigger(container).getAttribute("aria-expanded")).toBe("true");
}

function getTrigger(container: ParentNode): HTMLButtonElement {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Список расчётов"]');
  if (!trigger) throw new Error("Expected calculations trigger");
  return trigger;
}

function getButton(container: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );
  if (!button) throw new Error(`Expected button: ${text}`);
  return button;
}

function savedItem(): SavedNumerologyCalculationListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Антон Голубев",
    participantLabel: "Антон Голубев",
    modeLabel: "Личный расчёт",
    updatedAt: "2026-07-14T10:00:00.000Z",
    calculation: {
      id: "11111111-1111-4111-8111-111111111111"
    } as SavedNumerologyCalculationListItem["calculation"]
  };
}
