import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkAgentDocs } from "./check-agent-docs.mjs";

const requiredFiles = {
  "AGENTS.md": [
    "# ElevenHouse",
    "## Источники истины",
    "## Обязательный рабочий цикл",
    "## Shared-main concurrency"
  ],
  "docs/README.md": [
    "# Документация ElevenHouse",
    "architecture/deployment-topology.md",
    "architecture/media-storage.md",
    "agent-runbooks/10-telegram-business-hookdeck.md",
    "## Временные specs и plans"
  ],
  "docs/development/agent-workflow.md": [
    "## Autonomous Feature Pipeline",
    "## Living ExecPlan",
    "## Shared Checkout Protocol"
  ],
  "docs/development/research-strategy.md": ["## Technical Research", "## Product Research"],
  "docs/development/testing-strategy.md": ["## TDD contract", "## Runtime E2E", "## Design Parity"],
  "docs/development/commands.md": ["pnpm docs:check"],
  "docs/development/agent-runbooks/README.md": ["# Agent Runbooks"],
  "docs/development/agent-runbooks/00-task-intake.md": ["## Shared-main intake"],
  "docs/development/agent-runbooks/08-verification-and-git.md": ["## Shared Index"]
};

const skills = [
  "elevenhouse-feature-delivery",
  "elevenhouse-research",
  "elevenhouse-design-parity"
];

const fixtureApps = [
  "admin-api",
  "admin-web",
  "astrologer-api",
  "astrologer-web",
  "chart-engine",
  "chart-worker",
  "client-web",
  "landing",
  "notification-worker",
  "payment-worker",
  "public-api",
  "workers"
];

const fixturePackages = [
  "ai",
  "auth",
  "chart-engine-client",
  "config",
  "contracts",
  "db",
  "design-system",
  "domain",
  "i18n",
  "numerology-presentation",
  "observability",
  "testing",
  "validation"
];

const fixtureBackendModules = {
  "apps/public-api/src/modules": [
    "booking",
    "client-join",
    "client-profile",
    "database",
    "health",
    "identity",
    "orders",
    "payments",
    "redis",
    "security"
  ],
  "apps/astrologer-api/src/modules": [
    "ai",
    "astro-calendar",
    "astrologer-profile",
    "availability",
    "bookings",
    "calculations",
    "calendar",
    "charts",
    "clients",
    "clock",
    "database",
    "dictionary",
    "dictionary-ai",
    "finance",
    "health",
    "human-design",
    "identity",
    "matrix",
    "media",
    "messaging",
    "numerology",
    "platform-billing",
    "products",
    "redis",
    "security",
    "verification"
  ],
  "apps/admin-api/src/modules": [
    "database",
    "finance-policies",
    "health",
    "identity",
    "security"
  ]
};

async function createValidFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "elevenhouse-agent-docs-"));

  for (const [relativePath, markers] of Object.entries(requiredFiles)) {
    await writeFixtureFile(rootDir, relativePath, `${markers.join("\n\n")}\n`);
  }

  await createCurrentStateFixture(rootDir);

  for (const skill of skills) {
    const sharedMainMarker =
      skill === "elevenhouse-feature-delivery" ? "\n## Shared-main execution\n" : "";
    await writeFixtureFile(
      rootDir,
      `.agents/skills/${skill}/SKILL.md`,
      `---\nname: ${skill}\ndescription: Use when testing ${skill}.\n---\n\n# ${skill}\n${sharedMainMarker}`
    );
  }

  return rootDir;
}

async function createCurrentStateFixture(rootDir) {
  for (const app of fixtureApps) {
    await mkdir(path.join(rootDir, "apps", app), { recursive: true });
  }

  for (const packageName of fixturePackages) {
    await mkdir(path.join(rootDir, "packages", packageName), { recursive: true });
  }

  for (const [moduleRoot, modules] of Object.entries(fixtureBackendModules)) {
    for (const moduleName of modules) {
      await mkdir(path.join(rootDir, moduleRoot, moduleName), { recursive: true });
    }
  }

  await writeFixtureFile(
    rootDir,
    "docs/architecture/repository-structure.md",
    [
      "# Структура репозитория",
      "",
      "## Apps",
      ...fixtureApps.map((app) => `- \`${app}/\``),
      "",
      "## Packages",
      ...fixturePackages.map((packageName) => `- \`${packageName}/\``),
      ""
    ].join("\n")
  );

  const allBackendModules = Object.values(fixtureBackendModules).flat();
  const backendModuleList = Array.from(new Set(allBackendModules)).sort();

  await writeFixtureFile(
    rootDir,
    "docs/architecture/backend-modules.md",
    [
      "# Доменные модули backend",
      "",
      ...backendModuleList.map((moduleName) => `- \`${moduleName}\``),
      ""
    ].join("\n")
  );

  await writeFixtureFile(
    rootDir,
    "docs/architecture/design-reference-inventory.md",
    [
      "# Design Implementation Inventory",
      "",
      ...backendModuleList.map((moduleName) => `\`${moduleName}\``),
      ""
    ].join("\n")
  );

  await writeFixtureFile(
    rootDir,
    "docs/architecture/current-state.md",
    [
      "# Generated Current Implementation State",
      "",
      ...backendModuleList.map((moduleName) => `\`${moduleName}\``),
      ""
    ].join("\n")
  );
}

async function writeFixtureFile(rootDir, relativePath, content) {
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

test("accepts a minimal valid agent documentation tree", async () => {
  const rootDir = await createValidFixture();

  const result = await checkAgentDocs({ rootDir });

  assert.deepEqual(result.errors, []);
  assert.ok(result.filesChecked >= 10);
});

test("rejects broken relative Markdown links", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/README.md",
    "# Документация ElevenHouse\n\n[Missing](./missing.md)\n"
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(result.errors.some((error) => error.includes("broken relative link")));
});

test("rejects a documentation navigator missing canonical entries", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/README.md",
    [
      "# Документация ElevenHouse",
      "architecture/media-storage.md",
      "## Временные specs и plans"
    ].join("\n")
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("docs/README.md") &&
        error.includes("architecture/deployment-topology.md")
    )
  );
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("docs/README.md") &&
        error.includes("agent-runbooks/10-telegram-business-hookdeck.md")
    )
  );
});

test("rejects a documentation navigator without the plan lifecycle rule", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/README.md",
    [
      "# Документация ElevenHouse",
      "architecture/deployment-topology.md",
      "architecture/media-storage.md",
      "agent-runbooks/10-telegram-business-hookdeck.md"
    ].join("\n")
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(
    result.errors.some(
      (error) => error.includes("docs/README.md") && error.includes("## Временные specs и plans")
    )
  );
});

test("rejects skill files without required frontmatter", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    ".agents/skills/elevenhouse-research/SKILL.md",
    "# Research without frontmatter\n"
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(result.errors.some((error) => error.includes("missing valid skill frontmatter")));
});

test("rejects an oversized root instruction file", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "AGENTS.md",
    `# ElevenHouse\n\n## Источники истины\n\n## Обязательный рабочий цикл\n\n${"x".repeat(17_000)}`
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(result.errors.some((error) => error.includes("exceeds 16 KiB")));
});

test("rejects root instructions without the shared-main policy", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "AGENTS.md",
    "# ElevenHouse\n\n## Источники истины\n\n## Обязательный рабочий цикл\n"
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("AGENTS.md") && error.includes("## Shared-main concurrency")
    )
  );
});

test("rejects a required generic worktree workflow in feature delivery", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    ".agents/skills/elevenhouse-feature-delivery/SKILL.md",
    [
      "---",
      "name: elevenhouse-feature-delivery",
      "description: Use when testing feature delivery.",
      "---",
      "",
      "# Feature Delivery",
      "",
      "## Shared-main execution",
      "",
      "**REQUIRED SUB-SKILL:** Use superpowers:using-git-worktrees."
    ].join("\n")
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(
    result.errors.some((error) => error.includes("forbidden shared-main contradiction"))
  );
});

test("rejects known contradictory active-document statements", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/development/agent-runbooks/07-local-services.md",
    "# Local Services\n\nDocker compose in this repo provides only PostgreSQL and Redis.\n"
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(result.errors.some((error) => error.includes("known stale statement")));
});

test("rejects stale admin-api health-only claims in canonical documents", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/decisions/0001-monorepo-and-app-boundaries.md",
    "`admin-api` as the internal API surface; currently scaffolded with only a technical health module\n"
  );
  await writeFixtureFile(
    rootDir,
    "docs/product/full-functional-scope.md",
    "- `admin-api` для внутренних ролей; текущий код содержит минимальную health-only заготовку\n"
  );
  await writeFixtureFile(
    rootDir,
    "docs/product/roadmap.md",
    "- развитие `admin-api` из health-only заготовки в отдельную backend-поверхность\n"
  );

  const result = await checkAgentDocs({ rootDir });

  for (const relativePath of [
    "docs/decisions/0001-monorepo-and-app-boundaries.md",
    "docs/product/full-functional-scope.md",
    "docs/product/roadmap.md"
  ]) {
    assert.ok(
      result.errors.some(
        (error) => error.includes(relativePath) && error.includes("known stale statement")
      )
    );
  }
});

test("rejects active docs missing current app, package, or backend module entries", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/architecture/backend-modules.md",
    "# Доменные модули backend\n\n- `health`\n"
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("docs/architecture/backend-modules.md") &&
        error.includes("finance-policies")
    )
  );
});

test("rejects generated current state missing a backend module", async () => {
  const rootDir = await createValidFixture();
  await writeFixtureFile(
    rootDir,
    "docs/architecture/current-state.md",
    "# Generated Current Implementation State\n\n`health`\n"
  );

  const result = await checkAgentDocs({ rootDir });

  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("docs/architecture/current-state.md") &&
        error.includes("finance-policies")
    )
  );
});
