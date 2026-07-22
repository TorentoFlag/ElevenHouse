// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartHouse, ChartPoint, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import { ChartWheel } from "./ChartWheel";
import styles from "./ChartEnginePage.module.css";

describe("ChartWheel", () => {
  afterEach(() => cleanup());

  it("orients the chart by Asc, labels the main axes, and tones aspect lines", () => {
    render(<ChartWheel hoveredPointId={null} onHoverPoint={vi.fn()} result={wheelResult()} />);

    const sunMarker = screen.getByTestId("chart-point-sun");
    const sunDot = sunMarker.querySelector("circle");
    expect(Number(sunDot?.getAttribute("cx"))).toBeLessThan(260);
    expect(Number(sunDot?.getAttribute("cy"))).toBeCloseTo(260, 0);

    expect(screen.getByText("Asc")).toBeInTheDocument();
    expect(screen.getByText("MC")).toBeInTheDocument();
    expect(screen.getByTestId("chart-aspect-square")).toHaveAttribute("data-aspect-tone", "hard");
    expect(screen.getByTestId("chart-aspect-trine")).toHaveAttribute("data-aspect-tone", "soft");
  });

  it("marks focusable planet glyphs so native SVG focus outlines can be suppressed", () => {
    render(<ChartWheel hoveredPointId={null} onHoverPoint={vi.fn()} result={wheelResult()} />);

    const pointMarkerClass = styles.pointMarker;
    expect(pointMarkerClass).toBeDefined();
    if (!pointMarkerClass) {
      throw new Error("Expected point marker class to be exported from chart CSS module.");
    }
    expect(screen.getByTestId("chart-point-sun")).toHaveClass(pointMarkerClass);
  });
});

function wheelResult(): StoredChartCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: completePoints(),
      houses: completeHouses(),
      aspects: [
        {
          pointA: "sun",
          pointB: "moon",
          type: "square",
          angle: 90,
          orb: 1.2,
          applying: true,
          strength: 0.8
        },
        {
          pointA: "venus",
          pointB: "mars",
          type: "trine",
          angle: 120,
          orb: 2.4,
          applying: false,
          strength: 0.6
        }
      ],
      distributions: {
        elements: { fire: 3, earth: 2, air: 1, water: 4 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 4, feminine: 6 }
      },
      warnings: []
    }
  };
}

function completePoints(): ChartPoint[] {
  const entries = [
    ["sun", "Sun", 180, "libra", 0, 1, false],
    ["moon", "Moon", 270, "capricorn", 0, 4, false],
    ["mercury", "Mercury", 188, "libra", 8, 1, false],
    ["venus", "Venus", 210, "scorpio", 0, 2, false],
    ["mars", "Mars", 330, "pisces", 0, 6, false],
    ["jupiter", "Jupiter", 40, "taurus", 10, 8, false],
    ["saturn", "Saturn", 80, "gemini", 20, 10, true],
    ["uranus", "Uranus", 120, "leo", 0, 11, false],
    ["neptune", "Neptune", 150, "virgo", 0, 12, false],
    ["pluto", "Pluto", 250, "sagittarius", 10, 3, false],
    ["ascendant", "Ascendant", 180, "libra", 0, 1, false],
    ["midheaven", "Midheaven", 90, "cancer", 0, 10, false],
    ["north_node", "North Node", 15, "aries", 15, 7, true],
    ["south_node", "South Node", 195, "libra", 15, 1, true]
  ] as const;

  return entries.map(([id, label, longitude, sign, signDegree, house, retrograde]) => ({
    id,
    label,
    longitude,
    sign,
    signDegree,
    house,
    retrograde
  }));
}

function completeHouses(): ChartHouse[] {
  return Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    const longitude = (180 + index * 30) % 360;

    return {
      number,
      longitude,
      sign: "libra",
      signDegree: 0
    };
  });
}
