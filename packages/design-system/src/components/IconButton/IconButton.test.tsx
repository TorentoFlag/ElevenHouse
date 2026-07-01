import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IconButton } from "./IconButton.js";

const iconButtonCss = readFileSync(
  fileURLToPath(new URL("./IconButton.css", import.meta.url)),
  "utf8"
);

describe("IconButton", () => {
  it("renders an accessible icon-only button without visible title requirements", () => {
    const element = IconButton({
      label: "Свернуть меню",
      icon: <span data-icon="collapse" />,
      variant: "drawer",
      size: "big",
      pressed: true,
      className: "custom-control"
    });

    expect(element.type).toBe("button");
    expect(element.props.type).toBe("button");
    expect(element.props["aria-label"]).toBe("Свернуть меню");
    expect(element.props["aria-pressed"]).toBe(true);
    expect(element.props.className).toBe(
      "ehIconButton ehIconButton--big ehIconButton--drawer ehIconButton--pressed custom-control"
    );
    expect(element.props.children.props.className).toBe("ehIconButton__icon");
    expect(element.props.children.props.children.props["data-icon"]).toBe("collapse");
  });

  it("forwards native button props and click handlers", () => {
    const onClick = vi.fn();
    const element = IconButton({
      label: "Открыть уведомления",
      icon: <span data-icon="bell" />,
      disabled: true,
      onClick
    });

    expect(element.props.disabled).toBe(true);
    expect(element.props.className).toBe("ehIconButton ehIconButton--big ehIconButton--default");

    element.props.onClick();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("defines small, medium and big icon button dimensions", () => {
    expect(getCssRule(".ehIconButton--small")).toContain("width: 31px;");
    expect(getCssRule(".ehIconButton--small")).toContain("height: 31px;");
    expect(getCssRule(".ehIconButton--medium")).toContain("width: var(--eh-length-36);");
    expect(getCssRule(".ehIconButton--medium")).toContain("height: var(--eh-length-36);");
    expect(getCssRule(".ehIconButton--big")).toContain("width: 42px;");
    expect(getCssRule(".ehIconButton--big")).toContain("height: 42px;");
    expect(getCssRule(".ehIconButton--small .ehIconButton__icon svg")).toContain("width: 13px;");
    expect(getCssRule(".ehIconButton--small .ehIconButton__icon svg")).toContain("height: 13px;");
  });

  it("renders the quiet variant for transparent icon-only actions", () => {
    const element = IconButton({
      label: "Удалить",
      icon: <span data-icon="trash" />,
      variant: "quiet",
      size: "small"
    });

    expect(element.props.className).toBe("ehIconButton ehIconButton--small ehIconButton--quiet");
    expect(getCssRule(".ehIconButton--quiet")).toContain("background: transparent;");
    expect(getCssRule(".ehIconButton--quiet")).toContain("color: var(--eh-color-moon-500);");
  });
});

function getCssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`).exec(iconButtonCss);

  if (!match?.groups?.body) {
    throw new Error(`Expected CSS rule for ${selector}`);
  }

  return match.groups.body;
}
