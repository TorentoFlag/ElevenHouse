import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import { classNames } from "../../helpers/classNames.js";
import type {
  PopoverContentProps,
  PopoverOpenChangeReason,
  PopoverProps,
  PopoverTriggerProps
} from "./types.js";

type PopoverDismissalReason = Exclude<PopoverOpenChangeReason, "trigger">;

type PopoverContextValue = {
  readonly contentId: string;
  readonly open: boolean;
  readonly requestOpenChange: (open: boolean, reason: PopoverOpenChangeReason) => void;
  readonly triggerRef: MutableRefObject<HTMLButtonElement | null>;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function PopoverRoot({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  onKeyDown,
  ...rootProps
}: PopoverProps) {
  const contentId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = controlledOpen ?? internalOpen;

  const requestOpenChange = useCallback(
    (nextOpen: boolean, reason: PopoverOpenChangeReason) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen, reason);
    },
    [isControlled, onOpenChange]
  );

  useEffect(() => {
    const root = rootRef.current;
    const trigger = triggerRef.current;
    if (!open || !root || !trigger) return undefined;

    return bindPopoverDismissal(root.ownerDocument, root, (reason) => {
      requestOpenChange(false, reason);
    });
  }, [open, requestOpenChange]);

  const contextValue = useMemo<PopoverContextValue>(
    () => ({ contentId, open, requestOpenChange, triggerRef }),
    [contentId, open, requestOpenChange]
  );

  return (
    <PopoverContext.Provider value={contextValue}>
      <div
        {...rootProps}
        ref={rootRef}
        className={classNames("ehPopover", className)}
        data-state={open ? "open" : "closed"}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!open || event.defaultPrevented) return;
          handlePopoverEscape(event, triggerRef.current, (reason) => {
            requestOpenChange(false, reason);
          });
        }}
      >
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

function PopoverTrigger({
  type = "button",
  disabled,
  className,
  onClick,
  ...buttonProps
}: PopoverTriggerProps) {
  const context = usePopoverContext("Popover.Trigger");

  return (
    <button
      {...buttonProps}
      ref={context.triggerRef}
      type={type}
      className={classNames("ehPopover__trigger", className)}
      aria-expanded={context.open}
      aria-controls={context.contentId}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          context.requestOpenChange(!context.open, "trigger");
        }
      }}
    />
  );
}

function PopoverContent({ align = "start", className, ...contentProps }: PopoverContentProps) {
  const context = usePopoverContext("Popover.Content");
  if (!context.open) return null;

  return (
    <div
      {...contentProps}
      id={context.contentId}
      className={classNames(
        "ehPopover__content",
        `ehPopover__content--${align}`,
        className
      )}
      data-align={align}
      data-state="open"
    />
  );
}

function usePopoverContext(componentName: string): PopoverContextValue {
  const context = useContext(PopoverContext);
  if (!context) throw new Error(`${componentName} must be rendered inside Popover`);
  return context;
}

export function bindPopoverDismissal(
  documentTarget: Pick<Document, "addEventListener" | "removeEventListener">,
  root: Pick<HTMLElement, "contains">,
  onDismiss: (reason: PopoverDismissalReason) => void
): () => void {
  const handlePointerDown = (event: PointerEvent) => {
    if (event.target && !root.contains(event.target as Node)) {
      onDismiss("outside-pointer");
    }
  };
  documentTarget.addEventListener("pointerdown", handlePointerDown, true);

  return () => {
    documentTarget.removeEventListener("pointerdown", handlePointerDown, true);
  };
}

export function handlePopoverEscape(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "preventDefault" | "stopPropagation">,
  trigger: Pick<HTMLButtonElement, "focus"> | null,
  onDismiss: (reason: PopoverDismissalReason) => void
): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  event.preventDefault();
  event.stopPropagation();
  onDismiss("escape");
  trigger?.focus();
  return true;
}

export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent
});
