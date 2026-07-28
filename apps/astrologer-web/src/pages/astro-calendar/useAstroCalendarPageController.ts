import type {
  AstroCalendarEventType,
  AstroCalendarGenerationRequest,
  AstroCalendarRangeQuery,
  AstroCalendarScope,
  ChartSettings
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Temporal } from "temporal-polyfill";
import { useMemo, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { createAstroCalendarRangeQuery } from "../../features/astro-calendar/model/astroCalendarState";
import { useAstroCalendarDictionaryEntriesQuery } from "../../features/astro-calendar/model/useAstroCalendarDictionaryEntriesQuery";
import { useAstroCalendarRangeQuery } from "../../features/astro-calendar/model/useAstroCalendarRangeQuery";
import { useCreateAstroCalendarGenerationMutation } from "../../features/astro-calendar/model/useCreateAstroCalendarGenerationMutation";
import { useRetryAstroCalendarGenerationMutation } from "../../features/astro-calendar/model/useRetryAstroCalendarGenerationMutation";

const defaultSettings: ChartSettings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
};

export type AstroCalendarEventTypeFilter = AstroCalendarEventType | "all";

export function useAstroCalendarPageController(input: { readonly locale: SupportedLocale }) {
  useDocumentTitle(
    input.locale === "ru" ? "ElevenHouse | Астрокалендарь" : "ElevenHouse | Astro calendar"
  );
  const [scope, setScope] = useState<AstroCalendarScope>("all");
  const [eventType, setEventType] = useState<AstroCalendarEventTypeFilter>("all");
  const [search, setSearch] = useState("");
  const timeZone = getBrowserTimezone();
  const range = useMemo(() => createDefaultAstroCalendarRange(timeZone), [timeZone]);
  const rangeQueryInput = useMemo(
    () =>
      createAstroCalendarRangeQuery({
        ...range,
        timeZone,
        scope: "all",
        clientIds: [],
        eventTypes: []
      }),
    [range, timeZone]
  );
  const query = useMemo(
    () => ({
      ...rangeQueryInput,
      scope,
      eventTypes: eventType === "all" ? [] : [eventType]
    }),
    [eventType, rangeQueryInput, scope]
  );
  const rangeQuery = useAstroCalendarRangeQuery(rangeQueryInput);
  const dictionaryQuery = useAstroCalendarDictionaryEntriesQuery(
    {
      locale: input.locale,
      codes: rangeQuery.data?.dictionaryCodes ?? []
    },
    Boolean(rangeQuery.data?.dictionaryCodes.length)
  );
  const createGenerationMutation = useCreateAstroCalendarGenerationMutation();
  const retryGenerationMutation = useRetryAstroCalendarGenerationMutation();

  return {
    query,
    scope,
    eventType,
    search,
    rangeResponse: rangeQuery.data ?? null,
    dictionaryEntries: dictionaryQuery.data?.entries ?? [],
    isLoading: rangeQuery.isLoading,
    isFetching: rangeQuery.isFetching,
    isError: rangeQuery.isError,
    isDictionaryLoading: dictionaryQuery.isLoading,
    isCommandPending: createGenerationMutation.isPending || retryGenerationMutation.isPending,
    rangeLabel: formatAstroCalendarRangeLabel(query, input.locale),
    onScopeChange: setScope,
    onEventTypeChange: setEventType,
    onSearchChange: setSearch,
    onRefresh: () => rangeQuery.refetch(),
    onGenerate: () => {
      const body: AstroCalendarGenerationRequest = {
        ...rangeQueryInput,
        clients: [],
        settings: defaultSettings
      };
      void createGenerationMutation.mutateAsync(body);
    },
    onRetry: () => {
      const generationId = rangeQuery.data?.generation.generationId;
      if (generationId) {
        void retryGenerationMutation.mutateAsync(generationId);
        return;
      }

      const body: AstroCalendarGenerationRequest = {
        ...rangeQueryInput,
        clients: [],
        settings: defaultSettings
      };
      void createGenerationMutation.mutateAsync(body);
    }
  };
}

function createDefaultAstroCalendarRange(timeZone: string): Pick<
  AstroCalendarRangeQuery,
  "start" | "end"
> {
  const start = Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate();

  return {
    start: start.toString(),
    end: start.add({ days: 30 }).toString()
  };
}

function formatAstroCalendarRangeLabel(query: AstroCalendarRangeQuery, locale: SupportedLocale) {
  const formatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: query.timeZone
  });
  const start = toDate(query.start, query.timeZone);
  const end = toDate(query.end, query.timeZone);

  return formatter.formatRange(start, end).replaceAll("\u202f", " ");
}

function toDate(date: string, timeZone: string): Date {
  return new Date(
    Temporal.PlainDate.from(date)
      .toZonedDateTime({ timeZone, plainTime: "12:00" })
      .toInstant().epochMilliseconds
  );
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
