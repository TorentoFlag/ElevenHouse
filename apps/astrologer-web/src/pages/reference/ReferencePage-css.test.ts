import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const referencePageCss = readFileSync(
  fileURLToPath(new URL("./ReferencePage.module.css", import.meta.url)),
  "utf8"
);

describe("ReferencePage.module.css", () => {
  it("animates category selection and result list updates with design-system motion timing", () => {
    expect(referencePageCss).toContain("--reference-category-motion-duration: 220ms;");
    expect(referencePageCss).toContain("--reference-results-motion-duration: 360ms;");
    expect(referencePageCss).toContain(".categoryButton {");
    expect(referencePageCss).toContain("transition:");
    expect(referencePageCss).toContain(".resultsMotion {");
    expect(referencePageCss).toContain("--eh-motion-content-enter-y: 8px;");
    expect(referencePageCss).toContain("--eh-motion-content-enter-scale: 0.996;");
    expect(referencePageCss).toContain(".resultsMotionUpdating {");
    expect(referencePageCss).toContain("opacity: 0.82;");
    expect(referencePageCss).toContain("var(--reference-results-motion-duration)");
    expect(referencePageCss).toContain(
      "var(--eh-motion-ease-standard, cubic-bezier(0.16, 1, 0.3, 1))"
    );
  });

  it("removes result and category motion for reduced motion preferences", () => {
    expect(referencePageCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(referencePageCss).toContain(".resultsMotion,");
    expect(referencePageCss).toContain(".resultsMotionUpdating");
    expect(referencePageCss).toContain("animation: none;");
    expect(referencePageCss).toContain("transition: none;");
  });
});
