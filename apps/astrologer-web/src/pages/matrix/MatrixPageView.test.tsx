import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { matrixDataSchema } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { MatrixPageView, type MatrixPageViewProps } from "./MatrixPageView";
import {
  createEmptyMatrixReportEditor,
  getMatrixSelection
} from "../../features/matrix/model/matrixWorkspaceModel";

const matrix = matrixDataSchema.parse({
  points: Object.fromEntries(
    [
      "A",
      "B",
      "C",
      "D",
      "E",
      "tl",
      "tr",
      "br",
      "bl",
      "A1",
      "B1",
      "C1",
      "D1",
      "tl1",
      "tr1",
      "br1",
      "bl1"
    ].map((key, index) => [key, (index % 22) + 1])
  ),
  purposes: { earth: 1, sky: 2, male: 3, female: 4, personal: 5, social: 6, spiritual: 7 },
  zones: { purpose: 8, money: 9, love: 10, energy: 11 },
  energyMap: {
    rows: [
      "sahasrara",
      "ajna",
      "vishuddha",
      "anahata",
      "manipura",
      "svadhisthana",
      "muladhara"
    ].map((code, index) => ({ code, physical: index + 1, energy: index + 2, emotions: index + 3 })),
    totals: { physical: 10, energy: 11, emotions: 12 }
  }
});

describe("MatrixPageView", () => {
  it("uses CRM client selectors and exposes no manual participant entry", () => {
    const view = MatrixPageView(baseProps());
    const pickers = walk(view).filter((element) => element.type === ClientSearchCombobox);

    expect(pickers).toHaveLength(1);
    expect(pickers[0]?.props.label).toBe("Клиент");
    expect(walk(view).some((element) => element.type === "input")).toBe(false);
    expect(textOf(view)).toContain("Вводить данные вручную не нужно");
  });

  it("keeps client messaging as an honest disabled stub", () => {
    const view = MatrixPageView({
      ...baseProps(),
      matrix,
      selection: getMatrixSelection(matrix, "E")
    });
    const chatButton = walk(view).find(
      (element) => element.type === "button" && textOf(element).includes("Отправить клиенту")
    );

    expect(chatButton?.props.disabled).toBe(true);
    expect(textOf(view)).toContain("Чат пока не подключён");
    expect(textOf(view)).not.toContain("Опубликовать");
    expect(textOf(view)).not.toContain("Начать консультацию");
  });
});

function baseProps(): MatrixPageViewProps {
  const noop = vi.fn();
  return {
    matrix: null,
    projection: null,
    mode: "individual",
    subject: null,
    partner: null,
    calculationId: "",
    isLinked: false,
    selected: "E",
    selection: null,
    interpretation: null,
    notes: [],
    noteDraft: "",
    selectedNoteIds: [],
    reportEditor: createEmptyMatrixReportEditor("ru"),
    activePanel: "detail",
    isYearMode: false,
    isPresentationOpen: false,
    isBusy: false,
    isInterpretationLoading: false,
    reportCanSave: false,
    message: null,
    errorMessage: null,
    pdfLabel: "PDF",
    pdfDisabled: true,
    onSelectSubject: noop,
    onSelectPartner: noop,
    onToggleCompatibility: noop,
    onToggleYear: noop,
    onSelect: noop,
    onSetPanel: noop,
    onPersist: noop,
    onOpenPresentation: noop,
    onClosePresentation: noop,
    onNoteDraftChange: noop,
    onCreateNote: noop,
    onToggleNoteForReport: noop,
    onUpdateNote: noop,
    onDeleteNote: noop,
    onReportChange: noop,
    onGenerateReport: noop,
    onSaveReport: noop,
    onPdf: noop
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
