import { useEffect, useRef, useState } from "react";
import type {
  ClientBirthDataUpsertRequest,
  ClientBirthPlaceCandidate,
  DictionaryLocale
} from "@elevenhouse/contracts";
import { toBirthPlaceDraftPatch } from "../../clients/model/birthPlaceModel";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import {
  chartDstOccurrenceCopyByLocale,
  type ChartDstOccurrence
} from "../model/chartCivilTimeOccurrence";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import { ChartBirthDatePicker, formatBirthDateButtonLabel } from "./ChartBirthDatePicker";
import { ChartBirthTimePicker } from "./ChartBirthTimePicker";
import styles from "./ChartBirthDataEditor.module.css";

export function ChartBirthDataEditor({
  client,
  copy,
  disabled,
  errorMessage,
  isSaving,
  layout = "rail",
  locale,
  onSave,
  onSearchBirthPlaces
}: {
  readonly client: ClientSelectOption;
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly errorMessage: string | null;
  readonly isSaving: boolean;
  readonly layout?: "rail" | "workspace";
  readonly locale: DictionaryLocale;
  readonly onSave: (data: ClientBirthDataUpsertRequest) => void | Promise<void>;
  readonly onSearchBirthPlaces?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
}) {
  const birthData = client.birthData;
  const [birthDate, setBirthDate] = useState(birthData?.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(birthData?.birthTime ?? "");
  const [birthTimePrecision, setBirthTimePrecision] = useState<
    ClientBirthDataUpsertRequest["birthTimePrecision"]
  >(birthData?.birthTimePrecision ?? "unknown");
  const [birthPlaceText, setBirthPlaceText] = useState(birthData?.birthPlaceText ?? "");
  const [birthTimezone, setBirthTimezone] = useState(birthData?.birthTimezone ?? "");
  const [birthTimeDstOccurrence, setBirthTimeDstOccurrence] = useState<ChartDstOccurrence | null>(
    birthData?.birthTimeDstOccurrence ?? null
  );
  const [birthLatitude, setBirthLatitude] = useState(
    birthData?.birthLatitude == null ? "" : String(birthData.birthLatitude)
  );
  const [birthLongitude, setBirthLongitude] = useState(
    birthData?.birthLongitude == null ? "" : String(birthData.birthLongitude)
  );
  const [birthCountryCode, setBirthCountryCode] = useState(birthData?.birthCountryCode ?? null);
  const [birthCity, setBirthCity] = useState(birthData?.birthCity ?? null);
  const [birthRegion, setBirthRegion] = useState(birthData?.birthRegion ?? null);
  const [placeCandidates, setPlaceCandidates] = useState<readonly ClientBirthPlaceCandidate[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [selectedPlaceText, setSelectedPlaceText] = useState(birthData?.birthPlaceText ?? "");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const searchBirthPlacesRef = useRef(onSearchBirthPlaces);
  const occurrenceCopy = chartDstOccurrenceCopyByLocale[locale];
  const timeDisabled = disabled || birthTimePrecision === "unknown";

  useEffect(() => {
    searchBirthPlacesRef.current = onSearchBirthPlaces;
  }, [onSearchBirthPlaces]);

  useEffect(() => {
    const query = birthPlaceText.trim();
    const searchBirthPlaces = searchBirthPlacesRef.current;
    if (!searchBirthPlaces || disabled || query.length < 3 || query === selectedPlaceText) {
      setIsSearchingPlace(false);
      if (query.length < 3) {
        setPlaceCandidates([]);
        setPlaceSearchError(null);
      }
      return;
    }

    let isCancelled = false;
    setIsSearchingPlace(true);
    setPlaceSearchError(null);
    const timeoutId = window.setTimeout(() => {
      void searchBirthPlaces(query)
        .then((candidates) => {
          if (isCancelled) return;
          setPlaceCandidates(candidates);
          setPlaceSearchError(candidates.length === 0 ? copy.birthData.placeNotFound : null);
        })
        .catch((error) => {
          if (isCancelled) return;
          setPlaceCandidates([]);
          setPlaceSearchError(formatBirthPlaceSearchError(error, copy));
        })
        .finally(() => {
          if (!isCancelled) setIsSearchingPlace(false);
        });
    }, 800);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [birthPlaceText, copy, disabled, selectedPlaceText]);

  const selectPlaceCandidate = (candidate: ClientBirthPlaceCandidate) => {
    const patch = toBirthPlaceDraftPatch(candidate);
    setBirthPlaceText(patch.birthPlaceText ?? "");
    setSelectedPlaceText(patch.birthPlaceText ?? "");
    setBirthCountryCode(patch.birthCountryCode);
    setBirthCity(patch.birthCity);
    setBirthRegion(patch.birthRegion);
    const nextTimezone = patch.birthTimezone ?? "";
    if (nextTimezone !== birthTimezone) setBirthTimeDstOccurrence(null);
    setBirthTimezone(nextTimezone);
    setBirthLatitude(String(patch.birthLatitude ?? ""));
    setBirthLongitude(String(patch.birthLongitude ?? ""));
    setPlaceCandidates([]);
    setPlaceSearchError(null);
  };

  return (
    <form
      className={layout === "workspace" ? styles.birthDataWorkspaceForm : styles.birthDataCard}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsDatePickerOpen(false);
          setIsTimePickerOpen(false);
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          label: birthData?.label ?? copy.birthData.defaultLabel,
          birthDate: normalizeTextField(birthDate),
          birthTime: birthTimePrecision === "unknown" ? null : normalizeTextField(birthTime),
          birthTimePrecision,
          birthPlaceText: normalizeTextField(birthPlaceText),
          birthCountryCode,
          birthCity,
          birthRegion,
          birthTimezone: normalizeTextField(birthTimezone),
          birthTimeDstOccurrence: birthTimePrecision === "unknown" ? null : birthTimeDstOccurrence,
          birthLatitude: normalizeNumberField(birthLatitude),
          birthLongitude: normalizeNumberField(birthLongitude),
          isPrimary: birthData?.isPrimary ?? true
        });
      }}
    >
      <div className={styles.birthDataFormHeader}>
        <strong>{copy.birthData.title}</strong>
        <span>{copy.birthData.description}</span>
      </div>
      <div className={styles.birthDataPickerField}>
        <span className={styles.birthDataLabel}>{copy.birthData.date}</span>
        <button
          className={styles.birthDataPickerButton}
          name="birthDatePicker"
          type="button"
          aria-label={`${copy.birthData.date}: ${formatBirthDateButtonLabel(birthDate, copy)}`}
          aria-expanded={isDatePickerOpen}
          disabled={disabled}
          onClick={() => {
            setIsDatePickerOpen((isOpen) => !isOpen);
            setIsTimePickerOpen(false);
          }}
        >
          <strong>{formatBirthDateButtonLabel(birthDate, copy)}</strong>
          <small>{copy.birthData.openCalendar}</small>
        </button>
        <input name="birthDate" type="hidden" value={birthDate} />
        {isDatePickerOpen ? (
          <ChartBirthDatePicker
            copy={copy}
            value={birthDate}
            disabled={disabled}
            onChange={(nextDate) => {
              if (nextDate !== birthDate) setBirthTimeDstOccurrence(null);
              setBirthDate(nextDate);
              setIsDatePickerOpen(false);
            }}
          />
        ) : null}
      </div>
      <label className={styles.birthDataSelectField}>
        <span className={styles.birthDataLabel}>{copy.birthData.precision}</span>
        <select
          name="birthTimePrecision"
          value={birthTimePrecision}
          disabled={disabled}
          onChange={(event) => {
            const nextPrecision = event.target
              .value as ClientBirthDataUpsertRequest["birthTimePrecision"];
            if (nextPrecision !== birthTimePrecision) setBirthTimeDstOccurrence(null);
            setBirthTimePrecision(nextPrecision);
          }}
        >
          <option value="unknown">{copy.birthData.unknown}</option>
          <option value="approximate">{copy.birthData.approximate}</option>
          <option value="exact">{copy.birthData.exact}</option>
        </select>
      </label>
      <div className={styles.birthDataPickerField}>
        <span className={styles.birthDataLabel}>{copy.birthData.time}</span>
        <button
          className={styles.birthDataPickerButton}
          name="birthTimePicker"
          type="button"
          aria-label={copy.birthData.timeAria(birthTime)}
          aria-expanded={isTimePickerOpen}
          disabled={timeDisabled}
          onClick={() => {
            setIsTimePickerOpen((isOpen) => !isOpen);
            setIsDatePickerOpen(false);
          }}
        >
          <strong>{birthTime || copy.birthData.chooseTime}</strong>
          <small>
            {birthTimePrecision === "unknown"
              ? copy.birthData.choosePrecisionFirst
              : copy.birthData.openClock}
          </small>
        </button>
        <input name="birthTime" type="hidden" value={birthTime} />
        {isTimePickerOpen ? (
          <ChartBirthTimePicker
            copy={copy}
            value={birthTime}
            disabled={timeDisabled}
            onChange={(nextTime) => {
              if (nextTime !== birthTime) setBirthTimeDstOccurrence(null);
              setBirthTime(nextTime);
              setIsTimePickerOpen(false);
            }}
          />
        ) : null}
      </div>
      <label className={styles.birthDataSelectField}>
        <span className={styles.birthDataLabel}>{occurrenceCopy.label}</span>
        <select
          aria-describedby="chart-birth-time-occurrence-helper"
          aria-label={occurrenceCopy.label}
          name="birthTimeDstOccurrence"
          value={birthTimeDstOccurrence ?? ""}
          disabled={timeDisabled || !birthTime || !birthTimezone}
          onChange={(event) =>
            setBirthTimeDstOccurrence(
              event.target.value === "first" || event.target.value === "second"
                ? event.target.value
                : null
            )
          }
        >
          <option value="">{occurrenceCopy.none}</option>
          <option value="first">{occurrenceCopy.first}</option>
          <option value="second">{occurrenceCopy.second}</option>
        </select>
        <small className={styles.birthDataOccurrenceHelper} id="chart-birth-time-occurrence-helper">
          {occurrenceCopy.helper}
        </small>
      </label>
      <label className={styles.birthDataPlaceField}>
        <span className={styles.birthDataLabel}>{copy.birthData.place}</span>
        <div className={styles.birthPlaceAutocomplete}>
          <input
            name="birthPlaceText"
            type="text"
            value={birthPlaceText}
            disabled={disabled}
            placeholder={copy.birthData.placePlaceholder}
            autoComplete="off"
            onChange={(event) => {
              setBirthPlaceText(event.target.value);
              setSelectedPlaceText("");
              setBirthCountryCode(null);
              setBirthCity(null);
              setBirthRegion(null);
              if (birthTimezone) setBirthTimeDstOccurrence(null);
              setBirthTimezone("");
              setBirthLatitude("");
              setBirthLongitude("");
              setPlaceCandidates([]);
              setPlaceSearchError(null);
            }}
          />
          {isSearchingPlace ? (
            <span className={styles.birthPlaceSearchState} role="status">
              {copy.birthData.searchingPlace}
            </span>
          ) : null}
          {placeCandidates.length > 0 ? (
            <div
              className={styles.birthPlaceCandidates}
              role="listbox"
              aria-label={copy.birthData.placeOptions}
            >
              {placeCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPlaceCandidate(candidate)}
                  disabled={disabled}
                >
                  <strong>{candidate.placeName}</strong>
                  <span>{[candidate.region, candidate.timezone].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </label>
      {placeSearchError ? <p className={styles.birthDataError}>{placeSearchError}</p> : null}
      {birthTimezone && birthLatitude && birthLongitude ? (
        <p className={styles.birthPlaceResolved}>
          {birthTimezone} · {birthLatitude}, {birthLongitude}
        </p>
      ) : null}
      <details className={styles.birthDataManualFields}>
        <summary>{copy.birthData.manualCoordinates}</summary>
        <label>
          <span>{copy.birthData.timezone}</span>
          <input
            name="birthTimezone"
            type="text"
            value={birthTimezone}
            disabled={disabled}
            placeholder="Europe/Moscow"
            onChange={(event) => {
              if (event.target.value !== birthTimezone) setBirthTimeDstOccurrence(null);
              setBirthTimezone(event.target.value);
            }}
          />
        </label>
        <div className={styles.birthDataGrid}>
          <label>
            <span>{copy.birthData.latitude}</span>
            <input
              name="birthLatitude"
              type="number"
              step="0.0001"
              value={birthLatitude}
              disabled={disabled}
              onChange={(event) => setBirthLatitude(event.target.value)}
            />
          </label>
          <label>
            <span>{copy.birthData.longitude}</span>
            <input
              name="birthLongitude"
              type="number"
              step="0.0001"
              value={birthLongitude}
              disabled={disabled}
              onChange={(event) => setBirthLongitude(event.target.value)}
            />
          </label>
        </div>
      </details>
      {errorMessage ? <p className={styles.birthDataError}>{errorMessage}</p> : null}
      <button className={styles.birthDataSaveButton} type="submit" disabled={disabled}>
        {isSaving ? copy.birthData.saving : copy.birthData.save}
      </button>
    </form>
  );
}

function normalizeTextField(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumberField(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBirthPlaceSearchError(error: unknown, copy: ChartEngineCopy): string {
  if (
    error instanceof Error &&
    !/HTTP request failed|status\s+(?:429|5\d\d)/i.test(error.message)
  ) {
    return error.message;
  }
  return copy.birthData.placeSearchError;
}
