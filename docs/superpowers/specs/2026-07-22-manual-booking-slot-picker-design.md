# Manual Booking Slot Picker Design

Date: 2026-07-22
Status: approved for implementation
Owner surface: `apps/astrologer-web`

## Outcome

Replace the native day/time selects in the astrologer manual booking dialog with
a custom ElevenHouse booking slot picker. The picker must show all server
available booking dates inside the current availability booking horizon, not
only the currently visible calendar week.

## In Scope

- Manual booking dialog in `apps/astrologer-web`.
- Current production booking contour only: existing CRM client, active live solo
  product, server-projected available slot, confirmed manual booking.
- A custom app-owned date/time picker styled in the current ElevenHouse calendar
  modal language.
- RU and EN copy for new labels and states.
- Desktop and mobile responsive states.
- Runtime verification through Chrome DevTools MCP on the running production
  app, with network-backed slot data.

## Out of Scope

- Payments, prepayment, postpayment, refunds, or finance states.
- Guest client or new-client creation inside booking.
- Session lifecycle beyond the currently implemented confirmed booking and
  conflict handling.
- Public client booking or checkout.
- New reusable design-system primitive. This picker is business-specific until
  another production surface needs the same behavior.

## Repository Evidence

- `ManualBookingDialog` currently requests available slots using
  `props.range.start` and `props.range.end`, which are the visible calendar
  range.
- `useCalendarPageController` computes `calendar.range` from the active calendar
  view and anchor date.
- The backend `available-slots` endpoint and domain projection already support
  broader ranges up to the contract limit of 93 days.
- Live Chrome DevTools evidence on 2026-07-22 showed the current week request
  returned 8 slots across 2 days for `Прогноз на год · соляр`, while the same
  product over 60 days returned 595 slots across 56 days. The local schedule
  had `bookingHorizonDays: 90`.

## Research

Question: Which external calendar/date-time picker patterns should inform a
custom ElevenHouse server-slot picker?

Decision affected: whether to install or wrap a UI kit picker, use an existing
calendar library, or build an app-owned picker from current server slots.

Accessed: 2026-07-22

### Sources

- React Aria DatePicker, https://react-aria.adobe.com/DatePicker
  - Relevant for controlled values, locale/time-zone support, minute
    granularity, and `isDateUnavailable`.
- React DayPicker styling and custom components, https://daypicker.dev/docs/styling
  and https://daypicker.dev/guides/custom-components
  - Relevant for lightweight month grid customization patterns.
- WAI-ARIA APG date picker dialog example,
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/
  - Relevant for keyboard and accessibility behavior: grid navigation,
    roving focus, live month heading, Escape handling and focus return.
- MUI X date picker validation and custom slots,
  https://mui.com/x/react-date-pickers/validation/ and
  https://mui.com/x/react-date-pickers/custom-components/
  - Relevant for disabled date/time API trade-offs and slot customization.
- Ant Design DatePicker, https://ant.design/components/date-picker/
  - Relevant for the split between disabled dates and disabled times.
- Mantine DatePicker and DateTimePicker,
  https://mantine.dev/dates/date-picker/ and
  https://mantine.dev/dates/date-time-picker/
  - Relevant for controlled display month and time-picker composition.
- FullCalendar docs, https://fullcalendar.io/docs
  - Relevant because the repo already uses FullCalendar for large calendar
    views, but not as a compact picker.

### Findings

- Sourced fact: established generic pickers expose disabled date/time hooks, but
  they still operate on picker-local date/time concepts. Our valid values are
  server-projected slot instants.
- Sourced fact: accessible date pickers need explicit keyboard behavior and
  focus management; examples warn that browser and assistive technology support
  must be tested in production context.
- Repository evidence: current booking submission already guards against
  invented times by requiring `projectedStartAt` to be present in the current
  server slot list.
- Inference: adopting MUI, Mantine or Ant would introduce theme and dependency
  surface without solving the server-slot grouping problem.
- Inference: React DayPicker is a reasonable future primitive if we need a
  general calendar grid, but for this slice a custom grid over grouped server
  slots is smaller and easier to make visually exact.

### Options

1. Custom app-owned `BookingSlotPicker` over server slots.
   - Benefits: exact ElevenHouse visuals, no new UI kit, keeps slot authority on
     the backend, minimal dependency and migration cost.
   - Risks: we own keyboard/focus behavior; tests and Chrome DevTools QA must be
     strict.

2. Add React DayPicker and heavily customize it.
   - Benefits: mature calendar grid and navigation primitives.
   - Risks: extra dependency for one modal; custom day rendering still needed
     for server slot counts and ElevenHouse styling.

3. Add a full UI kit DateTimePicker such as MUI X, Mantine, or Ant.
   - Benefits: broad generic picker feature set.
   - Risks: visual mismatch, theme debt, larger bundle and dependency surface,
     and awkward fit for server-authoritative slot instants.

Recommendation: choose option 1. It fits current architecture, product scope and
visual parity requirements with the lowest lasting cost.

Rejected alternatives:

- FullCalendar inside the modal: too heavy and view-oriented for a compact
  booking picker.
- Native select dropdowns: compact but poor for many dates, visually below the
  reference language, and currently tied to the wrong range.
- Free text date/time input: would invite invalid or stale slots and duplicate
  backend validation in the browser.

User decisions: none remaining for this slice. The user approved a custom
component in ElevenHouse style and explicitly deferred payments/finance.

## Component Design

### `BookingSlotPicker`

Location: `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.tsx`

Props:

- `slots`: server slot options from the current product response.
- `timeZone`: response time zone.
- `locale`: supported locale.
- `value`: selected slot start instant or empty string.
- `onChange`: selected server slot start instant.
- `disabled`: creation pending.
- `copy`: localized labels and state text.

Behavior:

- Group slots by local date using the API response time zone.
- Select the preferred/prefilled slot if still available; otherwise select the
  first available slot.
- Month navigation is local UI state and does not create new server queries.
- Days outside the slot list are rendered muted and disabled.
- Days with slots show a visible accent state and a small slot count or dot.
- Selecting a date moves the time panel to that date and selects the first slot
  for that date unless the current selected time is already on that date.
- Selecting a time returns the exact `slot.startAt` string.

### Visual Layout

Desktop:

- Inside the existing booking modal card.
- Two-column picker block: month grid on the left, selected day time chips on
  the right.
- Dark surface, subtle violet border, gold selected state, compact labels, mono
  time chips.
- Summary row remains below the picker.

Mobile:

- Single column inside the existing modal.
- Month header and grid first, selected day and time chips below.
- Time chips are large enough for touch and wrap without horizontal overflow.

## Data Flow

1. `ManualBookingDialog` chooses the selected product.
2. It computes a booking slot query range independent from the visible calendar
   range:
   - start: now/today in the astrologer time zone.
   - end: start plus `schedule.bookingHorizonDays`, capped to 93 days to match
     the contract.
3. `useAvailableBookingSlotsQuery` fetches `/bookings/available-slots`.
4. `toManualBookingSlotOptions` formats local date/time metadata.
5. `BookingSlotPicker` renders only the returned slot instants.
6. `createManualBookingCommand` still rejects values that are not in the
   current server slot list.

## States

- Loading slots: compact skeleton/label in the picker area.
- Error loading slots: existing retry action remains, visually integrated.
- No slots in booking horizon: explicit empty state mentioning the configured
  booking horizon, not "this visible period".
- Disabled while creating: date and time buttons disabled, selection visible.
- Stale slot conflict on submit: existing conflict flow refetches slots and
  preserves the dialog.

## Accessibility

- Date grid uses semantic buttons with accessible names containing full date and
  availability count.
- Disabled dates are not selectable and expose disabled state.
- Selected date and selected time expose `aria-pressed` or equivalent selected
  state.
- Keyboard support covers Tab order, Enter/Space selection, arrow movement
  inside date grid, Home/End within week, PageUp/PageDown month navigation and
  Escape via the parent dialog.
- Focus remains inside the parent native dialog and returns to the opener when
  the dialog closes.

## Testing

Targeted tests:

- Model test for booking query range: horizon capped to 93 days and independent
  from visible calendar week.
- Model test for grouping slots by local day and selecting the first available
  slot after date changes.
- Component test that `ManualBookingDialog` no longer renders
  `manual-booking-date` / `manual-booking-time` native selects and renders the
  custom picker states.
- Component test for disabled days, selected day/time and exact server slot
  submission.

Runtime and visual QA:

- Chrome DevTools MCP on `localhost:5174/calendar`.
- Reproduce opening `Запись`, selecting `Прогноз на год · соляр`, and verify
  the network query spans booking horizon instead of the visible week.
- Desktop and mobile screenshots for loading/success/open picker states.
- Console and network check: no unexpected errors, available-slots status 200 or
  valid cache response, no invented mutation.

## Commit Scope

Expected implementation paths:

- `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.tsx`
- `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.module.css`
- `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.test.tsx`
- `apps/astrologer-web/src/features/bookings/components/ManualBookingDialog.tsx`
- `apps/astrologer-web/src/features/bookings/components/ManualBookingDialog.test.tsx`
- `apps/astrologer-web/src/features/bookings/model/manualBookingForm.ts`
- `apps/astrologer-web/src/features/bookings/model/manualBookingForm.test.ts`
- `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`

The implementation commit must stage only owned paths and preserve unrelated
dirty work in the shared checkout.
