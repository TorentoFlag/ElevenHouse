import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { SavedCalculationPicker } from "../../features/calculations/components/SavedCalculationPicker";
import type { SavedCalculationPickerProps } from "../../features/calculations/components/SavedCalculationPicker";
import { NumerologyPageView, type NumerologyPageViewProps } from "./NumerologyPageView";

describe("NumerologyPageView", () => {
  it("disables link action for manual-only calculations", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({ source: "manual", clientId: null })
    });
    const linkButton = findButtonByText(view, "Привязать");

    expect(linkButton.props.disabled).toBe(true);
  });

  it("enables link for CRM-linked participants and keeps publish disabled before approval", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(findButtonByText(view, "Привязать").props.disabled).toBe(false);
    expect(findButtonByText(view, "Опубликовать").props.disabled).toBe(true);
  });

  it("passes saved calculations to picker without recalculation callback", () => {
    const onSelectSaved = vi.fn();
    const onRecalculate = vi.fn();
    const saved = response({
      source: "manual",
      clientId: null
    }).calculation;
    const view = NumerologyPageView({
      ...baseProps(),
      calculations: [saved],
      onSelectSaved,
      onRecalculate
    });
    const picker = findRequiredElementByType<SavedCalculationPickerProps>(
      view,
      SavedCalculationPicker
    );

    picker.props.onSelect(saved);

    expect(onSelectSaved).toHaveBeenCalledWith(saved);
    expect(onRecalculate).not.toHaveBeenCalled();
  });
});

function baseProps(): NumerologyPageViewProps {
  return {
    calculations: [],
    selectedResponse: null,
    formState: {
      mode: "individual",
      title: "",
      subject: {
        source: "manual",
        clientId: "",
        displayName: "",
        fullName: "",
        birthDate: ""
      },
      partner: {
        source: "manual",
        clientId: "",
        displayName: "",
        fullName: "",
        birthDate: ""
      },
      includeNameNumbers: true,
      includePsychomatrix: true,
      includeStrengthLines: true,
      forecastDate: ""
    },
    isSetupOpen: false,
    interpretationText: "",
    errorMessage: null,
    isBusy: false,
    onOpenSetup: vi.fn(),
    onCloseSetup: vi.fn(),
    onFormChange: vi.fn(),
    onCreate: vi.fn(),
    onRecalculate: vi.fn(),
    onSelectSaved: vi.fn(),
    onLink: vi.fn(),
    onPublish: vi.fn(),
    onInterpretationChange: vi.fn(),
    onSaveInterpretation: vi.fn(),
    onApproveInterpretation: vi.fn()
  };
}

function response(participant: {
  readonly source: "manual" | "crm_client";
  readonly clientId: string | null;
}): NumerologyCalculationResponse {
  const calculation = {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    currentMethodVersion: "1.0.0",
    title: "Мария",
    status: "calculated",
    participants: [
      {
        role: "subject",
        source: participant.source,
        clientId: participant.clientId,
        displayName: "Мария",
        birthDate: "1990-03-14",
        inputSnapshot: { fullName: "Мария Иванова", birthDate: "1990-03-14" },
        manuallyOverridden: false
      }
    ],
    versions: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        versionNumber: 1,
        methodVersion: "1.0.0",
        settingsSnapshot: { includeNameNumbers: true },
        inputSnapshot: { mode: "individual" },
        resultSnapshot: {
          methodCode: "pythagorean",
          methodVersion: "1.0.0",
          keyNumbers: { lifePath: 9 }
        },
        resultSummary: { keyNumbers: { lifePath: 9 } },
        resultChecksum: "checksum",
        createdAt: "2026-07-06T00:00:00.000Z"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  } satisfies NumerologyCalculationResponse["calculation"];

  const currentVersion = calculation.versions[0]!;

  return {
    calculation,
    currentVersion,
    resultSnapshot: currentVersion.resultSnapshot,
    settingsSnapshot: currentVersion.settingsSnapshot,
    inputSnapshot: currentVersion.inputSnapshot
  };
}

function findButtonByText(root: ReactElement, text: string): ReactElement<{ disabled?: boolean }> {
  const result = findElements(root).find(
    (element) =>
      element.type === "button" &&
      includesText((element.props as { children?: unknown }).children, text)
  );
  if (!result) throw new Error(`Button not found: ${text}`);

  return result as ReactElement<{ disabled?: boolean }>;
}

function findRequiredElementByType<TProps>(
  root: ReactElement,
  type: unknown
): ReactElement<TProps> {
  const result = findElements(root).find((element) => element.type === type);
  if (!result) throw new Error("Element not found");

  return result as ReactElement<TProps>;
}

function findElements(root: ReactElement): ReactElement[] {
  const result: ReactElement[] = [root];

  const children = (root.props as { children?: ReactNode }).children;
  for (const child of Children.toArray(children)) {
    if (isValidElement(child)) {
      result.push(...findElements(child));
    }
  }

  return result;
}

function includesText(value: unknown, text: string): boolean {
  if (typeof value === "string") return value.includes(text);
  if (Array.isArray(value)) return value.some((item) => includesText(item, text));
  if (isValidElement(value)) {
    return includesText((value.props as { children?: unknown }).children, text);
  }

  return false;
}
