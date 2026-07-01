import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const motionCss = readFileSync(fileURLToPath(new URL("./motion.css", import.meta.url)), "utf8");

describe("motion.css", () => {
  it("defines native view-transition animation for routed page content", () => {
    expect(motionCss).toContain(".ehMotionRouteContent");
    expect(motionCss).toContain("::view-transition-old(root)");
    expect(motionCss).toContain("::view-transition-new(root)");
    expect(motionCss).toContain("::view-transition-old(eh-page)");
    expect(motionCss).toContain("::view-transition-new(eh-page)");
    expect(motionCss).toContain("@keyframes ehMotionRouteContentEnter");
    expect(motionCss).toContain("@keyframes ehMotionRouteContentExit");
  });

  it("keeps route transitions compatible with reduced motion preferences", () => {
    expect(motionCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motionCss).toContain(".ehMotionRouteContent--fallback");
    expect(motionCss).toContain("::view-transition-old(eh-page)");
    expect(motionCss).toContain("::view-transition-new(eh-page)");
    expect(motionCss).toContain("animation: none;");
  });
});
