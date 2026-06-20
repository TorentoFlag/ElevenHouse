import { afterEach, describe, expect, it, vi } from "vitest";
import { createDelayedValidationVisibilityController } from "./delayedValidationVisibility";

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
});
