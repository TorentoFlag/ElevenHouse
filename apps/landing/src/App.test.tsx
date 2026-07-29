import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, resolveLandingRoute } from "./App";
import { LANDING_APP_TITLE } from "./app-title";
import { landingCopy, landingLanguages, landingSections, loginHref, primaryCtaHref } from "./content/landingContent";
import { LandingPage } from "./pages/home/LandingPage";
import { PrivacyPolicyPage } from "./pages/privacy/PrivacyPolicyPage";
import { privacyContactEmail, privacyPolicySections } from "./pages/privacy/privacyPolicyContent";

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

  it("routes /privacy to the public privacy policy page", () => {
    expect(resolveLandingRoute("/privacy")).toBe("privacy");
    expect(resolveLandingRoute("/privacy/")).toBe("privacy");
    expect(resolveLandingRoute("/")).toBe("home");
    expect(resolveLandingRoute("/pricing")).toBe("home");

    const privacyElement = App({ pathname: "/privacy" });
    const homeElement = App({ pathname: "/" });

    expect(isValidElement(privacyElement) && privacyElement.type).toBe(PrivacyPolicyPage);
    expect(isValidElement(homeElement) && homeElement.type).toBe(LandingPage);
  });

  it("publishes policy content for messaging integrations and data deletion requests", () => {
    const policyText = privacyPolicySections
      .flatMap((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? [])])
      .join("\n");

    expect(privacyContactEmail).toBe("privacy@elevenhouse.ai");
    expect(policyText).toContain("Instagram Direct");
    expect(policyText).toContain("Telegram");
    expect(policyText).toContain("To request access, correction, deletion or account-data removal");
    expect(policyText).toContain("We do not sell Instagram, Telegram or other messaging data");
  });

  it("renders a React element", () => {
    expect(isValidElement(App())).toBe(true);
  });
});
