import { useI18n } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { AstroCalendarPageView } from "./AstroCalendarPageView";
import { useAstroCalendarPageController } from "./useAstroCalendarPageController";

export function AstroCalendarPage() {
  const { locale } = useI18n<AstrologerCopy>();

  return <AstroCalendarPageView {...useAstroCalendarPageController({ locale })} />;
}
