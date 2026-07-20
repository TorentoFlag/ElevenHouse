import { describe, expect, it } from "vitest";
import {
  formatAspectTypeDisplay,
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getChartPointSymbol
} from "./chartDisplay";

describe("chartDisplay", () => {
  it("maps provider point ids to Russian UI labels without changing canonical ids", () => {
    expect(getChartPointDisplayLabel("sun", "Sun")).toBe("Солнце");
    expect(getChartPointDisplayLabel("moon", "Moon")).toBe("Луна");
    expect(getChartPointDisplayLabel("ascendant", "Ascendant")).toBe("Асцендент");
    expect(getChartPointDisplayLabel("midheaven", "Midheaven")).toBe("Середина неба");
    expect(getChartPointDisplayLabel("north_node", "True North Node")).toBe("Северный узел");
    expect(getChartPointDisplayLabel("unknown", "Provider Name")).toBe("Provider Name");
  });

  it("formats signs, aspects and symbols in the Russian chart UI", () => {
    expect(formatChartPointPosition({ sign: "cancer", signDegree: 22.6, retrograde: false })).toBe(
      "Рак 22°36'"
    );
    expect(formatChartPointPosition({ sign: "capricorn", signDegree: 21.98, retrograde: true })).toBe(
      "Козерог 21°59' R"
    );
    expect(formatHouseSignDisplay("virgo")).toBe("Дева");
    expect(formatAspectTypeDisplay("square")).toBe("Квадрат");
    expect(getChartPointSymbol("south_node", "True South Node")).toBe("☋︎");
  });
});
