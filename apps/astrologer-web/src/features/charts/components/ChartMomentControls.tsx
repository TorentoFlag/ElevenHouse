import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
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
import { getChartTimeZoneGroups } from "../model/chartTimeZones";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { ChartBirthDatePicker, formatBirthDateButtonLabel } from "./ChartBirthDatePicker";
import { ChartBirthTimePicker } from "./ChartBirthTimePicker";
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
  const [openPicker, setOpenPicker] = useState<"date" | "time" | null>(null);
  const timeZoneGroups = getChartTimeZoneGroups(value.timezone);
  const datePickerButtonRef = useRef<HTMLButtonElement>(null);
  const timePickerButtonRef = useRef<HTMLButtonElement>(null);
  const datePickerOverlayRef = useRef<HTMLDivElement>(null);
  const timePickerOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openPicker) return;

    const overlay =
      openPicker === "date" ? datePickerOverlayRef.current : timePickerOverlayRef.current;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        datePickerButtonRef.current?.contains(event.target) ||
        timePickerButtonRef.current?.contains(event.target) ||
        overlay?.contains(event.target)
      ) {
        return;
      }
      setOpenPicker(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPicker(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPicker]);

  return (
    <div
      className={
        layout === "setup"
          ? `${styles.horaryQuestionFields} ${styles.horaryQuestionFieldsSetup}`
          : styles.horaryQuestionFields
      }
    >
      <section
        aria-label={copy.horary.question}
        className={layout === "setup" ? styles.horarySetupQuestionGroup : styles.horaryToolbarGroup}
      >
        <p className={styles.horarySetupGroupTitle}>
          <Icon iconName="chat" width={15} height={15} aria-hidden="true" />
          {copy.horary.question}
        </p>
        <label className={styles.horaryQuestionText}>
          <span>{layout === "setup" ? copy.horary.questionPrompt : copy.horary.question}</span>
          <textarea
            aria-label={copy.horary.questionAria}
            disabled={disabled}
            maxLength={500}
            name="horaryQuestion"
            placeholder={copy.horary.questionPlaceholder}
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
        {layout === "setup" ? (
          <p className={styles.horaryQuestionHint}>{copy.horary.questionHint}</p>
        ) : null}
      </section>
      <section
        aria-label={copy.horary.preparationMoment}
        className={layout === "setup" ? styles.horarySetupMomentGroup : styles.horaryToolbarGroup}
      >
        <p className={styles.horarySetupGroupTitle}>
          <Icon iconName="clock" width={15} height={15} aria-hidden="true" />
          {layout === "setup" ? copy.horary.momentTitle : copy.horary.preparationMoment}
        </p>
        {layout === "setup" ? (
          <div className={styles.horaryPickerField}>
            <span>{copy.horary.date}</span>
            <button
              ref={datePickerButtonRef}
              aria-expanded={openPicker === "date"}
              aria-label={`${copy.horary.date}: ${formatBirthDateButtonLabel(value.date, copy)}`}
              className={styles.horaryPickerButton}
              disabled={disabled}
              name="horaryDatePicker"
              type="button"
              onClick={() => setOpenPicker((current) => (current === "date" ? null : "date"))}
            >
              <strong>{formatBirthDateButtonLabel(value.date, copy)}</strong>
              <Icon iconName="calendar" width={16} height={16} aria-hidden="true" />
            </button>
            <input name="horaryDate" type="hidden" value={value.date} />
            {openPicker === "date" && datePickerButtonRef.current ? (
              <HoraryPickerOverlay
                anchor={datePickerButtonRef.current}
                overlayRef={datePickerOverlayRef}
              >
                <ChartBirthDatePicker
                  copy={copy}
                  disabled={disabled}
                  value={value.date}
                  onChange={(date) => {
                    onChange(updateChartCivilMoment(value, { date }));
                    setOpenPicker(null);
                  }}
                />
              </HoraryPickerOverlay>
            ) : null}
          </div>
        ) : (
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
        )}
        {layout === "setup" ? (
          <div className={styles.horaryPickerField}>
            <span>{copy.horary.time}</span>
            <button
              ref={timePickerButtonRef}
              aria-expanded={openPicker === "time"}
              aria-label={`${copy.horary.time}: ${value.time || copy.birthData.chooseTime}`}
              className={styles.horaryPickerButton}
              disabled={disabled}
              name="horaryTimePicker"
              type="button"
              onClick={() => setOpenPicker((current) => (current === "time" ? null : "time"))}
            >
              <strong>{value.time || copy.birthData.chooseTime}</strong>
              <Icon iconName="clock" width={16} height={16} aria-hidden="true" />
            </button>
            <input name="horaryTime" type="hidden" value={value.time} />
            {openPicker === "time" && timePickerButtonRef.current ? (
              <HoraryPickerOverlay
                anchor={timePickerButtonRef.current}
                overlayRef={timePickerOverlayRef}
              >
                <ChartBirthTimePicker
                  copy={copy}
                  disabled={disabled}
                  value={value.time}
                  onChange={(time) => {
                    onChange(updateChartCivilMoment(value, { time }));
                    setOpenPicker(null);
                  }}
                />
              </HoraryPickerOverlay>
            ) : null}
          </div>
        ) : (
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
        )}
        <label>
          <span>{copy.horary.timezone}</span>
          <select
            aria-label={copy.horary.timezoneAria}
            disabled={disabled}
            name="horaryTimezone"
            value={value.timezone}
            onChange={(event) =>
              onChange(updateChartCivilMoment(value, { timezone: event.target.value }))
            }
          >
            <option disabled value="">
              —
            </option>
            {timeZoneGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.timeZones.map((timeZone) => (
                  <option key={timeZone} value={timeZone}>
                    {timeZone}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {layout === "setup" ? (
          <details className={styles.horaryOccurrenceDetails}>
            <summary>{chartDstOccurrenceCopyByLocale[locale].helper}</summary>
            <OccurrenceField
              showHelper={false}
              disabled={disabled}
              id="chart-horary-occurrence-helper"
              locale={locale}
              value={value.dstOccurrence}
              onChange={(dstOccurrence) =>
                onChange(updateChartCivilMoment(value, { dstOccurrence }))
              }
            />
          </details>
        ) : (
          <OccurrenceField
            disabled={disabled}
            id="chart-horary-occurrence-helper"
            locale={locale}
            value={value.dstOccurrence}
            onChange={(dstOccurrence) => onChange(updateChartCivilMoment(value, { dstOccurrence }))}
          />
        )}
      </section>
      <section
        aria-label={copy.horary.placeGroup}
        className={layout === "setup" ? styles.horarySetupPlaceGroup : styles.horaryToolbarGroup}
      >
        <p className={styles.horarySetupGroupTitle}>
          <Icon iconName="pin" width={15} height={15} aria-hidden="true" />
          {copy.horary.place}
        </p>
        <HoraryPlaceField
          copy={copy}
          disabled={disabled}
          errorMessage={placeErrorMessage}
          selectedPlaceText={placeText}
          onClear={onClearPlace}
          onSearch={onSearchBirthPlaces}
          onSelect={onSelectPlace}
        />
        {layout === "setup" ? (
          <details className={styles.horaryManualCoordinates}>
            <summary>{copy.horary.manualCoordinates}</summary>
            <div className={styles.horaryManualCoordinatesFields}>
              <HoraryCoordinateFields
                disabled={disabled}
                copy={copy}
                value={value}
                onChange={onChange}
              />
            </div>
          </details>
        ) : (
          <HoraryCoordinateFields
            disabled={disabled}
            copy={copy}
            value={value}
            onChange={onChange}
          />
        )}
      </section>
    </div>
  );
}

function HoraryPickerOverlay({
  anchor,
  children,
  overlayRef
}: {
  readonly anchor: HTMLButtonElement;
  readonly children: ReactNode;
  readonly overlayRef: RefObject<HTMLDivElement | null>;
}) {
  const [position, setPosition] = useState(() => getHoraryPickerPosition(anchor));

  useLayoutEffect(() => {
    const updatePosition = () => {
      const picker = overlayRef.current?.firstElementChild;
      const pickerBounds = picker?.getBoundingClientRect();
      setPosition(getHoraryPickerPosition(anchor, pickerBounds));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      className={styles.horaryPickerOverlay}
      data-testid="chart-horary-picker-overlay"
      style={position}
    >
      {children}
    </div>,
    document.body
  );
}

function getHoraryPickerPosition(anchor: HTMLButtonElement, pickerBounds?: DOMRect) {
  const anchorBounds = anchor.getBoundingClientRect();
  const offset = 8;
  const viewportGutter = 16;
  const pickerHeight = pickerBounds?.height ?? 0;
  const pickerWidth = pickerBounds?.width ?? 0;
  const spaceBelow = window.innerHeight - anchorBounds.bottom - offset - viewportGutter;
  const spaceAbove = anchorBounds.top - offset - viewportGutter;
  const opensAbove = pickerHeight > spaceBelow && spaceAbove >= pickerHeight;
  const popoverTop = opensAbove
    ? anchorBounds.top - offset - pickerHeight
    : anchorBounds.bottom + offset;
  const popoverLeft = Math.min(
    Math.max(viewportGutter, anchorBounds.left),
    Math.max(viewportGutter, window.innerWidth - pickerWidth - viewportGutter)
  );

  return { left: popoverLeft, top: popoverTop - offset };
}

function HoraryCoordinateFields({
  copy,
  disabled,
  onChange,
  value
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly onChange: (question: ChartHoraryQuestionInput) => void;
  readonly value: ChartHoraryQuestionInput;
}) {
  return (
    <>
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
    </>
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
  const searchRef = useRef(onSearch);

  useEffect(() => setQuery(selectedPlaceText), [selectedPlaceText]);
  useEffect(() => {
    searchRef.current = onSearch;
  }, [onSearch]);
  useEffect(() => {
    const normalized = query.trim();
    const search = searchRef.current;
    if (!search || disabled || normalized.length < 3 || normalized === selectedPlaceText) {
      setCandidates([]);
      setIsSearching(false);
      return;
    }
    let active = true;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void search(normalized)
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
  }, [disabled, query, selectedPlaceText]);

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
      <Icon
        iconName="search"
        className={styles.horaryPlaceSearchIcon}
        width={17}
        height={17}
        aria-hidden="true"
      />
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
  showHelper = true,
  value
}: {
  readonly disabled: boolean;
  readonly id: string;
  readonly locale: DictionaryLocale;
  readonly onChange: (value: ChartDstOccurrence | undefined) => void;
  readonly showHelper?: boolean;
  readonly value?: ChartDstOccurrence;
}) {
  const copy = chartDstOccurrenceCopyByLocale[locale];
  return (
    <label className={styles.civilTimeOccurrenceField}>
      <span>{copy.label}</span>
      <select
        aria-describedby={showHelper ? id : undefined}
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
      {showHelper ? <small id={id}>{copy.helper}</small> : null}
    </label>
  );
}
