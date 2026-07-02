import { getFocusableElements } from "./getFocusableElements.js";

type DialogKeyboardEvent = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly currentTarget: HTMLElement;
  preventDefault(): void;
  stopPropagation(): void;
};

export function handleDialogKeyDown(event: DialogKeyboardEvent, onClose: () => void): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    onClose();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getFocusableElements(event.currentTarget);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement || !lastElement) {
    event.preventDefault();
    return;
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}
