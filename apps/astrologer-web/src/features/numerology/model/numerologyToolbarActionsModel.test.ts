import { describe, expect, it } from "vitest";
import { buildNumerologyToolbarActions } from "./numerologyToolbarActionsModel";

describe("buildNumerologyToolbarActions", () => {
  it("builds the three preparation commands in stable order", () => {
    expect(buildNumerologyToolbarActions(baseInput())).toEqual([
      {
        id: "presentation",
        label: "Открыть презентацию",
        iconName: "arrowUpRight",
        disabled: false,
        description: null
      },
      {
        id: "link",
        label: "Привязать к клиенту",
        iconName: "pin",
        disabled: false,
        description: null
      },
      {
        id: "pdf",
        label: "Сформировать PDF",
        iconName: "doc",
        disabled: false,
        description: null
      }
    ]);
  });

  it("shows linked, unavailable and pending states with reasons", () => {
    expect(
      buildNumerologyToolbarActions(
        baseInput({ isCalculationLinked: true, linkDisabled: true })
      )[1]
    ).toEqual({
      id: "link",
      label: "Привязано к клиенту",
      iconName: "check",
      disabled: true,
      description: null
    });

    const unavailable = buildNumerologyToolbarActions(
      baseInput({
        hasResult: false,
        linkDisabled: true,
        hasLinkableClient: false,
        pdfDisabled: true,
        pdfTitle: "Сначала сохраните расчёт"
      })
    );
    expect(unavailable[0]).toMatchObject({
      disabled: true,
      description: "Сначала выберите клиента"
    });
    expect(unavailable[1]).toMatchObject({
      disabled: true,
      description: "Нужен CRM-участник"
    });
    expect(unavailable[2]).toMatchObject({
      label: "Скачать PDF",
      disabled: true,
      description: "Сначала сохраните расчёт"
    });

    expect(
      buildNumerologyToolbarActions(
        baseInput({
          pdfLabel: "PDF готовится…",
          pdfDisabled: true,
          pdfTitle: "PDF формируется"
        })
      )[2]
    ).toMatchObject({
      label: "PDF готовится…",
      disabled: true,
      description: "PDF формируется"
    });
  });

  it("uses action-oriented ready and retry PDF labels", () => {
    expect(
      buildNumerologyToolbarActions(
        baseInput({ pdfLabel: "Скачать PDF", pdfTitle: "Скачать готовый PDF" })
      )[2]
    ).toMatchObject({ label: "Скачать PDF", disabled: false });

    expect(
      buildNumerologyToolbarActions(
        baseInput({ pdfLabel: "Повторить", pdfTitle: "Повторить формирование PDF" })
      )[2]
    ).toMatchObject({ label: "Повторить формирование PDF", disabled: false });
  });

  it("explains a busy link action without changing its identity", () => {
    expect(
      buildNumerologyToolbarActions(baseInput({ isBusy: true, linkDisabled: true }))[1]
    ).toMatchObject({
      id: "link",
      label: "Привязать к клиенту",
      disabled: true,
      description: "Действие выполняется"
    });
  });
});

function baseInput(
  patch: Partial<Parameters<typeof buildNumerologyToolbarActions>[0]> = {}
): Parameters<typeof buildNumerologyToolbarActions>[0] {
  return {
    hasResult: true,
    isBusy: false,
    isCalculationLinked: false,
    linkDisabled: false,
    hasLinkableClient: true,
    pdfLabel: "PDF",
    pdfDisabled: false,
    pdfTitle: "Сформировать PDF",
    ...patch
  };
}
