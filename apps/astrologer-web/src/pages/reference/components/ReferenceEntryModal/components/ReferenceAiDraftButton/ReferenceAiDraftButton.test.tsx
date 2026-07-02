import { Children, isValidElement, type ReactElement } from "react";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { describe, expect, it, vi } from "vitest";
import {
  ReferenceAiDraftButton,
  type ReferenceAiDraftButtonCopy
} from "./ReferenceAiDraftButton";

const copy = {
  label: "AI-черновик",
  title: "AI набросает черновик по заголовку — отредактируйте под свой стиль",
  loadingLabel: "Генерируем...",
  loadingAnnouncement: "Генерируем AI-черновик",
  errorLabel: "Повторить AI-черновик",
  errorTitle: "Не удалось создать AI-черновик. Попробуйте ещё раз.",
  errorAnnouncement: "Не удалось создать AI-черновик"
} satisfies ReferenceAiDraftButtonCopy;

describe("ReferenceAiDraftButton", () => {
  it("renders the active action with a sparkle icon and triggers generation", () => {
    const onClick = vi.fn();

    const button = ReferenceAiDraftButton({
      copy,
      state: "active",
      onClick
    });

    expect(button.type).toBe("button");
    expect(button.props.type).toBe("button");
    expect(button.props.title).toBe(copy.title);
    expect(button.props["aria-disabled"]).toBeUndefined();
    expect(button.props["data-state"]).toBe("active");
    expect(findRequiredElementByType(button, Sparkle).props.width).toBe(12);
    expect(JSON.stringify(button.props.children)).toContain("AI-черновик");

    button.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the loading button focusable, blocks repeat clicks, and announces progress", () => {
    const onClick = vi.fn();

    const button = ReferenceAiDraftButton({
      copy,
      state: "loading",
      onClick
    });

    expect(button.props.disabled).toBeUndefined();
    expect(button.props["aria-disabled"]).toBe(true);
    expect(button.props["data-state"]).toBe("loading");
    expect(JSON.stringify(button.props.children)).toContain("Генерируем...");
    expect(JSON.stringify(button.props.children)).toContain("Генерируем AI-черновик");

    const spinner = findRequiredElementByDataAttribute(button, "data-reference-ai-draft-spinner");
    expect(spinner.props["aria-hidden"]).toBe("true");

    const preventDefault = vi.fn();
    button.props.onClick({ preventDefault });
    expect(onClick).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it("renders a retry affordance when the previous request failed", () => {
    const onClick = vi.fn();

    const button = ReferenceAiDraftButton({
      copy,
      state: "error",
      onClick
    });

    expect(button.props["aria-disabled"]).toBeUndefined();
    expect(button.props["data-state"]).toBe("error");
    expect(button.props.title).toBe(copy.errorTitle);
    expect(JSON.stringify(button.props.children)).toContain("Повторить AI-черновик");
    expect(JSON.stringify(button.props.children)).toContain("Не удалось создать AI-черновик");

    button.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

type TestElementProps = {
  "aria-disabled"?: boolean;
  "aria-hidden"?: string;
  children?: unknown;
  disabled?: boolean;
  "data-reference-ai-draft-spinner"?: string;
  "data-state"?: string;
  onClick: (event?: { preventDefault: () => void }) => void;
  title?: string;
  type?: string;
  width?: number;
};

function findRequiredElementByType(root: unknown, type: unknown) {
  const element = findAllElements(root).find((candidate) => candidate.type === type);
  if (!element) {
    throw new Error("Expected matching element type");
  }

  return element;
}

function findRequiredElementByDataAttribute(root: unknown, attribute: keyof TestElementProps) {
  const element = findAllElements(root).find((candidate) => candidate.props[attribute]);
  if (!element) {
    throw new Error(`Expected element with ${attribute}`);
  }

  return element;
}

function findAllElements(root: unknown) {
  const matches: Array<ReactElement<TestElementProps>> = [];

  visitElements(root, (element) => matches.push(element));

  return matches;
}

function visitElements(root: unknown, visitor: (element: ReactElement<TestElementProps>) => void) {
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);
  Children.forEach(root.props.children, (child) => visitElements(child, visitor));
}
