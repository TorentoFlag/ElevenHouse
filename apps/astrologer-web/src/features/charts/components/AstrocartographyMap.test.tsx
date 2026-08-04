// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { StoredChartAstrocartographyCalculationPayload } from "@elevenhouse/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstrocartographyMap } from "./AstrocartographyMap";

afterEach(() => {
  cleanup();
});

describe("AstrocartographyMap", () => {
  it("renders Natural Earth land geometry and clips chart lines at the antimeridian", () => {
    render(<AstrocartographyMap result={astrocartographyResult()} />);

    const map = screen.getByTestId("astrocartography-map");
    expect(map.querySelector("ellipse")).toBeNull();
    const land = screen.getByTestId("astrocartography-land");
    expect(land.tagName.toLowerCase()).toBe("path");
    expect(land.getAttribute("d")?.match(/M/g)?.length).toBeGreaterThan(100);

    expect(screen.getByTestId("astrocartography-line-sun_mc")).toHaveAttribute(
      "points",
      "700.0,220.0 720.0,180.0"
    );
    expect(screen.getByTestId("astrocartography-line-sun_mc-segment-2")).toHaveAttribute(
      "points",
      "0.0,180.0 20.0,140.0"
    );
  });

  it("exposes every rendered line in a complete non-visual list", () => {
    render(<AstrocartographyMap result={astrocartographyResult()} />);

    const list = screen.getByRole("list", { name: "Линии астрокартографии" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Солнце, MC: Солнце MC")).toBeInTheDocument();
    expect(within(list).getByText("Луна, Asc: Луна Asc")).toBeInTheDocument();
  });
});

function astrocartographyResult(): StoredChartAstrocartographyCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "astrocartography",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-01-01",
      birthTime: "12:00",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    result: {
      lines: [
        {
          id: "sun_mc",
          point: "sun",
          angle: "mc",
          label: "Солнце MC",
          path: [
            { latitude: -20, longitude: 170 },
            { latitude: 20, longitude: -170 }
          ]
        },
        {
          id: "moon_asc",
          point: "moon",
          angle: "asc",
          label: "Луна Asc",
          path: [
            { latitude: -20, longitude: -30 },
            { latitude: 20, longitude: 30 }
          ]
        }
      ],
      warnings: []
    }
  };
}
