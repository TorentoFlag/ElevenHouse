import { describe, expect, it } from "vitest";
import * as designSystem from "./index.js";
import { colorTokens } from "./index.js";

describe("colorTokens", () => {
  it("exports the core palette from the visual reference app", () => {
    expect(colorTokens).toMatchObject({
      core: {
        night: "#0B0B1F",
        violetDeep: "#2A1B4E",
        amethyst: "#8B5CF6",
        gold: "#F4C430",
        moon: "#D8D4EC"
      },
      background: {
        deepest: "#07060F",
        app: "#0B0B1F",
        panel: "rgba(13, 12, 32, 0.6)"
      },
      surface: {
        sidebar: "#110F26",
        card: "#16142F",
        raised: "#1E1B3E",
        selected: "#272252"
      },
      text: {
        primary: "#ECEAF7",
        secondary: "#A7A2C8",
        muted: "#6F6A93",
        onAccent: "#0B0B1F"
      }
    });
  });

  it("includes both accent modes from the reference tweaks", () => {
    expect(colorTokens.accent.amethyst).toEqual({
      solid: "#8B5CF6",
      soft: "rgba(139, 92, 246, 0.14)",
      line: "rgba(139, 92, 246, 0.40)",
      text: "#B79CFB",
      glow: "rgba(139, 92, 246, 0.45)",
      onSolid: "#0B0B1F"
    });

    expect(colorTokens.accent.gold).toEqual({
      solid: "#F4C430",
      soft: "rgba(244, 196, 48, 0.14)",
      line: "rgba(244, 196, 48, 0.42)",
      text: "#F6D266",
      glow: "rgba(244, 196, 48, 0.40)",
      onSolid: "#2A1B0B"
    });
  });

  it("includes semantic colors for statuses, data series, and channels", () => {
    expect(colorTokens.status).toEqual({
      positive: {
        solid: "#4EC8A0",
        soft: "rgba(78, 200, 160, 0.14)",
        line: "rgba(78, 200, 160, 0.3)"
      },
      warning: {
        solid: "#F4C430",
        soft: "rgba(244, 196, 48, 0.14)",
        line: "rgba(244, 196, 48, 0.3)"
      },
      danger: {
        solid: "#F47A7A",
        soft: "rgba(244, 122, 122, 0.12)",
        line: "rgba(244, 122, 122, 0.3)"
      },
      info: {
        solid: "#6FA8FF",
        soft: "rgba(111, 168, 255, 0.16)",
        line: "rgba(111, 168, 255, 0.36)"
      },
      neutral: {
        solid: "#A7A2C8",
        soft: "rgba(167, 162, 200, 0.10)",
        line: "rgba(167, 162, 200, 0.35)"
      }
    });

    expect(colorTokens.data.categorical).toEqual([
      "#F4C430",
      "#F47A7A",
      "#E59CC4",
      "#B79CFB",
      "#6FA8FF",
      "#4EC8A0",
      "#D8D4EC",
      "#A7A2C8"
    ]);

    expect(colorTokens.channel).toMatchObject({
      telegram: "#2AABEE",
      instagram: "#E1306C",
      whatsapp: "#25D366",
      vk: "#0077FF",
      max: "#7C5CFC"
    });
  });

  it("does not keep the old surfaceTokens export", () => {
    expect("surfaceTokens" in designSystem).toBe(false);
  });
});
