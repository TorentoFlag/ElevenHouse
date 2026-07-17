import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const maxAgentsBytes = 16 * 1024;

const requiredFiles = new Map([
  [
    "AGENTS.md",
    [
      "# ElevenHouse",
      "## Источники истины",
      "## Обязательный рабочий цикл",
      "## Shared-main concurrency"
    ]
  ],
  ["docs/README.md", ["# Документация ElevenHouse"]],
  [
    "docs/development/agent-workflow.md",
    ["## Autonomous Feature Pipeline", "## Living ExecPlan", "## Shared Checkout Protocol"]
  ],
  ["docs/development/research-strategy.md", ["## Technical Research", "## Product Research"]],
  [
    "docs/development/testing-strategy.md",
    ["## TDD contract", "## Runtime E2E", "## Design Parity"]
  ],
  ["docs/development/commands.md", ["pnpm docs:check"]],
  ["docs/development/agent-runbooks/README.md", ["# Agent Runbooks"]],
  ["docs/development/agent-runbooks/00-task-intake.md", ["## Shared-main intake"]],
  ["docs/development/agent-runbooks/08-verification-and-git.md", ["## Shared Index"]],
  [
    ".agents/skills/elevenhouse-feature-delivery/SKILL.md",
    ["## Shared-main execution"]
  ]
]);

const requiredSkills = [
  "elevenhouse-feature-delivery",
  "elevenhouse-research",
  "elevenhouse-design-parity"
];

const staleStatements = [
  {
    file: "docs/development/agent-runbooks/07-local-services.md",
    pattern: /provides only PostgreSQL and Redis/i,
    label: "Docker Compose omits the implemented MinIO services"
  },
  {
    file: "docs/architecture/design-reference-inventory.md",
    pattern: /client cabinet APIs are missing/i,
    label: "client profile and relationship APIs are marked entirely missing"
  },
  {
    file: "docs/architecture/design-reference-inventory.md",
    pattern: /## First Implementation Slice Candidate/i,
    label: "inventory contains obsolete implementation-priority guidance"
  },
  {
    file: "docs/architecture/media-storage.md",
    pattern: /## Implementation Plan/i,
    label: "implemented media architecture is still presented as a future plan"
  }
];

const forbiddenSharedMainStatements = [
  {
    file: ".agents/skills/elevenhouse-feature-delivery/SKILL.md",
    pattern:
      /\*\*REQUIRED SUB-SKILL:\*\*\s*Use\s+`?superpowers:using-git-worktrees`?[.!]?/i,
    label: "feature delivery requires the generic worktree workflow"
  }
];

export async function checkAgentDocs({ rootDir = process.cwd() } = {}) {
  const errors = [];
  const markdownFiles = await collectMarkdownFiles(rootDir);

  for (const [relativePath, markers] of requiredFiles) {
    const content = await readRequiredFile(rootDir, relativePath, errors);
    if (content === undefined) {
      continue;
    }

    for (const marker of markers) {
      if (!content.includes(marker)) {
        errors.push(`${relativePath}: missing required marker ${JSON.stringify(marker)}`);
      }
    }
  }

  const agentsPath = path.join(rootDir, "AGENTS.md");
  if (await pathExists(agentsPath)) {
    const agentsStats = await stat(agentsPath);
    if (agentsStats.size > maxAgentsBytes) {
      errors.push(`AGENTS.md: exceeds 16 KiB (${agentsStats.size} bytes)`);
    }
  }

  for (const skillName of requiredSkills) {
    const relativePath = `.agents/skills/${skillName}/SKILL.md`;
    const content = await readRequiredFile(rootDir, relativePath, errors);
    if (content === undefined) {
      continue;
    }

    if (!hasValidSkillFrontmatter(content, skillName)) {
      errors.push(`${relativePath}: missing valid skill frontmatter for ${skillName}`);
    }
  }

  for (const relativePath of markdownFiles) {
    const content = await readFile(path.join(rootDir, relativePath), "utf8");
    for (const link of extractRelativeMarkdownLinks(content)) {
      const resolvedPath = path.resolve(
        path.dirname(path.join(rootDir, relativePath)),
        link.target
      );
      if (!(await pathExists(resolvedPath))) {
        errors.push(
          `${relativePath}:${link.line}: broken relative link ${JSON.stringify(link.original)}`
        );
      }
    }
  }

  for (const stale of staleStatements) {
    const absolutePath = path.join(rootDir, stale.file);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const content = await readFile(absolutePath, "utf8");
    if (stale.pattern.test(content)) {
      errors.push(`${stale.file}: known stale statement (${stale.label})`);
    }
  }

  for (const contradiction of forbiddenSharedMainStatements) {
    const absolutePath = path.join(rootDir, contradiction.file);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const content = await readFile(absolutePath, "utf8");
    if (contradiction.pattern.test(content)) {
      errors.push(
        `${contradiction.file}: forbidden shared-main contradiction (${contradiction.label})`
      );
    }
  }

  return { filesChecked: markdownFiles.length, errors };
}

async function collectMarkdownFiles(rootDir) {
  const roots = ["AGENTS.md", "docs", ".agents/skills"];
  const files = [];

  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(rootDir, relativeRoot);
    if (!(await pathExists(absoluteRoot))) {
      continue;
    }

    const rootStats = await stat(absoluteRoot);
    if (rootStats.isFile()) {
      if (relativeRoot.endsWith(".md")) {
        files.push(relativeRoot);
      }
      continue;
    }

    await walkMarkdownDirectory(rootDir, absoluteRoot, files);
  }

  return files.sort();
}

async function walkMarkdownDirectory(rootDir, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownDirectory(rootDir, absolutePath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(rootDir, absolutePath));
    }
  }
}

async function readRequiredFile(rootDir, relativePath, errors) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!(await pathExists(absolutePath))) {
    errors.push(`${relativePath}: required file is missing`);
    return undefined;
  }

  return readFile(absolutePath, "utf8");
}

function hasValidSkillFrontmatter(content, expectedName) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return false;
  }

  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return name === expectedName && Boolean(description);
}

function extractRelativeMarkdownLinks(content) {
  const links = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of content.matchAll(pattern)) {
    const original = match[1].trim().replace(/^<|>$/g, "");
    const withoutFragment = original.split("#", 1)[0].split("?", 1)[0];
    if (withoutFragment.length === 0 || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(withoutFragment)) {
      continue;
    }

    links.push({
      original,
      target: decodeURIComponent(withoutFragment),
      line: content.slice(0, match.index).split("\n").length
    });
  }

  return links;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCli() {
  const result = await checkAgentDocs();

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`agent-docs: ${error}`);
    }
    console.error(
      `agent-docs: failed with ${result.errors.length} error(s) across ${result.filesChecked} Markdown files`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`agent-docs: ok (${result.filesChecked} Markdown files)`);
}

const currentFile = pathToFileURL(fileURLToPath(import.meta.url)).href;
if (currentFile === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) {
  await runCli();
}
