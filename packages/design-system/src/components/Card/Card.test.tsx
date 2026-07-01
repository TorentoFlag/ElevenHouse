import { createRef } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Card } from "./Card.js";

const cardCss = readFileSync(fileURLToPath(new URL("./Card.css", import.meta.url)), "utf8");

describe("Card", () => {
  it("renders a design-system surface with semantic element, variant and padding", () => {
    const card = Card({
      as: "article",
      variant: "elevated",
      padding: "medium",
      children: "Солнце в Овне"
    });

    expect(card.type).toBe("article");
    expect(card.props.className).toBe("ehCard ehCard--medium ehCard--elevated");
    expect(card.props.children).toBe("Солнце в Овне");
  });

  it("passes native props, ref and custom className through", () => {
    const ref = createRef<HTMLDivElement>();
    const card = Card({
      className: "custom",
      ref,
      "aria-label": "Карточка трактовки",
      children: "Текст"
    });

    expect(card.type).toBe("div");
    expect(card.props.className).toBe("ehCard ehCard--medium ehCard--default custom");
    expect(card.props.ref).toBe(ref);
    expect(card.props["aria-label"]).toBe("Карточка трактовки");
  });

  it("defines shared card surface styles through design-system classes", () => {
    expect(cardCss).toContain(".ehCard");
    expect(cardCss).toContain("border: 1px solid var(--eh-card-border);");
    expect(cardCss).toContain("border-radius: var(--eh-card-radius);");
    expect(cardCss).toContain("background: var(--eh-card-background);");
    expect(cardCss).toContain("padding: var(--eh-card-padding);");
    expect(getCssRule(".ehCard--medium")).toContain("--eh-card-padding: 15px 17px;");
    expect(getCssRule(".ehCard--elevated")).toContain(
      "--eh-card-shadow: 0 18px 42px rgb(0 0 0 / 0.18);"
    );
  });
});

function getCssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`).exec(cardCss);

  if (!match?.groups?.body) {
    throw new Error(`Expected CSS rule for ${selector}`);
  }

  return match.groups.body;
}
