#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const productionImages = [
  {
    image: "elevenhouse-landing",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/landing",
    app_dir: "landing",
    build_args: "VITE_ASTROLOGER_WEB_ORIGIN=https://app.elevenhouse.ai",
    servicePaths: ["apps/landing/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-client-web",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/client-web",
    app_dir: "client-web",
    build_args: "",
    servicePaths: ["apps/client-web/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-astrologer-web",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/astrologer-web",
    app_dir: "astrologer-web",
    build_args: "",
    servicePaths: ["apps/astrologer-web/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-admin-web",
    dockerfile: "deployment/docker/frontend.Dockerfile",
    app_filter: "@elevenhouse/admin-web",
    app_dir: "admin-web",
    build_args: "",
    servicePaths: ["apps/admin-web/"],
    group: "frontend",
  },
  {
    image: "elevenhouse-public-api",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/public-api",
    app_dir: "public-api",
    build_args: "",
    servicePaths: ["apps/public-api/"],
    group: "backend",
  },
  {
    image: "elevenhouse-astrologer-api",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/astrologer-api",
    app_dir: "astrologer-api",
    build_args: "",
    servicePaths: ["apps/astrologer-api/"],
    group: "backend",
  },
  {
    image: "elevenhouse-admin-api",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/admin-api",
    app_dir: "admin-api",
    build_args: "",
    servicePaths: ["apps/admin-api/"],
    group: "backend",
  },
  {
    image: "elevenhouse-workers",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/workers",
    app_dir: "workers",
    build_args: "",
    servicePaths: ["apps/workers/"],
    group: "backend",
  },
  {
    image: "elevenhouse-payment-worker",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/payment-worker",
    app_dir: "payment-worker",
    build_args: "",
    servicePaths: ["apps/payment-worker/"],
    group: "backend",
  },
  {
    image: "elevenhouse-chart-worker",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/chart-worker",
    app_dir: "chart-worker",
    build_args: "",
    servicePaths: ["apps/chart-worker/"],
    group: "backend",
  },
  {
    image: "elevenhouse-chart-engine",
    dockerfile: "deployment/docker/chart-engine.Dockerfile",
    app_filter: "",
    app_dir: "chart-engine",
    build_args: "",
    servicePaths: ["apps/chart-engine/"],
    group: "chart-engine",
  },
  {
    image: "elevenhouse-notification-worker",
    dockerfile: "deployment/docker/backend.Dockerfile",
    app_filter: "@elevenhouse/notification-worker",
    app_dir: "notification-worker",
    build_args: "",
    servicePaths: ["apps/notification-worker/"],
    group: "backend",
  },
  {
    image: "elevenhouse-db-migrator",
    dockerfile: "deployment/docker/db-migrator.Dockerfile",
    app_filter: "",
    app_dir: "",
    build_args: "",
    servicePaths: ["packages/db/", "deployment/docker/db-migrator.Dockerfile"],
    group: "db-migrator",
  },
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

export function createProductionImagePlan(changedFiles, options = {}) {
  const currentImageTag = options.currentImageTag?.trim() ?? "";
  const forceDeploy = options.forceDeploy === true;
  const hasCurrentImageTag = /^[0-9a-f]{40}$/.test(currentImageTag);
  const normalizedFiles = [...new Set(changedFiles.filter(Boolean).sort())];

  const allImages = productionImages.map(({ servicePaths, group, ...image }) => image);
  const changedImages = new Set();
  let deployRuntimeChanged = false;

  for (const file of normalizedFiles) {
    if (matchesAnyPath(file, deployRuntimePaths)) {
      deployRuntimeChanged = true;
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

  const build = allImages.filter((image) => changedImages.has(image.image));
  const promote = hasCurrentImageTag
    ? allImages.filter((image) => !changedImages.has(image.image))
    : [];
  const buildAllBecauseNoCurrentTag = !hasCurrentImageTag;

  return {
    all: allImages,
    build: buildAllBecauseNoCurrentTag ? allImages : build,
    promote: buildAllBecauseNoCurrentTag ? [] : promote,
    currentImageTag,
    changedFiles: normalizedFiles,
    deployRequired:
      forceDeploy ||
      buildAllBecauseNoCurrentTag ||
      deployRuntimeChanged ||
      changedImages.size > 0,
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
    `has_build=${plan.build.length > 0 ? "true" : "false"}`,
    `has_promote=${plan.promote.length > 0 ? "true" : "false"}`,
    `build_matrix=${JSON.stringify({ include: plan.build })}`,
    `promote_matrix=${JSON.stringify({ include: plan.promote })}`,
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
    currentImageTag: env.CURRENT_IMAGE_TAG ?? "",
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
