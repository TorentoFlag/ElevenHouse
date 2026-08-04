// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { StoredChartAstrocartographyCalculationPayload } from "@elevenhouse/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { AstrocartographyLineList } from "./AstrocartographyLineList";

afterEach(cleanup);

describe("AstrocartographyLineList", () => {
  it("keeps the complete map line set available to assistive technology", () => {
    const result = astrocartographyResult();
    render(
      <AstrocartographyLineList copy={chartEngineCopyByLocale.en} locale="en" result={result} />
    );

    const list = screen.getByRole("list", { name: "Astrocartography lines" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(result.result.lines.length);
    expect(within(list).getByText("Sun, MC: Sun MC")).toBeInTheDocument();
    expect(within(list).getByText("Moon, Asc: Moon Asc")).toBeInTheDocument();
  });
});

function astrocartographyResult(): StoredChartAstrocartographyCalculationPayload {
  const points = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ] as const;
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
      lines: points.map((point, index) => ({
        id: `${point}_${index === 1 ? "asc" : "mc"}`,
        point,
        angle: index === 1 ? "asc" : "mc",
        label: `${point} ${index === 1 ? "Asc" : "MC"}`,
        path: [
          { latitude: -20, longitude: -30 },
          { latitude: 20, longitude: 30 }
        ]
      })),
      warnings: []
    }
  };
}
