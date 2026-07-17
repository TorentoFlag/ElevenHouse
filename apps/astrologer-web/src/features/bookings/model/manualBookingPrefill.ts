type ManualBookingStartInput = {
  readonly availableStarts: readonly string[];
  readonly selectedStartAt: string;
  readonly preferredStartAt: string | null;
};

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

export function isCurrentManualBookingSlotResponse(input: {
  readonly selectedProductId: string | null;
  readonly responseProductId: string | null;
  readonly isPlaceholderData: boolean;
}): boolean {
  return Boolean(
    input.selectedProductId &&
      input.responseProductId === input.selectedProductId &&
      !input.isPlaceholderData
  );
}

export function resolveManualBookingStart(input: ManualBookingStartInput): string {
  const availableInstants = input.availableStarts
    .map((value) => ({ value, instant: Date.parse(value) }))
    .filter((candidate) => Number.isFinite(candidate.instant));
  const selectedInstant = Date.parse(input.selectedStartAt);
  const selectedStart = availableInstants.find(
    (candidate) => candidate.instant === selectedInstant
  );

  if (selectedStart) return selectedStart.value;
  if (!input.preferredStartAt) return input.availableStarts[0] ?? "";

  const preferredInstant = Date.parse(input.preferredStartAt);
  if (!Number.isFinite(preferredInstant)) return "";

  return (
    availableInstants
      .filter(
        (candidate) =>
          candidate.instant >= preferredInstant &&
          candidate.instant < preferredInstant + HOUR_IN_MILLISECONDS
      )
      .sort((left, right) => left.instant - right.instant)[0]?.value ?? ""
  );
}
