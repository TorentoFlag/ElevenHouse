import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { useI18n } from "@elevenhouse/i18n";
import { useLocation, useNavigate } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { parseBookingCalendarHandoff } from "../../features/bookings/model/bookingNavigation";
import styles from "./CalendarPage.module.css";
import { CalendarPageView } from "./CalendarPageView";
import { useCalendarPageController } from "./useCalendarPageController";

export function CalendarPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const profileQuery = useCurrentAstrologerProfileQuery();
  const location = useLocation();
  const navigate = useNavigate();
  const bookingHandoff = parseBookingCalendarHandoff(location.search);

  useDocumentTitle(dictionary.calendar.documentTitle);

  if (profileQuery.isLoading) {
    return <section aria-busy="true">{dictionary.calendar.loadingLabel}</section>;
  }

  if (profileQuery.isError) {
    return (
      <section>
        <p role="alert">{dictionary.calendar.errorLabel}</p>
        <button type="button" onClick={() => void profileQuery.refetch()}>
          {dictionary.calendar.retryLabel}
        </button>
      </section>
    );
  }

  if (!profileQuery.data?.profile) {
    return (
      <section
        className={styles.profileRequiredState}
        aria-labelledby="calendar-profile-required-title"
      >
        <span className={styles.profileRequiredEyebrow}>{dictionary.calendar.title}</span>
        <div className={styles.profileRequiredText}>
          <h1 id="calendar-profile-required-title">{dictionary.calendar.profileRequired.title}</h1>
          <p>{dictionary.calendar.profileRequired.description}</p>
        </div>
        <Button
          className={styles.profileRequiredAction}
          type="button"
          variant="brand"
          size="big"
          title={dictionary.calendar.profileRequired.settingsLabel}
          onClick={() => navigate("/settings")}
        />
      </section>
    );
  }

  return (
    <CalendarPageContent
      key={bookingHandoff ? `${bookingHandoff.bookingId}:${bookingHandoff.startAt}` : "calendar"}
      bookingHandoff={bookingHandoff}
      copy={dictionary.calendar}
      locale={locale}
      timeZone={profileQuery.data.profile.timezone}
    />
  );
}

function CalendarPageContent({
  bookingHandoff,
  copy,
  locale,
  timeZone
}: {
  readonly bookingHandoff: ReturnType<typeof parseBookingCalendarHandoff>;
  readonly copy: AstrologerCopy["calendar"];
  readonly locale: "ru" | "en";
  readonly timeZone: string;
}) {
  const calendar = useCalendarPageController({ bookingHandoff, copy, locale, timeZone });
  return <CalendarPageView copy={copy} locale={locale} calendar={calendar} />;
}
