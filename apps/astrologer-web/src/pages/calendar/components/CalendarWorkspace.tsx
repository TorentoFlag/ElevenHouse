import type { AvailabilityBackground, CalendarEntry, CalendarView } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { FullCalendarRenderer } from "../../../features/calendar/components/FullCalendarRenderer";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "../CalendarPage.module.css";

type CalendarWorkspaceProps = {
  readonly copy: AstrologerCopy["calendar"];
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly view: CalendarView;
  readonly range: { readonly start: string; readonly end: string };
  readonly entries: readonly CalendarEntry[];
  readonly availability: readonly AvailabilityBackground[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly onRetry: () => unknown;
  readonly onSelectEntry: (entry: CalendarEntry) => void;
  readonly onOpenManualBooking: (selection?: { readonly start: string; readonly end: string }) => void;
};

export function CalendarWorkspace({
  copy,
  locale,
  timeZone,
  view,
  range,
  entries,
  availability,
  isLoading,
  isFetching,
  isError,
  onRetry,
  onSelectEntry,
  onOpenManualBooking
}: CalendarWorkspaceProps) {
  return (
    <main className={styles.workspace} aria-busy={isLoading || isFetching}>
      <div className={styles.calendarCanvas}>
        <FullCalendarRenderer
          view={view}
          locale={locale}
          timeZone={timeZone}
          visibleRange={range}
          entries={entries}
          availability={availability}
          onRangeChange={() => undefined}
          onEntryActivate={(entryId) => {
            const entry = entries.find((candidate) => candidate.id === entryId);
            if (entry) onSelectEntry(entry);
          }}
          onEmptyRangeSelect={onOpenManualBooking}
        />
      </div>

      {isLoading ? <div className={styles.stateOverlay}>{copy.loadingLabel}</div> : null}
      {isError ? (
        <div className={styles.stateOverlay} role="alert">
          <span>{copy.errorLabel}</span>
          <button className={styles.ghostButton} type="button" onClick={() => void onRetry()}>
            {copy.retryLabel}
          </button>
        </div>
      ) : null}
    </main>
  );
}
