import { useEffect, useState } from "react";
import type {
  ChartHoraryQuestionCategory,
  ClientBirthPlaceCandidate,
  DictionaryLocale
} from "@elevenhouse/contracts";
import {
  chartDstOccurrenceCopyByLocale,
  updateChartCivilMoment,
  type ChartDstOccurrence
} from "../model/chartCivilTimeOccurrence";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import type { ChartHoraryQuestionInput, ChartTransitMomentInput } from "../model/chartEngineInput";
import type { ChartEngineMode } from "../model/chartEngineMode";
import styles from "./ChartMomentControls.module.css";

export function ChartMomentControls({
  activeMode,
  copy,
  disabled,
  horaryPlaceErrorMessage,
  horaryLayout = "toolbar",
  horaryPlaceText,
  horaryQuestion,
  locale,
  onClearHoraryPlace,
  onHoraryQuestionChange,
  onProgressionTargetDateChange,
  onSearchBirthPlaces,
  onSelectHoraryPlace,
  onSolarReturnYearChange,
  onTransitMomentChange,
  progressionTargetDate,
  solarReturnYear,
  transitMoment
}: {
  readonly activeMode: ChartEngineMode;
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly horaryQuestion: ChartHoraryQuestionInput;
  readonly horaryPlaceErrorMessage: string | null;
  readonly horaryLayout?: "setup" | "toolbar";
  readonly horaryPlaceText: string;
  readonly locale: DictionaryLocale;
  readonly onHoraryQuestionChange: (question: ChartHoraryQuestionInput) => void;
  readonly onClearHoraryPlace?: () => void;
  readonly onProgressionTargetDateChange: (date: string) => void;
  readonly onSolarReturnYearChange?: (year: number) => void;
  readonly onSearchBirthPlaces?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
  readonly onSelectHoraryPlace?: (candidate: ClientBirthPlaceCandidate) => void;
  readonly onTransitMomentChange: (moment: ChartTransitMomentInput) => void;
  readonly progressionTargetDate: string;
  readonly solarReturnYear: number;
  readonly transitMoment: ChartTransitMomentInput;
}) {
  if (activeMode === "transit") {
    return (
      <TransitMomentFields
        copy={copy}
        disabled={disabled}
        locale={locale}
        value={transitMoment}
        onChange={onTransitMomentChange}
      />
    );
  }
  if (activeMode === "solar_return") {
    return (
      <SolarReturnYearField
        copy={copy}
        disabled={disabled}
        value={solarReturnYear}
        onChange={onSolarReturnYearChange}
      />
    );
  }
  if (activeMode === "progression") {
    return (
      <ProgressionTargetDateField
        copy={copy}
        disabled={disabled}
        value={progressionTargetDate}
        onChange={onProgressionTargetDateChange}
      />
    );
  }
  if (activeMode === "horary") {
    return (
      <HoraryQuestionFields
        copy={copy}
        disabled={disabled}
        layout={horaryLayout}
        locale={locale}
        placeErrorMessage={horaryPlaceErrorMessage}
        placeText={horaryPlaceText}
        value={horaryQuestion}
        onChange={onHoraryQuestionChange}
        onClearPlace={onClearHoraryPlace}
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSelectPlace={onSelectHoraryPlace}
      />
    );
  }
  return null;
}

function TransitMomentFields({
  copy,
  disabled,
  locale,
  onChange,
  value
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly locale: DictionaryLocale;
  readonly onChange: (moment: ChartTransitMomentInput) => void;
  readonly value: ChartTransitMomentInput;
}) {
  return (
    <div className={styles.transitMomentFields}>
      <label>
        <span>{copy.moment.transitDate}</span>
        <input
          aria-label={copy.moment.transitDate}
          disabled={disabled}
          name="transitDate"
          type="date"
          value={value.date}
          onChange={(event) =>
            onChange(updateChartCivilMoment(value, { date: event.target.value }))
          }
        />
      </label>
      <label>
        <span>{copy.moment.transitTime}</span>
        <input
          aria-label={copy.moment.transitTime}
          disabled={disabled}
          name="transitTime"
          type="time"
          value={value.time}
          onChange={(event) =>
            onChange(updateChartCivilMoment(value, { time: event.target.value }))
          }
        />
      </label>
      <OccurrenceField
        disabled={disabled}
        id="chart-transit-occurrence-helper"
        locale={locale}
        value={value.dstOccurrence}
        onChange={(dstOccurrence) => onChange(updateChartCivilMoment(value, { dstOccurrence }))}
      />
    </div>
  );
}

function SolarReturnYearField({
  copy,
  disabled,
  onChange,
  value
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly onChange?: (year: number) => void;
  readonly value: number;
}) {
  return (
    <div className={`${styles.transitMomentFields} ${styles.solarReturnYearField}`}>
      <label>
        <span>{copy.moment.solarYear}</span>
        <input
          aria-label={copy.moment.solarYear}
          disabled={disabled}
          max={2100}
          min={1900}
          name="solarReturnYear"
          type="number"
          value={value}
          onChange={(event) => {
            const year = Number(event.target.value);
            if (Number.isFinite(year)) onChange?.(year);
          }}
        />
      </label>
    </div>
  );
}

function ProgressionTargetDateField({
  copy,
  disabled,
  onChange,
  value
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly onChange: (date: string) => void;
  readonly value: string;
}) {
  return (
    <div className={`${styles.transitMomentFields} ${styles.solarReturnYearField}`}>
      <label>
        <span>{copy.moment.progressionDate}</span>
        <input
          aria-label={copy.moment.progressionDate}
          disabled={disabled}
          name="progressionTargetDate"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function HoraryQuestionFields({
  copy,
  disabled,
  layout,
  locale,
  onChange,
  onClearPlace,
  onSearchBirthPlaces,
  onSelectPlace,
  placeErrorMessage,
  placeText,
  value
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly layout: "setup" | "toolbar";
  readonly locale: DictionaryLocale;
  readonly onChange: (question: ChartHoraryQuestionInput) => void;
  readonly onClearPlace?: () => void;
  readonly onSearchBirthPlaces?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
  readonly onSelectPlace?: (candidate: ClientBirthPlaceCandidate) => void;
  readonly placeErrorMessage: string | null;
  readonly placeText: string;
  readonly value: ChartHoraryQuestionInput;
}) {
  return (
    <div
      className={
        layout === "setup"
          ? `${styles.horaryQuestionFields} ${styles.horaryQuestionFieldsSetup}`
          : styles.horaryQuestionFields
      }
    >
      <label className={styles.horaryQuestionText}>
        <span>{copy.horary.question}</span>
        <input
          aria-label={copy.horary.questionAria}
          disabled={disabled}
          maxLength={500}
          name="horaryQuestion"
          placeholder={copy.horary.questionPlaceholder}
          type="text"
          value={value.question}
          onChange={(event) => onChange({ ...value, question: event.target.value })}
        />
      </label>
      <label>
        <span>{copy.horary.category}</span>
        <select
          aria-label={copy.horary.categoryAria}
          disabled={disabled}
          name="horaryCategory"
          value={value.category}
          onChange={(event) =>
            onChange({
              ...value,
              category: event.target.value as ChartHoraryQuestionCategory
            })
          }
        >
          {(Object.keys(copy.horary.categories) as ChartHoraryQuestionCategory[]).map(
            (category) => (
              <option key={category} value={category}>
                {copy.horary.categories[category]}
              </option>
            )
          )}
        </select>
      </label>
      <label>
        <span>{copy.horary.date}</span>
        <input
          aria-label={copy.horary.dateAria}
          disabled={disabled}
          name="horaryDate"
          type="date"
          value={value.date}
          onChange={(event) =>
            onChange(updateChartCivilMoment(value, { date: event.target.value }))
          }
        />
      </label>
      <label>
        <span>{copy.horary.time}</span>
        <input
          aria-label={copy.horary.timeAria}
          disabled={disabled}
          name="horaryTime"
          type="time"
          value={value.time}
          onChange={(event) =>
            onChange(updateChartCivilMoment(value, { time: event.target.value }))
          }
        />
      </label>
      <HoraryPlaceField
        copy={copy}
        disabled={disabled}
        errorMessage={placeErrorMessage}
        selectedPlaceText={placeText}
        onClear={onClearPlace}
        onSearch={onSearchBirthPlaces}
        onSelect={onSelectPlace}
      />
      <label>
        <span>{copy.horary.timezone}</span>
        <input
          aria-label={copy.horary.timezoneAria}
          disabled={disabled}
          name="horaryTimezone"
          placeholder="Europe/Moscow"
          type="text"
          value={value.timezone}
          onChange={(event) =>
            onChange(updateChartCivilMoment(value, { timezone: event.target.value }))
          }
        />
      </label>
      <OccurrenceField
        disabled={disabled}
        id="chart-horary-occurrence-helper"
        locale={locale}
        value={value.dstOccurrence}
        onChange={(dstOccurrence) => onChange(updateChartCivilMoment(value, { dstOccurrence }))}
      />
      <label>
        <span>{copy.horary.latitude}</span>
        <input
          aria-label={copy.horary.latitudeAria}
          disabled={disabled}
          name="horaryLatitude"
          step="0.0001"
          type="number"
          value={value.latitude}
          onChange={(event) => onChange({ ...value, latitude: event.target.value })}
        />
      </label>
      <label>
        <span>{copy.horary.longitude}</span>
        <input
          aria-label={copy.horary.longitudeAria}
          disabled={disabled}
          name="horaryLongitude"
          step="0.0001"
          type="number"
          value={value.longitude}
          onChange={(event) => onChange({ ...value, longitude: event.target.value })}
        />
      </label>
    </div>
  );
}

function HoraryPlaceField({
  copy,
  disabled,
  errorMessage,
  onClear,
  onSearch,
  onSelect,
  selectedPlaceText
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly errorMessage: string | null;
  readonly onClear?: () => void;
  readonly onSearch?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
  readonly onSelect?: (candidate: ClientBirthPlaceCandidate) => void;
  readonly selectedPlaceText: string;
}) {
  const [query, setQuery] = useState(selectedPlaceText);
  const [candidates, setCandidates] = useState<readonly ClientBirthPlaceCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => setQuery(selectedPlaceText), [selectedPlaceText]);
  useEffect(() => {
    const normalized = query.trim();
    if (!onSearch || disabled || normalized.length < 3 || normalized === selectedPlaceText) {
      setCandidates([]);
      setIsSearching(false);
      return;
    }
    let active = true;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void onSearch(normalized)
        .then((nextCandidates) => {
          if (active) setCandidates(nextCandidates);
        })
        .catch(() => {
          if (active) setCandidates([]);
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [disabled, onSearch, query, selectedPlaceText]);

  return (
    <div className={styles.horaryPlaceField}>
      <label>
        <span>{copy.horary.place}</span>
        <input
          aria-label={copy.horary.placeAria}
          autoComplete="off"
          disabled={disabled}
          name="horaryPlace"
          placeholder={copy.horary.placePlaceholder}
          type="text"
          value={query}
          onChange={(event) => {
            if (selectedPlaceText) onClear?.();
            setQuery(event.target.value);
          }}
        />
      </label>
      {isSearching ? <small>{copy.horary.placeSearching}</small> : null}
      {candidates.length > 0 ? (
        <div
          className={styles.horaryPlaceCandidates}
          role="listbox"
          aria-label={copy.horary.placeOptions}
        >
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              role="option"
              type="button"
              onClick={() => {
                setQuery(candidate.placeName);
                setCandidates([]);
                onSelect?.(candidate);
              }}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      ) : null}
      {selectedPlaceText ? <small>{copy.horary.placeSelected(selectedPlaceText)}</small> : null}
      {errorMessage ? (
        <small className={styles.horaryPlaceError} role="alert">
          {errorMessage}
        </small>
      ) : null}
    </div>
  );
}

function OccurrenceField({
  disabled,
  id,
  locale,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly id: string;
  readonly locale: DictionaryLocale;
  readonly onChange: (value: ChartDstOccurrence | undefined) => void;
  readonly value?: ChartDstOccurrence;
}) {
  const copy = chartDstOccurrenceCopyByLocale[locale];
  return (
    <label className={styles.civilTimeOccurrenceField}>
      <span>{copy.label}</span>
      <select
        aria-describedby={id}
        aria-label={copy.label}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === "first" || event.target.value === "second"
              ? event.target.value
              : undefined
          )
        }
      >
        <option value="">{copy.none}</option>
        <option value="first">{copy.first}</option>
        <option value="second">{copy.second}</option>
      </select>
      <small id={id}>{copy.helper}</small>
    </label>
  );
}
