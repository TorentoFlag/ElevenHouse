# Manual Booking Slot Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom ElevenHouse date/time slot picker for the astrologer manual booking dialog, backed only by server-projected booking slots across the availability booking horizon.

**Architecture:** Keep the picker app-owned under `features/bookings/components`, with slot grouping and booking-range helpers in `features/bookings/model/manualBookingForm.ts`. `ManualBookingDialog` remains the composition point and continues to submit only exact server slot instants.

**Tech Stack:** React 19, TypeScript, CSS modules, React Query, `temporal-polyfill`, Vitest/jsdom, Chrome DevTools MCP.

## Global Constraints

- Work in shared checkout on `main`; do not branch, stash, checkout, or reset user work.
- Stage only exact owned paths.
- Do not add a new UI kit or calendar dependency.
- Preserve existing production booking scope: existing CRM client, active live solo product, server slot, confirmed manual booking.
- Do not implement payments, guest client, new-client creation, or public checkout.
- Browser acceptance must use Chrome DevTools MCP.

---

### Task 1: Slot Picker Model

**Files:**
- Modify: `apps/astrologer-web/src/features/bookings/model/manualBookingForm.ts`
- Modify: `apps/astrologer-web/src/features/bookings/model/manualBookingForm.test.ts`

**Interfaces:**
- Produces: `createManualBookingSlotQueryRange(input): { start: string; end: string }`
- Produces: `groupManualBookingSlotsByDate(slots): ManualBookingSlotDateGroup[]`
- Produces: `resolveManualBookingDateSelection(input): string`

- [ ] **Step 1: Write failing model tests**

Add tests that call:

```ts
createManualBookingSlotQueryRange({
  now: "2026-07-22T19:00:00+03:00",
  timeZone: "Europe/Moscow",
  bookingHorizonDays: 90
})
```

Expected:

```ts
{
  start: "2026-07-22T00:00:00+03:00",
  end: "2026-10-20T00:00:00+03:00"
}
```

Also assert `bookingHorizonDays: 120` caps to 93 days, and that two slots on different local dates group into two date groups.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run src/features/bookings/model/manualBookingForm.test.ts
```

Expected: FAIL because the helper functions are not exported.

- [ ] **Step 3: Implement model helpers**

Add focused helpers using `Temporal` from `temporal-polyfill`. `createManualBookingSlotQueryRange` starts at local midnight for `now`, and ends after `Math.min(bookingHorizonDays, 93)` days.

- [ ] **Step 4: Verify GREEN**

Run the same test command. Expected: PASS.

### Task 2: BookingSlotPicker Component

**Files:**
- Create: `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.tsx`
- Create: `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.module.css`
- Create: `apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.test.tsx`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`

**Interfaces:**
- Consumes: `ManualBookingSlotOption[]`, `ManualBookingSlotDateGroup[]`
- Produces: `BookingSlotPicker(props): JSX.Element`

- [ ] **Step 1: Write failing component tests**

Render the picker with one selected slot and assert:

```ts
expect(markup).toContain('aria-label="Календарь доступных дат"');
expect(markup).toContain("2 слота");
expect(markup).toContain("10:00");
expect(markup).not.toContain("<select");
```

Add an interactive jsdom test where clicking a date with slots calls `onChange`
with the first slot for that date.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run src/features/bookings/components/BookingSlotPicker.test.tsx
```

Expected: FAIL because the component file does not exist.

- [ ] **Step 3: Implement component and styles**

Implement a two-part picker:

```tsx
<section className={styles.picker} aria-label={copy.pickerLabel}>
  <div className={styles.calendarPanel}>...</div>
  <div className={styles.timePanel}>...</div>
</section>
```

Use buttons for days and times, `aria-pressed` for selected values, disabled buttons for unavailable days, and responsive CSS under `@media (max-width: 640px)`.

- [ ] **Step 4: Verify GREEN**

Run the same component test command. Expected: PASS.

### Task 3: ManualBookingDialog Integration

**Files:**
- Modify: `apps/astrologer-web/src/features/bookings/components/ManualBookingDialog.tsx`
- Modify: `apps/astrologer-web/src/features/bookings/components/ManualBookingDialog.test.tsx`

**Interfaces:**
- Consumes: `createManualBookingSlotQueryRange`
- Consumes: `BookingSlotPicker`

- [ ] **Step 1: Write failing integration tests**

Update the existing test so it asserts the dialog source no longer contains:

```ts
expect(source).not.toContain('id="manual-booking-date"');
expect(source).not.toContain('id="manual-booking-time"');
expect(source).toContain("<BookingSlotPicker");
expect(source).toContain("createManualBookingSlotQueryRange({");
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run src/features/bookings/components/ManualBookingDialog.test.tsx
```

Expected: FAIL because native selects are still present.

- [ ] **Step 3: Integrate picker**

Replace the native date/time select block with `BookingSlotPicker`. Query slots with:

```ts
const slotRange = createManualBookingSlotQueryRange({
  now: new Date().toISOString(),
  timeZone: props.schedule?.timeZone ?? "UTC",
  bookingHorizonDays: props.schedule?.bookingHorizonDays ?? 1
});
```

Pass `slotRange.start` and `slotRange.end` to `useAvailableBookingSlotsQuery`.

- [ ] **Step 4: Verify GREEN**

Run the same integration test command. Expected: PASS.

### Task 4: Verification and Commit

**Files:**
- All owned implementation files.

- [ ] **Step 1: Run targeted tests**

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run src/features/bookings/model/manualBookingForm.test.ts src/features/bookings/components/BookingSlotPicker.test.tsx src/features/bookings/components/ManualBookingDialog.test.tsx
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run affected calendar/booking tests**

```bash
pnpm exec vitest run apps/astrologer-web/src/features/bookings/model/manualBookingForm.test.ts apps/astrologer-web/src/features/bookings/components/BookingSlotPicker.test.tsx apps/astrologer-web/src/features/bookings/components/ManualBookingDialog.test.tsx apps/astrologer-web/src/pages/calendar/CalendarPageView.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 3: Run diff hygiene**

```bash
git diff --check -- apps/astrologer-web/src/features/bookings apps/astrologer-web/src/common/i18n/astrologerCopy.ts docs/superpowers/plans/2026-07-22-manual-booking-slot-picker.md
```

Expected: no output.

- [ ] **Step 4: Chrome DevTools QA**

Open `http://localhost:5174/calendar`, click `Запись`, select `Прогноз на год · соляр`, and verify:

- available-slots request uses a horizon range, not only `2026-07-20` to `2026-07-27`;
- picker shows more than two available days with current seed data;
- no console errors;
- no horizontal overflow on desktop and mobile.

- [ ] **Step 5: Commit exact owned paths**

Stage only implementation files and this plan file, then commit:

```bash
git commit -m "feat(calendar): add manual booking slot picker"
```
