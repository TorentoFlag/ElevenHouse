import { getFocusableElements } from "./getFocusableElements.js";

export function getInitialFocusElement(
  dialog: HTMLElement,
  preferred: HTMLElement | null | undefined
): HTMLElement {
  if (
    preferred &&
    dialog.contains(preferred) &&
    !preferred.hasAttribute("disabled") &&
    preferred.getAttribute("aria-hidden") !== "true"
  ) {
    return preferred;
  }

  return getFocusableElements(dialog)[0] ?? dialog;
}
