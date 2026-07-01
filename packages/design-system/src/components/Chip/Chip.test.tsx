import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip.js";

describe("Chip", () => {
  it("renders a compact interactive chip with label, count and active state", () => {
    const onClick = vi.fn();
    const chip = Chip({
      label: "ElevenHouse",
      count: 14,
      active: true,
      type: "button",
      onClick
    });

    expect(chip.type).toBe("button");
    expect(chip.props.type).toBe("button");
    expect(chip.props.className).toBe("ehChip ehChip--active");
    expect(chip.props["aria-pressed"]).toBe(true);
    expect(JSON.stringify(chip.props.children)).toContain("ElevenHouse");
    expect(JSON.stringify(chip.props.children)).toContain("14");
    chip.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an optional status dot and passes native button props through", () => {
    const ref = createRef<HTMLButtonElement>();
    const chip = Chip({
      label: "Свои",
      dotColor: "var(--eh-color-emerald)",
      className: "custom",
      disabled: true,
      "aria-label": "Filter mine",
      ref
    });

    expect(chip.props.className).toBe("ehChip custom");
    expect(chip.props.disabled).toBe(true);
    expect(chip.props["aria-label"]).toBe("Filter mine");
    expect(chip.props.ref).toBe(ref);
    expect(JSON.stringify(chip.props.children)).toContain("ehChip__dot");
    expect(JSON.stringify(chip.props.children)).toContain("--eh-chip-dot-color");
  });
});
