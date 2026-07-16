import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkAgentDocs } from "./check-agent-docs.mjs";

const requiredFiles = {
  "AGENTS.md": ["# ElevenHouse", "## Источники истины", "## Обязательный рабочий цикл"],
  "docs/README.md": ["# Документация ElevenHouse"],
  "docs/development/agent-workflow.md": [
    "## Autonomous Feature Pipeline",
    "## Living ExecPlan"
  ],
  "docs/development/research-strategy.md": ["## Technical Research", "## Product Research"],
  "docs/development/testing-strategy.md": [
    "## TDD contract",
    "## Runtime E2E",
    "## Design Parity"
  ],
  "docs/development/commands.md": ["pnpm docs:check"],
  "docs/development/agent-runbooks/README.md": ["# Agent Runbooks"]
};

const skills = [
  "elevenhouse-feature-delivery",
  "elevenhouse-research",
  "elevenhouse-design-parity"
];

async function createValidFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "elevenhouse-agent-docs-"));

  for (const [relativePath, markers] of Object.entries(requiredFiles)) {
    await writeFixtureFile(rootDir, relativePath, `${markers.join("\n\n")}\n`);
  }

  for (const skill of skills) {
    await writeFixtureFile(
      rootDir,
      `.agents/skills/${skill}/SKILL.md`,
      `---\nname: ${skill}\ndescription: Use when testing ${skill}.\n---\n\n# ${skill}\n`
    );
  }

  return rootDir;
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
  await writeFixtureFile(rootDir, "docs/README.md", "# Документация ElevenHouse\n\n[Missing](./missing.md)\n");

  const result = await checkAgentDocs({ rootDir });

  assert.ok(result.errors.some((error) => error.includes("broken relative link")));
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
