import type { CalendarView } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "../CalendarPage.module.css";

type CalendarToolbarProps = {
  readonly copy: AstrologerCopy["calendar"];
  readonly view: CalendarView;
  readonly rangeLabel: string;
  readonly isAvailabilityMode: boolean;
  readonly isSummaryPanelOpen: boolean;
  readonly onPrevious: () => void;
  readonly onToday: () => void;
  readonly onNext: () => void;
  readonly onSetView: (view: CalendarView) => void;
  readonly onSetAvailabilityMode: (enabled: boolean) => void;
  readonly onSetSummaryPanelOpen: (open: boolean) => void;
  readonly onOpenManualBooking: () => void;
};

export function CalendarToolbar({
  copy,
  view,
  rangeLabel,
  isAvailabilityMode,
  isSummaryPanelOpen,
  onPrevious,
  onToday,
  onNext,
  onSetView,
  onSetAvailabilityMode,
  onSetSummaryPanelOpen,
  onOpenManualBooking
}: CalendarToolbarProps) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.navigationGroup} aria-label={copy.title} role="group">
        <button
          className={styles.iconButton}
          type="button"
          aria-label={copy.previousLabel}
          onClick={onPrevious}
        >
          <Icon iconName="chevronLeft" width={18} height={18} aria-hidden="true" />
        </button>
        <button className={styles.ghostButton} type="button" onClick={onToday}>
          {copy.todayLabel}
        </button>
        <button
          className={styles.iconButton}
          type="button"
          aria-label={copy.nextLabel}
          onClick={onNext}
        >
          <Icon iconName="chevronRight" width={18} height={18} aria-hidden="true" />
        </button>
      </div>

      <strong className={styles.rangeLabel}>{rangeLabel}</strong>
      <span className={styles.toolbarSpacer} aria-hidden="true" />

      <div className={styles.viewSwitcher} aria-label={copy.title} role="group">
        {(["day", "week", "month"] as const).map((candidate) => (
          <button
            className={styles.viewButton}
            data-active={candidate === view}
            key={candidate}
            type="button"
            aria-pressed={candidate === view}
            onClick={() => onSetView(candidate)}
          >
            {copy.views[candidate]}
          </button>
        ))}
      </div>

      <button
        className={styles.ghostButton}
        data-active={isAvailabilityMode}
        type="button"
        aria-pressed={isAvailabilityMode}
        onClick={() => onSetAvailabilityMode(!isAvailabilityMode)}
      >
        <Icon
          iconName={isAvailabilityMode ? "check" : "clock"}
          width={15}
          height={15}
          aria-hidden="true"
        />
        {isAvailabilityMode ? copy.availabilityDoneLabel : copy.availabilityLabel}
      </button>

      <button
        className={styles.ghostButton}
        type="button"
        onClick={() => onSetSummaryPanelOpen(!isSummaryPanelOpen)}
      >
        <Icon iconName="layoutGrid" width={15} height={15} aria-hidden="true" />
        {isSummaryPanelOpen ? copy.hidePanelLabel : copy.showPanelLabel}
      </button>

      <button className={styles.brandButton} type="button" onClick={onOpenManualBooking}>
        <Icon iconName="plus" width={15} height={15} aria-hidden="true" />
        {copy.createBookingLabel}
      </button>
    </header>
  );
}
