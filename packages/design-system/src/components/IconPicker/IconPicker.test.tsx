import { describe, expect, it, vi } from "vitest";
import { IconPicker } from "./IconPicker.js";

describe("IconPicker", () => {
  it("renders icon options and emits selected icon name", () => {
    const onValueChange = vi.fn();
    const picker = IconPicker({
      value: "check",
      iconNames: ["check", "video"],
      ariaLabel: "Выберите иконку",
      className: "customPicker",
      onValueChange
    });

    expect(picker.props.role).toBe("listbox");
    expect(picker.props["aria-label"]).toBe("Выберите иконку");
    expect(picker.props.className).toContain("ehIconPicker");
    expect(picker.props.className).toContain("customPicker");

    const options = picker.props.children;
    expect(options).toHaveLength(2);
    expect(options[0].type).toBe("button");
    expect(options[0].props.type).toBe("button");
    expect(options[0].props.role).toBe("option");
    expect(options[0].props["aria-selected"]).toBe(true);
    expect(options[0].props.className).toContain("ehIconPicker__option--selected");
    expect(options[1].type).toBe("button");
    expect(options[1].props.type).toBe("button");
    expect(options[1].props.role).toBe("option");
    expect(options[1].props["aria-selected"]).toBe(false);
    expect(options[1].props.className).not.toContain("ehIconPicker__option--selected");

    options[1].props.onClick();
    expect(onValueChange).toHaveBeenCalledWith("video");
  });
});
