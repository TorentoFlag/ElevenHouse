import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

let cleanup: (() => void) | undefined;
let stateInitialized: boolean;
let stateValue: unknown;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => {
    cleanup?.();
    cleanup = effect() ?? undefined;
  },
  useState: <T,>(initialValue: T) => {
    if (!stateInitialized) {
      stateValue = initialValue;
      stateInitialized = true;
    }

    return [
      stateValue as T,
      (nextValue: T | ((currentValue: T) => T)) => {
        stateValue =
          typeof nextValue === "function"
            ? (nextValue as (currentValue: T) => T)(stateValue as T)
            : nextValue;
      }
    ];
  }
}));

describe("useDebounce", () => {
  beforeEach(() => {
    cleanup = undefined;
    stateInitialized = false;
    stateValue = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
  });

  it("keeps the initial value immediately and publishes changed values only after the delay", () => {
    expect(useDebounce("лу", 700)).toBe("лу");

    expect(useDebounce("луна", 700)).toBe("лу");
    vi.advanceTimersByTime(699);

    expect(stateValue).toBe("лу");

    vi.advanceTimersByTime(1);

    expect(stateValue).toBe("луна");
  });

  it("cancels a pending update when a newer value arrives before the delay", () => {
    expect(useDebounce("с", 700)).toBe("с");
    expect(useDebounce("со", 700)).toBe("с");
    vi.advanceTimersByTime(500);

    expect(useDebounce("сол", 700)).toBe("с");
    vi.advanceTimersByTime(699);

    expect(stateValue).toBe("с");

    vi.advanceTimersByTime(1);

    expect(stateValue).toBe("сол");
  });
});
