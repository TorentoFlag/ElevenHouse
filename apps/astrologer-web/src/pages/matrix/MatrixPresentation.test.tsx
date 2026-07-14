import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { matrixDataSchema } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { describe, expect, it, vi } from "vitest";
import { MatrixPresentation } from "./MatrixPresentation";

const matrixCss = readFileSync(fileURLToPath(new URL("./MatrixPage.module.css", import.meta.url)), "utf8");

const matrix = matrixDataSchema.parse({
  points: Object.fromEntries(
    [
      "A",
      "B",
      "C",
      "D",
      "E",
      "tl",
      "tr",
      "br",
      "bl",
      "A1",
      "B1",
      "C1",
      "D1",
      "tl1",
      "tr1",
      "br1",
      "bl1"
    ].map((key, index) => [key, (index % 22) + 1])
  ),
  purposes: { earth: 1, sky: 2, male: 3, female: 4, personal: 5, social: 6, spiritual: 7 },
  zones: { purpose: 8, money: 9, love: 10, energy: 11 },
  energyMap: {
    rows: [
      "sahasrara",
      "ajna",
      "vishuddha",
      "anahata",
      "manipura",
      "svadhisthana",
      "muladhara"
    ].map((code, index) => ({ code, physical: index + 1, energy: index + 2, emotions: index + 3 })),
    totals: { physical: 10, energy: 11, emotions: 12 }
  }
});

describe("MatrixPresentation", () => {
  it("uses the shared modal so close controls and Escape stay above the application shell", () => {
    const onClose = vi.fn();
    const view = MatrixPresentation({ matrix, title: "Голубев Антон", onClose });

    expect(view.type).toBe(Modal);
    expect(view.props.title).toBe("Матрица судьбы · Голубев Антон");
    expect(view.props.closeLabel).toBe("Закрыть презентацию");
    expect(view.props.onClose).toBe(onClose);
  });

  it("keeps the presentation dialog wider than the shared modal default", () => {
    expect(matrixCss).toContain(":global(.ehModal__backdrop).presentationOverlay");
    expect(matrixCss).toContain(":global(.ehModal__dialog).presentationDialog");
    expect(matrixCss).toContain(":global(.ehModal__content).presentationContent");
  });
});
