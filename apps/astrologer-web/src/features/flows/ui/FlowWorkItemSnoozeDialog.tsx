import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  createFlowWorkItemSnoozeDraft,
  resolveFlowWorkItemSnoozeDraft,
  type FlowWorkItemSnoozeDraft,
  type FlowWorkItemSnoozeOption
} from "../model/flowWorkItemSnoozeModel";
import styles from "./FlowWorkItemSnoozeDialog.module.css";

export type FlowWorkItemSnoozeDialogProps = {
  readonly open: boolean;
  readonly locale: "ru" | "en";
  readonly timeZone: string;
  readonly workItemTitle: string;
  readonly subjectLabel?: string;
  readonly pending: boolean;
  readonly error?: string | null;
  readonly now?: Date;
  readonly onClose: () => void;
  readonly onConfirm: (snoozedUntil: string) => void;
};

export function FlowWorkItemSnoozeDialog({
  open,
  locale,
  timeZone,
  workItemTitle,
  subjectLabel,
  pending,
  error = null,
  now,
  onClose,
  onConfirm
}: FlowWorkItemSnoozeDialogProps) {
  const copy = dialogCopy[locale];
  const fieldId = useId();
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const [effectiveNow, setEffectiveNow] = useState(() => now ?? new Date());
  const [draft, setDraft] = useState<FlowWorkItemSnoozeDraft>(() =>
    createFlowWorkItemSnoozeDraft({ now: effectiveNow, timeZone })
  );

  useEffect(() => {
    if (!open) return;
    const openedAt = now ?? new Date();
    setEffectiveNow(openedAt);
    setDraft(createFlowWorkItemSnoozeDraft({ now: openedAt, timeZone }));
  }, [now, open, timeZone]);

  const resolution = resolveFlowWorkItemSnoozeDraft({
    ...draft,
    locale,
    now: effectiveNow,
    timeZone
  });
  const validationId = `${fieldId}-validation`;
  const commandErrorId = `${fieldId}-command-error`;
  const summary = resolution.snoozedUntil
    ? formatReturnTime(resolution.snoozedUntil, locale, timeZone)
    : null;

  function selectOption(option: FlowWorkItemSnoozeOption) {
    if (pending) return;
    setDraft((current) => ({ ...current, option }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || resolution.snoozedUntil === null) return;
    onConfirm(resolution.snoozedUntil);
  }

  function handleClose() {
    if (!pending) onClose();
  }

  return (
    <Modal
      open={open}
      title={copy.title}
      closeLabel={copy.close}
      className={styles.dialog}
      contentClassName={styles.modalContent}
      initialFocusRef={firstOptionRef}
      onClose={handleClose}
    >
      <form className={styles.form} aria-busy={pending} onSubmit={handleSubmit}>
        <div className={styles.taskContext}>
          <span className={styles.taskIcon} aria-hidden="true">
            <Icon iconName="flow" width={15} height={15} />
          </span>
          <span className={styles.taskCopy}>
            <span>{subjectLabel ?? copy.task}</span>
            <strong>{workItemTitle}</strong>
          </span>
        </div>

        <div className={styles.timeZoneLine}>
          <Icon iconName="globe" width={14} height={14} aria-hidden="true" />
          <span>{copy.profileTimeZone}</span>
          <strong>{timeZone}</strong>
        </div>

        <fieldset className={styles.options}>
          <legend>{copy.returnTime}</legend>
          <SnoozeOption
            inputRef={firstOptionRef}
            name={`${fieldId}-option`}
            option="one_hour"
            selected={draft.option === "one_hour"}
            label={copy.oneHour}
            description={copy.oneHourDescription}
            iconName="clock"
            disabled={pending}
            onSelect={selectOption}
          />
          <SnoozeOption
            name={`${fieldId}-option`}
            option="tomorrow_morning"
            selected={draft.option === "tomorrow_morning"}
            label={copy.tomorrowMorning}
            description={copy.tomorrowMorningDescription}
            iconName="calendar"
            disabled={pending}
            onSelect={selectOption}
          />
          <SnoozeOption
            name={`${fieldId}-option`}
            option="custom"
            selected={draft.option === "custom"}
            label={copy.custom}
            description={copy.customDescription}
            iconName="edit"
            disabled={pending}
            onSelect={selectOption}
          />
        </fieldset>

        {draft.option === "custom" ? (
          <div className={styles.customField}>
            <label htmlFor={`${fieldId}-custom`}>{copy.customField}</label>
            <input
              id={`${fieldId}-custom`}
              type="datetime-local"
              step={60}
              value={draft.customLocalDateTime}
              disabled={pending}
              aria-invalid={resolution.validation !== null}
              aria-describedby={resolution.validation ? validationId : undefined}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({
                  ...current,
                  customLocalDateTime: value
                }));
              }}
            />
          </div>
        ) : null}

        {resolution.validation ? (
          <p id={validationId} className={styles.validation} role="alert">
            <Icon iconName="clock" width={14} height={14} aria-hidden="true" />
            <span>{resolution.validation.message}</span>
          </p>
        ) : null}

        {error ? (
          <p id={commandErrorId} className={styles.commandError} role="alert">
            <Icon iconName="lightning" width={14} height={14} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        {pending ? (
          <p className={styles.summary} role="status" aria-live="polite">
            <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
            <span>{copy.saving}</span>
          </p>
        ) : summary ? (
          <p className={styles.summary} role="status">
            <Icon iconName="check" width={14} height={14} aria-hidden="true" />
            <span>
              {copy.summary} <strong>{summary}</strong>
            </span>
          </p>
        ) : null}

        <footer className={styles.actions}>
          <Button
            type="button"
            size="medium"
            variant="default"
            title={copy.cancel}
            disabled={pending}
            onClick={handleClose}
          />
          <Button
            type="submit"
            size="medium"
            variant="brand"
            title={pending ? copy.submitting : copy.confirm}
            startIcon={<Icon iconName="clock" width={14} height={14} aria-hidden="true" />}
            disabled={pending || resolution.snoozedUntil === null}
          />
        </footer>
      </form>
    </Modal>
  );
}

type SnoozeOptionProps = {
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
  readonly name: string;
  readonly option: FlowWorkItemSnoozeOption;
  readonly selected: boolean;
  readonly label: string;
  readonly description: string;
  readonly iconName: "calendar" | "clock" | "edit";
  readonly disabled: boolean;
  readonly onSelect: (option: FlowWorkItemSnoozeOption) => void;
};

function SnoozeOption({
  inputRef,
  name,
  option,
  selected,
  label,
  description,
  iconName,
  disabled,
  onSelect
}: SnoozeOptionProps) {
  return (
    <label className={styles.option} data-selected={selected || undefined}>
      <input
        ref={inputRef}
        className={styles.optionInput}
        type="radio"
        name={name}
        value={option}
        checked={selected}
        disabled={disabled}
        aria-label={label}
        aria-checked={selected}
        onChange={() => onSelect(option)}
      />
      <span className={styles.optionIcon} aria-hidden="true">
        <Icon iconName={iconName} width={15} height={15} />
      </span>
      <span className={styles.optionCopy} aria-hidden="true">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <span className={styles.optionCheck} aria-hidden="true">
        {selected ? <Icon iconName="check" width={12} height={12} /> : null}
      </span>
    </label>
  );
}

function formatReturnTime(instant: string, locale: "ru" | "en", timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(instant));
}

const dialogCopy = {
  ru: {
    title: "Отложить задачу",
    close: "Закрыть",
    task: "Задача из воронки",
    profileTimeZone: "Часовой пояс профиля:",
    returnTime: "Когда вернуть задачу",
    oneHour: "На 1 час",
    oneHourDescription: "Вернуть через один абсолютный час",
    tomorrowMorning: "Завтра в 09:00",
    tomorrowMorningDescription: "Утром по часовому поясу профиля",
    custom: "Выбрать дату и время",
    customDescription: "Указать точное местное время",
    customField: "Дата и время возврата",
    summary: "Задача вернётся",
    saving: "Сохраняем время возврата.",
    cancel: "Отмена",
    confirm: "Отложить задачу",
    submitting: "Откладываем"
  },
  en: {
    title: "Snooze task",
    close: "Close",
    task: "Flow task",
    profileTimeZone: "Profile timezone:",
    returnTime: "When to return the task",
    oneHour: "For 1 hour",
    oneHourDescription: "Return after one absolute hour",
    tomorrowMorning: "Tomorrow at 09:00",
    tomorrowMorningDescription: "Morning in the profile timezone",
    custom: "Choose date and time",
    customDescription: "Set an exact local time",
    customField: "Return date and time",
    summary: "The task will return",
    saving: "Saving the return time.",
    cancel: "Cancel",
    confirm: "Snooze task",
    submitting: "Snoozing"
  }
} as const;
