import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip.js";

const tooltipCss = readFileSync(
  fileURLToPath(new URL("./Tooltip.css", import.meta.url)),
  "utf8"
);

describe("Tooltip", () => {
  it("wraps a control with an accessible tooltip message", () => {
    const tooltip = Tooltip({
      content: "Сначала заполните название",
      children: <button type="button" disabled />
    });

    expect(tooltip.type).toBe("span");
    expect(tooltip.props.className).toBe("ehTooltip ehTooltip--top");
    expect(tooltip.props.children[0].props["aria-describedby"]).toBeDefined();
    expect(tooltip.props.children[1].type).toBe("span");
    expect(tooltip.props.children[1].props.role).toBe("tooltip");
    expect(tooltip.props.children[1].props.children).toBe("Сначала заполните название");
    expect(tooltip.props.children[1].props.id).toBe(
      tooltip.props.children[0].props["aria-describedby"]
    );
  });

  it("defines hover and focus visibility for the tooltip bubble", () => {
    expect(getCssRule(".ehTooltip")).toContain("position: relative;");
    expect(getCssRule(".ehTooltip__bubble")).toContain("position: absolute;");
    expect(tooltipCss).toContain(".ehTooltip:hover .ehTooltip__bubble");
    expect(tooltipCss).toContain(".ehTooltip:focus-within .ehTooltip__bubble");
  });
});

function getCssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`).exec(tooltipCss);

  if (!match?.groups?.body) {
    throw new Error(`Expected CSS rule for ${selector}`);
  }

  return match.groups.body;
}
