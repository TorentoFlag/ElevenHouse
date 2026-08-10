import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiApps = ["public-api", "astrologer-api", "admin-api"];
const workerPorts = [
  ["workers", "WORKERS_HEALTH_PORT"],
  ["payment-worker", "PAYMENT_WORKER_HEALTH_PORT"],
  ["payment-worker", "PAYMENT_WORKER_WEBHOOK_PORT"],
  ["chart-worker", "CHART_WORKER_HEALTH_PORT"],
  ["notification-worker", "NOTIFICATION_WORKER_HEALTH_PORT"]
];

export async function renderCurrentState({ rootDir = process.cwd() } = {}) {
  const [apps, packages, apiModuleRows, portRows] = await Promise.all([
    directoryNames(rootDir, "apps"),
    directoryNames(rootDir, "packages"),
    collectApiModules(rootDir),
    collectWorkerPorts(rootDir)
  ]);

  return [
    "# Generated Current Implementation State",
    "",
    "> Generated from app/package/module directories and worker runtime config by `node scripts/agent-docs/generate-current-state.mjs`. Do not edit manually.",
    "",
    "Use this for current structural facts. Ownership, policy, contracts and readiness remain in the linked canonical docs.",
    "",
    "## Deployable apps",
    "",
    apps.map((name) => `- \`${name}\``).join("\n"),
    "",
    "## Shared packages",
    "",
    packages.map((name) => `- \`${name}\``).join("\n"),
    "",
    "## API modules",
    "",
    "| App | Module |",
    "| --- | --- |",
    ...apiModuleRows.map(([appName, moduleName]) => `| ${appName} | \`${moduleName}\` |`),
    "",
    "## Worker endpoint defaults",
    "",
    "| Process | Environment key | Port |",
    "| --- | --- | --- |",
    ...portRows.map(({ appName, key, port }) => `| ${appName} | \`${key}\` | ${port} |`),
    "",
    "`PAYMENT_WORKER_WEBHOOK_PORT` and `NOTIFICATION_WORKER_HEALTH_PORT` both default to `3013`; set an explicit non-conflicting local override before starting both processes.",
    ""
  ].join("\n");
}

async function directoryNames(rootDir, relativeDirectory) {
  try {
    return (await readdir(path.join(rootDir, relativeDirectory), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function collectApiModules(rootDir) {
  const rows = await Promise.all(
    apiApps.map(async (appName) => {
      const modules = await directoryNames(rootDir, `apps/${appName}/src/modules`);
      return modules.map((moduleName) => [appName, moduleName]);
    })
  );
  return rows.flat();
}

async function collectWorkerPorts(rootDir) {
  return Promise.all(
    workerPorts.map(async ([appName, key]) => ({
      appName,
      key,
      port: await findDefaultPort(rootDir, appName, key)
    }))
  );
}

async function findDefaultPort(rootDir, appName, key) {
  const runtimeConfigPath = path.join(rootDir, "apps", appName, "src", "runtime-config.ts");
  let content;
  try {
    content = await readFile(runtimeConfigPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
  const match = content.match(new RegExp(`${key}\\s*:\\s*[\\s\\S]{0,240}?\\.default\\((\\d+)\\)`));
  return match?.[1] ?? "unresolved";
}

async function runCli() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputPath = path.join(rootDir, "docs", "architecture", "current-state.md");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await renderCurrentState({ rootDir }), "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
