import { describe, expect, it, vi } from "vitest";
import { getFocusableElements } from "./getFocusableElements.js";

describe("getFocusableElements", () => {
  it("returns enabled controls that are exposed to assistive technologies", () => {
    const visibleButton = createElement();
    const disabledInput = createElement({ disabled: true });
    const hiddenLink = createElement({ ariaHidden: "true" });
    const root = {
      querySelectorAll: vi.fn(() => [visibleButton, disabledInput, hiddenLink])
    };

    expect(getFocusableElements(root as unknown as HTMLElement)).toEqual([visibleButton]);
    expect(root.querySelectorAll).toHaveBeenCalledWith(
      "a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])"
    );
  });
});

function createElement({
  disabled = false,
  ariaHidden = null
}: {
  readonly disabled?: boolean;
  readonly ariaHidden?: string | null;
} = {}) {
  return {
    hasAttribute: (name: string) => name === "disabled" && disabled,
    getAttribute: (name: string) => (name === "aria-hidden" ? ariaHidden : null)
  };
}
