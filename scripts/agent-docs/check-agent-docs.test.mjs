import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("AstroDiary execution docs describe one-time paid access, not recurring renewal", async () => {
  const captureDispatchPlan = await readFile(
    "docs/superpowers/plans/2026-08-13-client-subscription-capture-dispatch.md",
    "utf8"
  );
  const backendModules = await readFile("docs/architecture/backend-modules.md", "utf8");
  const astroDiaryBackendParagraph = backendModules
    .split("\n\n")
    .find((paragraph) => paragraph.startsWith("`astro-diary` exposes"));

  assert.doesNotMatch(captureDispatchPlan, /renewal\/replay/i);
  assert.ok(astroDiaryBackendParagraph);
  assert.doesNotMatch(astroDiaryBackendParagraph, /saved-card subscription/i);
});
