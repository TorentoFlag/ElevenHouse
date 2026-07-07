import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const landingStylesSource = readFileSync(
  fileURLToPath(new URL("../styles.css", import.meta.url)),
  "utf8"
);

const revealSource = readFileSync(
  fileURLToPath(new URL("./useLandingReveal.ts", import.meta.url)),
  "utf8"
);

const pricingSectionSource = readFileSync(
  fileURLToPath(new URL("../pages/home/sections/PricingSection.tsx", import.meta.url)),
  "utf8"
);

describe("landing motion contract", () => {
  it("uses a lightweight IntersectionObserver reveal layer", () => {
    expect(revealSource).toContain("IntersectionObserver");
    expect(revealSource).toContain("unobserve");
    expect(revealSource).toContain("prefers-reduced-motion");
  });

  it("defines compositor-only reveal choreography and reduced motion guards", () => {
    expect(landingStylesSource).toContain("--landing-motion-duration-normal");
    expect(landingStylesSource).toContain("@keyframes landingRevealIn");
    expect(landingStylesSource).toContain("transform: translate3d");
    expect(landingStylesSource).toContain("opacity:");
    expect(landingStylesSource).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("progressively enhances scroll-linked polish without requiring it", () => {
    expect(landingStylesSource).toContain("@supports (animation-timeline: view())");
    expect(landingStylesSource).toContain("animation-timeline: view()");
  });

  it("uses cinematic timing without animating layout properties", () => {
    expect(landingStylesSource).toContain("--landing-motion-duration-cinematic");
    expect(landingStylesSource).toContain("--landing-motion-stagger-step: 96ms");
    expect(landingStylesSource).toContain("@keyframes landingAmbientDrift");
    expect(landingStylesSource).toContain("@keyframes landingPanelFloat");
    expect(landingStylesSource).toContain("transition-behavior: allow-discrete");
    expect(landingStylesSource).not.toContain("transition: height");
    expect(landingStylesSource).not.toContain("transition: top");
    expect(landingStylesSource).not.toContain("transition: left");
  });

  it("smooths pricing cycle state changes with design-system motion", () => {
    expect(pricingSectionSource).toContain('from "@elevenhouse/design-system/motion"');
    expect(pricingSectionSource).toContain('<MotionContent className="price-cycle-motion"');
    expect(pricingSectionSource).toContain("transitionKey={`${cycle}-${plan.id}-${price}`}");
  });
});
