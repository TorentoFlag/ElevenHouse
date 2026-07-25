import { useState } from "react";
import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { Popover } from "@elevenhouse/design-system/components/Popover";
import "@elevenhouse/design-system/components/Popover.css";
import styles from "./HumanDesignCalculationMenu.module.css";

export type HumanDesignCalculationMenuProps = {
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedCalculationId: string | null;
  readonly disabled: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (isOpen: boolean) => void;
  readonly onSelect: (calculation: CalculationRecordResponse) => void;
};

type HumanDesignCalculationMenuViewProps = HumanDesignCalculationMenuProps & {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

export function HumanDesignCalculationMenu({
  calculations,
  selectedCalculationId,
  disabled,
  open: controlledOpen,
  onOpenChange,
  onSelect
}: HumanDesignCalculationMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? internalOpen;
  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };

  return renderHumanDesignCalculationMenu({
    calculations,
    selectedCalculationId,
    disabled,
    onSelect,
    isOpen,
    onOpenChange: handleOpenChange
  });
}

export function renderHumanDesignCalculationMenu({
  calculations,
  selectedCalculationId,
  disabled,
  onSelect,
  isOpen,
  onOpenChange
}: HumanDesignCalculationMenuViewProps) {
  const selectAndClose = (calculation: CalculationRecordResponse) => {
    onOpenChange(false);
    onSelect(calculation);
  };

  return (
    <Popover className={styles.calculationMenu} open={isOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger className={styles.calculationMenuTrigger} aria-label="Список расчётов Human Design">
        Расчёты
        <span className={styles.calculationCount}>{calculations.length}</span>
      </Popover.Trigger>
      <Popover.Content
        align="start"
        className={styles.calculationPopover}
        role="group"
        aria-labelledby="human-design-saved-calculations-title"
      >
        <div className={styles.calculationMenuHeader}>
          <strong id="human-design-saved-calculations-title">Сохранённые расчёты</strong>
        </div>
        <div className={styles.calculationList} role="list">
          {calculations.length > 0 ? (
            calculations.map((calculation) => (
              <div key={calculation.id} role="listitem">
                <button
                  type="button"
                  className={styles.calculationItem}
                  aria-current={calculation.id === selectedCalculationId ? "true" : undefined}
                  disabled={disabled}
                  onClick={() => selectAndClose(calculation)}
                >
                  <span className={styles.calculationItemTitle}>{calculation.title}</span>
                  <span className={styles.calculationItemMeta}>
                    {formatCalculationMode(calculation)} · {formatCalculationStatus(calculation)} ·{" "}
                    {formatParticipant(calculation)} ·{" "}
                    <time dateTime={calculation.updatedAt}>{formatUpdatedAt(calculation.updatedAt)}</time>
                  </span>
                </button>
              </div>
            ))
          ) : (
            <p className={styles.calculationEmpty}>Сохранённых расчётов пока нет</p>
          )}
        </div>
      </Popover.Content>
    </Popover>
  );
}

function formatCalculationMode(calculation: CalculationRecordResponse): string {
  return calculation.mode === "compatibility" ? "Совместимость" : "Индивидуальный";
}

function formatCalculationStatus(calculation: CalculationRecordResponse): string {
  const labels: Record<CalculationRecordResponse["status"], string> = {
    calculated: "Рассчитан",
    linked: "Привязан",
    published: "Опубликован",
    archived: "Архив"
  };
  return labels[calculation.status];
}

function formatParticipant(calculation: CalculationRecordResponse): string {
  return calculation.participants.find((participant) => participant.role === "subject")?.displayName ?? "Без клиента";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
