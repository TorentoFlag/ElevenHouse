import type { ClientBirthDataResponse, ClientBirthDataUpsertRequest } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { useEffect, useState, type ReactNode } from "react";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import { formatClientCrmDate } from "../model/clientsCrmPresentation";
import styles from "./ClientsCrm.module.css";

type BirthTimePrecision = ClientBirthDataUpsertRequest["birthTimePrecision"];

type ClientCrmBirthDataPanelProps = {
  readonly birthData: ClientBirthDataResponse | null;
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
  readonly isSaving: boolean;
  readonly isError: boolean;
  readonly onSave: (input: ClientBirthDataUpsertRequest) => Promise<unknown>;
};

export function ClientCrmBirthDataPanel({
  birthData,
  copy,
  locale,
  isSaving,
  isError,
  onSave
}: ClientCrmBirthDataPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [birthDate, setBirthDate] = useState(birthData?.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(birthData?.birthTime ?? "");
  const [birthTimePrecision, setBirthTimePrecision] = useState<BirthTimePrecision>(
    birthData?.birthTimePrecision ?? "unknown"
  );
  const [birthPlaceText, setBirthPlaceText] = useState(birthData?.birthPlaceText ?? "");
  const [birthTimezone, setBirthTimezone] = useState(birthData?.birthTimezone ?? "");

  useEffect(() => {
    setIsEditing(false);
    setBirthDate(birthData?.birthDate ?? "");
    setBirthTime(birthData?.birthTime ?? "");
    setBirthTimePrecision(birthData?.birthTimePrecision ?? "unknown");
    setBirthPlaceText(birthData?.birthPlaceText ?? "");
    setBirthTimezone(birthData?.birthTimezone ?? "");
  }, [
    birthData?.birthDate,
    birthData?.birthPlaceText,
    birthData?.birthTime,
    birthData?.birthTimePrecision,
    birthData?.birthTimezone,
    birthData?.revision
  ]);

  const submit = async () => {
    await onSave({
      label: birthData?.label ?? null,
      birthDate,
      birthTime: birthTimePrecision === "unknown" ? null : birthTime,
      birthTimePrecision,
      birthPlaceText,
      birthCountryCode: birthData?.birthCountryCode ?? null,
      birthCity: birthData?.birthCity ?? null,
      birthRegion: birthData?.birthRegion ?? null,
      birthTimezone,
      birthTimeDstOccurrence: birthData?.birthTimeDstOccurrence ?? null,
      birthLatitude: birthData?.birthLatitude ?? null,
      birthLongitude: birthData?.birthLongitude ?? null,
      expectedRevision: birthData?.revision ?? null
    });
    setIsEditing(false);
  };

  return (
    <section className={styles.card}>
      <div className={styles.crmCardHeader}>
        <div className={styles.kicker}>{copy.tabs.birthData}</div>
        {!isEditing ? (
          <button type="button" className={styles.iconButton} onClick={() => setIsEditing(true)}>
            <Icon iconName="edit" size={15} aria-hidden="true" />
            {copy.birthEditor.editLabel}
          </button>
        ) : null}
      </div>

      {!isEditing ? (
        birthData ? (
          <div className={styles.factList}>
            <Fact
              label={copy.facts.birthData}
              value={birthData.birthDate ?? copy.missingBirthData}
            />
            <Fact
              label={copy.facts.birthTime}
              value={
                birthData.birthTime
                  ? `${birthData.birthTime} · ${birthData.birthTimePrecision}`
                  : birthData.birthTimePrecision
              }
            />
            <Fact label={copy.facts.place} value={birthData.birthPlaceText ?? "-"} />
            <Fact label={copy.facts.timezone} value={birthData.birthTimezone ?? "-"} />
            <Fact label={copy.facts.revision} value={String(birthData.revision)} />
            <Fact
              label={copy.facts.updatedAt}
              value={formatClientCrmDate(birthData.updatedAt, locale)}
            />
          </div>
        ) : (
          <div className={styles.emptyStateCompact}>{copy.missingBirthData}</div>
        )
      ) : (
        <BirthProfileFields
          copy={copy}
          birthDate={birthDate}
          birthTime={birthTime}
          birthTimePrecision={birthTimePrecision}
          birthPlaceText={birthPlaceText}
          birthTimezone={birthTimezone}
          onBirthDateChange={setBirthDate}
          onBirthTimeChange={setBirthTime}
          onBirthTimePrecisionChange={setBirthTimePrecision}
          onBirthPlaceTextChange={setBirthPlaceText}
          onBirthTimezoneChange={setBirthTimezone}
        >
          {isError ? <div className={styles.inlineError}>{copy.birthEditor.saveError}</div> : null}
          <div className={styles.editorActions}>
            <button type="button" className={styles.button} onClick={submit} disabled={isSaving}>
              <Icon iconName="check" size={15} aria-hidden="true" />
              {isSaving ? copy.birthEditor.savingLabel : copy.birthEditor.saveLabel}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              {copy.birthEditor.cancelLabel}
            </button>
          </div>
        </BirthProfileFields>
      )}
    </section>
  );
}

type BirthProfileFieldsProps = {
  readonly copy: ClientsCrmCopy;
  readonly birthDate: string;
  readonly birthTime: string;
  readonly birthTimePrecision: BirthTimePrecision;
  readonly birthPlaceText: string;
  readonly birthTimezone: string;
  readonly children: ReactNode;
  readonly onBirthDateChange: (value: string) => void;
  readonly onBirthTimeChange: (value: string) => void;
  readonly onBirthTimePrecisionChange: (value: BirthTimePrecision) => void;
  readonly onBirthPlaceTextChange: (value: string) => void;
  readonly onBirthTimezoneChange: (value: string) => void;
};

export function BirthProfileFields({
  copy,
  birthDate,
  birthTime,
  birthTimePrecision,
  birthPlaceText,
  birthTimezone,
  children,
  onBirthDateChange,
  onBirthTimeChange,
  onBirthTimePrecisionChange,
  onBirthPlaceTextChange,
  onBirthTimezoneChange
}: BirthProfileFieldsProps) {
  return (
    <div className={styles.crmEditor}>
      <label className={styles.fieldLabel}>
        <span>{copy.birthEditor.dateLabel}</span>
        <input
          aria-label={copy.birthEditor.dateLabel}
          className={styles.input}
          type="date"
          value={birthDate}
          onChange={(event) => onBirthDateChange(event.target.value)}
        />
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.birthEditor.timeLabel}</span>
        <input
          aria-label={copy.birthEditor.timeLabel}
          className={styles.input}
          type="time"
          value={birthTime}
          onChange={(event) => onBirthTimeChange(event.target.value)}
        />
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.birthEditor.precisionLabel}</span>
        <select
          aria-label={copy.birthEditor.precisionLabel}
          className={styles.select}
          value={birthTimePrecision}
          onChange={(event) => onBirthTimePrecisionChange(event.target.value as BirthTimePrecision)}
        >
          <option value="exact">exact</option>
          <option value="approximate">approximate</option>
          <option value="unknown">unknown</option>
        </select>
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.birthEditor.placeLabel}</span>
        <input
          aria-label={copy.birthEditor.placeLabel}
          className={styles.input}
          value={birthPlaceText}
          onChange={(event) => onBirthPlaceTextChange(event.target.value)}
        />
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.birthEditor.timezoneLabel}</span>
        <input
          aria-label={copy.birthEditor.timezoneLabel}
          className={styles.input}
          value={birthTimezone}
          onChange={(event) => onBirthTimezoneChange(event.target.value)}
        />
      </label>
      {children}
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}
