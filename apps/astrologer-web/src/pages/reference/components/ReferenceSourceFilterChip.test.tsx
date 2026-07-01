import { Chip } from "@elevenhouse/design-system/components/Chip";
import { describe, expect, it, vi } from "vitest";
import { ReferenceSourceFilterChip } from "./ReferenceSourceFilterChip";

describe("ReferenceSourceFilterChip", () => {
  it("renders all-source filter without a source dot", () => {
    const onClick = vi.fn();
    const chip = ReferenceSourceFilterChip({
      source: "all",
      label: "Все источники",
      count: 14,
      isActive: true,
      onClick
    });

    expect(chip.type).toBe(Chip);
    expect(chip.props.label).toBe("Все источники");
    expect(chip.props.count).toBe(14);
    expect(chip.props.active).toBe(true);
    expect(chip.props.dotColor).toBeUndefined();
    expect(chip.props["data-reference-source"]).toBe("all");
    chip.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders non-all source filter with source dot color", () => {
    const chip = ReferenceSourceFilterChip({
      source: "custom",
      label: "Свои",
      count: 3,
      isActive: false,
      onClick: vi.fn()
    });

    expect(chip.props.dotColor).toBe("var(--eh-color-emerald)");
  });
});
