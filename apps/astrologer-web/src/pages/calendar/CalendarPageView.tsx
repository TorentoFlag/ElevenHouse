import type { SupportedLocale } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { CalendarSummaryPanel } from "./components/CalendarSummaryPanel";
import { AvailabilityEditorPanel } from "./components/AvailabilityEditorPanel";
import { CalendarToolbar } from "./components/CalendarToolbar";
import { CalendarWorkspace } from "./components/CalendarWorkspace";
import { BookingDetailPanel } from "./components/BookingDetailPanel";
import { ManualBookingDialog } from "../../features/bookings/components/ManualBookingDialog";
import type { useCalendarPageController } from "./useCalendarPageController";
import styles from "./CalendarPage.module.css";

export type CalendarPageViewProps = {
  readonly copy: AstrologerCopy["calendar"];
  readonly locale: SupportedLocale;
  readonly calendar: ReturnType<typeof useCalendarPageController>;
};

export function CalendarPageView({ copy, locale, calendar }: CalendarPageViewProps) {
  return (
    <section className={styles.calendarPage} aria-label={copy.title}>
      <CalendarToolbar
        copy={copy}
        view={calendar.view}
        rangeLabel={calendar.rangeLabel}
        isAvailabilityMode={calendar.isAvailabilityMode}
        isSummaryPanelOpen={calendar.isSummaryPanelOpen}
        onPrevious={calendar.onPrevious}
        onToday={calendar.onToday}
        onNext={calendar.onNext}
        onSetView={calendar.onSetView}
        onSetAvailabilityMode={calendar.onSetAvailabilityMode}
        onSetSummaryPanelOpen={calendar.onSetSummaryPanelOpen}
        onOpenManualBooking={calendar.onOpenManualBooking}
      />

      {calendar.isAvailabilityMode ? (
        <div className={styles.availabilityInstruction}>{copy.availabilityEditor.instruction}</div>
      ) : null}

      <div className={styles.body}>
        <CalendarWorkspace
          copy={copy}
          locale={locale}
          timeZone={calendar.timeZone}
          today={calendar.today}
          view={calendar.view}
          rangeLabel={calendar.rangeLabel}
          range={calendar.range}
          entries={calendar.entries}
          availability={calendar.availability}
          isLoading={calendar.isLoading}
          isFetching={calendar.isFetching}
          isError={calendar.isError}
          onRetry={calendar.onRetry}
          onOpenDate={calendar.onOpenDate}
          onSelectEntry={calendar.onSelectEntry}
          onOpenManualBooking={calendar.onOpenManualBooking}
        />

        {calendar.isAvailabilityMode ? (
          <AvailabilityEditorPanel
            copy={copy.availabilityEditor}
            timeZone={calendar.timeZone}
            schedule={calendar.schedule}
            products={calendar.availabilityProducts}
            isLoading={calendar.isAvailabilityLoading}
            isError={calendar.isAvailabilityError}
            isProductsLoading={calendar.isAvailabilityProductsLoading}
            isProductsError={calendar.isAvailabilityProductsError}
            isSaving={calendar.isCommandPending}
            onRetry={calendar.onRetryAvailability}
            onSave={calendar.onSaveSchedule}
          />
        ) : calendar.dialog === "booking_detail" && calendar.selectedEntry?.kind === "booking" ? (
          <>
            <div
              className={styles.mobileSheetBackdrop}
              data-mobile-sheet-backdrop="true"
              aria-hidden="true"
            />
            <BookingDetailPanel
              copy={copy.bookingDetail}
              locale={locale}
              timeZone={calendar.timeZone}
              entry={calendar.selectedEntry}
              booking={calendar.selectedBooking}
              isLoading={calendar.isBookingDetailLoading}
              isError={calendar.isBookingDetailError}
              onRetry={calendar.onRetryBookingDetail}
              onClose={calendar.onCloseDialog}
            />
          </>
        ) : calendar.isSummaryPanelOpen ? (
          <CalendarSummaryPanel locale={locale} summary={calendar.summary} />
        ) : null}
      </div>

      {calendar.conflictMessage ? (
        <div className={styles.liveAlert} role="alert" aria-live="assertive">
          {calendar.conflictMessage}
        </div>
      ) : null}

      {calendar.dialog === "manual_booking" ? (
        <ManualBookingDialog
          copy={copy.manualBooking}
          locale={locale}
          range={calendar.range}
          schedule={calendar.schedule}
          products={calendar.availabilityProducts}
          prefillStartAt={calendar.manualBookingStartAt}
          isProductsLoading={
            calendar.isAvailabilityLoading || calendar.isAvailabilityProductsLoading
          }
          isProductsError={
            calendar.isAvailabilityError || calendar.isAvailabilityProductsError
          }
          isCreating={calendar.isBookingCreating}
          conflictMessage={calendar.conflictMessage}
          onRetryProducts={calendar.onRetryManualBookingResources}
          onClose={calendar.onCloseDialog}
          onCreate={calendar.onCreateManualBooking}
        />
      ) : null}
    </section>
  );
}
