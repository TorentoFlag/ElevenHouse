import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { assertDevelopmentDatabaseUrl, createPostgresConnectionConfig } from "../src/connection";
import { createPostgresRuntime } from "../src/runtime";
import { seedAdminFinanceBrowserFixture } from "../src/dev-fixtures/admin-finance-browser-fixture";

const repositoryRoot = findRepositoryRoot(process.cwd());

config({ path: resolve(repositoryRoot, ".env"), quiet: true });
config({ path: resolve(repositoryRoot, ".env.example"), quiet: true });

async function main(): Promise<void> {
  const { connectionString } = createPostgresConnectionConfig();
  assertDevelopmentDatabaseUrl(
    connectionString,
    process.env.NODE_ENV,
    "seed admin finance fixture"
  );

  const runtime = createPostgresRuntime({ DATABASE_URL: connectionString });
  try {
    const result = await seedAdminFinanceBrowserFixture(runtime);
    const cookieScript = `document.cookie = "${result.sessionCookie}; Path=/; SameSite=Lax"; location.reload();`;

    console.log("Admin finance browser fixture seeded");
    console.log(`Admin user: ${result.adminUserId}`);
    console.log(`Astrologer user: ${result.astrologerUserId}`);
    console.log(`Session cookie: ${result.sessionCookie}`);
    console.log(`Browser console helper: ${cookieScript}`);
  } finally {
    await runtime.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function findRepositoryRoot(startDirectory: string): string {
  let directory = resolve(startDirectory);
  while (directory !== dirname(directory)) {
    if (existsSync(resolve(directory, "pnpm-workspace.yaml"))) return directory;
    directory = dirname(directory);
  }
  throw new Error("Could not locate repository root from current working directory");
}
