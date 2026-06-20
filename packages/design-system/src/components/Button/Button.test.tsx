import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders title, size, variant and html button type", () => {
    const button = Button({
      title: "Continue",
      size: "medium",
      variant: "brand",
      type: "submit"
    });

    expect(button.type).toBe("button");
    expect(button.props.type).toBe("submit");
    expect(button.props.className).toBe("ehButton ehButton--medium ehButton--brand");
    expect(JSON.stringify(button.props.children)).toContain("Continue");
  });

  it("renders optional start and end icons as decorative content", () => {
    const button = Button({
      title: "Back",
      size: "small",
      variant: "default",
      startIcon: <svg data-testid="start" />,
      endIcon: <svg data-testid="end" />
    });

    const serializedButton = JSON.stringify(button.props.children);

    expect(button.props.className).toBe("ehButton ehButton--small ehButton--default");
    expect(serializedButton).toContain("ehButton__icon ehButton__icon--start");
    expect(serializedButton).toContain("ehButton__icon ehButton__icon--end");
    expect(serializedButton).toContain("Back");
  });

  it("passes native button props and ref through", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const button = Button({
      title: "Save",
      disabled: true,
      "aria-label": "Save changes",
      className: "custom",
      onClick,
      ref
    });

    expect(button.props.disabled).toBe(true);
    expect(button.props["aria-label"]).toBe("Save changes");
    expect(button.props.className).toBe("ehButton ehButton--medium ehButton--brand custom");
    expect(button.props.onClick).toBe(onClick);
    expect(button.props.ref).toBe(ref);
  });
});
