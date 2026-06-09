import { describe, expect, it } from "vitest";
import { assertPostgresDatabaseUrl } from "./index";

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
