import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDelayedValidationVisibilityController,
  shouldSchedulePhoneFocusForName
} from "./delayedValidationVisibility";

describe("createDelayedValidationVisibilityController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows validation feedback only after the configured delay", () => {
    vi.useFakeTimers();
    const onVisibleChange = vi.fn();
    const controller = createDelayedValidationVisibilityController({
      delayMs: 700,
      onVisibleChange
    });

    controller.schedule(true);
    vi.advanceTimersByTime(699);

    expect(onVisibleChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onVisibleChange).toHaveBeenCalledWith(true);
  });

  it("cancels pending feedback when validation becomes clean", () => {
    vi.useFakeTimers();
    const onVisibleChange = vi.fn();
    const controller = createDelayedValidationVisibilityController({
      delayMs: 700,
      onVisibleChange
    });

    controller.schedule(true);
    vi.advanceTimersByTime(500);
    controller.schedule(false);
    vi.advanceTimersByTime(200);

    expect(onVisibleChange).toHaveBeenCalledOnce();
    expect(onVisibleChange).toHaveBeenCalledWith(false);
  });

  it("reschedules pending feedback when validation remains dirty", () => {
    vi.useFakeTimers();
    const onVisibleChange = vi.fn();
    const controller = createDelayedValidationVisibilityController({
      delayMs: 700,
      onVisibleChange
    });

    controller.schedule(true);
    vi.advanceTimersByTime(500);
    controller.schedule(true);
    vi.advanceTimersByTime(500);

    expect(onVisibleChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);

    expect(onVisibleChange).toHaveBeenCalledWith(true);
  });
});

describe("shouldSchedulePhoneFocusForName", () => {
  it("accepts a complete known name without surrounding spaces", () => {
    expect(
      shouldSchedulePhoneFocusForName({
        isRegisterMode: true,
        isPopularFirstName: true,
        name: "Антон"
      })
    ).toBe(true);
  });

  it("rejects known names with surrounding spaces", () => {
    expect(
      shouldSchedulePhoneFocusForName({
        isRegisterMode: true,
        isPopularFirstName: true,
        name: "Антон "
      })
    ).toBe(false);
    expect(
      shouldSchedulePhoneFocusForName({
        isRegisterMode: true,
        isPopularFirstName: true,
        name: " Антон"
      })
    ).toBe(false);
  });
});
