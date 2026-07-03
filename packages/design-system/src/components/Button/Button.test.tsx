import { createRef } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.js";

const buttonCss = readFileSync(
  fileURLToPath(new URL("./Button.css", import.meta.url)),
  "utf8"
);

describe("Button", () => {
  it("renders title, size, variant and html button type", () => {
    const button = Button({
      title: "Continue",
      size: "big",
      variant: "brand",
      type: "submit"
    });

    expect(button.type).toBe("button");
    expect(button.props.type).toBe("submit");
    expect(button.props.className).toBe("ehButton ehButton--big ehButton--brand");
    expect(JSON.stringify(button.props.children)).toContain("Continue");
  });

  it("renders optional start and end icons as decorative content", () => {
    const button = Button({
      title: "Back",
      size: "medium",
      variant: "default",
      startIcon: <svg data-testid="start" />,
      endIcon: <svg data-testid="end" />
    });

    const serializedButton = JSON.stringify(button.props.children);

    expect(button.props.className).toBe("ehButton ehButton--medium ehButton--default");
    expect(serializedButton).toContain("ehButton__icon ehButton__icon--start");
    expect(serializedButton).toContain("ehButton__icon ehButton__icon--end");
    expect(serializedButton).toContain("Back");
  });

  it("renders the compact small size", () => {
    const button = Button({
      title: "Compact",
      size: "small",
      variant: "default"
    });

    const smallRule = getCssRule(".ehButton--small");

    expect(button.props.className).toBe("ehButton ehButton--small ehButton--default");
    expect(smallRule).toContain("height: 31px;");
    expect(smallRule).toContain("font-size: 12px;");
    expect(smallRule).toContain("font-weight: 700;");
  });

  it("renders the glass variant", () => {
    const button = Button({
      title: "Glass",
      variant: "glass"
    });

    const glassRule = getCssRule(".ehButton--glass");

    expect(button.props.className).toBe("ehButton ehButton--big ehButton--glass");
    expect(glassRule).toContain("background-color: rgb(30, 27, 62);");
    expect(glassRule).toContain("border: 1px solid var(--eh-color-moon-300-alpha-14);");
    expect(glassRule).toContain("color: rgb(236, 234, 247);");
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
    expect(button.props.className).toBe("ehButton ehButton--big ehButton--brand custom");
    expect(button.props.onClick).toBe(onClick);
    expect(button.props.ref).toBe(ref);
  });

  it("defines the design-system button dimensions and typography", () => {
    expect(buttonCss).toContain("font-size: var(--eh-font-size-14);");
    expect(getCssRule(".ehButton--medium")).toContain("height: var(--eh-length-36);");
    expect(getCssRule(".ehButton--big")).toContain("height: 42px;");
  });
});

function getCssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`).exec(buttonCss);

  if (!match?.groups?.body) {
    throw new Error(`Expected CSS rule for ${selector}`);
  }

  return match.groups.body;
}
