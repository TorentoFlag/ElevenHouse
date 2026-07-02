import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResendCountdown } from "./useResendCountdown";

let stateValue: number;
let cleanup: (() => void) | undefined;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    cleanup = effect() ?? undefined;
  },
  useState: (initializer: () => number) => {
    stateValue = stateValue ?? initializer();

    return [
      stateValue,
      (nextValue: number) => {
        stateValue = nextValue;
      }
    ];
  }
}));

describe("useResendCountdown", () => {
  beforeEach(() => {
    stateValue = undefined as unknown as number;
    cleanup = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T10:00:10.000Z"));
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
  });

  it("returns seconds and formatted cooldown label while resend is locked", () => {
    const countdown = useResendCountdown({
      isActive: true,
      resendAvailableAt: "2026-06-16T10:01:00.000Z",
      labelTemplate: "Repeat in {time}",
      tickMs: 1000
    });

    expect(countdown.resendCountdownSeconds).toBe(50);
    expect(countdown.resendCooldownLabel).toBe("Repeat in 0:50");
  });

  it("ticks only while active and exposes an explicit reset", () => {
    const countdown = useResendCountdown({
      isActive: true,
      resendAvailableAt: "2026-06-16T10:01:00.000Z",
      labelTemplate: "Repeat in {time}",
      tickMs: 1000
    });

    vi.setSystemTime(new Date("2026-06-16T10:00:11.000Z"));
    vi.advanceTimersByTime(1000);

    expect(stateValue).toBe(Date.parse("2026-06-16T10:00:12.000Z"));

    cleanup?.();
    vi.setSystemTime(new Date("2026-06-16T10:00:12.000Z"));
    vi.advanceTimersByTime(1000);

    expect(stateValue).toBe(Date.parse("2026-06-16T10:00:12.000Z"));

    vi.setSystemTime(new Date("2026-06-16T10:00:13.000Z"));
    countdown.resetResendCountdown();

    expect(stateValue).toBe(Date.parse("2026-06-16T10:00:13.000Z"));
  });

  it("returns no cooldown label when inactive", () => {
    const countdown = useResendCountdown({
      isActive: false,
      resendAvailableAt: "2026-06-16T10:01:00.000Z",
      labelTemplate: "Repeat in {time}",
      tickMs: 1000
    });

    expect(countdown.resendCountdownSeconds).toBe(0);
    expect(countdown.resendCooldownLabel).toBeNull();
  });
});
