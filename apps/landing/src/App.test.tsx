import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, resolveLandingRoute } from "./App";
import { LANDING_APP_TITLE } from "./app-title";
import { landingCopy, landingLanguages, landingSections, loginHref, primaryCtaHref } from "./content/landingContent";
import { LandingPage } from "./pages/home/LandingPage";
import { PersonalDataProcessingPolicyPage } from "./pages/personal-data-processing/PersonalDataProcessingPolicyPage";
import {
  personalDataProcessingContactEmail,
  personalDataProcessingPolicyEn,
  personalDataProcessingPolicyRu
} from "./pages/personal-data-processing/personalDataProcessingPolicyContent";
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
    expect(resolveLandingRoute("/personal-data-processing")).toBe("personalDataProcessing");
    expect(resolveLandingRoute("/personal-data-processing/")).toBe("personalDataProcessing");
    expect(resolveLandingRoute("/")).toBe("home");
    expect(resolveLandingRoute("/pricing")).toBe("home");

    const privacyElement = App({ pathname: "/privacy" });
    const personalDataProcessingElement = App({ pathname: "/personal-data-processing" });
    const homeElement = App({ pathname: "/" });

    expect(isValidElement(privacyElement) && privacyElement.type).toBe(PrivacyPolicyPage);
    expect(
      isValidElement(personalDataProcessingElement) && personalDataProcessingElement.type
    ).toBe(PersonalDataProcessingPolicyPage);
    expect(isValidElement(homeElement) && homeElement.type).toBe(LandingPage);
  });

  it("links the standalone personal data processing policy from the footer copy", () => {
    expect(landingCopy.ru.legal.personalDataProcessing).toBe(
      "Политика сбора и обработки персональных данных"
    );
    expect(landingCopy.en.legal.personalDataProcessing).toBe("Personal data processing policy");
  });

  it("publishes the Kyrgyz Republic privacy policy content and contact", () => {
    const policyText = privacyPolicySections
      .flatMap((section) => [
        section.title,
        ...section.blocks.flatMap((block) => {
          if (block.kind === "list") {
            return block.items;
          }

          return block.text;
        })
      ])
      .join("\n");

    expect(privacyContactEmail).toBe("info@kyulchoro.kg");
    expect(policyText).toContain("Общество с ограниченной ответственностью «Кюльчоро»");
    expect(policyText).toContain("Законом Кыргызской Республики «О персональных данных»");
    expect(policyText).toContain("требованиями Google Play Developer Policy");
    expect(policyText).toContain("Email: info@kyulchoro.kg");
  });

  it("publishes the standalone personal data processing policy in Russian and English", () => {
    expect(personalDataProcessingContactEmail).toBe("support@elevenhouse.ai");
    expect(personalDataProcessingPolicyRu).toContain(
      "Политика сбора и обработки персональных данных"
    );
    expect(personalDataProcessingPolicyRu).toContain("ОсОО «Кюльчоро»");
    expect(personalDataProcessingPolicyRu).toContain("Цифрового кодекса Кыргызской Республики");
    expect(personalDataProcessingPolicyRu).toContain("Инциденты и уведомления");
    expect(personalDataProcessingPolicyEn).toContain(
      "Personal Data Collection and Processing Policy"
    );
    expect(personalDataProcessingPolicyEn).toContain("Kyulchoro LLC");
    expect(personalDataProcessingPolicyEn).toContain("Digital Code of the Kyrgyz Republic");
    expect(personalDataProcessingPolicyEn).toContain("Incidents and Notifications");
  });

  it("renders a React element", () => {
    expect(isValidElement(App())).toBe(true);
  });
});
