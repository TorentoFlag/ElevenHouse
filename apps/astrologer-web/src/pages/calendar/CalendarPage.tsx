import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { CalendarPageView } from "./CalendarPageView";
import { useCalendarPageController } from "./useCalendarPageController";

export function CalendarPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const profileQuery = useCurrentAstrologerProfileQuery();

  useDocumentTitle(dictionary.calendar.documentTitle);

  if (profileQuery.isLoading) {
    return <section aria-busy="true">{dictionary.calendar.loadingLabel}</section>;
  }

  if (profileQuery.isError || !profileQuery.data?.profile) {
    return (
      <section>
        <p role="alert">{dictionary.calendar.errorLabel}</p>
        <button type="button" onClick={() => void profileQuery.refetch()}>
          {dictionary.calendar.retryLabel}
        </button>
      </section>
    );
  }

  return (
    <CalendarPageContent
      copy={dictionary.calendar}
      locale={locale}
      timeZone={profileQuery.data.profile.timezone}
    />
  );
}

function CalendarPageContent({
  copy,
  locale,
  timeZone
}: {
  readonly copy: AstrologerCopy["calendar"];
  readonly locale: "ru" | "en";
  readonly timeZone: string;
}) {
  const calendar = useCalendarPageController({ copy, locale, timeZone });
  return <CalendarPageView copy={copy} locale={locale} calendar={calendar} />;
}
