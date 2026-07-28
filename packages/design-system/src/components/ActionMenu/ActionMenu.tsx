import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import { classNames } from "../../helpers/classNames.js";
import {
  getFirstEnabledActionMenuItemId,
  getLastEnabledActionMenuItemId,
  getNextEnabledActionMenuItemId
} from "./helpers/actionMenuNavigation.js";
import type { ActionMenuItem, ActionMenuProps } from "./types.js";

export function ActionMenu({
  label,
  items,
  align = "end",
  disabled = false,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  menuClassName,
  itemClassName,
  triggerAriaLabel,
  showChevron = true,
  ...rootProps
}: ActionMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = controlledOpen ?? internalOpen;

  const setMenuOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => document.removeEventListener("mousedown", handleDocumentMouseDown);
  }, [open, setMenuOpen]);

  useEffect(() => {
    if (!open) {
      setActiveItemId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !activeItemId) {
      return;
    }

    itemRefs.current[activeItemId]?.focus();
  }, [activeItemId, open]);

  const openMenu = (initialItemId = getFirstEnabledActionMenuItemId(items)) => {
    if (disabled || items.length === 0) {
      return;
    }

    setMenuOpen(true);
    setActiveItemId(initialItemId);
  };

  const closeMenu = ({ restoreFocus }: { readonly restoreFocus: boolean }) => {
    setMenuOpen(false);
    setActiveItemId(null);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(getFirstEnabledActionMenuItemId(items));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(getLastEnabledActionMenuItemId(items));
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveItemId((currentItemId) =>
        getNextEnabledActionMenuItemId(items, currentItemId, event.key === "ArrowDown" ? 1 : -1)
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveItemId(getFirstEnabledActionMenuItemId(items));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveItemId(getLastEnabledActionMenuItemId(items));
    }
  };

  return (
    <div {...rootProps} ref={rootRef} className={classNames("ehActionMenu", className)}>
      <button
        ref={triggerRef}
        className="ehActionMenu__trigger"
        type="button"
        aria-haspopup="menu"
        aria-label={triggerAriaLabel}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled || items.length === 0}
        onClick={() => {
          if (open) {
            closeMenu({ restoreFocus: false });
            return;
          }

          openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ehActionMenu__triggerLabel">{label}</span>
        {showChevron ? (
          <span className="ehActionMenu__triggerChevron" aria-hidden="true">
            ▾
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={menuId}
          className={classNames(
            "ehActionMenu__popover",
            `ehActionMenu__popover--${align}`,
            menuClassName
          )}
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) => (
            <ActionMenuItemButton
              key={item.id}
              item={item}
              className={itemClassName}
              refCallback={(node) => {
                itemRefs.current[item.id] = node;
              }}
              onSelect={() => {
                item.onSelect();
                closeMenu({ restoreFocus: true });
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ActionMenuItemButtonProps = {
  readonly item: ActionMenuItem;
  readonly className?: string;
  readonly refCallback: (node: HTMLButtonElement | null) => void;
  readonly onSelect: () => void;
};

function ActionMenuItemButton({
  item,
  className,
  refCallback,
  onSelect
}: ActionMenuItemButtonProps) {
  return (
    <button
      ref={refCallback}
      className={classNames(
        "ehActionMenu__item",
        {
          "ehActionMenu__item--danger": item.tone === "danger"
        },
        className
      )}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      data-action-menu-item={item.id}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();

        if (!item.disabled) {
          onSelect();
        }
      }}
    >
      {item.icon ? (
        <span className="ehActionMenu__itemIcon" aria-hidden="true">
          {item.icon}
        </span>
      ) : null}
      <span className="ehActionMenu__itemLabel">{item.label}</span>
    </button>
  );
}
