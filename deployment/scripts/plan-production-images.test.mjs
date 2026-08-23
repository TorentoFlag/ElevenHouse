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

test("plans one changed frontend app without promoting unchanged images", () => {
  const plan = createProductionImagePlan(
    ["apps/client-web/src/pages/home/HomePage.tsx"],
    { currentImageTags: { default: currentImageTag }, headRef: currentImageTag },
  );

  assert.deepEqual(imageNames(plan.build), ["elevenhouse-client-web"]);
  assert.equal(plan.deployMode, "service");
  assert.deepEqual(plan.deployServices, ["client-web"]);
  assert.equal(plan.promote.length, 0);
  assert.equal(plan.deployRequired, true);
});

test("shared packages conservatively rebuild all node images but not chart-engine", () => {
  const plan = createProductionImagePlan(["packages/contracts/src/clients.ts"], {
    currentImageTags: { default: currentImageTag },
    headRef: "1111111111111111111111111111111111111111",
  });

  assert.equal(plan.build.some((item) => item.image === "elevenhouse-chart-engine"), false);
  assert.equal(plan.build.length, productionImages.length - 1);
  assert.equal(plan.promote.length, 0);
  assert.equal(plan.serviceTags.CHART_ENGINE_IMAGE_TAG, currentImageTag);
  assert.equal(plan.serviceTags.CLIENT_WEB_IMAGE_TAG, "1111111111111111111111111111111111111111");
});

test("chart-engine changes rebuild only chart-engine", () => {
  const plan = createProductionImagePlan(["apps/chart-engine/src/chart_engine/main.py"], {
    currentImageTags: { default: currentImageTag },
    headRef: "2222222222222222222222222222222222222222",
  });

  assert.deepEqual(imageNames(plan.build), ["elevenhouse-chart-engine"]);
  assert.deepEqual(plan.deployServices, ["chart-engine"]);
  assert.equal(plan.chartSmokeRequired, true);
  assert.equal(plan.promote.length, 0);
});

test("deployment runtime changes deploy without rebuilding images", () => {
  const plan = createProductionImagePlan(["deployment/caddy/Caddyfile"], {
    currentImageTags: { default: currentImageTag },
  });

  assert.equal(plan.deployRequired, true);
  assert.equal(plan.deployMode, "runtime");
  assert.equal(plan.build.length, 0);
  assert.equal(plan.promote.length, 0);
});

test("docs-only changes do not require production deployment", () => {
  const plan = createProductionImagePlan(["docs/product/roadmap.md"], {
    currentImageTags: { default: currentImageTag },
  });

  assert.equal(plan.deployRequired, false);
  assert.equal(plan.deployMode, "none");
  assert.equal(plan.build.length, 0);
  assert.equal(plan.promote.length, 0);
});

test("force deploy runs full rollout without rebuilding unchanged images", () => {
  const plan = createProductionImagePlan(["docs/product/roadmap.md"], {
    currentImageTags: { default: currentImageTag },
    forceDeploy: true,
  });

  assert.equal(plan.deployRequired, true);
  assert.equal(plan.deployMode, "full");
  assert.equal(plan.build.length, 0);
  assert.equal(plan.promote.length, 0);
});

test("missing current tag rebuilds all images", () => {
  const plan = createProductionImagePlan(["docs/product/roadmap.md"], {
    currentImageTags: {},
    headRef: "3333333333333333333333333333333333333333",
  });

  assert.equal(plan.buildAllBecauseNoCurrentTag, true);
  assert.equal(plan.deployRequired, true);
  assert.equal(plan.deployMode, "full");
  assert.equal(plan.build.length, productionImages.length);
  assert.equal(plan.promote.length, 0);
  assert.equal(plan.serviceTags.CLIENT_WEB_IMAGE_TAG, "3333333333333333333333333333333333333333");
});

test("db package changes require database release and all writers", () => {
  const plan = createProductionImagePlan(["packages/db/src/schema.ts"], {
    currentImageTags: { default: currentImageTag },
    headRef: "4444444444444444444444444444444444444444",
  });

  assert.equal(plan.deployMode, "db");
  assert.equal(plan.databaseReleaseRequired, true);
  assert.deepEqual(plan.deployServices, [
    "admin-api",
    "astrologer-api",
    "chart-worker",
    "notification-worker",
    "payment-worker",
    "public-api",
    "workers",
  ]);
});

test("encodes deploy services for ssh-safe transport", () => {
  const plan = createProductionImagePlan(["packages/db/src/schema.ts"], {
    currentImageTags: { default: currentImageTag },
    headRef: "5555555555555555555555555555555555555555",
  });

  assert.equal(
    Buffer.from(plan.deployServicesBase64, "base64").toString("utf8"),
    "admin-api astrologer-api chart-worker notification-worker payment-worker public-api workers"
  );
});
