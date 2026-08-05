import type {
  CalendarEntry,
  CalendarView,
  ManualBookingResponse,
  PutDefaultAvailabilityScheduleRequest
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useReducer } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { HttpError } from "../../common/http/HttpError";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useAvailabilityScheduleQuery } from "../../features/availability/model/useAvailabilityScheduleQuery";
import { usePutDefaultAvailabilityScheduleMutation } from "../../features/availability/model/usePutDefaultAvailabilityScheduleMutation";
import { productListQueryOptions } from "../../features/products/model/productsQueryOptions";
import type { CreateManualBookingInput } from "../../features/bookings/api/createManualBooking";
import {
  bookingCalendarAnchorDate,
  type BookingCalendarHandoff
} from "../../features/bookings/model/bookingNavigation";
import { useBookingQuery } from "../../features/bookings/model/useBookingQuery";
import { useCreateManualBookingMutation } from "../../features/bookings/model/useCreateManualBookingMutation";
import type { CreateManualBlockInput } from "../../features/calendar/api/createManualBlock";
import {
  createCalendarRange,
  formatCalendarRangeLabel,
  getTodayInTimeZone,
  moveCalendarAnchor
} from "../../features/calendar/model/calendarRange";
import { useCreateManualBlockMutation } from "../../features/calendar/model/useCreateManualBlockMutation";
import {
  calendarQueryKeys,
  useCalendarRangeQuery
} from "../../features/calendar/model/useCalendarRangeQuery";
import { useReleaseManualBlockMutation } from "../../features/calendar/model/useReleaseManualBlockMutation";

export type CalendarPageDialog = "manual_booking" | "booking_detail" | null;

export type CalendarPageState = {
  readonly view: CalendarView;
  readonly anchorDate: string;
  readonly selectedEntryId: string | null;
  readonly isAvailabilityMode: boolean;
  readonly isSummaryPanelOpen: boolean;
  readonly dialog: CalendarPageDialog;
  readonly manualBookingStartAt: string | null;
  readonly conflictMessage: string | null;
};

export type CalendarPageAction =
  | { readonly type: "set_view"; readonly view: CalendarView }
  | { readonly type: "navigate"; readonly direction: "previous" | "next" }
  | { readonly type: "go_today"; readonly today: string }
  | { readonly type: "open_date"; readonly date: string }
  | { readonly type: "select_entry"; readonly entryId: string | null }
  | { readonly type: "set_availability_mode"; readonly enabled: boolean }
  | { readonly type: "set_summary_panel"; readonly open: boolean }
  | {
      readonly type: "open_dialog";
      readonly dialog: Exclude<CalendarPageDialog, null>;
      readonly manualBookingStartAt?: string | null;
    }
  | { readonly type: "close_dialog" }
  | { readonly type: "booking_conflict"; readonly message: string };

export function createInitialCalendarPageState(input: {
  readonly today: string;
  readonly timeZone?: string;
  readonly bookingHandoff?: BookingCalendarHandoff | null;
}): CalendarPageState {
  const bookingSelection =
    input.bookingHandoff && input.timeZone
      ? {
          anchorDate: bookingCalendarAnchorDate(input.bookingHandoff, input.timeZone),
          selectedEntryId: input.bookingHandoff.bookingId,
          dialog: "booking_detail" as const
        }
      : null;

  return {
    view: "week",
    anchorDate: bookingSelection?.anchorDate ?? input.today,
    selectedEntryId: bookingSelection?.selectedEntryId ?? null,
    isAvailabilityMode: false,
    isSummaryPanelOpen: true,
    dialog: bookingSelection?.dialog ?? null,
    manualBookingStartAt: null,
    conflictMessage: null
  };
}

export function calendarPageStateReducer(
  state: CalendarPageState,
  action: CalendarPageAction
): CalendarPageState {
  switch (action.type) {
    case "set_view":
      return closeBookingDetail({ ...state, view: action.view });
    case "navigate":
      return closeBookingDetail({
        ...state,
        anchorDate: moveCalendarAnchor(
          state.anchorDate,
          state.view,
          action.direction === "next" ? 1 : -1
        )
      });
    case "go_today":
      return closeBookingDetail({ ...state, anchorDate: action.today });
    case "open_date":
      return closeBookingDetail({ ...state, view: "week", anchorDate: action.date });
    case "select_entry":
      return { ...state, selectedEntryId: action.entryId };
    case "set_availability_mode":
      return action.enabled
        ? closeBookingDetail({ ...state, isAvailabilityMode: true })
        : { ...state, isAvailabilityMode: false };
    case "set_summary_panel":
      return { ...state, isSummaryPanelOpen: action.open };
    case "open_dialog":
      return {
        ...state,
        dialog: action.dialog,
        manualBookingStartAt:
          action.dialog === "manual_booking" ? (action.manualBookingStartAt ?? null) : null,
        conflictMessage: null
      };
    case "close_dialog":
      return { ...state, dialog: null, manualBookingStartAt: null, conflictMessage: null };
    case "booking_conflict":
      return { ...state, conflictMessage: action.message };
  }
}

function closeBookingDetail(state: CalendarPageState): CalendarPageState {
  return state.dialog === "booking_detail"
    ? { ...state, dialog: null, selectedEntryId: null }
    : state;
}

type CalendarPageControllerInput = {
  readonly timeZone: string;
  readonly locale: SupportedLocale;
  readonly copy: AstrologerCopy["calendar"];
  readonly bookingHandoff: BookingCalendarHandoff | null;
};

export function useCalendarPageController(input: CalendarPageControllerInput) {
  useDocumentTitle(input.copy.documentTitle);
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    calendarPageStateReducer,
    {
      today: getTodayInTimeZone(input.timeZone),
      timeZone: input.timeZone,
      bookingHandoff: input.bookingHandoff
    },
    createInitialCalendarPageState
  );
  const range = useMemo(
    () =>
      createCalendarRange({
        view: state.view,
        anchorDate: state.anchorDate,
        timeZone: input.timeZone
      }),
    [input.timeZone, state.anchorDate, state.view]
  );
  const rangeQuery = useCalendarRangeQuery(range);
  const needsSchedulingResources = state.isAvailabilityMode || state.dialog === "manual_booking";
  const availabilityQuery = useAvailabilityScheduleQuery(needsSchedulingResources);
  const availabilityProductsQuery = useQuery({
    ...productListQueryOptions({ status: "active", limit: 200, offset: 0 }),
    enabled: needsSchedulingResources
  });
  const createBlockMutation = useCreateManualBlockMutation();
  const releaseBlockMutation = useReleaseManualBlockMutation();
  const putScheduleMutation = usePutDefaultAvailabilityScheduleMutation();
  const createBookingMutation = useCreateManualBookingMutation();
  const selectedEntry =
    rangeQuery.data?.entries.find((entry) => entry.id === state.selectedEntryId) ?? null;
  const selectedBookingId =
    state.dialog === "booking_detail" && state.selectedEntryId
      ? state.selectedEntryId
      : selectedEntry?.kind === "booking"
        ? selectedEntry.id
        : "";
  const bookingQuery = useBookingQuery(selectedBookingId);
  const today = getTodayInTimeZone(input.timeZone);

  return {
    ...state,
    timeZone: input.timeZone,
    today,
    range,
    rangeLabel: formatCalendarRangeLabel({
      view: state.view,
      anchorDate: state.anchorDate,
      timeZone: input.timeZone,
      locale: input.locale
    }),
    entries: rangeQuery.data?.entries ?? [],
    availability: rangeQuery.data?.availability ?? [],
    summary: rangeQuery.data?.summary ?? null,
    schedule: availabilityQuery.data?.schedule ?? null,
    availabilityProducts: availabilityProductsQuery.data?.products ?? [],
    selectedEntry,
    selectedBooking: bookingQuery.data?.booking ?? null,
    isLoading: rangeQuery.isLoading,
    isFetching: rangeQuery.isFetching,
    isError: rangeQuery.isError,
    isAvailabilityLoading: availabilityQuery.isLoading,
    isAvailabilityError: availabilityQuery.isError,
    isAvailabilityProductsLoading: availabilityProductsQuery.isLoading,
    isAvailabilityProductsError: availabilityProductsQuery.isError,
    isBookingCreating: createBookingMutation.isPending,
    isBookingDetailLoading: bookingQuery.isLoading,
    isBookingDetailError: bookingQuery.isError,
    isCommandPending:
      createBlockMutation.isPending ||
      releaseBlockMutation.isPending ||
      putScheduleMutation.isPending ||
      createBookingMutation.isPending,
    onRetry: () => rangeQuery.refetch(),
    onRetryAvailability: () => {
      void availabilityQuery.refetch();
      void availabilityProductsQuery.refetch();
    },
    onRetryManualBookingResources: () => {
      void availabilityQuery.refetch();
      void availabilityProductsQuery.refetch();
    },
    onRetryBookingDetail: () => bookingQuery.refetch(),
    onSetView: (view: CalendarView) => dispatch({ type: "set_view", view }),
    onOpenDate: (date: string) => dispatch({ type: "open_date", date }),
    onPrevious: () => dispatch({ type: "navigate", direction: "previous" }),
    onNext: () => dispatch({ type: "navigate", direction: "next" }),
    onToday: () => dispatch({ type: "go_today", today }),
    onSetSummaryPanelOpen: (open: boolean) => dispatch({ type: "set_summary_panel", open }),
    onSetAvailabilityMode: (enabled: boolean) =>
      dispatch({ type: "set_availability_mode", enabled }),
    onSelectEntry: (entry: CalendarEntry) => {
      dispatch({ type: "select_entry", entryId: entry.id });
      if (entry.kind === "booking") dispatch({ type: "open_dialog", dialog: "booking_detail" });
    },
    onOpenManualBooking: (selection?: { readonly start: string }) =>
      dispatch({
        type: "open_dialog",
        dialog: "manual_booking",
        manualBookingStartAt: selection?.start ?? null
      }),
    onCloseDialog: () => dispatch({ type: "close_dialog" }),
    onCreateBlock: (command: CreateManualBlockInput) => createBlockMutation.mutateAsync(command),
    onReleaseBlock: (blockId: string) => releaseBlockMutation.mutateAsync(blockId),
    onSaveSchedule: (schedule: PutDefaultAvailabilityScheduleRequest) =>
      putScheduleMutation.mutateAsync(schedule),
    onCreateManualBooking: (command: CreateManualBookingInput) =>
      executeManualBookingCreate({
        mutate: createBookingMutation.mutateAsync,
        input: command,
        invalidateCalendar: () =>
          queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all() }),
        onConflict: () =>
          dispatch({ type: "booking_conflict", message: input.copy.conflictMessage })
      })
  };
}

type ExecuteManualBookingCreateInput = {
  readonly mutate: (input: CreateManualBookingInput) => Promise<ManualBookingResponse>;
  readonly input: CreateManualBookingInput;
  readonly invalidateCalendar: () => Promise<unknown>;
  readonly onConflict: () => void;
};

export async function executeManualBookingCreate(
  input: ExecuteManualBookingCreateInput
): Promise<"success" | "conflict"> {
  try {
    await input.mutate(input.input);
    return "success";
  } catch (error) {
    if (isStaleSlotConflict(error)) {
      await input.invalidateCalendar();
      input.onConflict();
      return "conflict";
    }
    throw error;
  }
}

function isStaleSlotConflict(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 409) return false;
  if (!error.body || typeof error.body !== "object") return false;
  return "code" in error.body && error.body.code === "slot_no_longer_available";
}
