import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { LANDING_APP_TITLE } from "./app-title";
import { landingCopy, landingLanguages, landingSections, loginHref, primaryCtaHref } from "./content/landingContent";

describe("landing app shell", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("routes acquisition CTAs to the local astrologer auth app by default", () => {
    expect(primaryCtaHref).toBe("http://localhost:5174/auth?mode=register");
    expect(loginHref).toBe("http://localhost:5174/auth?mode=login");
  });

  it("routes acquisition CTAs to the deploy-specific astrologer auth origin", async () => {
    vi.stubEnv("VITE_ASTROLOGER_WEB_ORIGIN", "https://app.elevenhouse.com");
    vi.resetModules();

    const content = await import("./content/landingContent");

    expect(content.primaryCtaHref).toBe("https://app.elevenhouse.com/auth?mode=register");
    expect(content.loginHref).toBe("https://app.elevenhouse.com/auth?mode=login");
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
