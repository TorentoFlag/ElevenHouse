import type { AvailabilityBackground, CalendarEntry, CalendarView } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { FullCalendarRenderer } from "../../../features/calendar/components/FullCalendarRenderer";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarMobileAgenda } from "./CalendarMobileAgenda";
import styles from "../CalendarPage.module.css";

type CalendarWorkspaceProps = {
  readonly copy: AstrologerCopy["calendar"];
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly today: string;
  readonly view: CalendarView;
  readonly rangeLabel: string;
  readonly range: { readonly start: string; readonly end: string };
  readonly entries: readonly CalendarEntry[];
  readonly availability: readonly AvailabilityBackground[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly onRetry: () => unknown;
  readonly onOpenDate: (date: string) => void;
  readonly onSelectEntry: (entry: CalendarEntry) => void;
  readonly onOpenManualBooking: (selection?: { readonly start: string; readonly end: string }) => void;
};

export function CalendarWorkspace({
  copy,
  locale,
  timeZone,
  today,
  view,
  rangeLabel,
  range,
  entries,
  availability,
  isLoading,
  isFetching,
  isError,
  onRetry,
  onOpenDate,
  onSelectEntry,
  onOpenManualBooking
}: CalendarWorkspaceProps) {
  return (
    <main className={styles.workspace} aria-busy={isLoading || isFetching}>
      {view === "month" ? (
        <CalendarMonthView
          copy={copy.monthGrid}
          locale={locale}
          timeZone={timeZone}
          today={today}
          range={range}
          entries={entries}
          availability={availability}
          onOpenDate={onOpenDate}
          onSelectEntry={onSelectEntry}
        />
      ) : (
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
      )}

      <CalendarMobileAgenda
        copy={copy.mobileAgenda}
        locale={locale}
        timeZone={timeZone}
        rangeLabel={rangeLabel}
        entries={entries}
        availability={availability}
        onSelectEntry={onSelectEntry}
        onOpenManualBooking={onOpenManualBooking}
      />

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
