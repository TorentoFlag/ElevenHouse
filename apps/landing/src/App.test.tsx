import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { LANDING_APP_TITLE } from "./app-title";
import { landingCopy, landingLanguages, landingSections, primaryCtaHref } from "./content/landingContent";

describe("landing app shell", () => {
  it("exposes the landing app title", () => {
    expect(LANDING_APP_TITLE).toBe("ElevenHouse Landing");
  });

  it("keeps the design reference section order", () => {
    expect(landingSections.map((section) => section.id)).toEqual([
      "hero",
      "pains",
      "showcase",
      "features",
      "replace",
      "how",
      "pricing",
      "quotes",
      "faq",
      "footer"
    ]);
  });

  it("routes acquisition CTAs to astrologer registration", () => {
    expect(primaryCtaHref).toBe("/auth?mode=register");
  });

  it("provides English landing copy for the language switcher", () => {
    expect(landingLanguages).toEqual(["ru", "en"]);
    expect(landingCopy.en.hero.title).toEqual(["Your stellar practice", "in one workspace"]);
    expect(landingCopy.en.navLinks.map((link) => link.label)).toEqual(["Features", "How it works", "Pricing"]);
  });

  it("renders a React element", () => {
    expect(isValidElement(App())).toBe(true);
  });
});
