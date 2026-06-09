import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { createPostgresConnectionConfig } from "./src/index";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDirectory, "../../.env"), quiet: true });
config({ path: resolve(currentDirectory, "../../.env.example"), quiet: true });

const { connectionString } = createPostgresConnectionConfig();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString
  },
  strict: true,
  verbose: true
});
