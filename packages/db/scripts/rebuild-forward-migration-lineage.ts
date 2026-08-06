import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { assertLinearLineage, readMigrationLineage, type MigrationLineage } from "./migration-lineage";
import { normalizeBaselineIndexOrderFile } from "./normalize-baseline-index-order";

const execFileAsync = promisify(execFile);

export type PhasePlan = {
  readonly index: number;
  readonly name: string;
  readonly schemaModules: readonly string[];
  readonly augmenters?: readonly MigrationPhaseAugmenter[];
};

export type MigrationPhaseAugmenter = (migrationPath: string) => Promise<void>;

const augmentAiUsageBaseline: MigrationPhaseAugmenter = (migrationPath) =>
  runAugmenter("augment-ai-usage-baseline", "augmentAiUsageBaseline", migrationPath);
const augmentChartJobsBaseline: MigrationPhaseAugmenter = (migrationPath) =>
  runAugmenter("augment-chart-jobs-baseline", "augmentChartJobsBaseline", migrationPath);
const augmentClientBirthProfileBaseline: MigrationPhaseAugmenter = (migrationPath) =>
  runAugmenter("augment-client-birth-profile-baseline", "augmentClientBirthProfileBaseline", migrationPath);
const augmentFlowsBaseline: MigrationPhaseAugmenter = (migrationPath) =>
  runAugmenter("augment-flows-baseline", "augmentFlowsBaseline", migrationPath);
const augmentSchedulingBaseline: MigrationPhaseAugmenter = (migrationPath) =>
  runAugmenter("augment-scheduling-baseline", "augmentSchedulingBaseline", migrationPath);

export type SourceManifest = ReadonlyMap<string, string>;

export type BuildCandidateLineageInput = {
  readonly packageDirectory: string;
  readonly outputDirectory: string;
  readonly sourceManifestPaths: readonly string[];
  readonly sourceManifest?: SourceManifest;
  readonly phasePlan: readonly PhasePlan[];
};

export const DEFAULT_FORWARD_PHASE_PLAN: readonly PhasePlan[] = [
  { index: 0, name: "identity", schemaModules: ["identity"] },
  { index: 1, name: "audit_log", schemaModules: ["identity", "audit-log"] },
  { index: 2, name: "outbox", schemaModules: ["identity", "audit-log", "outbox"] },
  { index: 3, name: "media", schemaModules: ["identity", "audit-log", "outbox", "media"] },
  { index: 4, name: "products", schemaModules: ["identity", "audit-log", "outbox", "media", "products"] },
  { index: 5, name: "platform_billing", schemaModules: ["identity", "audit-log", "outbox", "media", "products", "platform-billing"] },
  { index: 6, name: "client_profiles", schemaModules: ["identity", "audit-log", "outbox", "media", "products", "platform-billing", "clients"], augmenters: [augmentClientBirthProfileBaseline] },
  { index: 7, name: "astrologer_profile", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile"] },
  { index: 8, name: "verification", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification"] },
  { index: 9, name: "dictionary", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary"] },
  { index: 10, name: "calculations_matrix", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix"], augmenters: [augmentChartJobsBaseline] },
  { index: 11, name: "astro_calendar", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix", "astro-calendar"] },
  { index: 12, name: "scheduling", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix", "astro-calendar", "scheduling"], augmenters: [augmentSchedulingBaseline] },
  { index: 13, name: "flows", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix", "astro-calendar", "scheduling", "flows"], augmenters: [augmentFlowsBaseline] },
  { index: 14, name: "messaging", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix", "astro-calendar", "scheduling", "flows", "messaging"] },
  { index: 15, name: "ai_usage", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix", "astro-calendar", "scheduling", "flows", "messaging", "ai"], augmenters: [augmentAiUsageBaseline] },
  { index: 16, name: "finance", schemaModules: ["identity", "audit-log", "outbox", "products", "platform-billing", "media", "clients", "astrologer-profile", "verification", "dictionary", "calculations", "matrix", "astro-calendar", "scheduling", "flows", "messaging", "ai", "finance"], augmenters: [augmentFinancePhase] }
];

async function captureSourceManifest(paths: readonly string[]): Promise<SourceManifest> {
  return new Map(
    await Promise.all(
      [...paths].sort().map(async (path) => [path, sha256(await readFile(path))] as const)
    )
  );
}

async function build(input: BuildCandidateLineageInput): Promise<MigrationLineage> {
  const capturedManifest = input.sourceManifest ?? (await captureSourceManifest(input.sourceManifestPaths));
  await assertSourceManifest(capturedManifest, input.sourceManifestPaths);
  assertPhasePlan(input.phasePlan);

  const buildDirectory = await mkdtemp(join(input.packageDirectory, ".migration-lineage-build-"));
  const candidateDirectory = join(buildDirectory, "drizzle");
  try {
    const configPath = join(buildDirectory, "drizzle.config.ts");
    await writeFile(configPath, buildConfigSource(), "utf8");

    for (const phase of input.phasePlan) {
      await assertSourceManifest(capturedManifest, input.sourceManifestPaths);
      const schemaPath = join(buildDirectory, `schema-${phase.index}.ts`);
      await writeFile(schemaPath, phaseSchemaSource(phase), "utf8");
      const generation = await generatePhase({
        packageDirectory: input.packageDirectory,
        configPath,
        schemaPath,
        candidateDirectory,
        phase
      });
      const generatedLineage = await readMigrationLineage(candidateDirectory);
      if (generatedLineage.artifacts.length !== phase.index + 1) {
        throw new Error(`MIGRATION_LINEAGE_PHASE_EMPTY:${phase.name}:${generation.stdout.trim()}:${generation.stderr.trim()}`);
      }
      const migrationPath = join(
        candidateDirectory,
        `${phase.index.toString().padStart(4, "0")}_${phase.name}.sql`
      );
      await normalizeGeneratedMigration(migrationPath);
      for (const augmenter of phase.augmenters ?? []) {
        await augmenter(migrationPath);
      }
    }

    const lineage = await readMigrationLineage(candidateDirectory);
    assertLinearLineage(lineage);
    await assertSourceManifest(capturedManifest, input.sourceManifestPaths);
    await mkdir(dirname(input.outputDirectory), { recursive: true });
    await rm(input.outputDirectory, { recursive: true, force: true });
    await rename(candidateDirectory, input.outputDirectory);
    return await readMigrationLineage(input.outputDirectory);
  } finally {
    await rm(buildDirectory, { recursive: true, force: true });
  }
}

export const buildCandidateLineage = Object.assign(build, { captureSourceManifest });

export async function collectSchemaSourcePaths(schemaDirectory: string): Promise<readonly string[]> {
  const entries = await readdir(schemaDirectory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(schemaDirectory, entry.name);
      if (entry.isDirectory()) return collectSchemaSourcePaths(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
  );
  return nested.flat().sort();
}

function assertPhasePlan(phasePlan: readonly PhasePlan[]): void {
  if (phasePlan.length === 0) throw new Error("MIGRATION_LINEAGE_PHASE_PLAN_EMPTY");
  for (const [index, phase] of phasePlan.entries()) {
    if (phase.index !== index || !/^[a-z][a-z0-9_]*$/.test(phase.name) || phase.schemaModules.length === 0) {
      throw new Error("MIGRATION_LINEAGE_PHASE_PLAN_INVALID");
    }
  }
}

async function assertSourceManifest(
  manifest: SourceManifest,
  paths: readonly string[]
): Promise<void> {
  const currentManifest = await captureSourceManifest(paths);
  if (
    currentManifest.size !== manifest.size ||
    [...currentManifest].some(([path, digest]) => manifest.get(path) !== digest)
  ) {
    throw new Error("MIGRATION_LINEAGE_SOURCE_CHANGED");
  }
}

function phaseSchemaSource(phase: PhasePlan): string {
  return `${phase.schemaModules.map((module) => `export * from "../src/schema/${module}";`).join("\n")}\n`;
}

function buildConfigSource(): string {
  return [
    'import { defineConfig } from "drizzle-kit";',
    'export default defineConfig({',
    '  dialect: "postgresql",',
    '  schema: process.env.MIGRATION_LINEAGE_SCHEMA_PATH!,',
    '  out: process.env.MIGRATION_LINEAGE_OUT_PATH!,',
    '  dbCredentials: { url: process.env.DATABASE_URL! }',
    '});'
  ].join("\n");
}

async function generatePhase(input: {
  readonly packageDirectory: string;
  readonly configPath: string;
  readonly schemaPath: string;
  readonly candidateDirectory: string;
  readonly phase: PhasePlan;
}): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(
    "pnpm",
    ["exec", "drizzle-kit", "generate", "--config", input.configPath, "--name", input.phase.name],
    {
      cwd: input.packageDirectory,
      env: {
        ...process.env,
        MIGRATION_LINEAGE_SCHEMA_PATH: input.schemaPath,
        MIGRATION_LINEAGE_OUT_PATH: relative(input.packageDirectory, input.candidateDirectory)
      },
      timeout: 30_000
    }
  );
  if (result.stderr.trim()) {
    throw new Error(`MIGRATION_LINEAGE_GENERATION_FAILED:${input.phase.name}:${result.stderr.trim()}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function sha256(source: Buffer): string {
  return createHash("sha256").update(source).digest("hex");
}

async function augmentFinancePhase(migrationPath: string): Promise<void> {
  const financeModule = await loadAugmenterModule("augment-finance-baseline") as {
    augmentFinanceBaseline: MigrationPhaseAugmenter;
    augmentOnlineWalletRefundCaseMigrationSource: (source: string) => string;
    augmentSavedCardDisclosureMigrationSource: (source: string) => string;
  };
  await financeModule.augmentFinanceBaseline(migrationPath);
  const source = await readFile(migrationPath, "utf8");
  const withSavedCardDisclosure = financeModule.augmentSavedCardDisclosureMigrationSource(source);
  const augmented = financeModule.augmentOnlineWalletRefundCaseMigrationSource(withSavedCardDisclosure);
  if (augmented !== source) await writeFile(migrationPath, augmented, "utf8");
}

async function runAugmenter(
  scriptName: string,
  exportName: string,
  migrationPath: string
): Promise<void> {
  const module = await loadAugmenterModule(scriptName);
  const augmenter = module[exportName];
  if (typeof augmenter !== "function") {
    throw new Error(`MIGRATION_LINEAGE_AUGMENTER_MISSING:${scriptName}:${exportName}`);
  }
  await (augmenter as MigrationPhaseAugmenter)(migrationPath);
}

async function loadAugmenterModule(scriptName: string): Promise<Record<string, unknown>> {
  return await import(pathToFileURL(join(__dirname, `${scriptName}.ts`)).href);
}

async function normalizeGeneratedMigration(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  if (/^\s*CREATE UNIQUE INDEX\b|^\s*ALTER TABLE\b[\s\S]*?\bADD CONSTRAINT\b[\s\S]*?\bUNIQUE\s*\(/im.test(source) && /^\s*ALTER TABLE\b/im.test(source)) {
    await normalizeBaselineIndexOrderFile(migrationPath);
  }
}

async function runCli(): Promise<void> {
  const packageDirectory = process.cwd();
  const dryRun = process.argv.includes("--dry-run");
  const outputFlagIndex = process.argv.indexOf("--output");
  const outputDirectory = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : undefined;
  if (!dryRun && !outputDirectory) throw new Error("MIGRATION_LINEAGE_OUTPUT_REQUIRED");
  if (outputFlagIndex >= 0 && !outputDirectory) throw new Error("MIGRATION_LINEAGE_OUTPUT_REQUIRED");

  const privateOutputRoot = dryRun ? await mkdtemp(join(packageDirectory, ".migration-lineage-dry-run-")) : "";
  const candidateDirectory = outputDirectory ?? join(privateOutputRoot, "drizzle");
  try {
    const sourceManifestPaths = await collectSchemaSourcePaths(join(packageDirectory, "src/schema"));
    const sourceManifest = await captureSourceManifest(sourceManifestPaths);
    const lineage = await buildCandidateLineage({
      packageDirectory,
      outputDirectory: candidateDirectory,
      sourceManifestPaths,
      sourceManifest,
      phasePlan: DEFAULT_FORWARD_PHASE_PLAN
    });
    process.stdout.write(`${JSON.stringify({ artifacts: lineage.artifacts.map(({ index, tag, digest }) => ({ index, tag, digest })) }, null, 2)}\n`);
  } finally {
    if (privateOutputRoot) await rm(privateOutputRoot, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("rebuild-forward-migration-lineage.ts")) {
  void runCli().catch((error: unknown) => {
    process.exitCode = 1;
    console.error(error);
  });
}
