import { describe, expect, it } from "vitest";
import { SegmentedIndicator } from "./SegmentedIndicator.js";

describe("SegmentedIndicator", () => {
  it("renders the segmented control indicator style contract", () => {
    const indicator = SegmentedIndicator({
      activeIndex: 1,
      itemCount: 3
    });

    expect(indicator.type).toBe("span");
    expect(indicator.props.className).toBe("ehSegmentedIndicator");
    expect(indicator.props.style).toEqual({
      "--eh-motion-segmented-active-index": 1,
      "--eh-motion-segmented-count": 3
    });
    expect(indicator.props["aria-hidden"]).toBe("true");
  });
});
