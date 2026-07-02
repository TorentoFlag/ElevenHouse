import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type MouseEvent } from "react";
import { classNames } from "../../helpers/classNames.js";
import { getFocusableElements } from "./helpers/getFocusableElements.js";
import { handleDialogKeyDown } from "./helpers/handleDialogKeyDown.js";
import type { ModalProps } from "./types.js";

export function Modal({
  title,
  closeLabel,
  children,
  open = true,
  className,
  contentClassName,
  onClose
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }

    previousActiveElementRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const firstFocusable = dialog ? getFocusableElements(dialog)[0] : null;
      (firstFocusable ?? dialog)?.focus();
    });

    return () => {
      document.body.style.overflow = previousBodyOverflow;

      if (previousActiveElementRef.current instanceof HTMLElement) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const content = (
    <div
      className="ehModal__backdrop"
      role="presentation"
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={classNames("ehModal__dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <header className="ehModal__header">
          <h2 id={titleId} className="ehModal__title">
            {title}
          </h2>
          <button
            className="ehModal__closeButton"
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
          />
        </header>
        <div className={classNames("ehModal__content", contentClassName)}>{children}</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
