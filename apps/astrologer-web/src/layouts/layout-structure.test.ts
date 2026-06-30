import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const layoutsDirectory = dirname(fileURLToPath(import.meta.url));

describe("layout file structure", () => {
  it("keeps app layout and header files in component folders", () => {
    expect(existsSync(join(layoutsDirectory, "AstrologerAppLayout"))).toBe(true);
    expect(existsSync(join(layoutsDirectory, "AstrologerHeader"))).toBe(true);
  });
});
