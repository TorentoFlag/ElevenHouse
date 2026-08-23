#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const productionImages = [
  {
    image: "elevenhouse-landing",
    service: "landing",
    tagVariable: "LANDING_IMAGE_TAG",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/landing",
    app_dir: "landing",
    build_args: "VITE_ASTROLOGER_WEB_ORIGIN=https://app.elevenhouse.ai",
    servicePaths: ["apps/landing/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-client-web",
    service: "client-web",
    tagVariable: "CLIENT_WEB_IMAGE_TAG",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/client-web",
    app_dir: "client-web",
    build_args: "",
    servicePaths: ["apps/client-web/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-astrologer-web",
    service: "astrologer-web",
    tagVariable: "ASTROLOGER_WEB_IMAGE_TAG",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/astrologer-web",
    app_dir: "astrologer-web",
    build_args: "",
    servicePaths: ["apps/astrologer-web/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-admin-web",
    service: "admin-web",
    tagVariable: "ADMIN_WEB_IMAGE_TAG",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/admin-web",
    app_dir: "admin-web",
    build_args: "",
    servicePaths: ["apps/admin-web/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-public-api",
    service: "public-api",
    tagVariable: "PUBLIC_API_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/public-api",
    app_dir: "public-api",
    build_args: "",
    servicePaths: ["apps/public-api/"],
    group: "backend",
  },
  {
    image: "elevenhouse-astrologer-api",
    service: "astrologer-api",
    tagVariable: "ASTROLOGER_API_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/astrologer-api",
    app_dir: "astrologer-api",
    build_args: "",
    servicePaths: ["apps/astrologer-api/"],
    group: "backend",
  },
  {
    image: "elevenhouse-admin-api",
    service: "admin-api",
    tagVariable: "ADMIN_API_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/admin-api",
    app_dir: "admin-api",
    build_args: "",
    servicePaths: ["apps/admin-api/"],
    group: "backend",
  },
  {
    image: "elevenhouse-workers",
    service: "workers",
    tagVariable: "WORKERS_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/workers",
    app_dir: "workers",
    build_args: "",
    servicePaths: ["apps/workers/"],
    group: "backend",
  },
  {
    image: "elevenhouse-payment-worker",
    service: "payment-worker",
    tagVariable: "PAYMENT_WORKER_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/payment-worker",
    app_dir: "payment-worker",
    build_args: "",
    servicePaths: ["apps/payment-worker/"],
    group: "backend",
  },
  {
    image: "elevenhouse-chart-worker",
    service: "chart-worker",
    tagVariable: "CHART_WORKER_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/chart-worker",
    app_dir: "chart-worker",
    build_args: "",
    servicePaths: ["apps/chart-worker/"],
    group: "backend",
  },
  {
    image: "elevenhouse-chart-engine",
    service: "chart-engine",
    tagVariable: "CHART_ENGINE_IMAGE_TAG",
    dockerfile: "deployment/docker/chart-engine.Dockerfile",
    app_filter: "",
    app_dir: "chart-engine",
    build_args: "",
    servicePaths: ["apps/chart-engine/"],
    group: "chart-engine",
  },
  {
    image: "elevenhouse-notification-worker",
    service: "notification-worker",
    tagVariable: "NOTIFICATION_WORKER_IMAGE_TAG",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/notification-worker",
    app_dir: "notification-worker",
    build_args: "",
    servicePaths: ["apps/notification-worker/"],
    group: "backend",
  },
  {
    image: "elevenhouse-db-migrator",
    service: "db-migrator",
    tagVariable: "DB_MIGRATOR_IMAGE_TAG",
    dockerfile: "deployment/docker/db-migrator.Dockerfile",
    app_filter: "",
    app_dir: "",
    build_args: "",
    servicePaths: ["packages/db/", "deployment/docker/db-migrator.Dockerfile"],
    group: "db-migrator",
  },
];

const databaseWriterServices = [
  "public-api",
  "astrologer-api",
  "admin-api",
  "workers",
  "payment-worker",
  "chart-worker",
  "notification-worker",
];

const serviceSmokeTargets = new Map([
  ["landing", ["https://elevenhouse.ai"]],
  ["client-web", ["https://client.elevenhouse.ai"]],
  ["public-api", ["https://client.elevenhouse.ai/api/health"]],
  ["astrologer-web", ["https://app.elevenhouse.ai"]],
  ["astrologer-api", ["https://app.elevenhouse.ai/api/health"]],
  ["admin-web", ["https://admin.elevenhouse.ai"]],
  ["admin-api", ["https://admin.elevenhouse.ai/api/health"]],
]);

const fullSmokeTargets = [
  "https://elevenhouse.ai",
  "https://client.elevenhouse.ai",
  "https://client.elevenhouse.ai/api/health",
  "https://app.elevenhouse.ai",
  "https://app.elevenhouse.ai/api/health",
  "https://admin.elevenhouse.ai",
  "https://admin.elevenhouse.ai/api/health",
];

const sharedNodePaths = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "packages/",
];

const deployRuntimePaths = [
  "deployment/compose/",
  "deployment/caddy/",
  "deployment/server/",
];

const databaseReleasePaths = [
  "packages/db/",
  "deployment/docker/db-migrator.Dockerfile",
];

const frontendImagePaths = [
  "deployment/docker/frontend.Dockerfile",
  "deployment/docker/frontend.Caddyfile",
];

const backendImagePaths = ["deployment/docker/backend.Dockerfile"];
const chartEngineImagePaths = ["deployment/docker/chart-engine.Dockerfile"];

function matchesAnyPath(file, prefixes) {
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
  );
}

function normalizeCurrentImageTags(input) {
  if (typeof input === "string") {
    return { default: input.trim() };
  }

  if (!input || typeof input !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, String(value ?? "").trim()])
      .filter(([, value]) => value.length > 0),
  );
}

function isCommitTag(value) {
  return /^[0-9a-f]{40}$/.test(value);
}

function imageTagFor(image, currentImageTags) {
  return currentImageTags[image.tagVariable] ?? currentImageTags.default ?? "";
}

function uniqueSorted(items) {
  return [...new Set(items)].sort();
}

function deployEnvContent(serviceTags) {
  return [
    "IMAGE_NAMESPACE=ghcr.io/torentoflag",
    `RELEASE_IMAGE_TAG=${serviceTags.RELEASE_IMAGE_TAG}`,
    ...Object.entries(serviceTags)
      .filter(([key]) => key !== "RELEASE_IMAGE_TAG")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`),
    "COMPOSE_PROJECT_NAME=elevenhouse",
  ].join("\n");
}

function encodeBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

export function createProductionImagePlan(changedFiles, options = {}) {
  const currentImageTags = normalizeCurrentImageTags(
    options.currentImageTags ?? options.currentImageTag,
  );
  const headRef = String(options.headRef ?? options.imageTag ?? "HEAD").trim();
  const forceDeploy = options.forceDeploy === true;
  const normalizedFiles = [...new Set(changedFiles.filter(Boolean).sort())];

  const allImages = productionImages.map(({ servicePaths, group, ...image }) => image);
  const changedImages = new Set();
  let deployRuntimeChanged = false;
  let databaseReleaseRequired = false;

  for (const file of normalizedFiles) {
    if (matchesAnyPath(file, deployRuntimePaths)) {
      deployRuntimeChanged = true;
    }

    if (matchesAnyPath(file, databaseReleasePaths)) {
      databaseReleaseRequired = true;
    }

    if (matchesAnyPath(file, sharedNodePaths)) {
      for (const image of productionImages) {
        if (image.group !== "chart-engine") {
          changedImages.add(image.image);
        }
      }
      continue;
    }

    if (matchesAnyPath(file, frontendImagePaths)) {
      for (const image of productionImages.filter((item) => item.group === "frontend")) {
        changedImages.add(image.image);
      }
      continue;
    }

    if (matchesAnyPath(file, backendImagePaths)) {
      for (const image of productionImages.filter((item) => item.group === "backend")) {
        changedImages.add(image.image);
      }
      continue;
    }

    if (matchesAnyPath(file, chartEngineImagePaths)) {
      changedImages.add("elevenhouse-chart-engine");
      continue;
    }

    for (const image of productionImages) {
      if (matchesAnyPath(file, image.servicePaths)) {
        changedImages.add(image.image);
      }
    }
  }

  const buildAllBecauseNoCurrentTag = productionImages.some(
    (image) => !isCommitTag(imageTagFor(image, currentImageTags)),
  );
  const effectiveChangedImages = buildAllBecauseNoCurrentTag
    ? new Set(productionImages.map((image) => image.image))
    : changedImages;
  const build = allImages.filter((image) => changedImages.has(image.image));
  const effectiveBuild = buildAllBecauseNoCurrentTag ? allImages : build;
  const changedRuntimeServices = uniqueSorted(
    productionImages
      .filter((image) => effectiveChangedImages.has(image.image) && image.service !== "db-migrator")
      .map((image) => image.service),
  );
  const deployServices = databaseReleaseRequired
    ? uniqueSorted(databaseWriterServices)
    : changedRuntimeServices;
  const deployRequired =
    forceDeploy ||
    buildAllBecauseNoCurrentTag ||
    deployRuntimeChanged ||
    changedImages.size > 0;
  const deployMode = !deployRequired
    ? "none"
    : forceDeploy || buildAllBecauseNoCurrentTag
      ? "full"
      : databaseReleaseRequired
        ? "db"
        : deployRuntimeChanged && changedImages.size === 0
          ? "runtime"
          : "service";
  const serviceTags = Object.fromEntries(
    productionImages.map((image) => [
      image.tagVariable,
      effectiveChangedImages.has(image.image) ? headRef : imageTagFor(image, currentImageTags),
    ]),
  );
  serviceTags.RELEASE_IMAGE_TAG = headRef;
  const smokeTargets =
    deployMode === "full" || deployMode === "db" || deployMode === "runtime"
      ? fullSmokeTargets
      : uniqueSorted(deployServices.flatMap((service) => serviceSmokeTargets.get(service) ?? []));
  const chartSmokeRequired =
    deployMode === "full" ||
    deployMode === "db" ||
    deployServices.includes("chart-worker") ||
    deployServices.includes("chart-engine");
  const envContent = deployEnvContent(serviceTags);

  return {
    all: allImages,
    build: effectiveBuild,
    promote: [],
    currentImageTag: currentImageTags.default ?? "",
    currentImageTags,
    changedFiles: normalizedFiles,
    deployRequired,
    deployMode,
    deployServices,
    deployServicesBase64: encodeBase64(deployServices.join(" ")),
    serviceTags,
    deployEnvBase64: encodeBase64(`${envContent}\n`),
    smokeTargets,
    chartSmokeRequired,
    databaseReleaseRequired,
    forceDeploy,
    deployRuntimeChanged,
    buildAllBecauseNoCurrentTag,
  };
}

function readChangedFiles(baseRef, headRef) {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}...${headRef}`],
    { encoding: "utf8" },
  );
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function writeGitHubOutput(plan) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = [
    `deploy_required=${plan.deployRequired ? "true" : "false"}`,
    `deploy_mode=${plan.deployMode}`,
    `deploy_services=${plan.deployServices.join(" ")}`,
    `deploy_services_base64=${plan.deployServicesBase64}`,
    `deploy_env_base64=${plan.deployEnvBase64}`,
    `smoke_targets=${plan.smokeTargets.join(" ")}`,
    `chart_smoke_required=${plan.chartSmokeRequired ? "true" : "false"}`,
    `database_release_required=${plan.databaseReleaseRequired ? "true" : "false"}`,
    `has_build=${plan.build.length > 0 ? "true" : "false"}`,
    `build_matrix=${JSON.stringify({ include: plan.build })}`,
    `current_image_tag=${plan.currentImageTag}`,
    `changed_files_json=${JSON.stringify(plan.changedFiles)}`,
  ];

  if (!outputPath) {
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const fs = await import("node:fs");
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const baseRef = argv[0] ?? env.BASE_REF;
  const headRef = argv[1] ?? env.HEAD_REF ?? "HEAD";
  if (!baseRef) {
    throw new Error("BASE_REF_REQUIRED");
  }

  const changedFiles = readChangedFiles(baseRef, headRef);
  const plan = createProductionImagePlan(changedFiles, {
    currentImageTags: JSON.parse(env.CURRENT_IMAGE_TAGS_JSON ?? "{}"),
    headRef,
    forceDeploy: env.FORCE_DEPLOY === "true",
  });

  await writeGitHubOutput(plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
