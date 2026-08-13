import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiApps = ["public-api", "astrologer-api", "admin-api"];

export async function renderRouteInventory({ rootDir = process.cwd() } = {}) {
  const sections = await Promise.all(
    apiApps.map(async (appName) => ({
      appName,
      routes: await collectAppRoutes(rootDir, appName)
    }))
  );

  return [
    "# Generated API Route Inventory",
    "",
    "> Generated from Nest controller decorators by `node scripts/agent-docs/generate-route-inventory.mjs`. Do not edit manually.",
    "",
    "This is the current route inventory. API ownership, authorization and contract rules remain in `api-boundaries.md`.",
    "",
    ...sections.flatMap(({ appName, routes }) => [
      `## ${appName}`,
      "",
      ...(routes.length === 0
        ? ["No controller routes found."]
        : ["| Method | Route | Controller |", "| --- | --- | --- |", ...routes.map(formatRoute)]),
      ""
    ])
  ].join("\n");
}

async function collectAppRoutes(rootDir, appName) {
  const modulesRoot = path.join(rootDir, "apps", appName, "src", "modules");
  const controllerFiles = await collectControllerFiles(modulesRoot);
  const routes = [];

  for (const filePath of controllerFiles) {
    const content = await readFile(filePath, "utf8");
    const relativeController = path.relative(rootDir, filePath);

    for (const controller of parseControllers(content)) {
      for (const route of parseMethodRoutes(controller.body)) {
        routes.push({
          ...route,
          route: joinRoute(controller.path, route.path),
          controller: relativeController
        });
      }
    }
  }

  return routes.sort((left, right) =>
    `${left.route} ${left.method} ${left.controller}`.localeCompare(
      `${right.route} ${right.method} ${right.controller}`
    )
  );
}

async function collectControllerFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectControllerFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".controller.ts") ? [entryPath] : [];
    })
  );
  return nested.flat().sort();
}

function parseControllers(content) {
  const matches = Array.from(
    content.matchAll(/@Controller\(\s*(?:["']([^"']*)["'])?\s*\)/g)
  );
  return matches.map((match, index) => ({
    path: match[1] ?? "",
    body: content.slice(match.index, matches[index + 1]?.index)
  }));
}

function parseMethodRoutes(content) {
  return Array.from(content.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:["']([^"']*)["'])?\s*\)/g)).map(
    (match) => ({ method: match[1].toUpperCase(), path: match[2] ?? "" })
  );
}

function joinRoute(prefix, suffix) {
  const segments = [prefix, suffix].filter(Boolean).join("/");
  return `/${segments}`.replace(/\/{2,}/g, "/");
}

function formatRoute(route) {
  return `| ${route.method} | \`${route.route}\` | \`${route.controller}\` |`;
}

async function runCli() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputPath = path.join(rootDir, "docs", "api", "route-inventory.md");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await renderRouteInventory({ rootDir }), "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
