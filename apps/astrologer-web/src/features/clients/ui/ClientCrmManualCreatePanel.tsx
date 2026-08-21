import { useState, type FormEvent } from "react";
import type { AstrologerClientCrmManualClientCreateRequest } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import styles from "./ClientsCrm.module.css";

type ClientCrmManualCreatePanelProps = {
  readonly copy: ClientsCrmCopy["manualCreate"];
  readonly isSaving: boolean;
  readonly isError: boolean;
  readonly onCreate: (input: AstrologerClientCrmManualClientCreateRequest) => Promise<unknown>;
};

export function ClientCrmManualCreatePanel({
  copy,
  isSaving,
  isError,
  onCreate
}: ClientCrmManualCreatePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<"ru" | "en" | "">("");
  const [timezone, setTimezone] = useState("");

  const reset = () => {
    setIsOpen(false);
    setDisplayName("");
    setPreferredLocale("");
    setTimezone("");
  };

  const close = () => {
    if (isSaving) return;
    reset();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreate({
      displayName,
      preferredLocale: preferredLocale === "" ? null : preferredLocale,
      timezone: timezone.trim().length === 0 ? null : timezone
    });
    reset();
  };

  if (!isOpen) {
    return (
      <button className={styles.addClientButton} onClick={() => setIsOpen(true)} type="button">
        <Icon iconName="plus" size={15} aria-hidden="true" />
        {copy.openLabel}
      </button>
    );
  }

  return (
    <form className={styles.manualCreatePanel} onSubmit={handleSubmit}>
      <div className={styles.manualCreateHeader}>
        <span>{copy.title}</span>
        <button
          aria-label={copy.cancelLabel}
          className={styles.iconButton}
          disabled={isSaving}
          onClick={close}
          type="button"
        >
          <Icon iconName="close" size={15} aria-hidden="true" />
        </button>
      </div>
      <label className={styles.fieldLabel}>
        <span>{copy.displayNameLabel}</span>
        <input
          className={styles.input}
          name="manual-client-display-name"
          onChange={(event) => setDisplayName(event.target.value)}
          required
          type="text"
          value={displayName}
        />
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.localeLabel}</span>
        <select
          className={styles.select}
          name="manual-client-locale"
          onChange={(event) => setPreferredLocale(event.target.value as "ru" | "en" | "")}
          value={preferredLocale}
        >
          <option value="">{copy.optionalLabel}</option>
          <option value="ru">{copy.localeRuLabel}</option>
          <option value="en">{copy.localeEnLabel}</option>
        </select>
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.timezoneLabel}</span>
        <input
          className={styles.input}
          name="manual-client-timezone"
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="Europe/Moscow"
          type="text"
          value={timezone}
        />
      </label>
      {isError ? <p className={styles.formError}>{copy.errorLabel}</p> : null}
      <div className={styles.manualCreateActions}>
        <button className={styles.button} disabled={isSaving} type="button" onClick={close}>
          {copy.cancelLabel}
        </button>
        <button className={styles.buttonPrimary} disabled={isSaving} type="submit">
          {isSaving ? copy.submittingLabel : copy.submitLabel}
        </button>
      </div>
    </form>
  );
}
