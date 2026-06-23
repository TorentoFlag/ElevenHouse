export type ResolveResendCountdownSecondsInput = {
  readonly nowMs: number;
  readonly resendAvailableAt: string;
};

export function resolveResendCountdownSeconds({
  nowMs,
  resendAvailableAt
}: ResolveResendCountdownSecondsInput): number {
  const availableAtMs = Date.parse(resendAvailableAt);

  if (!Number.isFinite(availableAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((availableAtMs - nowMs) / 1000));
}

export function formatResendCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
