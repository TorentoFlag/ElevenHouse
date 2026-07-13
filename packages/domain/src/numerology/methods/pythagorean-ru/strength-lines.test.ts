import { describe, expect, it } from "vitest";
import { calculateStrengthLines } from "./strength-lines";

describe("Pythagorean RU strength lines", () => {
  it("classifies the approved five line levels", () => {
    const cells = {
      "1": "",
      "2": "2",
      "3": "33",
      "4": "444",
      "5": "5555",
      "6": "",
      "7": "",
      "8": "",
      "9": ""
    } as const;
    const values = calculateStrengthLines(cells);
    expect(values.find((line) => line.code === "goal")?.level).toBe("expressed");
    expect(values.find((line) => line.code === "family")?.level).toBe("strong");
    expect(values.find((line) => line.code === "stability")?.level).toBe("moderate");
    expect(values.find((line) => line.code === "talent")?.level).toBe("absent");
    expect(values.find((line) => line.code === "self_esteem")?.level).toBe("expressed");
  });
});
