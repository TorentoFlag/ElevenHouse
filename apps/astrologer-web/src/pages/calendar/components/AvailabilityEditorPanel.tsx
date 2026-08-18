import type { AvailabilitySchedule, ProductResponse, PutDefaultAvailabilityScheduleRequest } from "@elevenhouse/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { HttpError } from "../../../common/http/HttpError";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import {
  createAvailabilityEditorForm,
  createAvailabilityScheduleCommand
} from "../../../features/availability/model/availabilityEditorForm";
import styles from "../CalendarPage.module.css";
import { AvailabilityProductsEditor } from "./AvailabilityProductsEditor";
import { DateOverridesEditor } from "./DateOverridesEditor";
import { SchedulePolicyFields } from "./SchedulePolicyFields";
import { WeeklyAvailabilityEditor } from "./WeeklyAvailabilityEditor";

type AvailabilityEditorPanelProps = {
  readonly copy: AstrologerCopy["calendar"]["availabilityEditor"];
  readonly timeZone: string;
  readonly schedule: AvailabilitySchedule | null;
  readonly products: readonly Pick<ProductResponse, "id" | "title">[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isProductsLoading: boolean;
  readonly isProductsError: boolean;
  readonly isSaving: boolean;
  readonly onRetry: () => void;
  readonly onSave: (command: PutDefaultAvailabilityScheduleRequest) => Promise<unknown>;
};

export function AvailabilityEditorPanel({
  copy,
  timeZone,
  schedule,
  products,
  isLoading,
  isError,
  isProductsLoading,
  isProductsError,
  isSaving,
  onRetry,
  onSave
}: AvailabilityEditorPanelProps) {
  const [form, setForm] = useState(() => createAvailabilityEditorForm(schedule, timeZone));
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error" | "conflict">("idle");

  useEffect(() => {
    setForm(createAvailabilityEditorForm(schedule, timeZone));
  }, [schedule, timeZone]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("idle");
    try {
      const selectableProductIds =
        isProductsLoading || isProductsError ? undefined : products.map((product) => product.id);
      await onSave(createAvailabilityScheduleCommand(form, { selectableProductIds }));
      setSaveState("saved");
    } catch (error) {
      if (isAvailabilityVersionConflict(error)) {
        onRetry();
        setSaveState("conflict");
      } else {
        setSaveState("error");
      }
    }
  }

  if (isLoading) {
    return <aside className={styles.availabilityPanel} aria-busy="true"><p className={styles.panelState}>{copy.description}</p></aside>;
  }

  if (isError) {
    return (
      <aside className={styles.availabilityPanel}>
        <div className={styles.panelState} role="alert">
          <p>{copy.loadErrorLabel}</p>
          <button className={styles.inlineButton} type="button" onClick={onRetry}>{copy.retryLabel}</button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.availabilityPanel} aria-label={copy.title}>
      <form className={styles.availabilityForm} onSubmit={handleSubmit}>
        <header className={styles.availabilityHeader}>
          <div><h2>{copy.title}</h2><p>{copy.description}</p></div>
          <span className={styles.timeZoneBadge}>{timeZone}</span>
        </header>
        <div className={styles.availabilityScroll}>
          <SchedulePolicyFields copy={copy} form={form} onChange={setForm} />
          <WeeklyAvailabilityEditor copy={copy} form={form} onChange={setForm} />
          <DateOverridesEditor copy={copy} form={form} onChange={setForm} />
          <AvailabilityProductsEditor
            copy={copy}
            form={form}
            products={products}
            isLoading={isProductsLoading}
            isError={isProductsError}
            onRetry={onRetry}
            onChange={setForm}
          />
        </div>
        <footer className={styles.availabilityFooter}>
          {saveState === "error" ? <p className={styles.editorError} role="alert">{copy.saveErrorLabel}</p> : null}
          {saveState === "conflict" ? <p className={styles.editorError} role="alert">{copy.conflictErrorLabel}</p> : null}
          {saveState === "saved" ? <p className={styles.editorSuccess} role="status">{copy.savedLabel}</p> : null}
          <button className={styles.saveAvailabilityButton} type="submit" disabled={isSaving}>
            {isSaving ? copy.savingLabel : copy.saveLabel}
          </button>
        </footer>
      </form>
    </aside>
  );
}

export function isAvailabilityVersionConflict(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 409) return false;
  if (!error.body || typeof error.body !== "object") return false;
  return "code" in error.body && error.body.code === "availability_version_conflict";
}
