import { describe, expect, it } from "vitest";
import {
  assertDevelopmentDatabaseUrl,
  assertPostgresDatabaseUrl,
  createPostgresConnectionConfig
} from "./index";

describe("assertPostgresDatabaseUrl", () => {
  it("accepts postgres URLs", () => {
    const url = "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse";

    expect(assertPostgresDatabaseUrl(url)).toBe(url);
  });

  it("rejects non-postgres URLs", () => {
    expect(() => assertPostgresDatabaseUrl("mysql://localhost:3306/elevenhouse")).toThrow(
      "Unsupported database protocol: mysql:"
    );
  });
});

describe("createPostgresConnectionConfig", () => {
  it("creates a pool config from DATABASE_URL", () => {
    const databaseUrl = "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse";

    expect(createPostgresConnectionConfig({ DATABASE_URL: databaseUrl })).toEqual({
      connectionString: databaseUrl
    });
  });

  it("rejects missing DATABASE_URL", () => {
    expect(() => createPostgresConnectionConfig({})).toThrow("DATABASE_URL is required");
  });
});

describe("assertDevelopmentDatabaseUrl", () => {
  it("accepts local development databases", () => {
    const url = "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse";

    expect(assertDevelopmentDatabaseUrl(url, "development")).toBe(url);
  });

  it("rejects production resets", () => {
    expect(() =>
      assertDevelopmentDatabaseUrl(
        "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse",
        "production"
      )
    ).toThrow("Refusing to reset a production database");
  });

  it("rejects non-local development databases", () => {
    expect(() =>
      assertDevelopmentDatabaseUrl("postgresql://elevenhouse:elevenhouse@db.internal/elevenhouse")
    ).toThrow("Refusing to reset a non-local database host: db.internal");
  });
});
