import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { LandingReveal } from "./LandingReveal";

describe("LandingReveal", () => {
  it("renders a reveal element with stable motion attributes", () => {
    const reveal = LandingReveal({
      children: "Practice grows here",
      className: "custom-class",
      delay: 2,
      variant: "lift"
    });

    expect(reveal.type).toBe("div");
    expect(reveal.props.className).toBe("motion-reveal motion-reveal--lift custom-class");
    expect(reveal.props["data-motion"]).toBe("reveal");
    expect(reveal.props["data-motion-delay"]).toBe("2");
    expect(reveal.props.children).toBe("Practice grows here");
  });

  it("can render semantic section wrappers without nesting layout cards", () => {
    const reveal = LandingReveal({
      as: "section",
      children: <h2>Pricing</h2>,
      className: "section",
      variant: "fade"
    });

    expect(reveal.type).toBe("section");
    expect(reveal.props.className).toBe("motion-reveal motion-reveal--fade section");
    expect(isValidElement(reveal.props.children)).toBe(true);
  });
});
