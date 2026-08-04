import type { ClientBirthPlaceCandidate } from "@elevenhouse/contracts";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./BirthPlaceAutocomplete.module.css";

const SEARCH_DEBOUNCE_MS = 800;
const MIN_QUERY_LENGTH = 3;

export type BirthPlaceAutocompleteCopy = {
  readonly label: string;
  readonly placeholder: string;
  readonly searching: string;
  readonly empty: string;
  readonly error: string;
  readonly retry: string;
  readonly resolved: string;
};

export type BirthPlaceAutocompleteProps = {
  readonly copy: BirthPlaceAutocompleteCopy;
  readonly disabled: boolean;
  readonly inputId?: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly name?: string;
  readonly selectedPlaceText: string | null;
  readonly timezone: string | null;
  readonly validationError?: string | null;
  readonly value: string;
  readonly onQueryChange: (value: string) => void;
  readonly onSelect: (candidate: ClientBirthPlaceCandidate) => void;
  readonly onSearch: (
    query: string,
    signal: AbortSignal
  ) => Promise<readonly ClientBirthPlaceCandidate[]>;
};

type SearchStatus = "idle" | "searching" | "ready" | "empty" | "error";

export function BirthPlaceAutocomplete({
  copy,
  disabled,
  inputId: providedInputId,
  latitude,
  longitude,
  name,
  selectedPlaceText,
  timezone,
  validationError = null,
  value,
  onQueryChange,
  onSelect,
  onSearch
}: BirthPlaceAutocompleteProps) {
  const generatedId = useId();
  const inputId = providedInputId ?? `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const statusId = `${generatedId}-status`;
  const validationId = `${generatedId}-validation`;
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [candidates, setCandidates] = useState<readonly ClientBirthPlaceCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestVersion = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const normalizedValue = normalizeQuery(value);
  const normalizedSelection = normalizeQuery(selectedPlaceText ?? "");
  const hasResolvedSelection =
    normalizedSelection.length > 0 &&
    normalizedSelection === normalizedValue &&
    Boolean(timezone) &&
    isFiniteCoordinate(latitude) &&
    isFiniteCoordinate(longitude);

  useEffect(() => {
    const version = ++requestVersion.current;
    activeController.current?.abort();
    activeController.current = null;

    if (disabled || normalizedValue.length < MIN_QUERY_LENGTH || hasResolvedSelection) {
      setCandidates([]);
      setActiveIndex(-1);
      setIsOpen(false);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    activeController.current = controller;
    setCandidates([]);
    setActiveIndex(-1);
    setIsOpen(true);
    setStatus("searching");

    const timer = window.setTimeout(() => {
      void onSearch(normalizedValue, controller.signal)
        .then((nextCandidates) => {
          if (controller.signal.aborted || requestVersion.current !== version) {
            return;
          }

          setCandidates(nextCandidates);
          setActiveIndex(-1);
          setIsOpen(true);
          setStatus(nextCandidates.length > 0 ? "ready" : "empty");
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            requestVersion.current !== version ||
            isAbortError(error)
          ) {
            return;
          }

          setCandidates([]);
          setActiveIndex(-1);
          setIsOpen(true);
          setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (activeController.current === controller) {
        activeController.current = null;
      }
    };
  }, [disabled, hasResolvedSelection, normalizedValue, onSearch, retryRevision]);

  function selectCandidate(candidate: ClientBirthPlaceCandidate) {
    requestVersion.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setCandidates([]);
    setActiveIndex(-1);
    setIsOpen(false);
    setStatus("idle");
    onSelect(candidate);
  }

  function dismissSearch() {
    requestVersion.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setIsOpen(false);
    setActiveIndex(-1);
    if (status !== "ready") {
      setCandidates([]);
      setStatus("idle");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        dismissSearch();
      }
      return;
    }

    if (event.key === "ArrowDown" && !isOpen && candidates.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex(0);
      return;
    }

    if (!isOpen || candidates.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % candidates.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? candidates.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const candidate = candidates[activeIndex];
      if (candidate) {
        selectCandidate(candidate);
      }
    }
  }

  const activeDescendant =
    isOpen && activeIndex >= 0 ? `${generatedId}-option-${activeIndex}` : undefined;
  const describedBy = [
    status !== "idle" || hasResolvedSelection ? statusId : null,
    validationError ? validationId : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={styles.field}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          dismissSearch();
        }
      }}
    >
      <label htmlFor={inputId}>{copy.label}</label>
      <div className={styles.control}>
        <input
          id={inputId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={describedBy || undefined}
          aria-expanded={isOpen && status === "ready"}
          aria-invalid={validationError ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          name={name}
          placeholder={copy.placeholder}
          role="combobox"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setCandidates([]);
            setActiveIndex(-1);
            setIsOpen(false);
            setStatus("idle");
            onQueryChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />

        {isOpen && status === "ready" && candidates.length > 0 ? (
          <div className={styles.listbox} id={listboxId} role="listbox">
            {candidates.map((candidate, index) => (
              <button
                key={candidate.id}
                aria-label={candidate.placeName}
                aria-selected={index === activeIndex}
                className={styles.option}
                id={`${generatedId}-option-${index}`}
                role="option"
                type="button"
                onClick={() => selectCandidate(candidate)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{candidate.placeName}</span>
                {candidate.label !== candidate.placeName ? <small>{candidate.label}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {status === "searching" ? (
        <p className={styles.supportingText} id={statusId} role="status">
          {copy.searching}
        </p>
      ) : null}
      {status === "empty" ? (
        <p className={styles.supportingText} id={statusId} role="status">
          {copy.empty}
        </p>
      ) : null}
      {status === "error" ? (
        <div className={styles.error} id={statusId} role="alert">
          <span>{copy.error}</span>
          <button
            disabled={disabled}
            type="button"
            onClick={() => setRetryRevision((revision) => revision + 1)}
          >
            {copy.retry}
          </button>
        </div>
      ) : null}
      {hasResolvedSelection ? (
        <p className={styles.resolved} id={statusId} role="status">
          {copy.resolved}: {timezone} · {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
        </p>
      ) : null}
      {validationError ? (
        <p className={styles.validationError} id={validationId} role="alert">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isFiniteCoordinate(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCoordinate(value: number | null): string {
  return isFiniteCoordinate(value) ? value.toFixed(4).replace(/\.?0+$/, "") : "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
