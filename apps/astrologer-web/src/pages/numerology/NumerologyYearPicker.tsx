import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import {
  MAX_NUMEROLOGY_YEAR,
  MIN_NUMEROLOGY_YEAR,
  parseNumerologyYearDraft
} from "../../features/numerology/model/numerologyPeriodModel";
import styles from "./NumerologyYearPicker.module.css";

const POPOVER_ID = "numerology-year-picker";

export type NumerologyYearPickerProps = {
  readonly selectedYear: number;
  readonly isOpen: boolean;
  readonly isPeriodVisible: boolean;
  readonly isPreviewPending: boolean;
  readonly errorMessage: string | null;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onApply: (year: number) => void;
  readonly onHide: () => void;
  readonly onRetry: () => void;
};

export function closeNumerologyYearPicker(close: () => void, restoreFocus: () => void): void {
  close();
  restoreFocus();
}

export function NumerologyYearPicker({
  selectedYear,
  isOpen,
  isPeriodVisible,
  isPreviewPending,
  errorMessage,
  disabled,
  onToggle,
  onApply,
  onHide,
  onRetry
}: NumerologyYearPickerProps) {
  const [draftYear, setDraftYear] = useState(String(selectedYear));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const parsedDraft = parseNumerologyYearDraft(draftYear);

  useEffect(() => {
    if (!isOpen) return undefined;

    setDraftYear(String(selectedYear));
    const focusFrame = requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onToggle();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen, onToggle, selectedYear]);

  function closeAndRestoreFocus(): void {
    closeNumerologyYearPicker(onToggle, () => triggerRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || !isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeAndRestoreFocus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (parsedDraft.value === null) return;
    closeNumerologyYearPicker(
      () => onApply(parsedDraft.value!),
      () => triggerRef.current?.focus()
    );
  }

  function stepYear(delta: -1 | 1): void {
    const currentYear = parsedDraft.value ?? selectedYear;
    const nextYear = Math.min(
      MAX_NUMEROLOGY_YEAR,
      Math.max(MIN_NUMEROLOGY_YEAR, currentYear + delta)
    );
    setDraftYear(String(nextYear));
  }

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={isPeriodVisible ? styles.triggerActive : styles.trigger}
        aria-expanded={isOpen}
        aria-controls={POPOVER_ID}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onToggle}
        title="Выбрать личный год"
      >
        <Icon iconName="clock" width={15} height={15} aria-hidden="true" />
        Год · {selectedYear}
        {isPreviewPending ? <span className={styles.busyMark}>…</span> : null}
      </button>

      {isOpen && !disabled ? (
        <form
          id={POPOVER_ID}
          className={styles.popover}
          aria-label="Выбор личного года"
          onSubmit={handleSubmit}
        >
          <span className={styles.label}>Прогнозный год</span>
          <div className={styles.yearRow}>
            <button
              type="button"
              className={styles.stepButton}
              aria-label="Предыдущий год"
              disabled={parsedDraft.value === MIN_NUMEROLOGY_YEAR}
              onClick={() => stepYear(-1)}
            >
              −
            </button>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={draftYear}
              aria-invalid={parsedDraft.error ? "true" : undefined}
              aria-describedby={parsedDraft.error ? `${POPOVER_ID}-error` : undefined}
              onChange={(event) => setDraftYear(event.target.value)}
            />
            <button
              type="button"
              className={styles.stepButton}
              aria-label="Следующий год"
              disabled={parsedDraft.value === MAX_NUMEROLOGY_YEAR}
              onClick={() => stepYear(1)}
            >
              +
            </button>
          </div>
          {parsedDraft.error ? (
            <span className={styles.validationError} id={`${POPOVER_ID}-error`}>
              {parsedDraft.error}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.currentYearButton}
            onClick={() => setDraftYear(String(new Date().getFullYear()))}
          >
            Текущий год
          </button>
          <div className={styles.actions}>
            {isPeriodVisible ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => closeNumerologyYearPicker(onHide, () => triggerRef.current?.focus())}
              >
                Скрыть период
              </button>
            ) : null}
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={parsedDraft.value === null}
            >
              Применить
            </button>
          </div>
        </form>
      ) : null}

      {errorMessage ? (
        <div className={styles.errorNotice} role="status">
          <span>{errorMessage}</span>
          <button type="button" onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : null}
    </div>
  );
}
