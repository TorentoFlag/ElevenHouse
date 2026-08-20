import test from "node:test";
import assert from "node:assert/strict";

import {
  createProductionImagePlan,
  productionImages,
} from "./plan-production-images.mjs";

const currentImageTag = "6cec802e07bae80141b2279c8f959b640e4855b4";

function imageNames(items) {
  return items.map((item) => item.image).sort();
}

test("plans one changed frontend app and promotes the rest", () => {
  const plan = createProductionImagePlan(
    ["apps/client-web/src/pages/home/HomePage.tsx"],
    { currentImageTag },
  );

  assert.deepEqual(imageNames(plan.build), ["elevenhouse-client-web"]);
  assert.equal(plan.promote.length, productionImages.length - 1);
  assert.equal(plan.deployRequired, true);
});

test("shared packages conservatively rebuild all node images but not chart-engine", () => {
  const plan = createProductionImagePlan(["packages/contracts/src/clients.ts"], {
    currentImageTag,
  });

  assert.equal(plan.build.some((item) => item.image === "elevenhouse-chart-engine"), false);
  assert.equal(plan.build.length, productionImages.length - 1);
  assert.deepEqual(imageNames(plan.promote), ["elevenhouse-chart-engine"]);
});

test("chart-engine changes rebuild only chart-engine", () => {
  const plan = createProductionImagePlan(["apps/chart-engine/src/chart_engine/main.py"], {
    currentImageTag,
  });

  assert.deepEqual(imageNames(plan.build), ["elevenhouse-chart-engine"]);
  assert.equal(plan.promote.length, productionImages.length - 1);
});

test("deployment runtime changes deploy without rebuilding images", () => {
  const plan = createProductionImagePlan(["deployment/caddy/Caddyfile"], {
    currentImageTag,
  });

  assert.equal(plan.deployRequired, true);
  assert.equal(plan.build.length, 0);
  assert.equal(plan.promote.length, productionImages.length);
});

test("docs-only changes do not require production deployment", () => {
  const plan = createProductionImagePlan(["docs/product/roadmap.md"], {
    currentImageTag,
  });

  assert.equal(plan.deployRequired, false);
  assert.equal(plan.build.length, 0);
  assert.equal(plan.promote.length, productionImages.length);
});

test("force deploy keeps images promoted for a manual redeploy", () => {
  const plan = createProductionImagePlan(["docs/product/roadmap.md"], {
    currentImageTag,
    forceDeploy: true,
  });

  assert.equal(plan.deployRequired, true);
  assert.equal(plan.build.length, 0);
  assert.equal(plan.promote.length, productionImages.length);
});

test("missing current tag rebuilds all images", () => {
  const plan = createProductionImagePlan(["docs/product/roadmap.md"], {
    currentImageTag: "",
  });

  assert.equal(plan.buildAllBecauseNoCurrentTag, true);
  assert.equal(plan.deployRequired, true);
  assert.equal(plan.build.length, productionImages.length);
  assert.equal(plan.promote.length, 0);
});
