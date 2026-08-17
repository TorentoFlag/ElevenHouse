import { useRef, useState, type KeyboardEvent } from "react";
import { Tooltip } from "@elevenhouse/design-system/components/Tooltip";
import "@elevenhouse/design-system/components/Tooltip.css";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import {
  overflowChartModes,
  primaryChartModes,
  type ChartEngineMode
} from "../model/chartEngineMode";
import styles from "./ChartEnginePage.module.css";

export function ChartEngineModeMenu({
  activeMode,
  copy,
  onSelect
}: {
  readonly activeMode: ChartEngineMode;
  readonly copy: ChartEngineCopy;
  readonly onSelect: (mode: ChartEngineMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isOverflowModeActive = overflowChartModes.includes(activeMode);

  const closeAndReturnFocus = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const focusMenuItem = (index: number) => {
    const count = overflowChartModes.length;
    itemRefs.current[(index + count) % count]?.focus();
  };

  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem(overflowChartModes.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
    }
  };

  const renderModeButton = (mode: ChartEngineMode, kind: "active" | "primary") => (
    <Tooltip
      key={`${kind}-${mode}`}
      className={styles.modeTooltip}
      content={copy.modes[mode].tooltip}
      id={`chart-mode-${kind}-${mode.replaceAll("_", "-")}-tooltip`}
      placement="bottom"
    >
      <button
        className={kind === "active" ? styles.modeActive : styles.modeButton}
        type="button"
        onClick={() => onSelect(mode)}
      >
        <span className={styles.modeTabLabel}>{copy.modes[mode].tab}</span>
      </button>
    </Tooltip>
  );

  return (
    <nav className={styles.modeTabs} aria-label={copy.modeMenu.navigationLabel}>
      {primaryChartModes.map((mode) =>
        renderModeButton(mode, activeMode === mode ? "active" : "primary")
      )}
      {isOverflowModeActive ? renderModeButton(activeMode, "active") : null}
      <div
        className={styles.modeOverflow}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsOpen(false);
          }
        }}
      >
        <button
          ref={triggerRef}
          className={styles.modeButton}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={copy.modeMenu.openLabel}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeAndReturnFocus();
              return;
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            setIsOpen(true);
            window.requestAnimationFrame(() =>
              focusMenuItem(event.key === "ArrowDown" ? 0 : overflowChartModes.length - 1)
            );
          }}
        >
          <span className={styles.modeOverflowDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        {isOpen ? (
          <div className={styles.modeOverflowMenu} role="menu" aria-label={copy.modeMenu.menuLabel}>
            {overflowChartModes.map((mode, index) => (
              <Tooltip
                key={mode}
                className={styles.modeTooltip}
                content={copy.modes[mode].tooltip}
                id={`chart-mode-overflow-${mode.replaceAll("_", "-")}-tooltip`}
                placement="right"
              >
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  className={
                    activeMode === mode ? styles.modeOverflowItemActive : styles.modeOverflowItem
                  }
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(mode);
                    closeAndReturnFocus();
                  }}
                  onKeyDown={(event) => handleItemKeyDown(event, index)}
                >
                  {copy.modes[mode].tab}
                </button>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
