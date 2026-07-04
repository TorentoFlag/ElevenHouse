import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type MouseEvent } from "react";
import { IconButton } from "../IconButton/index.js";
import { Icon } from "../../icons/Icon/index.js";
import { classNames } from "../../helpers/classNames.js";
import { getFocusableElements } from "./helpers/getFocusableElements.js";
import { handleDialogKeyDown } from "./helpers/handleDialogKeyDown.js";
import type { ModalProps } from "./types.js";

export function Modal({
  title,
  right,
  closeLabel,
  children,
  open = true,
  portalTarget,
  backdropClassName,
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
      className={classNames("ehModal__backdrop", backdropClassName)}
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
          {right ? <div className="ehModal__right">{right}</div> : null}
          <IconButton
            className="ehModal__closeButton"
            type="button"
            label={closeLabel}
            icon={<Icon iconName="close" aria-hidden="true" />}
            size="medium"
            variant="quiet"
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

  return createPortal(content, portalTarget ?? document.body);
}
