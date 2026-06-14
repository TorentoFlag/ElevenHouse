import { describe, expect, it } from "vitest";
import {
  createDrizzleDatabase,
  createPostgresPool,
  createPostgresRuntime
} from "./index";

describe("createPostgresPool", () => {
  it("creates a pg pool from a connection string", async () => {
    const pool = createPostgresPool({
      connectionString: "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse"
    });

    try {
      expect(pool.options.connectionString).toBe(
        "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse"
      );
    } finally {
      await pool.end();
    }
  });
});

describe("createDrizzleDatabase", () => {
  it("creates a Drizzle database for the provided pool", async () => {
    const pool = createPostgresPool({
      connectionString: "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse"
    });

    try {
      const database = createDrizzleDatabase(pool);

      expect(database).toHaveProperty("insert");
      expect(database).toHaveProperty("transaction");
    } finally {
      await pool.end();
    }
  });
});

describe("createPostgresRuntime", () => {
  it("creates a database and close hook from environment config", async () => {
    const runtime = createPostgresRuntime({
      DATABASE_URL: "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse"
    });

    try {
      expect(runtime.database).toHaveProperty("select");
      expect(runtime.pool.options.connectionString).toBe(
        "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse"
      );
    } finally {
      await runtime.close();
    }
  });
});
