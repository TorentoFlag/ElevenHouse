import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { SavedCalculationPicker } from "./SavedCalculationPicker";

describe("SavedCalculationPicker", () => {
  it("renders localized calculation metadata instead of raw status enums", () => {
    const calculation = savedCalculation();
    const view = SavedCalculationPicker({
      calculations: [calculation],
      selectedCalculationId: calculation.id,
      onSelect: vi.fn()
    });
    const text = textOf(view);

    expect(text).toContain("Сохранённые");
    expect(text).toContain("Индивидуальный");
    expect(text).toContain("Привязан");
    expect(text).toContain("Марина Краснова");
    expect(text).not.toContain("linked");
  });

  it("marks the selected record and opens it from the list", () => {
    const onSelect = vi.fn();
    const calculation = savedCalculation();
    const view = SavedCalculationPicker({
      calculations: [calculation],
      selectedCalculationId: calculation.id,
      onSelect
    });
    const item = walk(view).find(
      (element): element is ReactElement<{ "aria-current"?: string; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes(calculation.title)
    );

    expect(item?.props["aria-current"]).toBe("true");
    item?.props.onClick();
    expect(onSelect).toHaveBeenCalledWith(calculation);
  });
});

function savedCalculation(): CalculationRecordResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "human_design",
    mode: "individual",
    interpretationMode: null,
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked",
    requestFingerprint: `sha256:${"a".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: `sha256:${"b".repeat(64)}`,
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
  };
}

function walk(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(walk)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(textOf).join(" ");
}
